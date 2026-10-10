const pool = require("../db");

const occurrenceSummarySql = `
  SELECT
    co.booking_id,
    COUNT(*)::integer AS occurrence_count,
    COUNT(*) FILTER (WHERE co.status = 'cancelled')::integer AS cancelled_count,
    COUNT(*) FILTER (WHERE co.status = 'completed')::integer AS completed_count,
    COUNT(*) FILTER (
      WHERE co.status IN ('scheduled', 'rescheduled')
        AND co.scheduled_date >= NOW()
    )::integer AS upcoming_count,
    jsonb_agg(
      jsonb_build_object(
        'occurrence_id', co.occurrence_id,
        'occurrence_number', co.occurrence_number,
        'scheduled_date', co.scheduled_date,
        'scheduled_end_date', co.scheduled_end_date,
        'status', co.status,
        'attended', co.attended,
        'rescheduled_to', co.rescheduled_to,
        'cancellation_reason', co.cancellation_reason,
        'cancelled_by', co.cancelled_by
      )
      ORDER BY co.occurrence_number
    ) AS occurrences
  FROM class_occurrences co
  GROUP BY co.booking_id
`;

const bookingRowsSql = `
  WITH occurrence_summary AS (${occurrenceSummarySql}),
  booking_rows AS (
    SELECT
      b.booking_id,
      b.start_date,
      b.end_date,
      b.enrolled_package_type,
      b.classes_total,
      b.classes_attended,
      b.classes_remaining,
      b.charged_credits,
      b.dollars_per_credit,
      b.status,
      b.policy_snapshot,
      b.cancelled_at,
      b.cancelled_by,
      b.cancellation_reason,
      b.refunded_credits,
      b.refund_percentage,
      b.created_at,
      b.updated_at,
      u.user_id,
      u.name AS parent_name,
      u.email AS parent_email,
      u.phone_number AS parent_phone,
      c.child_id,
      c.name AS child_name,
      c.date_of_birth AS child_date_of_birth,
      c.gender AS child_gender,
      l.listing_id,
      l.listing_title,
      p.partner_id,
      p.partner_name,
      p.email AS partner_email,
      s.schedule_id,
      s.day AS schedule_day,
      s.start_time AS schedule_start_time,
      s.end_time AS schedule_end_time,
      o.outlet_id,
      o.outlet_name,
      o.address AS outlet_address,
      o.nearest_mrt,
      COALESCE(os.occurrence_count, 0) AS occurrence_count,
      COALESCE(os.cancelled_count, 0) AS cancelled_count,
      COALESCE(os.completed_count, 0) AS completed_count,
      COALESCE(os.upcoming_count, 0) AS upcoming_count,
      COALESCE(os.occurrences, '[]'::jsonb) AS occurrences,
      CASE
        WHEN b.status = 'cancelled' THEN 'cancelled'
        WHEN COALESCE(os.occurrence_count, 0) > 0
          AND os.cancelled_count = os.occurrence_count THEN 'cancelled'
        WHEN b.start_date > NOW() THEN 'upcoming'
        WHEN b.end_date >= NOW() THEN 'in_progress'
        ELSE 'completed'
      END AS booking_status
    FROM bookings b
    JOIN users u ON u.user_id = b.user_id
    LEFT JOIN children c ON c.child_id = b.child_id
    JOIN listings l ON l.listing_id = b.listing_id
    JOIN partners p ON p.partner_id = l.partner_id
    LEFT JOIN schedules s ON s.schedule_id = b.schedule_id
    LEFT JOIN listingOutlets lo ON lo.listing_outlet_id = s.listing_outlet_id
    LEFT JOIN outlets o ON o.outlet_id = lo.outlet_id
    LEFT JOIN occurrence_summary os ON os.booking_id = b.booking_id
  )
`;

const listAdminBookings = async ({
  dbPool = pool,
  search,
  status,
  page,
  limit,
  offset,
}) => {
  const [bookingsResult, summaryResult] = await Promise.all([
    dbPool.query(
      `${bookingRowsSql}
       SELECT booking_rows.*,
              (COUNT(*) OVER())::integer AS filtered_total
       FROM booking_rows
       WHERE (
         $1 = '' OR
         booking_id::text ILIKE '%' || $1 || '%' OR
         parent_name ILIKE '%' || $1 || '%' OR
         parent_email ILIKE '%' || $1 || '%' OR
         child_name ILIKE '%' || $1 || '%' OR
         listing_title ILIKE '%' || $1 || '%' OR
         partner_name ILIKE '%' || $1 || '%' OR
         outlet_name ILIKE '%' || $1 || '%'
       )
         AND ($2 = 'all' OR booking_status = $2)
       ORDER BY created_at DESC, booking_id DESC
       LIMIT $3 OFFSET $4`,
      [search, status, limit, offset],
    ),
    dbPool.query(
      `${bookingRowsSql}
       SELECT
         COUNT(*)::integer AS total,
         COUNT(*) FILTER (WHERE booking_status = 'upcoming')::integer AS upcoming,
         COUNT(*) FILTER (WHERE booking_status = 'in_progress')::integer AS in_progress,
         COUNT(*) FILTER (WHERE booking_status = 'completed')::integer AS completed,
         COUNT(*) FILTER (WHERE booking_status = 'cancelled')::integer AS cancelled
       FROM booking_rows`,
    ),
  ]);

  const total = bookingsResult.rows[0]?.filtered_total || 0;
  const bookings = bookingsResult.rows.map(
    ({ filtered_total: _filteredTotal, ...booking }) => booking,
  );

  return {
    bookings,
    summary: summaryResult.rows[0],
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  };
};

module.exports = { listAdminBookings };
