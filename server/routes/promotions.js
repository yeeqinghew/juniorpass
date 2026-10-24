const express = require("express");
const pool = require("../db");
const authorization = require("../middleware/authorization");
const { AUTH_ROLES } = require("../constants/auth");
const { getPackageCreditCost } = require("../utils/packageCredits");
const { getPromotionPrice } = require("../services/promotionPricing.service");
const { recordAuditEvent, requestAuditId } = require("../services/auditLog.service");

const router = express.Router();
const partnerAuthorization = authorization.forRole(AUTH_ROLES.PARTNER);
const adminAuthorization = authorization.forRole(AUTH_ROLES.ADMIN);
const userAuthorization = authorization.forRole(AUTH_ROLES.USER);
const PACKAGE_TYPES = ["pay-as-you-go", "short-term", "full-term"];
const ELIGIBILITY_TYPES = ["first_time_customer", "everyone", "selected_users"];

const promotionSelect = `
  SELECT p.*, l.listing_title, o.outlet_name,
         (SELECT partner_name FROM partners WHERE partner_id = p.partner_id) AS partner_name,
         (SELECT COUNT(*)::integer FROM promotion_redemptions pr
          WHERE pr.promotion_id = p.promotion_id) AS redemption_count,
         (SELECT COUNT(*)::integer FROM promotion_allowed_users pau
          WHERE pau.promotion_id = p.promotion_id) AS selected_user_count,
         (SELECT COALESCE(SUM(pr.charged_credits), 0)::integer
          FROM promotion_redemptions pr WHERE pr.promotion_id = p.promotion_id) AS charged_credits_total,
         (SELECT COALESCE(SUM(pr.standard_credits), 0)::integer
          FROM promotion_redemptions pr WHERE pr.promotion_id = p.promotion_id) AS standard_credits_total,
         (SELECT COALESCE(SUM(b.partner_credited_credits), 0)::integer
          FROM promotion_redemptions pr
          JOIN bookings b ON b.booking_id = pr.booking_id
          WHERE pr.promotion_id = p.promotion_id) AS partner_credited_credits_total
  FROM promotions p
  JOIN listings l ON l.listing_id = p.listing_id
  JOIN schedule_groups sg ON sg.schedule_group_id = p.schedule_group_id
  JOIN listingOutlets lo ON lo.listing_outlet_id = sg.listing_outlet_id
  JOIN outlets o ON o.outlet_id = lo.outlet_id
`;

