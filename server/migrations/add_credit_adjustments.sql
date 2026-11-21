-- Immutable, idempotent audit records for manual parent and partner balance changes.
CREATE TABLE IF NOT EXISTS credit_adjustments (
    adjustment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('parent', 'partner')),
    parent_id UUID REFERENCES users(user_id) ON DELETE RESTRICT,
    partner_id UUID REFERENCES partners(partner_id) ON DELETE RESTRICT,
    credit_delta INTEGER NOT NULL CHECK (credit_delta <> 0),
    balance_before INTEGER NOT NULL CHECK (balance_before >= 0),
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    reason VARCHAR(1000) NOT NULL CHECK (LENGTH(TRIM(reason)) >= 10),
    reference VARCHAR(200),
    idempotency_key VARCHAR(100) NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES admins(admin_id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (balance_after = balance_before + credit_delta),
    CHECK (
      (account_type = 'parent' AND parent_id IS NOT NULL AND partner_id IS NULL)
      OR
      (account_type = 'partner' AND partner_id IS NOT NULL AND parent_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS credit_adjustments_parent_created_idx
    ON credit_adjustments(parent_id, created_at DESC)
    WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS credit_adjustments_partner_created_idx
    ON credit_adjustments(partner_id, created_at DESC)
    WHERE partner_id IS NOT NULL;

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS credit_adjustment_id UUID
    REFERENCES credit_adjustments(adjustment_id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_credit_adjustment_uidx
    ON transactions(credit_adjustment_id)
    WHERE credit_adjustment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION prevent_credit_adjustment_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'credit adjustments are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS credit_adjustments_immutable ON credit_adjustments;
CREATE TRIGGER credit_adjustments_immutable
    BEFORE UPDATE OR DELETE ON credit_adjustments
    FOR EACH ROW EXECUTE FUNCTION prevent_credit_adjustment_mutation();

-- Partner payouts are optional in older environments. Add the linkage only
-- where that ledger has already been installed. The linked ledger entries use
-- the existing MANUAL_ADJUSTMENT source when an admin changes a partner balance.
DO $$
BEGIN
    IF to_regclass('partner_earnings') IS NOT NULL THEN
        ALTER TABLE partner_earnings
            ADD COLUMN IF NOT EXISTS credit_adjustment_id UUID
            REFERENCES credit_adjustments(adjustment_id) ON DELETE RESTRICT;
        CREATE UNIQUE INDEX IF NOT EXISTS partner_earnings_credit_adjustment_uidx
            ON partner_earnings(credit_adjustment_id)
            WHERE credit_adjustment_id IS NOT NULL;
    END IF;
END;
$$;
