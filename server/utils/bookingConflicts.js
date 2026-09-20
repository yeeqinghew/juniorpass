const getIntervalDays = (frequency) => {
  if (frequency === "Biweekly") return 14;
  if (frequency === "Monthly") return 30;
  return 7;
};

const buildOccurrenceWindows = ({ startDate, endDate, classCount, frequency }) => {
  const firstStart = new Date(startDate);
  const firstEnd = new Date(endDate);
  const durationMs = firstEnd.getTime() - firstStart.getTime();
  const intervalDays = getIntervalDays(frequency);

  return Array.from({ length: classCount }, (_, index) => {
    const start = new Date(
      firstStart.getTime() + index * intervalDays * 24 * 60 * 60 * 1000,
    );
    return {
      start_at: start.toISOString(),
      end_at: new Date(start.getTime() + durationMs).toISOString(),
    };
  });
};

const findChildBookingConflicts = async (db, childId, occurrences) => {
  const result = await db.query(
    `WITH proposed AS (
       SELECT start_at, end_at
       FROM jsonb_to_recordset($2::jsonb)
         AS proposed_occurrence(start_at timestamptz, end_at timestamptz)
     ), existing AS (
       SELECT co.occurrence_id,
              co.scheduled_date AS start_at,
              co.scheduled_end_date AS end_at,
              l.listing_title,
              COALESCE(
                b.child_id,
                (
                  SELECT t.child_id
                  FROM transactions t
                  WHERE t.parent_id = b.user_id
                    AND t.listing_id = b.listing_id
                    AND t.transaction_type = 'DEBIT'
                    AND t.child_id IS NOT NULL
                    AND t.created_at >= b.created_at
                  ORDER BY t.created_at ASC
                  LIMIT 1
                )
              ) AS child_id
       FROM class_occurrences co
       JOIN bookings b ON b.booking_id = co.booking_id
       JOIN listings l ON l.listing_id = b.listing_id
       WHERE co.status IN ('scheduled', 'rescheduled')
     )
     SELECT DISTINCT ON (existing.occurrence_id)
            existing.occurrence_id,
            existing.listing_title,
            existing.start_at,
            existing.end_at,
            (existing.start_at < proposed.end_at
              AND existing.end_at > proposed.start_at) AS is_overlap
     FROM proposed
     JOIN existing
       ON existing.child_id = $1
      AND existing.start_at::date = proposed.start_at::date
     ORDER BY existing.occurrence_id, is_overlap DESC, existing.start_at`,
    [childId, JSON.stringify(occurrences)],
  );

  return result.rows;
};

module.exports = { buildOccurrenceWindows, findChildBookingConflicts };
