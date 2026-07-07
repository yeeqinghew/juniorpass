# Credit Validity System - Database Design

## Requirements Summary

### Credit Validity Rules
1. **Initial Top-up**: +90 days validity
2. **Maximum Validity**: 365 days (cap)
3. **Extension Logic**: Current validity remaining + 90 days (capped at 365)
4. **Example**: 45 days left + 90 days top-up = 135 days total

---

## Proposed Database Schema

### Option 1: Enhanced Transaction-Based System (Recommended)

This approach tracks each credit "batch" with its own expiry date, following the FIFO (First In, First Out) principle - oldest credits expire/used first.

#### 1. Create `credit_balances` table (Summary table)

```sql
CREATE TABLE credit_balances (
    balance_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES users(user_id) ON DELETE CASCADE NOT NULL,
    total_credits INTEGER DEFAULT 0,
    available_credits INTEGER DEFAULT 0,
    expired_credits INTEGER DEFAULT 0,
    used_credits INTEGER DEFAULT 0,
    validity_end_date TIMESTAMP,  -- Overall account validity (latest expiry)
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE TRIGGER set_timestamp_credit_balances
    BEFORE UPDATE ON credit_balances
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE INDEX idx_credit_balances_user ON credit_balances(user_id);
```

#### 2. Create `credit_batches` table (Track each top-up batch)

```sql
CREATE TABLE credit_batches (
    batch_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES users(user_id) ON DELETE CASCADE NOT NULL,
    credits_added INTEGER NOT NULL,
    credits_remaining INTEGER NOT NULL,
    credits_used INTEGER DEFAULT 0,
    credits_expired INTEGER DEFAULT 0,
    source VARCHAR(50) NOT NULL,  -- 'topup', 'refund', 'promo', 'referral'
    validity_days INTEGER DEFAULT 90,  -- Usually 90, but can vary for promos
    purchased_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,  -- purchased_at + validity_days
    status VARCHAR(20) DEFAULT 'active',  -- 'active', 'depleted', 'expired'
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_credit_batches
    BEFORE UPDATE ON credit_batches
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

-- Indexes for efficient queries
CREATE INDEX idx_credit_batches_user ON credit_batches(user_id);
CREATE INDEX idx_credit_batches_expiry ON credit_batches(expires_at);
CREATE INDEX idx_credit_batches_status ON credit_batches(status);
CREATE INDEX idx_credit_batches_user_status ON credit_batches(user_id, status, expires_at);
```

#### 3. Update `transactions` table (Add batch tracking)

```sql
-- Add new columns to existing transactions table
ALTER TABLE transactions 
ADD COLUMN amount_usd DECIMAL(10,2),  -- Original USD amount (if converted from $)
ADD COLUMN credit_rate DECIMAL(10,2),  -- Conversion rate used (e.g., 1 USD = 100 credits)
ADD COLUMN batch_id uuid REFERENCES credit_batches(batch_id),  -- Link to credit batch used
ADD COLUMN description TEXT;  -- Transaction description

-- Add index
CREATE INDEX idx_transactions_batch ON transactions(batch_id);
```

#### 4. Create `credit_ledger` table (Detailed audit trail - Optional but recommended)

```sql
CREATE TABLE credit_ledger (
    ledger_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES users(user_id) ON DELETE CASCADE NOT NULL,
    batch_id uuid REFERENCES credit_batches(batch_id),
    transaction_type VARCHAR(20) NOT NULL,  -- 'TOPUP', 'DEBIT', 'REFUND', 'EXPIRY'
    amount INTEGER NOT NULL,  -- Positive for add, negative for deduct
    balance_before INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reference_id uuid,  -- booking_id, transaction_id, etc.
    reference_type VARCHAR(50),  -- 'booking', 'refund', 'expiry', etc.
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_credit_ledger_user ON credit_ledger(user_id, created_at DESC);
CREATE INDEX idx_credit_ledger_batch ON credit_ledger(batch_id);
```

