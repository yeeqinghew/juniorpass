const express = require("express");
const pool = require("../db");
const { AUTH_ROLES } = require("../constants/auth");
const authorization = require("../middleware/authorization").forRole(
  AUTH_ROLES.ADMIN,
);

const router = express.Router();
const SECTIONS = new Set([
  "payments",
  "transactions",
  "webhooks",
  "referrals",
]);

const STATUS_BY_SECTION = {
  payments: new Set(["ALL", "PENDING", "COMPLETED", "FAILED"]),
  transactions: new Set(["ALL", "CREDIT", "DEBIT"]),
  webhooks: new Set([
    "ALL",
    "RECEIVED",
    "PROCESSED",
    "IGNORED",
    "REJECTED",
    "FAILED",
  ]),
  referrals: new Set(["ALL", "PENDING", "COMPLETED", "EXPIRED", "CANCELLED"]),
};

const positiveInteger = (value, fallback, maximum) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
};

const searchTerm = (value) => String(value || "").trim().slice(0, 100);

async function getSummary() {
  const [payments, transactions, referrals, webhooks] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
         COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
         COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
         COALESCE(SUM(amount) FILTER (WHERE status = 'COMPLETED'), 0) AS completed_amount,
         COALESCE(SUM(credits) FILTER (WHERE status = 'COMPLETED'), 0)::int AS completed_credits
       FROM payment_requests`,
    ),
    pool.query(
      `SELECT
         COALESCE(SUM(used_credit) FILTER (WHERE transaction_type = 'CREDIT'), 0)::int AS credits_in,
         COALESCE(SUM(used_credit) FILTER (WHERE transaction_type = 'DEBIT'), 0)::int AS credits_out
       FROM transactions`,
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
         COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
         COALESCE((
           SELECT SUM(used_credit)
           FROM transactions
           WHERE referral_id IS NOT NULL AND transaction_type = 'CREDIT'
         ), 0)::int AS rewarded_credits
       FROM referrals`,
    ),
    pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE processing_status = 'FAILED')::int AS failed,
         COUNT(*) FILTER (WHERE processing_status = 'REJECTED')::int AS rejected
       FROM payment_webhook_events`,
    ),
  ]);

  return {
    payments: payments.rows[0],
    wallet: transactions.rows[0],
    referrals: referrals.rows[0],
    webhooks: webhooks.rows[0],
  };
}

function getSectionQuery(section, status, search, limit, offset) {
  const values = [];
  const where = [];
  const add = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (section === "payments") {
    if (status !== "ALL") where.push(`pr.status = ${add(status)}`);
    if (search) {
      const term = add(`%${search}%`);
      where.push(`(u.name ILIKE ${term} OR u.email ILIKE ${term}
        OR pr.reference_number ILIKE ${term} OR pr.hitpay_payment_id ILIKE ${term})`);
    }
    return {
      values,
      from: `FROM payment_requests pr JOIN users u ON u.user_id = pr.user_id`,
      where,
      select: `SELECT pr.request_id, pr.amount, pr.credits, pr.reference_number,
        pr.hitpay_payment_id, pr.status, pr.webhook_received, pr.settled_at,
        pr.receipt_email_sent_at, pr.created_at, pr.updated_at,
        u.user_id, u.name AS user_name, u.email AS user_email`,
      order: `ORDER BY pr.created_at DESC`,
      limit,
      offset,
    };
  }

  if (section === "transactions") {
    if (status !== "ALL") where.push(`t.transaction_type = ${add(status)}`);
    if (search) {
      const term = add(`%${search}%`);
      where.push(`(u.name ILIKE ${term} OR u.email ILIKE ${term}
        OR t.transaction_id::text ILIKE ${term}
        OR COALESCE(l.listing_title, '') ILIKE ${term})`);
    }
    return {
      values,
      from: `FROM transactions t
        JOIN users u ON u.user_id = t.parent_id
        LEFT JOIN listings l ON l.listing_id = t.listing_id
        LEFT JOIN payment_requests pr ON pr.request_id = t.payment_request_id`,
      where,
      select: `SELECT t.transaction_id, t.transaction_type, t.used_credit,
        t.payment_request_id, t.referral_id, t.listing_id, t.child_id,
        t.created_at, u.user_id, u.name AS user_name, u.email AS user_email,
        l.listing_title, pr.reference_number,
        CASE WHEN t.payment_request_id IS NOT NULL THEN 'TOP_UP'
             WHEN t.referral_id IS NOT NULL THEN 'REFERRAL_REWARD'
             WHEN t.listing_id IS NOT NULL THEN 'BOOKING'
             ELSE 'OTHER' END AS source`,
      order: `ORDER BY t.created_at DESC`,
      limit,
      offset,
    };
  }

  if (section === "webhooks") {
    if (status !== "ALL") where.push(`pwe.processing_status = ${add(status)}`);
    if (search) {
      const term = add(`%${search}%`);
      where.push(`(COALESCE(pwe.reference_number, '') ILIKE ${term}
        OR COALESCE(pwe.hitpay_payment_id, '') ILIKE ${term}
        OR COALESCE(u.email, '') ILIKE ${term})`);
    }
    return {
      values,
      from: `FROM payment_webhook_events pwe
        LEFT JOIN payment_requests pr ON pr.request_id = pwe.payment_request_id
        LEFT JOIN users u ON u.user_id = pr.user_id`,
      where,
      select: `SELECT pwe.webhook_event_id, pwe.payment_request_id,
        pwe.reference_number, pwe.hitpay_payment_id, pwe.payment_status,
        pwe.amount, pwe.signature_valid, pwe.processing_status,
        pwe.response_code, pwe.error_code, pwe.received_at, pwe.processed_at,
        u.name AS user_name, u.email AS user_email`,
      order: `ORDER BY pwe.received_at DESC`,
      limit,
      offset,
    };
  }

  if (status !== "ALL") where.push(`r.status = ${add(status.toLowerCase())}`);
  if (search) {
    const term = add(`%${search}%`);
    where.push(`(referrer.name ILIKE ${term} OR referrer.email ILIKE ${term}
      OR referee.name ILIKE ${term} OR referee.email ILIKE ${term}
      OR r.id::text ILIKE ${term})`);
  }
  return {
    values,
    from: `FROM referrals r
      JOIN users referrer ON referrer.user_id = r.referrer_id
      JOIN users referee ON referee.user_id = r.referee_id
      LEFT JOIN payment_requests pr ON pr.request_id = r.rewarded_payment_request_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(t.used_credit), 0)::int AS reward_credits
        FROM transactions t
        WHERE t.referral_id = r.id AND t.transaction_type = 'CREDIT'
      ) rewards ON TRUE`,
    where,
    select: `SELECT r.id, r.status, r.referrer_id, r.referee_id,
      r.completed_at, r.rewarded_payment_request_id, r.created_at, r.updated_at,
      r.expired_at, referrer.name AS referrer_name,
      referrer.email AS referrer_email, referee.name AS referee_name,
      referee.email AS referee_email, pr.reference_number,
      rewards.reward_credits`,
    order: `ORDER BY r.created_at DESC`,
    limit,
    offset,
  };
}

router.get("/", authorization, async (req, res) => {
  const section = String(req.query.section || "payments").toLowerCase();
  if (!SECTIONS.has(section)) {
    return res.status(400).json({ error: "Unknown payment workspace section" });
  }

  const requestedStatus = String(req.query.status || "ALL").toUpperCase();
  if (!STATUS_BY_SECTION[section].has(requestedStatus)) {
    return res.status(400).json({ error: "Invalid status filter" });
  }

  const page = positiveInteger(req.query.page, 1, 100000);
  const limit = positiveInteger(req.query.limit, 20, 100);
  const offset = (page - 1) * limit;
  const query = getSectionQuery(
    section,
    requestedStatus,
    searchTerm(req.query.search),
    limit,
    offset,
  );
  const whereSql = query.where.length ? `WHERE ${query.where.join(" AND ")}` : "";
  const listValues = [...query.values, limit, offset];

  try {
    const [summary, countResult, listResult] = await Promise.all([
      getSummary(),
      pool.query(`SELECT COUNT(*)::int AS total ${query.from} ${whereSql}`, query.values),
      pool.query(
        `${query.select} ${query.from} ${whereSql} ${query.order}
         LIMIT $${query.values.length + 1} OFFSET $${query.values.length + 2}`,
        listValues,
      ),
    ]);
    const total = countResult.rows[0].total;
    return res.json({
      summary,
      section,
      items: listResult.rows,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error("Unable to load admin payment workspace:", error);
    return res.status(500).json({ error: "Unable to load payments and transactions" });
  }
});

module.exports = router;
