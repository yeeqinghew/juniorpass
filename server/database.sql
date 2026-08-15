CREATE DATABASE juniorPASS;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS children CASCADE;
DROP TABLE IF EXISTS parents CASCADE;
DROP TABLE IF EXISTS listings CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS partners CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS admins CASCADE;
DROP TABLE IF EXISTS ageGroups CASCADE;
DROP TABLE IF EXISTS categoriesListings CASCADE;
DROP TABLE IF EXISTS packageTypes CASCADE;
DROP TABLE IF EXISTS outlets CASCADE;
DROP TABLE IF EXISTS listingOutlets CASCADE;
DROP TABLE IF EXISTS schedules CASCADE;
DROP TABLE IF EXISTS partnerForms CASCADE;
DROP TABLE IF EXISTS passwordResets CASCADE;
DROP TABLE IF EXISTS otpRequests CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS referral_codes CASCADE;
DROP TABLE IF EXISTS referrals CASCADE;

DROP TYPE IF EXISTS user_types CASCADE;
DROP TYPE IF EXISTS methods CASCADE;
DROP TYPE IF EXISTS genders CASCADE;
DROP TYPE IF EXISTS categories CASCADE;
DROP TYPE IF EXISTS package_types CASCADE;
DROP TYPE IF EXISTS transaction_types CASCADE;
DROP TYPE IF EXISTS age_groups CASCADE;

CREATE OR REPLACE FUNCTION trigger_set_timestamp ()
    RETURNS TRIGGER
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$
LANGUAGE plpgsql;

CREATE TYPE user_types AS ENUM ('parent', 'child');
CREATE TYPE methods AS ENUM('email', 'gmail');
CREATE TYPE genders AS ENUM('M', 'F');
CREATE TYPE categories AS ENUM('Sports', 'Music');
CREATE TYPE package_types AS ENUM('trial', 'pay-as-you-go', 'short-term', 'full-term');
CREATE TYPE transaction_types AS ENUM('CREDIT', 'DEBIT');
CREATE TYPE age_groups AS ENUM ('infant', 'toddler', 'preschooler', 'above-7');
CREATE TYPE payment_status AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

CREATE TABLE users (
    user_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255),
    phone_number VARCHAR(8) UNIQUE,
    user_type user_types,
    method methods NOT NULL DEFAULT 'email', -- login method used
    credit INTEGER DEFAULT 0,
    display_picture VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- automate updated_at timestamp on update
