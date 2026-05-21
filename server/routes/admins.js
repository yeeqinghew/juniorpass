const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcryptjs");
const jwtGenerator = require("../utils/jwtGenerator");
const etagMiddleware = require("../middleware/etagMiddleware");
const cacheMiddleware = require("../middleware/cacheMiddleware");
const authorization = require("../middleware/authorization");
const adminOnly = require("../middleware/adminOnly");

router.use(etagMiddleware);

// ADMIN
router.post("/login", cacheMiddleware, async (req, res) => {
  const { username, password } = req.body;

  try {
    const admin = await pool.query("SELECT * FROM admins WHERE username = $1", [
      username,
    ]);

    if (admin.rows.length === 0) {
      return res.status(401).json({ message: "Invalid Credential" });
    }

    const validPassword = bcrypt.compareSync(password, admin.rows[0].password);

    if (!validPassword) {
      return res
        .status(401)
        .json({ message: "Password or Email is incorrect" });
    }

    const token = jwtGenerator(admin.rows[0].admin_id);
    return res.json({ token });
  } catch (error) {
    console.error("ERROR in /admins/login", error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get(
  "/getAllParents",
  authorization,
  adminOnly,
  cacheMiddleware,
  async (req, res) => {
    // TODO: use middleware to check if user is superadmin
    try {
      const allParents = await pool.query(
        "SELECT * FROM users WHERE user_type = 'parent'",
      );
      return res.status(200).json(allParents.rows);
    } catch (error) {
      console.error("ERROR in /admins/getAllParents", error.message);
      res.status(500).json({ error: error.message });
    }
  },
);

router.get("/getAllChildren", authorization, adminOnly, async (req, res) => {
  // TODO: use middleware to check if user is superadmin
  try {
    const allChildren = await pool.query("SELECT * FROM children");
    return res.status(200).json(allChildren.rows);
  } catch (error) {
    console.error("ERROR in /admins/getAllChildren", error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get("/getAllPartners", authorization, adminOnly, async (req, res) => {
  try {
    const partners = await pool.query("SELECT * FROM partners");
    return res.status(200).json(partners.rows);
  } catch (error) {
    console.error("ERROR in /admins/getAllPartners", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Moderation: Approve a listing (sets active=true) and notify partner.
 */
router.patch(
  "/listings/:id/approve",
  authorization,
  adminOnly,
  async (req, res) => {
    const { id } = req.params;
    try {
      // Get partner_id for notification
      const listing = await pool.query(
        "SELECT partner_id, listing_title FROM listings WHERE listing_id = $1",
        [id],
      );
      if (listing.rowCount === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }

      await pool.query(
        "UPDATE listings SET active = true WHERE listing_id = $1",
        [id],
      );

      // Notify partner of approval
      try {
        await pool.query(
          `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data)
         VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            "partner",
            listing.rows[0].partner_id,
            "listing_status",
            "Listing approved",
            "Your listing has been approved.",
            JSON.stringify({
              listing_id: id,
              status: "approved",
              title: listing.rows[0].listing_title,
            }),
          ],
        );
      } catch (notifyErr) {
        console.error(
          "Failed to insert partner notification (approve):",
          notifyErr.message,
        );
      }

      return res.status(200).json({ message: "Listing approved" });
    } catch (error) {
      console.error(
        "ERROR in PATCH /admins/listings/:id/approve",
        error.message,
      );
      return res.status(500).json({ error: error.message });
    }
  },
);

/**
 * Moderation: Reject a listing (sets active=false) and notify partner with reason.
 * Body: { reason: string }
 */
router.patch(
  "/listings/:id/reject",
  authorization,
  adminOnly,
  async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    try {
      const listing = await pool.query(
        "SELECT partner_id, listing_title FROM listings WHERE listing_id = $1",
        [id],
      );
      if (listing.rowCount === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }

      await pool.query(
        "UPDATE listings SET active = false WHERE listing_id = $1",
        [id],
      );

      // Notify partner of rejection
      try {
        await pool.query(
          `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data)
         VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            "partner",
            listing.rows[0].partner_id,
            "listing_status",
            "Listing rejected",
            "Your listing has been rejected.",
            JSON.stringify({
              listing_id: id,
              status: "rejected",
              reason: reason || null,
              title: listing.rows[0].listing_title,
            }),
          ],
        );
      } catch (notifyErr) {
        console.error(
          "Failed to insert partner notification (reject):",
          notifyErr.message,
        );
      }

      return res.status(200).json({ message: "Listing rejected" });
    } catch (error) {
      console.error(
        "ERROR in PATCH /admins/listings/:id/reject",
        error.message,
      );
      return res.status(500).json({ error: error.message });
    }
  },
);

/**
 * Analytics overview with basic KPIs.
 * Query: ?period=7d|30d (default 7d)
 */
router.get("/metrics/overview", authorization, adminOnly, async (req, res) => {
  try {
    const period = (req.query.period || "7d").toLowerCase();
    let days = 7;
    if (period === "30d") days = 30;

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      newUsers,
      bookings,
      totalUserCredits,
      totalPartnerCredits,
      debitSum,
      partnersCount,
    ] = await Promise.all([
      pool.query("SELECT COUNT(*) AS c FROM users WHERE created_at >= $1", [
        since,
      ]),
      pool.query("SELECT COUNT(*) AS c FROM bookings WHERE created_at >= $1", [
        since,
      ]),
      pool.query("SELECT COALESCE(SUM(credit), 0) AS s FROM users"),
      pool.query("SELECT COALESCE(SUM(credit), 0) AS s FROM partners"),
      pool.query(
        "SELECT COALESCE(SUM(used_credit), 0) AS s FROM transactions WHERE transaction_type = 'DEBIT' AND created_at >= $1",
        [since],
      ),
      pool.query("SELECT COUNT(*) AS c FROM partners"),
    ]);

    return res.status(200).json({
      period: `${days}d`,
      new_users: parseInt(newUsers.rows[0].c, 10),
      bookings: parseInt(bookings.rows[0].c, 10),
      partners: parseInt(partnersCount.rows[0].c, 10),
      total_user_credits: parseInt(totalUserCredits.rows[0].s, 10),
      total_partner_credits: parseInt(totalPartnerCredits.rows[0].s, 10),
      debit_credits_period: parseInt(debitSum.rows[0].s, 10),
    });
  } catch (error) {
    console.error("ERROR in GET /admins/metrics/overview", error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Get all partner enquiries (partnerForms)
router.get(
  "/getAllPartnerEnquiries",
  authorization,
  adminOnly,
  async (req, res) => {
    try {
      const enquiries = await pool.query(
        "SELECT * FROM partnerforms ORDER BY created_at DESC",
      );
      return res.status(200).json(enquiries.rows);
    } catch (error) {
      console.error("ERROR in /admins/getAllPartnerEnquiries", error.message);
      res.status(500).json({ error: error.message });
    }
  },
);

// Mark partner enquiry as responded
router.put(
  "/markEnquiryResponded/:id",
  authorization,
  adminOnly,
  async (req, res) => {
    const { id } = req.params;
    try {
      const result = await pool.query(
        "UPDATE partnerForms SET responded = true, updated_at = NOW() WHERE id = $1 RETURNING *",
        [id],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Enquiry not found" });
      }

      return res.status(200).json({
        message: "Enquiry marked as responded successfully",
        enquiry: result.rows[0],
      });
    } catch (error) {
      console.error("ERROR in /admins/markEnquiryResponded", error.message);
      res.status(500).json({ error: error.message });
    }
  },
);

module.exports = router;
