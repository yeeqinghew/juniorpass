const express = require("express");
const router = express.Router();
const pool = require("../db");
const authorization = require("../middleware/authorization");
const { AUTH_ROLES } = require("../constants/auth");
const {
  REVIEW_WINDOW_DAYS,
  REVIEW_TAGS,
  normalizeReviewInput,
} = require("../utils/reviews");

const userAuthorization = authorization.forRole(AUTH_ROLES.USER);
const partnerAuthorization = authorization.forRole(AUTH_ROLES.PARTNER);
const adminAuthorization = authorization.forRole(AUTH_ROLES.ADMIN);

const bookingReviewWindowSql = `
  SELECT
    b.booking_id,
    b.listing_id,
    l.partner_id,
    l.listing_title,
    l.images,
    b.enrolled_package_type,
    b.status AS booking_status,
    b.cancelled_at,
    COALESCE(MIN(co.scheduled_date), b.start_date) AS first_session_at,
    CASE
      WHEN b.status = 'cancelled'
        AND b.cancelled_at > COALESCE(MIN(co.scheduled_date), b.start_date)
        THEN b.cancelled_at
      ELSE COALESCE(MAX(co.scheduled_end_date), b.end_date)
    END AS review_opened_at
  FROM bookings b
  JOIN listings l ON l.listing_id = b.listing_id
  LEFT JOIN class_occurrences co ON co.booking_id = b.booking_id
  WHERE b.booking_id = $1 AND b.user_id = $2
  GROUP BY b.booking_id, l.partner_id, l.listing_title, l.images
`;

router.get("/listing/:listingId", async (req, res) => {
  try {
    const [reviews, summary] = await Promise.all([
      pool.query(
        `SELECT r.review_id, r.rating, r.comment, r.tags,
                r.attended_at_least_one, r.partner_reply,
                r.partner_replied_at, r.created_at, r.updated_at,
                CASE
                  WHEN NULLIF(BTRIM(u.name), '') IS NULL THEN 'JuniorPASS parent'
                  ELSE SPLIT_PART(BTRIM(u.name), ' ', 1)
                END AS reviewer_name
         FROM reviews r
         JOIN users u ON u.user_id = r.user_id
         WHERE r.listing_id = $1 AND r.status = 'published'
         ORDER BY r.created_at DESC`,
        [req.params.listingId],
      ),
      pool.query(
        `SELECT COUNT(*)::integer AS count,
                COALESCE(ROUND(AVG(rating)::numeric, 1), 0) AS average_rating
         FROM reviews
         WHERE listing_id = $1 AND status = 'published'`,
        [req.params.listingId],
      ),
    ]);
    res.json({ reviews: reviews.rows, summary: summary.rows[0] });
  } catch (error) {
    console.error("Unable to load listing reviews:", error.message);
    res.status(500).json({ error: "Unable to load reviews" });
  }
});

router.get("/mine/eligibility", userAuthorization, async (req, res) => {
  try {
    const result = await pool.query(
      `WITH booking_windows AS (
         SELECT b.booking_id, b.listing_id, b.enrolled_package_type,
                b.status AS booking_status, b.cancelled_at,
                l.listing_title, l.images,
                COALESCE(MIN(co.scheduled_date), b.start_date) AS first_session_at,
                CASE
                  WHEN b.status = 'cancelled'
                    AND b.cancelled_at > COALESCE(MIN(co.scheduled_date), b.start_date)
                    THEN b.cancelled_at
                  ELSE COALESCE(MAX(co.scheduled_end_date), b.end_date)
                END AS review_opened_at
         FROM bookings b
         JOIN listings l ON l.listing_id = b.listing_id
         LEFT JOIN class_occurrences co ON co.booking_id = b.booking_id
         WHERE b.user_id = $1
         GROUP BY b.booking_id, l.listing_title, l.images
       )
       SELECT bw.*,
              bw.review_opened_at + ($2::text || ' days')::interval AS review_deadline,
              r.review_id, r.rating, r.comment, r.tags,
              r.attended_at_least_one, r.status AS review_status,
              r.partner_reply, r.created_at AS reviewed_at,
              (
                NOW() >= bw.review_opened_at
                AND NOW() <= bw.review_opened_at + ($2::text || ' days')::interval
                AND (
                  bw.booking_status = 'confirmed'
                  OR (bw.booking_status = 'cancelled' AND bw.cancelled_at > bw.first_session_at)
                )
              ) AS can_review
       FROM booking_windows bw
       LEFT JOIN reviews r ON r.booking_id = bw.booking_id
       WHERE r.review_id IS NOT NULL
          OR NOW() BETWEEN bw.review_opened_at
             AND bw.review_opened_at + ($2::text || ' days')::interval
       ORDER BY bw.review_opened_at DESC`,
      [req.user, REVIEW_WINDOW_DAYS],
    );
    res.json({ bookings: result.rows, allowed_tags: REVIEW_TAGS });
  } catch (error) {
    console.error("Unable to load review eligibility:", error.message);
    res.status(500).json({ error: "Unable to load review eligibility" });
  }
});

