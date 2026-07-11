-- Migration: Add class_occurrences table for individual class sessions
-- This allows tracking each class in a booking package separately

CREATE TYPE occurrence_status AS ENUM ('scheduled', 'completed', 'cancelled', 'rescheduled');

CREATE TABLE class_occurrences (
    occurrence_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID REFERENCES bookings(booking_id) ON DELETE CASCADE NOT NULL,

    -- Scheduled time for this specific class
    scheduled_date TIMESTAMP NOT NULL,
    scheduled_end_date TIMESTAMP NOT NULL,

    -- Class status and tracking
    status occurrence_status DEFAULT 'scheduled',
    attended BOOLEAN DEFAULT false,

    -- If rescheduled, track the new date
    rescheduled_to TIMESTAMP,

    -- Occurrence sequence (1st class, 2nd class, etc.)
    occurrence_number INTEGER NOT NULL CHECK (occurrence_number > 0),

    -- Cancellation/rescheduling info
    cancellation_reason TEXT,
    cancelled_by VARCHAR(50), -- 'partner' or 'user'

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Ensure unique occurrence numbers per booking
    UNIQUE (booking_id, occurrence_number)
);

-- Indexes for common queries
CREATE INDEX idx_occurrences_booking ON class_occurrences(booking_id);
CREATE INDEX idx_occurrences_scheduled_date ON class_occurrences(scheduled_date);
CREATE INDEX idx_occurrences_status ON class_occurrences(status);

-- Trigger for updated_at
CREATE TRIGGER set_timestamp_class_occurrences
    BEFORE UPDATE ON class_occurrences
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

-- Add a comment
COMMENT ON TABLE class_occurrences IS 'Individual class sessions within a booking package. Allows tracking attendance, cancellations, and rescheduling per class.';