---

## Migration SQL Script

```sql
-- ============================================
-- CREDIT VALIDITY SYSTEM MIGRATION
-- Implements 90-day validity with 365-day cap
-- ============================================

BEGIN;

-- 1. Create credit_balances table
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

-- 2. Create credit_batches table
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
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_credit_batches
    BEFORE UPDATE ON credit_batches
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE INDEX idx_credit_batches_user ON credit_batches(user_id);
CREATE INDEX idx_credit_batches_expiry ON credit_batches(expires_at);
CREATE INDEX idx_credit_batches_status ON credit_batches(status);
CREATE INDEX idx_credit_batches_user_status ON credit_batches(user_id, status, expires_at);

-- 3. Update transactions table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS amount_usd DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS credit_rate DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES credit_batches(batch_id),
ADD COLUMN IF NOT EXISTS description TEXT;

CREATE INDEX IF NOT EXISTS idx_transactions_batch ON transactions(batch_id);

-- 4. Create credit_ledger table
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
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_credit_ledger_user ON credit_ledger(user_id, created_at DESC);
CREATE INDEX idx_credit_ledger_batch ON credit_ledger(batch_id);

COMMIT;

-- ============================================
-- MIGRATION: Populate existing credits
-- Run this AFTER the tables are created
-- ============================================

-- Migrate existing user credits to credit_batches
-- This creates a single batch for each user with 90 days validity from now
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
```

---

## Helper Functions & Stored Procedures

### 1. Function: Calculate Validity Extension

```sql
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
```

### 2. Function: Add Credit Batch (Top-up)

```sql
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
    
    -- Update or create credit_balances
    INSERT INTO credit_balances (user_id, total_credits, available_credits, validity_end_date)
    VALUES (p_user_id, p_credits, p_credits, v_expires_at)
    ON CONFLICT (user_id) DO UPDATE SET
        total_credits = credit_balances.total_credits + p_credits,
        available_credits = credit_balances.available_credits + p_credits,
        validity_end_date = GREATEST(credit_balances.validity_end_date, v_expires_at);
    
    -- Get current balance for ledger
    SELECT available_credits - p_credits INTO v_current_balance
    FROM credit_balances
    WHERE user_id = p_user_id;
    
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
        format('Top-up: $%s at rate %s credits/USD', p_amount_usd, p_rate)
    );
    
    -- Update users table credit
    UPDATE users SET credit = credit + p_credits WHERE user_id = p_user_id;
    
    RETURN v_batch_id;
END;
$$ LANGUAGE plpgsql;
```

### 3. Function: Deduct Credits (FIFO)

```sql
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
    SELECT available_credits INTO v_current_balance
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
            format('Deducted %s credits from batch %s', v_credits_to_deduct, v_batch.batch_id)
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
```

### 4. Function: Expire Old Credits (Cron Job)

```sql
CREATE OR REPLACE FUNCTION expire_old_credits()
RETURNS TABLE(expired_user_id uuid, expired_amount INTEGER) AS $$
DECLARE
    v_batch RECORD;
BEGIN
    FOR v_batch IN 
        SELECT * FROM credit_batches
        WHERE status = 'active'
        AND expires_at <= NOW()
        AND credits_remaining > 0
    LOOP
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
            (SELECT credit FROM users WHERE user_id = v_batch.user_id) + v_batch.credits_remaining,
            (SELECT credit FROM users WHERE user_id = v_batch.user_id),
            format('Credits expired from batch %s', v_batch.batch_id)
        );
        
        expired_user_id := v_batch.user_id;
        expired_amount := v_batch.credits_remaining;
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
```

---

## Usage Examples

### Example 1: User tops up $50 (5000 credits)

```sql
-- User has 0 credits, tops up 5000 credits
SELECT add_credit_batch(
    '550e8400-e29b-41d4-a716-446655440000',  -- user_id
    5000,                                     -- credits
    'topup',                                  -- source
    50.00,                                    -- amount_usd
    100                                       -- rate (100 credits per USD)
);
-- Result: Credits valid for 90 days from now
```