router.post("/", userAuthorization, async (req, res) => {
  const input = normalizeReviewInput(req.body);
  if (!input || !req.body.booking_id) {
    return res.status(400).json({ error: "Enter a rating from 1 to 5 and a valid review" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT booking_id FROM bookings WHERE booking_id = $1 FOR UPDATE", [
      req.body.booking_id,
    ]);
    const booking = await client.query(bookingReviewWindowSql, [
      req.body.booking_id,
      req.user,
    ]);
    if (booking.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Booking not found" });
    }

    const details = booking.rows[0];
    const openedAt = new Date(details.review_opened_at);
    const deadline = new Date(openedAt);
    deadline.setUTCDate(deadline.getUTCDate() + REVIEW_WINDOW_DAYS);
    const now = new Date();
    const eligibleBooking =
      details.booking_status === "confirmed" ||
      (details.booking_status === "cancelled" &&
        details.cancelled_at &&
        new Date(details.cancelled_at) > new Date(details.first_session_at));
    if (now < openedAt || now > deadline || !eligibleBooking) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This booking is not currently open for review" });
    }

    const created = await client.query(
      `INSERT INTO reviews (
         booking_id, listing_id, partner_id, user_id, rating, comment,
         tags, attended_at_least_one, review_opened_at, review_deadline
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        details.booking_id,
        details.listing_id,
        details.partner_id,
        req.user,
        input.rating,
        input.comment,
        input.tags,
        input.attendedAtLeastOne,
        openedAt,
        deadline,
      ],
    );
    await client.query(
      `INSERT INTO notifications (
         recipient_type, recipient_id, type, title, message, data
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        AUTH_ROLES.PARTNER,
        details.partner_id,
        "review_received",
        `New review: ${details.listing_title}`,
        `A parent left a ${input.rating}-star verified booking review.`,
        JSON.stringify({
          review_id: created.rows[0].review_id,
          listing_id: details.listing_id,
        }),
      ],
    );
    await client.query("COMMIT");
    res.status(201).json({ review: created.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.code === "23505") {
      return res.status(409).json({ error: "You already reviewed this booking" });
    }
    console.error("Unable to create review:", error.message);
    res.status(500).json({ error: "Unable to save review" });
  } finally {
    client.release();
  }
});

router.patch("/:reviewId", userAuthorization, async (req, res) => {
  const input = normalizeReviewInput(req.body);
  if (!input) return res.status(400).json({ error: "Invalid review" });
  try {
    const updated = await pool.query(
      `UPDATE reviews
       SET rating = $1, comment = $2, tags = $3,
           attended_at_least_one = $4
       WHERE review_id = $5 AND user_id = $6
         AND NOW() <= review_deadline
       RETURNING *`,
      [input.rating, input.comment, input.tags, input.attendedAtLeastOne, req.params.reviewId, req.user],
    );
    if (updated.rowCount === 0) {
      return res.status(409).json({ error: "This review can no longer be edited" });
    }
    res.json({ review: updated.rows[0] });
  } catch (error) {
    console.error("Unable to update review:", error.message);
    res.status(500).json({ error: "Unable to update review" });
  }
});

