# Credit Validity System - Quick Implementation Guide

## Summary

Your credit validity system with **90-day validity** and **365-day cap** requires the following database changes:

---

## New Database Tables

### 1. `credit_balances` (Summary table)
Tracks overall credit status per user:
- `total_credits`: Lifetime credits added
- `available_credits`: Current usable credits
- `expired_credits`: Credits that expired
- `used_credits`: Credits spent
- `validity_end_date`: Latest expiry date

### 2. `credit_batches` (Individual top-ups)
Each top-up creates a new batch with its own expiry:
- `credits_added`: Amount added in this batch
- `credits_remaining`: Current balance in this batch
- `expires_at`: When this batch expires
- `status`: 'active', 'depleted', or 'expired'

Uses **FIFO** (First In, First Out) - oldest credits used first

### 3. `credit_ledger` (Audit trail)
Complete transaction history:
- Every top-up, deduction, and expiry logged
- Links to batch_id and reference (booking_id, etc.)
- Balance before/after each transaction

---

## Updated Tables

### `transactions` table
Added columns:
- `amount_usd`: Original USD amount (if converted from $)
- `credit_rate`: Conversion rate (e.g., 1 USD = 100 credits)
- `batch_id`: Links to the credit batch used
- `description`: Transaction details

---

## How It Works

### Scenario 1: First Top-up
```
User has: 0 credits
User tops up: $50 = 5000 credits
Result: 5000 credits valid for 90 days
```

### Scenario 2: Top-up with Credits Remaining
```
User has: 2000 credits (45 days remaining)
User tops up: $50 = 5000 credits
Result: 7000 credits valid for 135 days (45 + 90)
```

### Scenario 3: Maximum Cap
```
User has: 3000 credits (300 days remaining)
User tops up: $50 = 5000 credits
Result: 8000 credits valid for 365 days (capped, not 390)
```

### Scenario 4: Credit Deduction (FIFO)
```
User has 2 batches:
- Batch 1: 2000 credits (expires in 30 days)
- Batch 2: 5000 credits (expires in 120 days)

User books class: 3000 credits needed
Deduction:
- 2000 from Batch 1 (depleted)
- 1000 from Batch 2 (4000 remaining)
```

### Scenario 5: Credit Expiry
```
Batch expires at: 2026-10-07
Current date: 2026-10-08
Remaining: 1500 credits

System automatically:
1. Marks batch as 'expired'
2. Deducts 1500 from user balance
3. Logs expiry in credit_ledger
4. Sends notification to user
```

---

## Installation Steps

### 1. Run Migration
```bash
cd ~/Desktop/admin/personal/juniorPASS/server
psql -U postgres -d juniorpass -f migrations/add_credit_validity_system.sql
```

### 2. Verify Installation
```sql
-- Check tables created
\dt credit_*

-- Check functions created
\df calculate_new_validity
\df add_credit_batch
\df deduct_credits
\df expire_old_credits

-- Verify data migration
SELECT user_id, available_credits, validity_end_date 
FROM credit_balances 
LIMIT 5;
```

---

## Backend Implementation

### API Endpoints Needed

#### 1. Top-up Credits
```javascript
POST /api/credits/topup
Body: {
  userId: uuid,
  amountUsd: 50,
  creditRate: 100  // 1 USD = 100 credits
}

// Call database function
const result = await pool.query(
  'SELECT add_credit_batch($1, $2, $3, $4, $5)',
  [userId, credits, 'topup', amountUsd, creditRate]
);
```

#### 2. Get Credit Balance
```javascript
GET /api/credits/balance/:userId

// Query
SELECT 
  available_credits,
  validity_end_date,
  EXTRACT(DAY FROM (validity_end_date - NOW())) as days_remaining
FROM credit_balances
WHERE user_id = $1;

// Also get active batches
SELECT 
  batch_id,
  credits_remaining,
  expires_at,
  EXTRACT(DAY FROM (expires_at - NOW())) as days_until_expiry
FROM credit_batches
WHERE user_id = $1 
AND status = 'active'
ORDER BY expires_at ASC;
```