CREATE TRIGGER set_timestamp_users
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE TABLE parents (
    parent_id uuid PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE children (
    child_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id uuid REFERENCES parents(parent_id) ON DELETE CASCADE,
    name VARCHAR(100),
    date_of_birth DATE NOT NULL,
    gender genders NOT NULL,
    special_notes TEXT
);

-- a helper function to caclulate age from dob
CREATE OR REPLACE FUNCTION calculate_age(dob DATE)
RETURNS INTEGER AS $$
BEGIN
    RETURN EXTRACT(YEAR FROM AGE(CURRENT_DATE, dob));
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE VIEW children_with_age AS
SELECT
    child_id,
    parent_id,
    name,
    date_of_birth,
    calculate_age(date_of_birth) AS age,
    gender,
    special_notes
FROM children;

CREATE TABLE referral_codes (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    code VARCHAR(10) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- speeds up fetching a user's referral code by user_id
CREATE INDEX idx_referral_codes_user on referral_codes(user_id);

CREATE TABLE referrals (
    id SERIAL PRIMARY KEY,
    referrer_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    referee_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending', -- pending, completed, expired, cancelled
    completed_at TIMESTAMP,  -- When referral was completed
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    expired_at TIMESTAMP     -- e.g. 30 days after created_at
);

CREATE TRIGGER set_timestamp_referrals
    BEFORE UPDATE ON referrals
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

-- PARTNER PORTAL
CREATE TABLE partners (
    partner_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    partner_name VARCHAR(100) DEFAULT 'New Partner',
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(244) NOT NULL,
    description VARCHAR(1000) DEFAULT 'Profile setup in progress',
    website VARCHAR(1000),
    rating BIGINT DEFAULT 0,
    credit INTEGER DEFAULT 0,  -- Partner's credit balance from bookings
    picture VARCHAR(1000),
    address VARCHAR(1000),
    region VARCHAR(50),
    contact_number VARCHAR(8),
    categories categories[],
    is_profile_complete BOOLEAN DEFAULT true,
    requires_password_change BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- For newly invited partners, these will be set to false and true respectively
-- Existing partners are marked as complete with no password change required
CREATE INDEX IF NOT EXISTS idx_partners_profile_complete ON partners(is_profile_complete);
CREATE INDEX IF NOT EXISTS idx_partners_password_change ON partners(requires_password_change);

CREATE TRIGGER set_timestamp_partners
    BEFORE UPDATE ON partners
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

-- If migrating an existing database, run this to add the credit column:
-- ALTER TABLE partners ADD COLUMN IF NOT EXISTS credit INTEGER DEFAULT 0;

INSERT INTO partners(partner_name, email, password, description, website, picture, address, region, contact_number, categories, created_at)
    VALUES
    ('SG Basketball', 'admin@sgbasketball.com', '$2b$10$tk2dxadGFGRMGsj3mjJr2OQ4VpsxvS7cSvajbTUbRJIchUOvYOAGO', 'SG Basketball Pte Ltd is the leading service provider for basketball in Singapore. Our programs and events cater for players of all ages, from beginner to advanced levels. Our coaches and tournament organizers are passionate about ensuring that every participant has a positive experience - and that their sport experience enriches their lives.', 
     'https://www.sgbasketball.com/', 'https://images.squarespace-cdn.com/content/v1/5ad0064b31d4df14309baeb5/1561030353172-ES8S0PN75WS044UIWCDT/SGBASKETBALL.png?format=1500w', '750B Chai Chee Rd #01-02 S(469002)', 'Kembangan', '98763456', '{"Sports"}', CURRENT_TIMESTAMP)
 
    , ('Swim Werks', 'sales@swimwerks.com.sg', '$2b$10$tk2dxadGFGRMGsj3mjJr2OQ4VpsxvS7cSvajbTUbRJIchUOvYOAGO', 'Swimwerks is a trusted provider of lifeguard services for various organisations in Singapore, playing a key role in ensuring the safety of thousands of swimmers across a multitude of contexts, from the open seas to hotel swimming pools.', 
     'https://swimwerks.com.sg/', 'https://swimwerks.com.sg/wp-content/uploads/2023/04/Swimwerks-Logo.png', '3 Gambas Cres, #07-11 Nordcom 1, Singapore 757088', 'Sembawang', '66986645', '{"Sports"}',CURRENT_TIMESTAMP)

    , ('Aureus Academy', 'contact@areusacademy.com', '$2b$10$tk2dxadGFGRMGsj3mjJr2OQ4VpsxvS7cSvajbTUbRJIchUOvYOAGO', 'Aureus Academy is Singapore''s fastest growing music school with over 18,000 students enrolled between all our schools.', 
     'https://www.aureusacademy.com/', 'https://w7.pngwing.com/pngs/949/42/png-transparent-aureus-academy-at-northpoint-city-music-lesson-aureus-academy-at-eastpoint-others-text-trademark-logo.png', '23 Serangoon Central, #04-01A/02 NEX, Singapore 556083', 'Serangoon', '65742231', '{"Music"}', CURRENT_TIMESTAMP)

    , ('Little Kickers', 'Singapore@littlekickers.sg', '$2b$10$tk2dxadGFGRMGsj3mjJr2OQ4VpsxvS7cSvajbTUbRJIchUOvYOAGO', 'The home of pre-school football we believe in something we call "Play not Push". It means teaching football in a fun, pressure-free environment. We want to give children a positive introduction to sport as a whole and have FUN along the way', 
     'https://www.littlekickers.sg/', 'https://pbs.twimg.com/profile_images/1205502044741742592/aA3NOOhs_400x400.jpg', '16 Raffles Quay, Hong Leong Building Singapore, Singapore 48581', 'City Hall', '67890987', '{"Sports"}', CURRENT_TIMESTAMP)
    ;

CREATE TABLE listings (
    listing_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    partner_id uuid REFERENCES partners(partner_id) NOT NULL,
    listing_title VARCHAR(1000) NOT NULL,
    price INTEGER,
    credit INTEGER,
    description VARCHAR(5000),
    rating BIGINT NOT NULL DEFAULT 0,
    -- rating ON UPDATE CASCADE
    age_groups age_groups[] NOT NULL,
    images JSONB,
    registered_parents VARCHAR(500),
    active BOOLEAN,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_listings
    BEFORE UPDATE ON listings
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE TABLE outlets (
    outlet_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    partner_id uuid REFERENCES partners(partner_id) ON DELETE CASCADE,
    address VARCHAR(1000),
    nearest_mrt VARCHAR(200),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_outlets
    BEFORE UPDATE ON outlets
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE TABLE listingOutlets (
    listing_outlet_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id uuid REFERENCES listings(listing_id) ON DELETE CASCADE,
    outlet_id uuid REFERENCES outlets(outlet_id) ON DELETE CASCADE,
    UNIQUE (listing_id, outlet_id)
);

CREATE TABLE schedules (
    schedule_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_outlet_id uuid REFERENCES listingOutlets(listing_outlet_id) ON DELETE CASCADE,
    schedule_group_id UUID REFERENCES schedule_groups(schedule_group_id) ON DELETE CASCADE,
    day TEXT CHECK (day IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_schedules_schedule_group ON schedules(schedule_group_id);

CREATE TRIGGER set_timestamp_schedules
    BEFORE UPDATE ON schedules
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();


CREATE TABLE schedule_groups (
  schedule_group_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_outlet_id UUID REFERENCES listingOutlets(listing_outlet_id) ON DELETE CASCADE NOT NULL,

  -- Package configuration (moved from schedules)
  package_types package_types[] NOT NULL DEFAULT ARRAY['pay-as-you-go']::package_types[],
  is_progressive BOOLEAN DEFAULT false,

  -- Full-term package config
  full_term_start_date TIMESTAMP,
  full_term_class_count INTEGER CHECK (full_term_class_count > 0),
  short_term_class_count INTEGER CHECK (short_term_class_count > 0),

  -- Pricing (in dollars)
  price_payg DECIMAL(10, 2) CHECK (price_payg >= 0),
  price_fullterm DECIMAL(10, 2) CHECK (price_fullterm >= 0),
  price_shortterm DECIMAL(10, 2) CHECK (price_shortterm >= 0),

  -- Frequency and slots (shared across all time slots in group)
  frequency TEXT CHECK (frequency IN ('Biweekly', 'Weekly', 'Monthly', 'Yearly')),
  slots INTEGER DEFAULT 10 CHECK (slots >= 1 AND slots <= 100),

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add trigger for updated_at
CREATE TRIGGER set_timestamp_schedule_groups
  BEFORE UPDATE ON schedule_groups
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Add indexes
CREATE INDEX idx_schedule_groups_listing_outlet ON schedule_groups(listing_outlet_id);
CREATE INDEX idx_schedule_groups_package_types ON schedule_groups USING GIN (package_types);
CREATE INDEX idx_schedule_groups_is_progressive ON schedule_groups(is_progressive);
CREATE INDEX idx_schedule_groups_full_term_start ON schedule_groups(full_term_start_date);

-- Add constraints
ALTER TABLE schedule_groups
ADD CONSTRAINT check_schedule_groups_package_types_not_empty
  CHECK (array_length(package_types, 1) > 0);

CREATE TABLE scheduleExceptions (
    exception_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    schedule_id uuid REFERENCES schedules(schedule_id) ON DELETE CASCADE,
    exception_date DATE NOT NULL,
    exception_type VARCHAR(20) CHECK (exception_type IN ('cancelled', 'rescheduled')) NOT NULL,
    reason VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (schedule_id, exception_date)
);

CREATE INDEX idx_schedule_exceptions_schedule_date ON scheduleExceptions(schedule_id, exception_date);

CREATE OR REPLACE FUNCTION calculate_short_term_classes(full_term_class_count INTEGER)
RETURNS INTEGER AS $$
BEGIN
    RETURN CEIL(full_term_class_count * 0.25);
END;
$$ LANGUAGE plpgsql STABLE;
COMMENT ON FUNCTION calculate_short_term_classes IS 'Calculate short-term package classes as 25% of full-term package classes, rounded up.';

CREATE OR REPLACE FUNCTION is_valid_package_combination(types package_types[])
RETURNS BOOLEAN AS $$
BEGIN
    -- Valid combinations:
    -- 1) ['pay-as-you-go']
    -- 2) ['full-term']
    -- 3} ['full-term', 'short-term']
    -- 4) ['trial']
    iF array_length(types, 1) = 1 THEN
        RETURN types[1] IN ('full-term', 'pay-as-you-go', 'trial');
    END IF;

    IF array_length(types, 1) = 2 THEN
        RETURN 'full-term' = ANY(types) AND 'short-term' = ANY(types);
    END IF;

    -- Invalid if more than 2 types
    RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;
COMMENT ON FUNCTION is_valid_package_combination IS 'Validate that package type combination is one of the three allowed configurations."]';


CREATE OR REPLACE FUNCTION trigger_calculate_short_term_classes()
RETURNS TRIGGER AS $$
BEGIN
    -- only calculate if full-term is in package_types and full_term_class_count is set
    IF 'full-term' = ANY(NEW.package_types) AND NEW.full_term_class_count IS NOT NULL THEN
        NEW.short_term_class_count := calculate_short_term_classes(NEW.full_term_class_count);
    ELSE
        NEW.short_term_class_count := NULL; -- No short-term classes if no full-term package
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_short_term_class_count
    BEFORE INSERT OR UPDATE OF full_term_class_count ON schedules
    FOR EACH ROW
    EXECUTE FUNCTION trigger_calculate_short_term_classes();

CREATE OR REPLACE FUNCTION trigger_update_classes_remaining()
RETURNS TRIGGER AS $$
BEGIN
    NEW.classes_remaining := NEW.classes_total - NEW.classes_attended;

    -- update extension eligibility for short-term bookings
    IF NEW.enrolled_package_type = 'short-term' THEN
        -- can extend if: not already extended AND has classes remaining
        NEW.can_extend_to_full_term := (
            NEW.upgraded_from_booking_id IS NULL AND 
            NEW.classes_remaining > 0
        );

        IF NEW.classes_remaining = 1 AND NEW.can_extend_to_full_term THEN
            -- would need to be set based on the actual class start time
            -- for now, we will set to NULL and handle it in application layer
            NEW.extension_deadline := NULL;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_booking_classes
    BEFORE INSERT OR UPDATE OF classes_attended, classes_total ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_classes_remaining();

CREATE OR REPLACE FUNCTION can_book_package_type(
    p_schedule_id UUID,
    p_package_type package_types,
    p_user_id UUID,
    p_current_time TIMESTAMP DEFAULT NOW()
)
RETURNS TABLE(
    can_book BOOLEAN,
    reason TEXT
) AS $$
DECLARE
    v_schedule RECORD;
    v_has_shortterm BOOLEAN;
BEGIN
    -- Get schedule details
    SELECT * FROM schedules
    WHERE schedule_id = p_schedule_id;

    -- Check if package type is available
    IF NOT (p_package_type = ANY(v_schedule.package_types)) THEN
        RETURN QUERY SELECT true, 'Package type not available for this schedule';
        RETURN;
    END IF;
    
    -- Pay-as-you-go always available
    IF p_package_type = 'pay-as-you-go' THEN
        RETURN QUERY SELECT true, 'Pay-as-you-go is always available';
        RETURN;
    END IF;

    -- short-term validation
    IF p_package_type = 'short-term' THEN
        -- check if user has already used short-term
        SELECT EXISTS (
            SELECT 1 FROM bookings b
            JOIN schedules s ON b.schedule_id = s.schedule_id
            WHERE b.child_id IN (
                SELECT child_id FROM children WHERE parent_id = p_user_id
            )
            AND s.schedule_id = p_schedule_id
            AND b.has_used_short_term = true
        ) INTO v_has_shortterm;

        IF v_has_shortterm THEN
            RETURN QUERY SELECT false, 'Short-term already used for this schedule';
            RETURN;
        END IF;

        -- check if past full-term start date (for progressive schedules)
        IF v_schedule.is_progressive AND v_schedule.full_term_start_date IS NOT NULL THEN
            IF p_current_time >= v_schedule.full_term_start_date THEN
                RETURN QUERY SELECT false, 'Short-term booking window has closed for this schedule';
                RETURN;
            END IF;
        END IF;

        RETURN QUERY SELECT true, 'Short-term booking is available';
        RETURN;
    END IF;

    -- full-term validation
    IF p_package_type = 'full-term' THEN
        -- check if progressive and past start date
        IF v_schedule.is_progressive AND v_schedule.full_term_start_date IS NOT NULL THEN
            IF p_current_time > v_schedule.full_term_start_date THEN 
               RETURN QUERY SELECT false, 'Cannot join progressive class mid-cycle';
                RETURN;
            END IF;
        END IF;

        RETURN QUERY SELECT true, 'Full-term booking is available';
        RETURN;
    END IF;

    RETURN QUERY SELECT false, 'Unknown package type';
END;
$$ LANGUAGE plpgsql STABLE;
COMMENT ON FUNCTION can_book_package_type IS 'Validate if a user can book a specific package type at current time, considering progressive classes and short term usage.';

CREATE TABLE payment_requests (
    request_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL,
    credits INTEGER NOT NULL CHECK (credits > 0),
    reference_number VARCHAR(255) NOT NULL,
    hitpay_payment_id VARCHAR(255) NOT NULL,
    status payment_status DEFAULT 'PENDING',
    webhook_received BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP
);

CREATE TABLE transactions (
    transaction_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id uuid REFERENCES parents(parent_id) NOT NULL,
    child_id uuid REFERENCES children(child_id) NOT NULL,
    listing_id uuid REFERENCES listings(listing_id) NOT NULL,
    used_credit INTEGER NOT NULL,
    transaction_type transaction_types NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_transactions
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE TABLE reviews (
    review_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id uuid REFERENCES listings(listing_id) NOT NULL,
    partner_id uuid REFERENCES partners(partner_id) NOT NULL,
    user_id uuid REFERENCES users(user_id) NOT NULL,
    rating INTEGER NOT NULL,
    comment VARCHAR(5000) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_reviews
    BEFORE UPDATE ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE TABLE categoriesListings (
    id SERIAL PRIMARY KEY,
    name categories
);

INSERT INTO categoriesListings (name) 
    VALUES
    ('Music'),
    ('Sports');

CREATE TABLE packageTypes (
    ID SERIAL PRIMARY KEY,
    name VARCHAR(100),
    package_type package_types
);

INSERT INTO packageTypes (name, package_type) 
    VALUES
    ('Trial', 'trial'),
    ('Pay-as-you-go', 'pay-as-you-go'),
    ('Short term package', 'short-term'),
    ('Full term package', 'full-term');

CREATE TABLE ageGroups (
    id SERIAL PRIMARY KEY,
    name age_groups,
    min_age INTEGER,
    max_age INTEGER
);

INSERT INTO ageGroups (name, min_age, max_age) 
    VALUES
    ('infant', 0, 1),
    ('toddler', 1, 2),
    ('preschooler', 3, 6),
    ('above-7', 7, null);

-- ADMIN PORTAL
CREATE TABLE admins (
    admin_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(20),
    password VARCHAR(200)
);

INSERT INTO admins (username, password)
    VALUES('superadmin', '$2b$10$tk2dxadGFGRMGsj3mjJr2OQ4VpsxvS7cSvajbTUbRJIchUOvYOAGO');

CREATE TABLE partnerForms (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    contact_person_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    message TEXT,
    responded BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_partner_forms
    BEFORE UPDATE ON partnerForms
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE TABLE passwordResets (
    reset_id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL
);

CREATE TABLE otpRequests (
    otp_id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    otp VARCHAR(6) NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL
);

-- BOOKINGS: stores user bookings for listings
CREATE TABLE bookings (
    booking_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id uuid REFERENCES listings(listing_id) ON DELETE CASCADE,
    schedule_id uuid REFERENCES schedules(schedule_id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(user_id) ON DELETE CASCADE,
    schedule_group_id UUID REFERENCES schedule_groups(schedule_group_id) ON DELETE CASCADE,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    enrolled_package_type package_types,
    classes_total INTEGER,
    classes_attended INTEGER DEFAULT 0,
    classes_remaining INTEGER,
    has_used_short_term BOOLEAN DEFAULT false,
    can_extend_to_full_term BOOLEAN DEFAULT false,
    extension_deadline TIMESTAMP,
    upgraded_from_booking_id UUID REFERENCES bookings(booking_id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_bookings
    BEFORE UPDATE ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

-- Helpful index for overlap checks by user and date range
CREATE INDEX idx_bookings_user_date ON bookings (user_id, start_date, end_date);
-- Index for checking schedule capacity
CREATE INDEX idx_bookings_schedule_date ON bookings (schedule_id, start_date, end_date);
-- Keep schedule_id for tracking which specific time slots were attended
CREATE INDEX idx_bookings_schedule_group ON bookings(schedule_group_id);

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

-- NOTIFICATIONS: generic notification system for users, partners, and admins
CREATE TABLE notifications (
    notification_id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_type TEXT CHECK (recipient_type IN ('user','partner','admin')) NOT NULL,
    recipient_id uuid NOT NULL,
    type TEXT NOT NULL,                           -- e.g. 'booking', 'listing_update', 'user_registration'
    title VARCHAR(255) NOT NULL,
    message VARCHAR(2000),
    data JSONB,                                   -- extra payload e.g. { listing_id, start_date, end_date, credit }
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_notifications
    BEFORE UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

-- Helpful indexes to fetch notifications by recipient
CREATE INDEX idx_notifications_recipient ON notifications (recipient_type, recipient_id);
CREATE INDEX idx_notifications_created_at ON notifications (created_at);