router.delete("/:reviewId", userAuthorization, async (req, res) => {
  try {
    const deleted = await pool.query(
      "DELETE FROM reviews WHERE review_id = $1 AND user_id = $2 RETURNING review_id",
      [req.params.reviewId, req.user],
    );
    if (deleted.rowCount === 0) return res.status(404).json({ error: "Review not found" });
    res.status(204).send();
  } catch (error) {
    console.error("Unable to delete review:", error.message);
    res.status(500).json({ error: "Unable to delete review" });
  }
});

router.get("/partner/all", partnerAuthorization, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, l.listing_title,
              CASE WHEN NULLIF(BTRIM(u.name), '') IS NULL THEN 'JuniorPASS parent'
                   ELSE SPLIT_PART(BTRIM(u.name), ' ', 1) END AS reviewer_name
       FROM reviews r
       JOIN listings l ON l.listing_id = r.listing_id
       JOIN users u ON u.user_id = r.user_id
       WHERE r.partner_id = $1
       ORDER BY r.created_at DESC`,
      [req.user],
    );
    res.json({ reviews: result.rows });
  } catch (error) {
    console.error("Unable to load partner reviews:", error.message);
    res.status(500).json({ error: "Unable to load reviews" });
  }
});

router.patch("/:reviewId/reply", partnerAuthorization, async (req, res) => {
  const reply = typeof req.body.reply === "string" ? req.body.reply.trim() : "";
  if (!reply || reply.length > 1000) {
    return res.status(400).json({ error: "Reply must be between 1 and 1,000 characters" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      `UPDATE reviews SET partner_reply = $1, partner_replied_at = NOW()
       WHERE review_id = $2 AND partner_id = $3
       RETURNING *`,
      [reply, req.params.reviewId, req.user],
    );
    if (updated.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Review not found" });
    }
    await client.query(
      `INSERT INTO notifications (
         recipient_type, recipient_id, type, title, message, data
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        AUTH_ROLES.USER,
        updated.rows[0].user_id,
        "review_reply",
        "Partner responded to your review",
        "The activity partner posted a public response to your review.",
        JSON.stringify({
          review_id: updated.rows[0].review_id,
          listing_id: updated.rows[0].listing_id,
        }),
      ],
    );
    await client.query("COMMIT");
    res.json({ review: updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Unable to reply to review:", error.message);
    res.status(500).json({ error: "Unable to save reply" });
  } finally {
    client.release();
  }
});

router.get("/admin/all", adminAuthorization, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, l.listing_title, p.partner_name, u.name AS reviewer_name,
              u.email AS reviewer_email
       FROM reviews r
       JOIN listings l ON l.listing_id = r.listing_id
       JOIN partners p ON p.partner_id = r.partner_id
       JOIN users u ON u.user_id = r.user_id
       ORDER BY r.created_at DESC`,
    );
    res.json({ reviews: result.rows });
  } catch (error) {
    console.error("Unable to load admin reviews:", error.message);
    res.status(500).json({ error: "Unable to load reviews" });
  }
});

router.patch("/:reviewId/moderation", adminAuthorization, async (req, res) => {
  const status = req.body.status;
  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
  if (!["published", "hidden"].includes(status) || (status === "hidden" && !reason)) {
    return res.status(400).json({ error: "A moderation reason is required when hiding a review" });
  }
  try {
    const updated = await pool.query(
      `UPDATE reviews
       SET status = $1, moderation_reason = $2,
           moderated_at = NOW(), moderated_by = $3
       WHERE review_id = $4
       RETURNING *`,
      [status, status === "hidden" ? reason.slice(0, 500) : null, req.user, req.params.reviewId],
    );
    if (updated.rowCount === 0) return res.status(404).json({ error: "Review not found" });
    res.json({ review: updated.rows[0] });
  } catch (error) {
    console.error("Unable to moderate review:", error.message);
    res.status(500).json({ error: "Unable to moderate review" });
  }
});

module.exports = router;
