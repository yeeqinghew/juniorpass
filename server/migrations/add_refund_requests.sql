CREATE TABLE IF NOT EXISTS refund_requests (
  refund_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(booking_id) ON DELETE RESTRICT,
  parent_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  requested_credits INTEGER NOT NULL CHECK (requested_credits > 0),
  reason VARCHAR(1000) NOT NULL,
  internal_notes VARCHAR(2000),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processed', 'rejected', 'failed')),
  requested_by UUID NOT NULL REFERENCES admins(admin_id) ON DELETE RESTRICT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by UUID REFERENCES admins(admin_id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  review_note VARCHAR(1000),
  idempotency_key UUID NOT NULL UNIQUE,
  credit_adjustment_id UUID REFERENCES credit_adjustments(adjustment_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS refund_requests_status_requested_idx
  ON refund_requests(status, requested_at DESC);