#### 3. Deduct Credits (Booking)
```javascript
POST /api/credits/deduct
Body: {
  userId: uuid,
  creditsNeeded: 1000,
  referenceId: bookingId,
  referenceType: 'booking'
}

// Call database function
const result = await pool.query(
  'SELECT deduct_credits($1, $2, $3, $4)',
  [userId, creditsNeeded, referenceId, referenceType]
);
```

#### 4. Get Transaction History
```javascript
GET /api/credits/history/:userId?page=1&limit=20

SELECT 
  transaction_type,
  amount,
  balance_after,
  description,
  created_at
FROM credit_ledger
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;
```

#### 5. Expire Old Credits (Cron Job)
```javascript
// In your cron job file (e.g., creditExpiryJob.js)
const cron = require('node-cron');

// Run every day at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('Running credit expiry job...');
  
  const result = await pool.query('SELECT * FROM expire_old_credits()');
  
  // Send notifications to affected users
  for (const row of result.rows) {
    await sendNotification(row.expired_user_id, {
      type: 'credit_expired',
      title: 'Credits Expired',
      message: `${row.expired_amount} credits have expired due to 90-day validity limit.`,
      data: { expired_amount: row.expired_amount }
    });
  }
  
  console.log(`Expired credits for ${result.rows.length} users`);
});
```

---

## Frontend Changes

### 1. Credit Balance Display
```jsx
// Show in user dashboard
<CreditBalance>
  <div>
    <h3>Available Credits</h3>
    <p className="credit-amount">{availableCredits}</p>
  </div>
  <div>
    <h4>Valid Until</h4>
    <p>{validityDate}</p>
    {daysRemaining < 30 && (
      <Alert type="warning">
        Your credits expire in {daysRemaining} days!
      </Alert>
    )}
  </div>
</CreditBalance>
```

### 2. Top-up Preview
```jsx
// Show before payment
<TopupPreview>
  <p>Current Balance: {currentCredits} credits</p>
  <p>Valid Until: {currentValidity}</p>
  
  <Divider />
  
  <p>Top-up Amount: ${amount} = {credits} credits</p>
  <p className="highlight">New Validity: {newValidity}</p>
  {isCapped && (
    <Alert type="info">
      Maximum validity is 365 days from today
    </Alert>
  )}
  
  <p>New Balance: {currentCredits + credits} credits</p>
</TopupPreview>
```

### 3. Credit Batches View
```jsx
// Show active batches
<CreditBatches>
  {batches.map(batch => (
    <BatchCard key={batch.batch_id}>
      <h4>{batch.credits_remaining} credits</h4>
      <p>Expires: {batch.expires_at}</p>
      <p>{batch.days_until_expiry} days remaining</p>
      {batch.days_until_expiry < 30 && (
        <Tag color="orange">Expiring Soon</Tag>
      )}
    </BatchCard>
  ))}
</CreditBatches>
```

### 4. Transaction History
```jsx
<TransactionHistory>
  {history.map(tx => (
    <TransactionRow key={tx.ledger_id}>
      <TypeBadge type={tx.transaction_type} />
      <span>{tx.description}</span>
      <span className={tx.amount > 0 ? 'positive' : 'negative'}>
        {tx.amount > 0 ? '+' : ''}{tx.amount}
      </span>
      <span>{tx.balance_after} credits</span>
      <span>{formatDate(tx.created_at)}</span>
    </TransactionRow>
  ))}
</TransactionHistory>
```

---

## Testing Checklist

### Database Tests
- [ ] Run migration successfully
- [ ] Verify all tables created
- [ ] Verify all functions created
- [ ] Check existing credits migrated
- [ ] Test `add_credit_batch()` function
- [ ] Test `deduct_credits()` function
- [ ] Test `calculate_new_validity()` function
- [ ] Test `expire_old_credits()` function