router.get("/partner/options", partnerAuthorization, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.listing_id, l.listing_title, sg.schedule_group_id,
              TO_JSON(sg.package_types) AS package_types,
              sg.price_payg, sg.price_shortterm,
              sg.price_fullterm, sg.pricing_dollars_per_credit,
              sg.full_term_class_count, sg.short_term_class_count,
              o.outlet_name,
              ARRAY_AGG(DISTINCT s.day ORDER BY s.day) AS schedule_days
       FROM listings l
       JOIN listingOutlets lo ON lo.listing_id = l.listing_id
       JOIN outlets o ON o.outlet_id = lo.outlet_id
       JOIN schedule_groups sg ON sg.listing_outlet_id = lo.listing_outlet_id
       LEFT JOIN schedules s ON s.schedule_group_id = sg.schedule_group_id
       WHERE l.partner_id = $1
       GROUP BY l.listing_id, sg.schedule_group_id, o.outlet_name
       ORDER BY l.listing_title, o.outlet_name`,
      [req.user],
    );
    res.json({ schedules: result.rows });
  } catch (error) {
    console.error("Unable to load promotion options:", error.message);
    res.status(500).json({ error: "Unable to load promotion options" });
  }
});

router.get("/partner", partnerAuthorization, async (req, res) => {
  try {
    const result = await pool.query(
      `${promotionSelect}
       WHERE p.partner_id = $1
       ORDER BY p.created_at DESC`,
      [req.user],
    );
    res.json({ promotions: result.rows });
  } catch (error) {
    console.error("Unable to load partner promotions:", error.message);
    res.status(500).json({ error: "Unable to load promotions" });
  }
});

router.post("/partner", partnerAuthorization, async (req, res) => {
  const {
    listing_id: listingId,
    schedule_group_id: scheduleGroupId,
    package_type: packageType,
    promotional_credit_cost: promotionalCreditCost,
    starts_at: startsAt,
    ends_at: endsAt,
    max_redemptions: maxRedemptions,
    per_user_redemption_limit: perUserRedemptionLimit = 1,
    eligibility,
    selected_user_emails: selectedEmails = [],
  } = req.body;
  const creditCost = Number(promotionalCreditCost);
  const redemptionLimit = Number(maxRedemptions);
  const perUserLimit = Number(perUserRedemptionLimit);
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  if (
    !listingId ||
    !scheduleGroupId ||
    !PACKAGE_TYPES.includes(packageType) ||
    !ELIGIBILITY_TYPES.includes(eligibility) ||
    !Number.isInteger(creditCost) ||
    creditCost < 1 ||
    !Number.isInteger(redemptionLimit) ||
    redemptionLimit < 1 ||
    !Number.isInteger(perUserLimit) ||
    perUserLimit < 1 ||
    perUserLimit > redemptionLimit ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end <= start
  ) {
    return res.status(400).json({ error: "Enter complete and valid promotion details" });
  }

  const emails = [...new Set(
    (Array.isArray(selectedEmails) ? selectedEmails : [])
      .map((email) => String(email).trim().toLowerCase())
      .filter(Boolean),
  )];
  if (eligibility === "selected_users" && emails.length === 0) {
    return res.status(400).json({ error: "Add at least one selected customer email" });
  }
  if (emails.length > 100) {
    return res.status(400).json({ error: "A promotion can target at most 100 selected users" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const schedule = await client.query(
      `SELECT sg.*, l.listing_id
       FROM schedule_groups sg
       JOIN listingOutlets lo ON lo.listing_outlet_id = sg.listing_outlet_id
       JOIN listings l ON l.listing_id = lo.listing_id
       WHERE sg.schedule_group_id = $1 AND l.listing_id = $2 AND l.partner_id = $3
       FOR UPDATE OF sg`,
      [scheduleGroupId, listingId, req.user],
    );
    if (schedule.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Class schedule not found" });
    }

    const packageTypes = schedule.rows[0].package_types || [];
    if (!packageTypes.includes(packageType)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Package type is not offered by this schedule" });
    }
    const standardCredits = getPackageCreditCost(
      schedule.rows[0],
      packageType,
      Number(schedule.rows[0].pricing_dollars_per_credit),
    );
    if (!standardCredits || creditCost >= standardCredits) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Promotional credits must be lower than the current standard credit cost",
      });
    }

    const overlap = await client.query(
      `SELECT promotion_id FROM promotions
       WHERE schedule_group_id = $1 AND package_type = $2
         AND status IN ('pending', 'approved', 'paused')
         AND tstzrange(starts_at, ends_at, '[)') && tstzrange($3, $4, '[)')
       LIMIT 1`,
      [scheduleGroupId, packageType, start, end],
    );
    if (overlap.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "A promotion already covers this package and period" });
    }

    let selectedUsers = [];
    if (eligibility === "selected_users") {
      const users = await client.query(
        "SELECT user_id, LOWER(email) AS email FROM users WHERE LOWER(email) = ANY($1::text[])",
        [emails],
      );
      const foundEmails = new Set(users.rows.map((user) => user.email));
      const missingEmails = emails.filter((email) => !foundEmails.has(email));
      if (missingEmails.length > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: `No parent account found for: ${missingEmails.join(", ")}`,
        });
      }
      selectedUsers = users.rows;
    }

    const created = await client.query(
      `INSERT INTO promotions (
         partner_id, listing_id, schedule_group_id, package_type,
         promotional_credit_cost, starts_at, ends_at, max_redemptions,
         per_user_redemption_limit, eligibility
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        req.user, listingId, scheduleGroupId, packageType, creditCost,
        start, end, redemptionLimit, perUserLimit, eligibility,
      ],
    );
    for (const user of selectedUsers) {
      await client.query(
        "INSERT INTO promotion_allowed_users (promotion_id, user_id) VALUES ($1, $2)",
        [created.rows[0].promotion_id, user.user_id],
      );
    }
    await client.query("COMMIT");
    res.status(201).json({ promotion: created.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Unable to create promotion:", error.message);
    res.status(500).json({ error: "Unable to create promotion" });
  } finally {
    client.release();
  }
});

