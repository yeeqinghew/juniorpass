const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcryptjs");
const jwtGenerator = require("../utils/jwtGenerator");
const etagMiddleware = require("../middleware/etagMiddleware");
const cacheMiddleware = require("../middleware/cacheMiddleware");
const authorization = require("../middleware/authorization");
const adminOnly = require("../middleware/adminOnly");
const sendEmail = require("../utils/emailSender");
const crypto = require("crypto");

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

// Create/Invite new partner
router.post(
  "/createPartner",
  authorization,
  adminOnly,
  async (req, res) => {
    const { email, partner_name } = req.body;

    try {
      // Validate email
      if (!email || !email.includes("@")) {
        return res.status(400).json({ message: "Valid email is required" });
      }

      // Check if email already exists
      const existingPartner = await pool.query(
        "SELECT partner_id FROM partners WHERE email = $1",
        [email]
      );

      if (existingPartner.rows.length > 0) {
        return res.status(400).json({ message: "A partner with this email already exists" });
      }

      // Generate secure random password (12 characters)
      const tempPassword = crypto.randomBytes(6).toString("base64").slice(0, 12);
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      // Create minimal partner record with temporary data
      const newPartner = await pool.query(
        `INSERT INTO partners (
          partner_name,
          email,
          password,
          address,
          region,
          categories,
          description,
          is_profile_complete,
          requires_password_change
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING partner_id, email, partner_name`,
        [
          partner_name || "New Partner", // Temporary name
          email,
          hashedPassword,
          "TBD", // Temporary address
          "TBD", // Temporary region
          [], // Default category
          "Profile setup in progress", // Temporary description
          false, // Profile not complete
          true // Requires password change
        ]
      );

      const partner = newPartner.rows[0];

      // Send invitation email
      const emailHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #98BDD2 0%, #F3A5C7 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px; }
            .credentials-box { background: #f9fafb; border: 2px solid #98BDD2; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .credential-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
            .credential-row:last-child { border-bottom: none; }
            .credential-label { font-weight: 600; color: #6b7280; }
            .credential-value { font-family: monospace; background: white; padding: 4px 8px; border-radius: 4px; color: #1f2937; }
            .button { display: inline-block; background: #98BDD2; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
            .steps { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0; border-radius: 4px; }
            .steps ol { margin: 10px 0; padding-left: 20px; }
            .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; font-size: 28px;">Welcome to JuniorPASS! 🎉</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Partner Portal Invitation</p>
            </div>

            <div class="content">
              <p>Hello${partner_name ? ` <strong>${partner_name}</strong>` : ''},</p>

              <p>You've been invited to join JuniorPASS as a partner organization! We're excited to have you on board.</p>

              <div class="credentials-box">
                <h3 style="margin-top: 0; color: #1f2937;">Your Login Credentials</h3>
                <div class="credential-row">
                  <span class="credential-label">Portal URL:</span>
                  <span class="credential-value">https://partner.juniorpass.sg</span>
                </div>
                <div class="credential-row">
                  <span class="credential-label">Email:</span>
                  <span class="credential-value">${email}</span>
                </div>
                <div class="credential-row">
                  <span class="credential-label">Temporary Password:</span>
                  <span class="credential-value">${tempPassword}</span>
                </div>
              </div>

              <div style="text-align: center;">
                <a href="https://partner.juniorpass.sg/login" class="button">Login to Partner Portal →</a>
              </div>

              <div class="steps">
                <strong>⚠️ First Login Steps:</strong>
                <ol>
                  <li>Login with the credentials above</li>
                  <li>You'll be prompted to change your password immediately</li>
                  <li>Complete your organization profile with:
                    <ul style="margin-top: 8px;">
                      <li>Organization details & description</li>
                      <li>Headquarters address & region</li>
                      <li>Contact number & website</li>
                      <li>Upload your logo</li>
                      <li>Select service categories</li>
                      <li>Add outlet locations</li>
                    </ul>
                  </li>
                  <li>Once complete, you can start creating class listings!</li>
                </ol>
              </div>

              <p><strong>Need Help?</strong><br>
              If you have any questions or need assistance, please contact our team at <a href="mailto:support@juniorpass.sg">support@juniorpass.sg</a></p>

              <div class="footer">
                <p>This is an automated email from JuniorPASS.<br>
                Please do not reply to this email.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      await sendEmail(
        email,
        "Welcome to JuniorPASS - Your Partner Portal Access",
        emailHTML
      );

      return res.status(201).json({
        success: true,
        message: "Partner invitation sent successfully",
        partner: {
          partner_id: partner.partner_id,
          email: partner.email,
          partner_name: partner.partner_name
        }
      });

    } catch (error) {
      console.error("ERROR in /admins/createPartner:", error);
      res.status(500).json({ message: error.message || "Failed to create partner" });
    }
  }
);

module.exports = router;
