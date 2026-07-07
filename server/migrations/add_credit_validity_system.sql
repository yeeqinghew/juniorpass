-- ============================================
-- CREDIT VALIDITY SYSTEM MIGRATION
-- Implements 90-day validity with 365-day cap
-- Author: System
-- Date: 2026-07-07
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: Create credit_balances table
-- ============================================
CREATE TABLE IF NOT EXISTS credit_balances (
    balance_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES users(user_id) ON DELETE CASCADE NOT NULL,
    total_credits INTEGER DEFAULT 0,
    available_credits INTEGER DEFAULT 0,
    expired_credits INTEGER DEFAULT 0,
    used_credits INTEGER DEFAULT 0,
    validity_end_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE TRIGGER set_timestamp_credit_balances
    BEFORE UPDATE ON credit_balances
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE INDEX idx_credit_balances_user ON credit_balances(user_id);

-- ============================================
-- STEP 2: Create credit_batches table
-- ============================================
CREATE TABLE IF NOT EXISTS credit_batches (
    batch_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES users(user_id) ON DELETE CASCADE NOT NULL,
    credits_added INTEGER NOT NULL,
    credits_remaining INTEGER NOT NULL,
    credits_used INTEGER DEFAULT 0,
    credits_expired INTEGER DEFAULT 0,
    source VARCHAR(50) NOT NULL DEFAULT 'topup',
    validity_days INTEGER DEFAULT 90,
    purchased_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CHECK (status IN ('active', 'depleted', 'expired'))
);

CREATE TRIGGER set_timestamp_credit_batches
    BEFORE UPDATE ON credit_batches
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE INDEX idx_credit_batches_user ON credit_batches(user_id);
CREATE INDEX idx_credit_batches_expiry ON credit_batches(expires_at);
CREATE INDEX idx_credit_batches_status ON credit_batches(status);
CREATE INDEX idx_credit_batches_user_status ON credit_batches(user_id, status, expires_at);

-- ============================================
-- STEP 3: Update transactions table
-- ============================================
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS amount_usd DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS credit_rate DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES credit_batches(batch_id),
ADD COLUMN IF NOT EXISTS description TEXT;

CREATE INDEX IF NOT EXISTS idx_transactions_batch ON transactions(batch_id);

-- ============================================
-- STEP 4: Create credit_ledger table
-- ============================================
CREATE TABLE IF NOT EXISTS credit_ledger (
    ledger_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES users(user_id) ON DELETE CASCADE NOT NULL,
    batch_id uuid REFERENCES credit_batches(batch_id),
    transaction_type VARCHAR(20) NOT NULL,
    amount INTEGER NOT NULL,
    balance_before INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reference_id uuid,
    reference_type VARCHAR(50),
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    CHECK (transaction_type IN ('TOPUP', 'DEBIT', 'REFUND', 'EXPIRY', 'MIGRATION'))
);

CREATE INDEX idx_credit_ledger_user ON credit_ledger(user_id, created_at DESC);
CREATE INDEX idx_credit_ledger_batch ON credit_ledger(batch_id);

COMMIT;

-- ============================================
-- STEP 5: Helper Functions
-- ============================================

-- Function 1: Calculate new validity with 365-day cap
CREATE OR REPLACE FUNCTION calculate_new_validity(
    p_user_id uuid,
    p_topup_days INTEGER DEFAULT 90
)
RETURNS TIMESTAMP AS $$
DECLARE
    v_current_validity TIMESTAMP;
    v_new_validity TIMESTAMP;
    v_max_validity TIMESTAMP;
BEGIN
    -- Get current validity (latest expiry date among active batches)
    SELECT MAX(expires_at) INTO v_current_validity
    FROM credit_batches
    WHERE user_id = p_user_id
    AND status = 'active'
    AND expires_at > NOW();

    -- If no active credits, start from now
    IF v_current_validity IS NULL THEN
        v_current_validity := NOW();
    END IF;

    -- Add topup days (90 days)
    v_new_validity := v_current_validity + (p_topup_days || ' days')::INTERVAL;

    -- Cap at 365 days from now
    v_max_validity := NOW() + INTERVAL '365 days';

    -- Return the lesser of new_validity or max_validity
    RETURN LEAST(v_new_validity, v_max_validity);
END;
$$ LANGUAGE plpgsql;

-- Function 2: Add credit batch (Top-up)
CREATE OR REPLACE FUNCTION add_credit_batch(
    p_user_id uuid,
    p_credits INTEGER,
    p_source VARCHAR DEFAULT 'topup',
    p_amount_usd DECIMAL DEFAULT NULL,
    p_rate DECIMAL DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
    v_batch_id uuid;
    v_expires_at TIMESTAMP;
    v_current_balance INTEGER;
BEGIN
    -- Calculate new expiry date
    v_expires_at := calculate_new_validity(p_user_id, 90);

    -- Create new credit batch
    INSERT INTO credit_batches (
        user_id,
        credits_added,
        credits_remaining,
        source,
        validity_days,
        expires_at
    ) VALUES (
        p_user_id,
        p_credits,
        p_credits,
        p_source,
        90,
        v_expires_at
    )
    RETURNING batch_id INTO v_batch_id;

    -- Get current balance for ledger
    SELECT COALESCE(available_credits, 0) INTO v_current_balance
    FROM credit_balances
    WHERE user_id = p_user_id;

    -- Update or create credit_balances
    INSERT INTO credit_balances (user_id, total_credits, available_credits, validity_end_date)
    VALUES (p_user_id, p_credits, p_credits, v_expires_at)
    ON CONFLICT (user_id) DO UPDATE SET
        total_credits = credit_balances.total_credits + p_credits,
        available_credits = credit_balances.available_credits + p_credits,
        validity_end_date = GREATEST(credit_balances.validity_end_date, v_expires_at);

    -- Add ledger entry
    INSERT INTO credit_ledger (
        user_id,
        batch_id,
        transaction_type,
        amount,
        balance_before,
        balance_after,
        description
    ) VALUES (
        p_user_id,
        v_batch_id,
        'TOPUP',
        p_credits,
        v_current_balance,
        v_current_balance + p_credits,
        CASE
            WHEN p_amount_usd IS NOT NULL THEN
                format('Top-up: $%s at rate %s credits/USD', p_amount_usd, p_rate)
            ELSE
                format('Top-up: %s credits', p_credits)
        END
    );

    -- Update users table credit
    UPDATE users SET credit = credit + p_credits WHERE user_id = p_user_id;

    RETURN v_batch_id;
END;
$$ LANGUAGE plpgsql;

-- Function 3: Deduct credits (FIFO - oldest first)
CREATE OR REPLACE FUNCTION deduct_credits(
    p_user_id uuid,
    p_credits_needed INTEGER,
    p_reference_id uuid DEFAULT NULL,
    p_reference_type VARCHAR DEFAULT 'booking'
)
RETURNS BOOLEAN AS $$
DECLARE
    v_batch RECORD;
    v_credits_to_deduct INTEGER;
    v_remaining_needed INTEGER := p_credits_needed;
    v_current_balance INTEGER;
BEGIN
    -- Check if user has enough credits
    SELECT COALESCE(available_credits, 0) INTO v_current_balance
    FROM credit_balances
    WHERE user_id = p_user_id;

    IF v_current_balance < p_credits_needed THEN
        RAISE EXCEPTION 'Insufficient credits. Available: %, Needed: %', v_current_balance, p_credits_needed;
    END IF;

    -- Deduct from batches in FIFO order (oldest first)
    FOR v_batch IN
        SELECT * FROM credit_batches
        WHERE user_id = p_user_id
        AND status = 'active'
        AND credits_remaining > 0
        AND expires_at > NOW()
        ORDER BY expires_at ASC
    LOOP
        IF v_remaining_needed <= 0 THEN
            EXIT;
        END IF;

        -- Deduct from this batch
        v_credits_to_deduct := LEAST(v_batch.credits_remaining, v_remaining_needed);

        UPDATE credit_batches
        SET
            credits_remaining = credits_remaining - v_credits_to_deduct,
            credits_used = credits_used + v_credits_to_deduct,
            status = CASE
                WHEN credits_remaining - v_credits_to_deduct = 0 THEN 'depleted'
                ELSE 'active'
            END
        WHERE batch_id = v_batch.batch_id;

        -- Add ledger entry for this deduction
        INSERT INTO credit_ledger (
            user_id,
            batch_id,
            transaction_type,
            amount,
            balance_before,
            balance_after,
            reference_id,
            reference_type,
            description
        ) VALUES (
            p_user_id,
            v_batch.batch_id,
            'DEBIT',
            -v_credits_to_deduct,
            v_current_balance,
            v_current_balance - v_credits_to_deduct,
            p_reference_id,
            p_reference_type,
            format('Deducted %s credits for %s', v_credits_to_deduct, p_reference_type)
        );

        v_remaining_needed := v_remaining_needed - v_credits_to_deduct;
        v_current_balance := v_current_balance - v_credits_to_deduct;
    END LOOP;

    -- Update credit_balances
    UPDATE credit_balances
    SET
        available_credits = available_credits - p_credits_needed,
        used_credits = used_credits + p_credits_needed
    WHERE user_id = p_user_id;

    -- Update users table
    UPDATE users
    SET credit = credit - p_credits_needed
    WHERE user_id = p_user_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function 4: Expire old credits (Run via cron job)
CREATE OR REPLACE FUNCTION expire_old_credits()
RETURNS TABLE(expired_user_id uuid, expired_amount INTEGER) AS $$
DECLARE
    v_batch RECORD;
    v_previous_balance INTEGER;
BEGIN
    FOR v_batch IN
        SELECT * FROM credit_batches
        WHERE status = 'active'
        AND expires_at <= NOW()
        AND credits_remaining > 0
    LOOP
        -- Get current balance before expiry
        SELECT COALESCE(available_credits, 0) INTO v_previous_balance
        FROM credit_balances
        WHERE user_id = v_batch.user_id;

        -- Mark batch as expired
        UPDATE credit_batches
        SET
            status = 'expired',
            credits_expired = credits_remaining,
            credits_remaining = 0
        WHERE batch_id = v_batch.batch_id;

        -- Update credit_balances
        UPDATE credit_balances
        SET
            available_credits = available_credits - v_batch.credits_remaining,
            expired_credits = expired_credits + v_batch.credits_remaining
        WHERE user_id = v_batch.user_id;

        -- Update users table
        UPDATE users
        SET credit = credit - v_batch.credits_remaining
        WHERE user_id = v_batch.user_id;

        -- Add ledger entry
        INSERT INTO credit_ledger (
            user_id,
            batch_id,
            transaction_type,
            amount,
            balance_before,
            balance_after,
            description
        ) VALUES (
            v_batch.user_id,
            v_batch.batch_id,
            'EXPIRY',
            -v_batch.credits_remaining,
            v_previous_balance,
            v_previous_balance - v_batch.credits_remaining,
            format('Credits expired from batch purchased on %s', v_batch.purchased_at::date)
        );

        expired_user_id := v_batch.user_id;
        expired_amount := v_batch.credits_remaining;
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 6: Migrate existing user credits
-- Run this to populate credit_batches with existing credits
-- ============================================

-- Migrate existing user credits to credit_batches
INSERT INTO credit_batches (
    user_id,
    credits_added,
    credits_remaining,
    source,
    validity_days,
    purchased_at,
    expires_at,
    status
)
SELECT
    user_id,
    credit AS credits_added,
    credit AS credits_remaining,
    'migration' AS source,
    90 AS validity_days,
    NOW() AS purchased_at,
    NOW() + INTERVAL '90 days' AS expires_at,
    CASE
        WHEN credit > 0 THEN 'active'
        ELSE 'depleted'
    END AS status
FROM users
WHERE credit > 0;

-- Populate credit_balances summary
INSERT INTO credit_balances (
    user_id,
    total_credits,
    available_credits,
    validity_end_date
)
SELECT
    user_id,
    credit AS total_credits,
    credit AS available_credits,
    NOW() + INTERVAL '90 days' AS validity_end_date
FROM users
WHERE credit > 0;

-- Initial ledger entries for migration
INSERT INTO credit_ledger (
    user_id,
    batch_id,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    description
)
SELECT
    cb.user_id,
    cb.batch_id,
    'MIGRATION' AS transaction_type,
    cb.credits_added AS amount,
    0 AS balance_before,
    cb.credits_added AS balance_after,
    'Initial credit migration with 90-day validity' AS description
FROM credit_batches cb
WHERE cb.source = 'migration';

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check credit_batches
-- SELECT user_id, credits_added, credits_remaining, expires_at, status FROM credit_batches LIMIT 10;

-- Check credit_balances
-- SELECT user_id, available_credits, validity_end_date FROM credit_balances LIMIT 10;

-- Check credit_ledger
-- SELECT user_id, transaction_type, amount, description, created_at FROM credit_ledger ORDER BY created_at DESC LIMIT 10;