### API Tests
- [ ] Test credit top-up endpoint
- [ ] Test balance retrieval endpoint
- [ ] Test credit deduction endpoint
- [ ] Test transaction history endpoint
- [ ] Test 365-day cap enforcement
- [ ] Test FIFO deduction order
- [ ] Test insufficient credit error

### Frontend Tests
- [ ] Display credit balance correctly
- [ ] Show validity date
- [ ] Show warning when < 30 days remaining
- [ ] Top-up preview shows correct new validity
- [ ] Display active batches
- [ ] Transaction history pagination
- [ ] Expiry notifications appear

### Cron Job Tests
- [ ] Expire old credits job runs
- [ ] Expired batches marked correctly
- [ ] User balances updated
- [ ] Notifications sent to users
- [ ] Ledger entries created

---

## Monitoring & Alerts

### Database Queries for Monitoring

```sql
-- Users with credits expiring in next 7 days
SELECT 
  u.user_id, 
  u.email, 
  cb.available_credits,
  cb.validity_end_date,
  EXTRACT(DAY FROM (cb.validity_end_date - NOW())) as days_remaining
FROM credit_balances cb
JOIN users u ON u.user_id = cb.user_id
WHERE cb.validity_end_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
AND cb.available_credits > 0
ORDER BY cb.validity_end_date;

-- Total credits expiring today
SELECT SUM(credits_remaining) as total_expiring
FROM credit_batches
WHERE DATE(expires_at) = CURRENT_DATE
AND status = 'active';

-- Credit usage statistics
SELECT 
  COUNT(*) as total_users,
  SUM(available_credits) as total_available,
  SUM(used_credits) as total_used,
  SUM(expired_credits) as total_expired
FROM credit_balances;
```

---

## Common Operations

### Manually Add Credits (Promo/Refund)
```sql
-- Add 1000 credits as promotional credits
SELECT add_credit_batch(
  'user-uuid-here',
  1000,
  'promo',
  NULL,
  NULL
);
```

### Refund Credits to User
```sql
-- Return 500 credits to user
SELECT add_credit_batch(
  'user-uuid-here',
  500,
  'refund',
  NULL,
  NULL
);
```

### Check User's Credit Status
```sql
-- Summary
SELECT * FROM credit_balances WHERE user_id = 'user-uuid-here';

-- Active batches
SELECT * FROM credit_batches 
WHERE user_id = 'user-uuid-here' 
AND status = 'active'
ORDER BY expires_at;

-- Recent transactions
SELECT * FROM credit_ledger 
WHERE user_id = 'user-uuid-here' 
ORDER BY created_at DESC 
LIMIT 20;
```

### Manually Expire Credits
```sql
-- Force expire credits for testing
UPDATE credit_batches
SET expires_at = NOW() - INTERVAL '1 day'
WHERE user_id = 'user-uuid-here';

-- Then run expiry function
SELECT * FROM expire_old_credits();
```

---

## Next Steps

1. ✅ **Database**: Run migration script
2. ⚠️ **Backend**: Implement API endpoints
3. ⚠️ **Cron Job**: Set up daily expiry job
4. ⚠️ **Frontend**: Update UI components
5. ⚠️ **Testing**: Test all scenarios
6. ⚠️ **Monitoring**: Set up alerts for expiring credits
7. ⚠️ **Documentation**: Update user-facing docs

---

## Questions?

- **Q: What if a user tops up exactly at 365 days remaining?**
  - A: New validity stays at 365 days (already at cap)

- **Q: What happens to credits when booking is cancelled?**
  - A: Credits should be refunded using `add_credit_batch()` with source='refund'

- **Q: Can admin extend validity manually?**
  - A: Yes, by updating `expires_at` in `credit_batches` table

- **Q: How to handle promotional credits with different validity?**
  - A: Use `add_credit_batch()` with custom `validity_days` parameter

---

**Status**: Database design complete, ready for backend implementation.