router.patch("/partner/:promotionId/status", partnerAuthorization, async (req, res) => {
  const targetStatus = req.body.status;
  if (!["approved", "paused"].includes(targetStatus)) {
    return res.status(400).json({ error: "Promotion can only be paused or resumed" });
  }
  try {
    const result = await pool.query(
      `UPDATE promotions
       SET status = $1
       WHERE promotion_id = $2 AND partner_id = $3
         AND (($1 = 'paused' AND status = 'approved')
           OR ($1 = 'approved' AND status = 'paused' AND ends_at > NOW()))
       RETURNING *`,
      [targetStatus, req.params.promotionId, req.user],
    );
    if (result.rowCount === 0) {
      return res.status(409).json({ error: "This promotion cannot be changed" });
    }
    res.json({ promotion: result.rows[0] });
  } catch (error) {
    console.error("Unable to update promotion:", error.message);
    res.status(500).json({ error: "Unable to update promotion" });
  }
});

router.get("/admin/options", adminAuthorization, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.listing_id, l.listing_title, l.partner_id, p.partner_name,
              sg.schedule_group_id, TO_JSON(sg.package_types) AS package_types,
              sg.price_payg, sg.price_shortterm, sg.price_fullterm,
              sg.pricing_dollars_per_credit, sg.full_term_class_count,
              sg.short_term_class_count, o.outlet_name,
              ARRAY_AGG(DISTINCT s.day ORDER BY s.day) AS schedule_days
       FROM listings l
       JOIN partners p ON p.partner_id = l.partner_id
       JOIN listingOutlets lo ON lo.listing_id = l.listing_id
       JOIN outlets o ON o.outlet_id = lo.outlet_id
       JOIN schedule_groups sg ON sg.listing_outlet_id = lo.listing_outlet_id
       LEFT JOIN schedules s ON s.schedule_group_id = sg.schedule_group_id
       GROUP BY l.listing_id, p.partner_name, sg.schedule_group_id, o.outlet_name
       ORDER BY p.partner_name, l.listing_title, o.outlet_name`,
    );
    res.json({ schedules: result.rows });
  } catch (error) {
    console.error("Unable to load admin promotion options:", error.message);
    res.status(500).json({ error: "Unable to load promotion options" });
  }
});

router.post("/admin", adminAuthorization, async (req, res) => {
  const {
    listing_id: listingId, schedule_group_id: scheduleGroupId,
    package_type: packageType, promotional_credit_cost: promotionalCreditCost,
    starts_at: startsAt, ends_at: endsAt, max_redemptions: maxRedemptions,
    per_user_redemption_limit: perUserRedemptionLimit, eligibility,
    funded_by: fundedBy, platform_funding_percentage: requestedPlatformPercentage,
    selected_user_emails: selectedEmails = [],
  } = req.body;
  const creditCost = Number(promotionalCreditCost);
  const redemptionLimit = Number(maxRedemptions);
  const perUserLimit = Number(perUserRedemptionLimit);
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const platformPercentage = fundedBy === "platform" ? 100
    : fundedBy === "partner" ? 0 : Number(requestedPlatformPercentage);
  if (
    !listingId || !scheduleGroupId || !PACKAGE_TYPES.includes(packageType) ||
    !ELIGIBILITY_TYPES.includes(eligibility) ||
    !["partner", "platform", "shared"].includes(fundedBy) ||
    !Number.isInteger(creditCost) || creditCost < 1 ||
    !Number.isInteger(redemptionLimit) || redemptionLimit < 1 ||
    !Number.isInteger(perUserLimit) || perUserLimit < 1 || perUserLimit > redemptionLimit ||
    !Number.isFinite(platformPercentage) || platformPercentage < 0 || platformPercentage > 100 ||
    (fundedBy === "shared" && (platformPercentage <= 0 || platformPercentage >= 100)) ||
    Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start
  ) return res.status(400).json({ error: "Enter complete and valid promotion details" });

  const emails = [...new Set(
    (Array.isArray(selectedEmails) ? selectedEmails : [])
      .map((email) => String(email).trim().toLowerCase())
      .filter(Boolean),
  )];
  if (eligibility === "selected_users" && emails.length === 0) {
    return res.status(400).json({ error: "Add at least one selected customer email" });
  }
  if (emails.length > 100) {
    return res.status(400).json({ error: "A promotion can target at most 100 selected users" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const schedule = await client.query(
      `SELECT sg.*, l.listing_id, l.partner_id
       FROM schedule_groups sg
       JOIN listingOutlets lo ON lo.listing_outlet_id = sg.listing_outlet_id
       JOIN listings l ON l.listing_id = lo.listing_id
       WHERE sg.schedule_group_id = $1 AND l.listing_id = $2
       FOR UPDATE OF sg`,
      [scheduleGroupId, listingId],
    );
    if (schedule.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Class schedule not found" });
    }
    if (!(schedule.rows[0].package_types || []).includes(packageType)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Package type is not offered by this schedule" });
    }
    const standardCredits = getPackageCreditCost(
      schedule.rows[0], packageType, Number(schedule.rows[0].pricing_dollars_per_credit),
    );
    if (!standardCredits || creditCost >= standardCredits) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Promotional credits must be lower than the standard credit cost" });
    }
    const overlap = await client.query(
      `SELECT promotion_id FROM promotions
       WHERE schedule_group_id = $1 AND package_type = $2
         AND status IN ('pending', 'approved', 'paused')
         AND tstzrange(starts_at, ends_at, '[)') && tstzrange($3, $4, '[)') LIMIT 1`,
      [scheduleGroupId, packageType, start, end],
    );
    if (overlap.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "A promotion already covers this package and period" });
    }
    let selectedUsers = [];
    if (eligibility === "selected_users") {
      const users = await client.query(
        "SELECT user_id, LOWER(email) AS email FROM users WHERE LOWER(email) = ANY($1::text[])",
        [emails],
      );
      const foundEmails = new Set(users.rows.map((user) => user.email));
      const missingEmails = emails.filter((email) => !foundEmails.has(email));
      if (missingEmails.length > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: `No parent account found for: ${missingEmails.join(", ")}` });
      }
      selectedUsers = users.rows;
    }
    const created = await client.query(
      `INSERT INTO promotions (
         partner_id, listing_id, schedule_group_id, package_type,
         promotional_credit_cost, starts_at, ends_at, max_redemptions,
         per_user_redemption_limit, eligibility, status, funded_by,
         submitted_by, platform_funding_percentage, reviewed_by, reviewed_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved',$11,'admin',$12,$13,NOW())
       RETURNING *`,
      [schedule.rows[0].partner_id, listingId, scheduleGroupId, packageType,
       creditCost, start, end, redemptionLimit, perUserLimit, eligibility,
       fundedBy, platformPercentage, req.user],
    );
    for (const user of selectedUsers) {
      await client.query(
        "INSERT INTO promotion_allowed_users (promotion_id, user_id) VALUES ($1, $2)",
        [created.rows[0].promotion_id, user.user_id],
      );
    }
    await recordAuditEvent(client, {
      actorType: "admin", actorId: req.user, action: "PROMOTION_CREATED",
      entityType: "promotion", entityId: created.rows[0].promotion_id,
      after: created.rows[0], requestId: requestAuditId(req),
    });
    await client.query("COMMIT");
    res.status(201).json({ promotion: created.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Unable to create admin promotion:", error.message);
    res.status(500).json({ error: "Unable to create promotion" });
  } finally { client.release(); }
});

router.get("/admin", adminAuthorization, async (_req, res) => {
  try {
    const result = await pool.query(
      `${promotionSelect}
       ORDER BY p.created_at DESC`,
    );
    res.json({ promotions: result.rows });
  } catch (error) {
    console.error("Unable to load admin promotions:", error.message);
    res.status(500).json({ error: "Unable to load promotions" });
  }
});

router.patch("/admin/:promotionId/review", adminAuthorization, async (req, res) => {
  const decision = req.body.decision;
  const fundedBy = req.body.funded_by;
  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
  if (!['approve', 'reject'].includes(decision)) {
    return res.status(400).json({ error: "Choose approve or reject" });
  }
  if (decision === "approve" && !["partner", "platform", "shared"].includes(fundedBy)) {
    return res.status(400).json({ error: "Choose who funds the discount" });
  }
  const requestedPercentage = Number(req.body.platform_funding_percentage);
  const platformPercentage = fundedBy === "platform" ? 100
    : fundedBy === "partner" ? 0 : requestedPercentage;
  if (decision === "approve" && (
    !Number.isFinite(platformPercentage) || platformPercentage < 0 || platformPercentage > 100 ||
    (fundedBy === "shared" && (platformPercentage <= 0 || platformPercentage >= 100))
  )) return res.status(400).json({ error: "Enter a valid Junior Pass funding share" });
  if (decision === "reject" && !reason) {
    return res.status(400).json({ error: "Add a rejection reason" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      "SELECT * FROM promotions WHERE promotion_id = $1 FOR UPDATE",
      [req.params.promotionId],
    );
    if (current.rowCount === 0 || current.rows[0].status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Promotion is no longer pending" });
    }
    const result = await client.query(
      `UPDATE promotions
       SET status = $1, funded_by = $2, platform_funding_percentage = $3,
           rejection_reason = $4, reviewed_by = $5, reviewed_at = NOW()
       WHERE promotion_id = $6 AND status = 'pending'
       RETURNING *`,
      [
        decision === "approve" ? "approved" : "rejected",
        decision === "approve" ? fundedBy : null,
        decision === "approve" ? platformPercentage : null,
        decision === "reject" ? reason.slice(0, 500) : null,
        req.user,
        req.params.promotionId,
      ],
    );
    await recordAuditEvent(client, {
      actorType: "admin", actorId: req.user,
      action: decision === "approve" ? "PROMOTION_APPROVED" : "PROMOTION_REJECTED",
      entityType: "promotion", entityId: req.params.promotionId,
      before: current.rows[0], after: result.rows[0], requestId: requestAuditId(req),
    });
    await client.query("COMMIT");
    res.json({ promotion: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Unable to review promotion:", error.message);
    res.status(500).json({ error: "Unable to review promotion" });
  } finally { client.release(); }
});

router.patch("/admin/:promotionId/status", adminAuthorization, async (req, res) => {
  const targetStatus = req.body.status;
  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
  if (!["approved", "paused", "terminated"].includes(targetStatus)) {
    return res.status(400).json({ error: "Promotion can only be paused, resumed or terminated" });
  }
  if (targetStatus === "terminated" && !reason) {
    return res.status(400).json({ error: "Add a termination reason" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      "SELECT * FROM promotions WHERE promotion_id = $1 FOR UPDATE",
      [req.params.promotionId],
    );
    if (current.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Promotion not found" });
    }
    const previous = current.rows[0];
    const allowed =
      (targetStatus === "paused" && previous.status === "approved") ||
      (targetStatus === "approved" && previous.status === "paused" && new Date(previous.ends_at) > new Date()) ||
      (targetStatus === "terminated" && ["approved", "paused"].includes(previous.status));
    if (!allowed) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This promotion cannot be changed" });
    }
    const updated = await client.query(
      `UPDATE promotions SET status = $1,
         terminated_at = CASE WHEN $1 = 'terminated' THEN NOW() ELSE terminated_at END,
         terminated_by = CASE WHEN $1 = 'terminated' THEN $2 ELSE terminated_by END,
         termination_reason = CASE WHEN $1 = 'terminated' THEN $3 ELSE termination_reason END
       WHERE promotion_id = $4 RETURNING *`,
      [targetStatus, req.user, targetStatus === "terminated" ? reason.slice(0, 500) : null, req.params.promotionId],
    );
    await recordAuditEvent(client, {
      actorType: "admin", actorId: req.user,
      action: `PROMOTION_${targetStatus.toUpperCase()}`,
      entityType: "promotion", entityId: req.params.promotionId,
      before: previous, after: updated.rows[0], requestId: requestAuditId(req),
    });
    await client.query("COMMIT");
    res.json({ promotion: updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Unable to update promotion status:", error.message);
    res.status(500).json({ error: "Unable to update promotion" });
  } finally { client.release(); }
});

router.get("/admin/:promotionId/report", adminAuthorization, async (req, res) => {
  try {
    const promotion = await pool.query(
      `${promotionSelect} WHERE p.promotion_id = $1`,
      [req.params.promotionId],
    );
    if (promotion.rowCount === 0) return res.status(404).json({ error: "Promotion not found" });
    const redemptions = await pool.query(
      `SELECT pr.redemption_id, pr.created_at, pr.charged_credits, pr.standard_credits,
              b.partner_credited_credits, b.booking_id, u.name AS full_name, u.email,
              (b.partner_credited_credits - pr.charged_credits) AS platform_funded_credits,
              (pr.standard_credits - b.partner_credited_credits) AS partner_funded_credits
       FROM promotion_redemptions pr
       JOIN bookings b ON b.booking_id = pr.booking_id
       JOIN users u ON u.user_id = pr.user_id
       WHERE pr.promotion_id = $1 ORDER BY pr.created_at DESC`,
      [req.params.promotionId],
    );
    res.json({ promotion: promotion.rows[0], redemptions: redemptions.rows });
  } catch (error) {
    console.error("Unable to load promotion report:", error.message);
    res.status(500).json({ error: "Unable to load promotion report" });
  }
});

router.get("/eligible/:scheduleId/:packageType", userAuthorization, async (req, res) => {
  try {
    const schedule = await pool.query(
      `SELECT sg.* FROM schedules s
       JOIN schedule_groups sg ON sg.schedule_group_id = s.schedule_group_id
       WHERE s.schedule_id = $1`,
      [req.params.scheduleId],
    );
    if (schedule.rowCount === 0) return res.status(404).json({ error: "Schedule not found" });
    const standardCredits = getPackageCreditCost(
      schedule.rows[0],
      req.params.packageType,
      Number(schedule.rows[0].pricing_dollars_per_credit),
    );
    if (!standardCredits) return res.status(400).json({ error: "Package price unavailable" });
    const pricing = await getPromotionPrice(pool, {
      userId: req.user,
      scheduleGroupId: schedule.rows[0].schedule_group_id,
      packageType: req.params.packageType,
      standardCredits,
    });
    res.json({
      standard_credits: standardCredits,
      effective_credits: pricing.chargedCredits,
      promotion: pricing.promotion
        ? {
            promotion_id: pricing.promotion.promotion_id,
            ends_at: pricing.promotion.ends_at,
            remaining_redemptions:
              Number(pricing.promotion.max_redemptions) - Number(pricing.promotion.redemption_count),
          }
        : null,
    });
  } catch (error) {
    console.error("Unable to check promotion:", error.message);
    res.status(500).json({ error: "Unable to check promotion" });
  }
});

module.exports = router;
