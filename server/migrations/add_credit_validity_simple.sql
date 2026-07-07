-- ============================================
-- CREDIT VALIDITY SYSTEM - SIMPLIFIED (NO CRON)
-- Option A: Single expiry date for all credits
-- Credits expire on-demand when checked
-- Date: 2026-07-07
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: Add validity columns to users table
-- ============================================

ALTER TABLE users
ADD COLUMN IF NOT EXISTS credit_validity_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS credit_last_topup_date TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_users_credit_validity ON users(credit_validity_date)
WHERE credit > 0 AND credit_validity_date IS NOT NULL;

-- ============================================
-- STEP 2: Add validity tracking to transactions
-- ============================================

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS amount_sgd DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS credit_rate DECIMAL(10,2) DEFAULT 100,
ADD COLUMN IF NOT EXISTS validity_extended_to TIMESTAMP,
ADD COLUMN IF NOT EXISTS description TEXT;

-- ============================================
-- STEP 3: Helper Functions
-- ============================================

-- Function: Calculate new validity date with 365-day cap
CREATE OR REPLACE FUNCTION calculate_new_validity(
    p_current_validity TIMESTAMP,
    p_topup_days INTEGER DEFAULT 90
)
RETURNS TIMESTAMP AS $$
DECLARE
    v_base_date TIMESTAMP;
    v_new_validity TIMESTAMP;
    v_max_validity TIMESTAMP;
BEGIN
    -- If no current validity or expired, start from now
    IF p_current_validity IS NULL OR p_current_validity <= NOW() THEN
        v_base_date := NOW();
    ELSE
        v_base_date := p_current_validity;
    END IF;

    -- Add topup days (90 days)
    v_new_validity := v_base_date + (p_topup_days || ' days')::INTERVAL;

    -- Cap at 365 days from now
    v_max_validity := NOW() + INTERVAL '365 days';

    -- Return the lesser of new_validity or max_validity
    RETURN LEAST(v_new_validity, v_max_validity);
END;
$$ LANGUAGE plpgsql;

-- Function: Get days remaining until expiry
CREATE OR REPLACE FUNCTION get_credit_days_remaining(p_user_id uuid)
RETURNS INTEGER AS $$
DECLARE
    v_validity_date TIMESTAMP;
    v_days INTEGER;
BEGIN
    SELECT credit_validity_date INTO v_validity_date
    FROM users
    WHERE user_id = p_user_id;

    IF v_validity_date IS NULL OR v_validity_date <= NOW() THEN
        RETURN 0;
    END IF;

    v_days := EXTRACT(DAY FROM (v_validity_date - NOW()));

    RETURN v_days;
END;
$$ LANGUAGE plpgsql;

-- Function: Top up credits and extend validity
CREATE OR REPLACE FUNCTION topup_credits(
    p_user_id uuid,
    p_credits INTEGER,
    p_amount_sgd DECIMAL DEFAULT NULL,
    p_rate DECIMAL DEFAULT 1
)
RETURNS TABLE(
    new_credit INTEGER,
    new_validity_date TIMESTAMP,
    days_remaining INTEGER
) AS $$
DECLARE
    v_current_validity TIMESTAMP;
    v_new_validity TIMESTAMP;
    v_new_credit INTEGER;
BEGIN
    -- Get current validity
    SELECT credit_validity_date INTO v_current_validity
    FROM users
    WHERE user_id = p_user_id;

    -- Calculate new validity (90 days extension, capped at 365)
    v_new_validity := calculate_new_validity(v_current_validity, 90);

    -- Update user credits and validity
    UPDATE users
    SET
        credit = credit + p_credits,
        credit_validity_date = v_new_validity,
        credit_last_topup_date = NOW()
    WHERE user_id = p_user_id
    RETURNING credit INTO v_new_credit;

    -- Return results
    RETURN QUERY SELECT
        v_new_credit,
        v_new_validity,
        EXTRACT(DAY FROM (v_new_validity - NOW()))::INTEGER;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 4: Migrate existing credits
-- Give existing users 90 days validity from now
-- ============================================

UPDATE users
SET
    credit_validity_date = NOW() + INTERVAL '90 days',
    credit_last_topup_date = NOW()
WHERE credit > 0
AND credit_validity_date IS NULL;

COMMIT;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check users with validity dates
-- SELECT user_id, email, credit, credit_validity_date,
--        EXTRACT(DAY FROM (credit_validity_date - NOW())) as days_remaining
-- FROM users
-- WHERE credit > 0
-- LIMIT 10;

-- Test calculate_new_validity function
-- SELECT calculate_new_validity(NOW() + INTERVAL '45 days', 90) as new_validity;
-- Should return: current_date + 135 days (45 + 90)

-- Test with cap
-- SELECT calculate_new_validity(NOW() + INTERVAL '300 days', 90) as new_validity;
-- Should return: current_date + 365 days (capped, not 390)

-- ============================================
-- HOW IT WORKS (NO CRON JOB NEEDED)
-- ============================================
-- Credits expire automatically when:
-- 1. User views their credit balance (GET /credits/balance)
-- 2. User tries to book a class (POST /bookings)
-- 3. Any API checks credit validity
--
-- The API endpoints check if credit_validity_date <= NOW()
-- If expired, they:
-- - Set credit = 0
-- - Set credit_validity_date = NULL
-- - Log expiry transaction
-- - Create notification
--
-- No cron job needed!

-- ============================================
-- ROLLBACK (if needed)
-- ============================================

-- To rollback this migration:
-- ALTER TABLE users DROP COLUMN IF EXISTS credit_validity_date;
-- ALTER TABLE users DROP COLUMN IF EXISTS credit_last_topup_date;
-- ALTER TABLE transactions DROP COLUMN IF EXISTS amount_sgd;
-- ALTER TABLE transactions DROP COLUMN IF EXISTS credit_rate;
-- ALTER TABLE transactions DROP COLUMN IF EXISTS validity_extended_to;
-- ALTER TABLE transactions DROP COLUMN IF EXISTS description;
-- DROP FUNCTION IF EXISTS calculate_new_validity(TIMESTAMP, INTEGER);
-- DROP FUNCTION IF EXISTS get_credit_days_remaining(uuid);
-- DROP FUNCTION IF EXISTS topup_credits(uuid, INTEGER, DECIMAL, DECIMAL);
