const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcryptjs");
const jwtGenerator = require("../utils/jwtGenerator");
const authorization = require("../middleware/authorization");
const etagMiddleware = require("../middleware/etagMiddleware");
const cacheMiddleware = require("../middleware/cacheMiddleware");
const client = require("../utils/redisClient");
const validInfo = require("../middleware/validInfo");
const sendEmail = require("../utils/emailSender");

router.use(etagMiddleware);

// PARTNER
router.get("/", authorization, async (req, res) => {
  try {
    const partner = await pool.query(
      "SELECT * FROM partners WHERE partner_id = $1",
      [req.user],
    );
    return res.status(200).json(partner.rows[0]);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const partner = await pool.query(
      `SELECT partner_id, email, password, requires_password_change, is_profile_complete
       FROM partners WHERE email = $1`,
      [email],
    );

    if (partner.rows.length === 0) {
      return res.status(401).json({ message: "Invalid Credential" });
    }

    const validPassword = bcrypt.compareSync(
      password,
      partner.rows[0].password,
    );
    if (!validPassword) {
      return res
        .status(401)
        .json({ message: "Password or Email is incorrect" });
    }

    const token = jwtGenerator(partner.rows[0].partner_id);

    return res.status(200).json({
      token,
      requires_password_change:
        partner.rows[0].requires_password_change || false,
      is_profile_complete: partner.rows[0].is_profile_complete !== false, // Default true for existing partners
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/:partnerId/outlets", authorization, async (req, res) => {
  const { partnerId } = req.params;

  try {
    // Query to get outlets for the specific partner
    const outlets = await pool.query(
      "SELECT * FROM outlets WHERE partner_id = $1",
      [partnerId],
    );
    return res.status(200).json(outlets.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id", cacheMiddleware, async (req, res) => {
  const id = req.params.id;
  try {
    const [partner, listings, reviews] = await Promise.all([
      getPartnerByPartnerId(id),
      getListingsByPartnerId(id),
      getReviwesByPartnerId(id),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        partner,
        listings,
        reviews,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      partner_name,
      description,
      picture,
      address,
      contact_number,
      website,
      outlets = [],
    } = req.body;

    // -------------------------
    // 1. UPDATE PARTNER
    // -------------------------
    const updatedPartner = await pool.query(
      `UPDATE partners 
       SET
        partner_name = COALESCE($1, partner_name),
        description = COALESCE($2, description),
        picture = COALESCE($3, picture),
        address = COALESCE($4, address),
        contact_number = COALESCE($5, contact_number),
        website = COALESCE($6, website)
       WHERE partner_id = $7
       RETURNING *`,
      [
        partner_name,
        description,
        picture,
        address,
        contact_number,
        website,
        id,
      ],
    );

    await client.del(`/partners/${id}`);

    // -------------------------
    // 2. GET EXISTING OUTLETS
    // -------------------------
    const existing = await pool.query(
      `SELECT * FROM outlets WHERE partner_id = $1`,
      [id],
    );

    const existingMap = new Map(existing.rows.map((o) => [o.outlet_id, o]));

    const incomingIds = new Set(
      outlets.filter((o) => o.outlet_id).map((o) => o.outlet_id),
    );

    // -------------------------
    // 3. DELETE REMOVED OUTLETS
    // -------------------------
    const deleteQueries = existing.rows
      .filter((o) => !incomingIds.has(o.outlet_id))
      .map((o) =>
        pool.query(`DELETE FROM outlets WHERE outlet_id = $1`, [o.outlet_id]),
      );

    // -------------------------
    // 4. UPDATE EXISTING
    // -------------------------
    const updateQueries = outlets
      .filter((o) => o.outlet_id && existingMap.has(o.outlet_id))
      .map((o) =>
        pool.query(
          `UPDATE outlets 
           SET address = $1, nearest_mrt = $2
           WHERE outlet_id = $3`,
          [o.address, o.nearest_mrt, o.outlet_id],
        ),
      );

    // -------------------------
    // 5. INSERT NEW
    // -------------------------
    const insertQueries = outlets
      .filter((o) => !o.outlet_id)
      .map((o) =>
        pool.query(
          `INSERT INTO outlets (partner_id, address, nearest_mrt)
           VALUES ($1, $2, $3)`,
          [id, o.address, o.nearest_mrt],
        ),
      );

    await Promise.all([...deleteQueries, ...updateQueries, ...insertQueries]);

    return res.status(200).json({
      message: "Information updated successfully!",
      partner: updatedPartner.rows[0],
    });
  } catch (error) {
    console.error("Update Error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/partner-form", validInfo, async (req, res) => {
  try {
    const { companyName, companyPersonName, email, message } = req.body;
    await pool.query(
      `INSERT INTO partnerForms (
        company_name,
        contact_person_name,
        email,
        message
      )
      VALUES($1, $2, $3, $4)`,
      [companyName, companyPersonName, email, message],
    );

    // send email notification to admin
    await sendEmail(
      "admin@juniorpass.sg",
      "New Partner Enquiry",
      `
      <p>A new partner has submitted a request.</p>
      <p><strong>Company:</strong> ${companyName}</p>
      <p><strong>Contact Person:</strong> ${companyPersonName}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Message:</strong></p>
      <p>${message}</p>
      `,
    );

    res.status(201).json({
      message:
        "We've received your request. Our admin will contact you shortly.",
    });
  } catch (error) {
    console.error("ERROR in /misc/contactUs", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Change password for partners (especially for first-time login with temp password)
router.post("/change-password", authorization, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const partner_id = req.user;

  try {
    // Get current partner data
    const partner = await pool.query(
      "SELECT password FROM partners WHERE partner_id = $1",
      [partner_id],
    );

    if (partner.rows.length === 0) {
      return res.status(404).json({ message: "Partner not found" });
    }

    // Verify current password
    const validPassword = bcrypt.compareSync(
      currentPassword,
      partner.rows[0].password,
    );
    if (!validPassword) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear password change requirement
    await pool.query(
      `UPDATE partners
       SET password = $1, requires_password_change = false, updated_at = NOW()
       WHERE partner_id = $2`,
      [hashedNewPassword, partner_id],
    );

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("ERROR in /partners/change-password", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Mark profile as complete (called after partner completes their profile setup)
router.post("/complete-profile", authorization, async (req, res) => {
  const partner_id = req.user;

  try {
    await pool.query(
      `UPDATE partners
       SET is_profile_complete = true, updated_at = NOW()
       WHERE partner_id = $1`,
      [partner_id],
    );

    return res.status(200).json({
      success: true,
      message: "Profile marked as complete",
    });
  } catch (error) {
    console.error("ERROR in /partners/complete-profile", error.message);
    res.status(500).json({ error: error.message });
  }
});

const getPartnerByPartnerId = async (partnerId) => {
  try {
    const partner = await pool.query(
      `SELECT partner_id,
        partner_name,
        email,
        password,
        description,
        website,
        rating,
        picture,
        address,
        region,
        contact_number,
        array_to_json(categories) AS categories,
        created_at 
      FROM partners WHERE partner_id = $1`,
      [partnerId],
    );
    return partner.rows[0];
  } catch (error) {
    console.error("ERROR in getPartnerByPartnerId:", error.message);
    throw error;
  }
};

const getListingsByPartnerId = async (partnerId) => {
  try {
    const listings = await pool.query(
      "SELECT * FROM listings WHERE partner_id = $1 ORDER BY created_at DESC",
      [partnerId],
    );
    return listings.rows;
  } catch (error) {
    console.error("ERROR in getPartnerByPartnerId:", error.message);
    throw error;
  }
};

const getReviwesByPartnerId = async (partnerId) => {
  try {
    const reviews = await pool.query(
      "SELECT * FROM reviews WHERE partner_id = $1",
      [partnerId],
    );
    return reviews.rows;
  } catch (error) {
    console.error("ERROR in getPartnerByPartnerId:", error.message);
    throw error;
  }
};

/**
 * Partner Dashboard: Overview metrics.
 * Returns credit balance, counts of listings and bookings, and unread notifications count.
 */
router.get("/dashboard/overview", authorization, async (req, res) => {
  const partnerId = req.user;
  try {
    const [creditRes, listingsCountRes, bookingsCountRes, unreadNotifRes] =
      await Promise.all([
        pool.query(
          "SELECT COALESCE(credit, 0) AS credit FROM partners WHERE partner_id = $1",
          [partnerId],
        ),
        pool.query("SELECT COUNT(*) AS c FROM listings WHERE partner_id = $1", [
          partnerId,
        ]),
        pool.query(
          `SELECT COUNT(*) AS c
           FROM bookings b
           JOIN listings l ON l.listing_id = b.listing_id
           WHERE l.partner_id = $1`,
          [partnerId],
        ),
        pool.query(
          `SELECT COUNT(*) AS c
           FROM notifications
           WHERE recipient_type = 'partner' AND recipient_id = $1 AND is_read = false`,
          [partnerId],
        ),
      ]);

    return res.status(200).json({
      credit: parseInt(creditRes.rows[0]?.credit || 0, 10),
      listings: parseInt(listingsCountRes.rows[0]?.c || 0, 10),
      bookings: parseInt(bookingsCountRes.rows[0]?.c || 0, 10),
      unread_notifications: parseInt(unreadNotifRes.rows[0]?.c || 0, 10),
    });
  } catch (error) {
    console.error("ERROR in GET /partners/dashboard/overview", error.message);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Partner Dashboard: Bookings stream with pagination.
 * Query: ?page=1&limit=10
 */
router.get("/dashboard/bookings", authorization, async (req, res) => {
  const partnerId = req.user;
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.max(parseInt(req.query.limit || "10", 10), 1);
  const offset = (page - 1) * limit;

  try {
    const [list, count] = await Promise.all([
      pool.query(
        `SELECT b.*, l.listing_title
         FROM bookings b
         JOIN listings l ON l.listing_id = b.listing_id
         WHERE l.partner_id = $1
         ORDER BY b.created_at DESC
         LIMIT $2 OFFSET $3`,
        [partnerId, limit, offset],
      ),
      pool.query(
        `SELECT COUNT(*) AS total
         FROM bookings b
         JOIN listings l ON l.listing_id = b.listing_id
         WHERE l.partner_id = $1`,
        [partnerId],
      ),
    ]);

    return res.status(200).json({
      page,
      limit,
      total: parseInt(count.rows[0]?.total || 0, 10),
      data: list.rows,
    });
  } catch (error) {
    console.error("ERROR in GET /partners/dashboard/bookings", error.message);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Partner Dashboard: Export bookings CSV.
 * Optional Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
router.get("/dashboard/bookings/export", authorization, async (req, res) => {
  const partnerId = req.user;
  const { from, to } = req.query;

  try {
    const clauses = ["l.partner_id = $1"];
    const params = [partnerId];
    let idx = 2;

    if (from) {
      clauses.push(`b.created_at >= $${idx++}`);
      params.push(new Date(from));
    }
    if (to) {
      clauses.push(`b.created_at <= $${idx++}`);
      params.push(new Date(to));
    }

    const whereSQL = "WHERE " + clauses.join(" AND ");

    const result = await pool.query(
      `
      SELECT b.booking_id, b.user_id, b.listing_id, l.listing_title, b.start_date, b.end_date, b.created_at
      FROM bookings b
      JOIN listings l ON l.listing_id = b.listing_id
      ${whereSQL}
      ORDER BY b.created_at DESC
      `,
      params,
    );

    // Build CSV
    const headers = [
      "booking_id",
      "user_id",
      "listing_id",
      "listing_title",
      "start_date",
      "end_date",
      "created_at",
    ];
    const rows = result.rows.map((r) =>
      [
        r.booking_id,
        r.user_id,
        r.listing_id,
        (r.listing_title || "").replaceAll('"', '""'),
        r.start_date?.toISOString?.() || r.start_date,
        r.end_date?.toISOString?.() || r.end_date,
        r.created_at?.toISOString?.() || r.created_at,
      ]
        .map((v) =>
          v === null || typeof v === "undefined" ? "" : `"${String(v)}"`,
        )
        .join(","),
    );
    const csv = [headers.join(","), ...rows].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="bookings.csv"');
    return res.status(200).send(csv);
  } catch (error) {
    console.error(
      "ERROR in GET /partners/dashboard/bookings/export",
      error.message,
    );
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