### Example 2: User has 45 days left, tops up again

```sql
-- Current validity: 45 days remaining
-- New top-up: 5000 credits
SELECT add_credit_batch(
    '550e8400-e29b-41d4-a716-446655440000',
    5000,
    'topup',
    50.00,
    100
);
-- Result: New validity = 45 days + 90 days = 135 days
```

### Example 3: User books a class (deduct credits)

```sql
-- Booking costs 1000 credits
SELECT deduct_credits(
    '550e8400-e29b-41d4-a716-446655440000',  -- user_id
    1000,                                     -- credits_needed
    'booking-uuid-here',                      -- reference_id
    'booking'                                 -- reference_type
);
-- Result: Credits deducted from oldest batch first (FIFO)
```

### Example 4: Check user's credit status

```sql
-- Get summary
SELECT * FROM credit_balances WHERE user_id = '550e8400-e29b-41d4-a716-446655440000';

-- Get active batches
SELECT 
    batch_id,
    credits_remaining,
    expires_at,
    EXTRACT(DAY FROM (expires_at - NOW())) as days_remaining
FROM credit_batches
WHERE user_id = '550e8400-e29b-41d4-a716-446655440000'
AND status = 'active'
ORDER BY expires_at ASC;

-- Get transaction history
SELECT * FROM credit_ledger 
WHERE user_id = '550e8400-e29b-41d4-a716-446655440000'
ORDER BY created_at DESC
LIMIT 20;
```

---

## Backend Implementation Checklist

### API Endpoints to Create/Update

1. **POST `/credits/topup`**
   - Add credit batch
   - Calculate new validity
   - Record transaction
   - Send notification

2. **GET `/credits/balance/:userId`**
   - Return available credits
   - Return validity end date
   - Return active batches with expiry

3. **POST `/credits/deduct`** (Internal use)
   - Deduct credits (FIFO)
   - Update balances
   - Record in ledger

4. **GET `/credits/history/:userId`**
   - Return credit ledger entries
   - Pagination support

5. **POST `/credits/expire`** (Cron Job)
   - Run expire_old_credits()
   - Send expiry notifications
   - Run daily at midnight

### Cron Job Setup

```javascript
// Run daily to expire old credits
cron.schedule('0 0 * * *', async () => {
  const result = await db.query('SELECT * FROM expire_old_credits()');
  
  // Send notifications to users whose credits expired
  for (const row of result.rows) {
    await sendNotification(row.expired_user_id, {
      type: 'credit_expired',
      title: 'Credits Expired',
      message: `${row.expired_amount} credits have expired`,
    });
  }
});
```

---

## Frontend Changes Needed

### 1. Credits Display Component

Show:
- Available credits
- Validity end date
- Days remaining warning (if < 30 days)
- Expiring soon batches

### 2. Top-up Flow

- Show current validity
- Show new validity after top-up
- Warning if at 365-day cap

### 3. Transaction History

- List all credit transactions
- Filter by type (topup, debit, expiry)
- Show batch details

---

## Summary of Changes

✅ **New Tables:**
1. `credit_balances` - User credit summary
2. `credit_batches` - Individual credit batches with expiry
3. `credit_ledger` - Audit trail

✅ **Updated Tables:**
1. `transactions` - Add batch tracking, USD amount, rate

✅ **New Functions:**
1. `calculate_new_validity()` - Validity calculation with 365-day cap
2. `add_credit_batch()` - Top-up with validity extension
3. `deduct_credits()` - FIFO credit deduction
4. `expire_old_credits()` - Automated expiry

✅ **Features:**
- 90-day validity per top-up
- 365-day maximum cap
- FIFO deduction (oldest credits used first)
- Automatic expiry with cron job
- Full audit trail
- Notification system integration
