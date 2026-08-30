const express = require("express");
const router = express.Router();
const pool = require("../db");
const { AUTH_ROLES } = require("../constants/auth");
const authMiddleware = require("../middleware/authorization");
const authorization = authMiddleware.forRole(
  AUTH_ROLES.USER,
);
const adminAuthorization = authMiddleware.forRole(AUTH_ROLES.ADMIN);
const adminOnly = require("../middleware/adminOnly");
const sendEmail = require("../utils/emailSender");
const { generateReferralCode } = require("../utils/referralGenerator");
const {
  REFERRAL_REWARD_CREDITS,
  PaymentSettlementError,
  reconcileReferralReward,
} = require("../services/paymentSettlement.service");

// Get user's referral info
router.get("/my-referral", authorization, async (req, res) => {
  try {
    const userId = req.user;

    // Get referral code
    const codeResult = await pool.query(
      "SELECT code FROM referral_codes WHERE user_id = $1",
      [userId],
    );

    let referralCode = null;
    if (codeResult.rows.length === 0) {
      referralCode = await generateReferralCode(userId);
    } else {
      referralCode = codeResult.rows[0].code;
    }

    // Get referral stats
    const stats = await pool.query(
      `
      SELECT
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_referrals,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_referrals,
        COUNT(*) as total_referrals,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) * $2 as total_credits_earned
      FROM referrals
      WHERE referrer_id = $1
      `,
      [userId, REFERRAL_REWARD_CREDITS],
    );

    // Get recent referrals
    // const referrals = await pool.query(
    //   `
    //   SELECT
    //     r.id,
    //     r.status,
    //     r.created_at,
    //     r.completed_at,
    //     u.name as referee_name,
    //     u.email as referee_email
    //   FROM referrals r
    //   JOIN users u ON r.referee_id = u.user_id
    //   WHERE r.referrer_id = $1
    //   ORDER BY r.created_at DESC
    //   LIMIT 10
    //   `,
    //   [userId],
    // );

    // Define fixed reward amount
    // Referral rewards use the shared REFERRAL_REWARD_CREDITS constant.

    res.status(200).json({
      referral_code: referralCode,
      stats: stats.rows[0],
      // recent_referrals: referrals.rows,
      // reward_amount: REFERRAL_REWARD_CREDITS,
    });
  } catch (error) {
    console.error("Error fetching referral info:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Register with referral code
router.post("/register-with-code", async (req, res) => {
  try {
    const { referral_code } = req.body;

    // Find referrer by code
    const codeResult = await pool.query(
      "SELECT user_id FROM referral_codes WHERE code = $1",
      [referral_code],
    );

    if (codeResult.rows.length === 0) {
      return res
        .status(400)
        .json({ error: "Invalid referral code", valid: false });
    }

    res.status(200).json({
      valid: true,
      referrer_id: codeResult.rows[0].user_id,
      message: "Valid referral code",
    });
  } catch (error) {
    console.error("Error validating referral code:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Create referral record after user registration
router.post("/create", authorization, async (req, res) => {
  try {
    const { referrer_id, referee_id: requestedRefereeId } = req.body;
    const referee_id = req.user;

    if (!referrer_id) {
      return res
        .status(400)
        .json({ error: "Missing referrer_id" });
    }
    if (requestedRefereeId && requestedRefereeId !== referee_id) {
      return res.status(403).json({ error: "Referee must match the signed-in user" });
    }
    if (referrer_id === referee_id) {
      return res.status(400).json({ error: "Self-referrals are not allowed" });
    }

    // The partial unique index on referee_id makes this race-safe: one user
    // can have only one pending/completed referral, even under concurrent calls.
    const referralResult = await pool.query(
      `
      INSERT INTO referrals (referrer_id, referee_id, status)
      VALUES ($1, $2, 'pending')
      ON CONFLICT (referee_id) WHERE status IN ('pending', 'completed')
      DO NOTHING
      RETURNING *
      `,
      [referrer_id, referee_id],
    );

    if (referralResult.rowCount === 0) {
      return res.status(409).json({ error: "Referral already exists" });
    }

    res.status(201).json({
      message: "Referral created",
      referral: referralResult.rows[0],
    });
  } catch (error) {
    console.error("Error creating referral:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Complete referral (when referee tops up for first time)
router.put(
  "/complete/:referralId",
  adminAuthorization,
  adminOnly,
  async (req, res) => {
  try {
    const { referralId } = req.params;
    const result = await reconcileReferralReward({ referralId });

    res.status(200).json({
      message: result.alreadyCompleted
        ? "Referral was already completed"
        : "Referral completed successfully",
      idempotent: result.alreadyCompleted,
      reward_credits: result.rewardCredits || REFERRAL_REWARD_CREDITS,
    });
  } catch (error) {
    console.error("Error completing referral:", error.message);
    if (error instanceof PaymentSettlementError) {
      const status = error.code === "REFERRAL_NOT_FOUND" ? 404 : 409;
      return res.status(status).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
  },
);

// Share referral link via email
router.post("/share-email", authorization, async (req, res) => {
  try {
    const userId = req.user;
    const { email, recipient_name } = req.body;

    if (!email || !recipient_name) {
      return res.status(400).json({ error: "Missing email or recipient_name" });
    }

    // Get referral code
    const codeResult = await pool.query(
      "SELECT code FROM referral_codes WHERE user_id = $1",
      [userId],
    );

    if (codeResult.rows.length === 0) {
      return res.status(400).json({ error: "Referral code not found" });
    }

    const referralCode = codeResult.rows[0].code;
    const referralLink = `https://www.juniorpass.sg/register?referral_code=${referralCode}`;

    // Get sender name
    const userResult = await pool.query(
      "SELECT name FROM users WHERE user_id = $1",
      [userId],
    );
    const senderName = userResult.rows[0].name;

    // Send email
    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Join juniorPASS!</h2>
        <p>Hi ${recipient_name},</p>
        <p>${senderName} thinks you should check out juniorPASS - a platform for booking enrichment classes for kids in Singapore!</p>
        
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Special Offer:</strong></p>
          <p style="margin: 0 0 15px 0;">Use referral code <strong>${referralCode}</strong> or <a href="${referralLink}">click here</a> to sign up and get <strong>50 free credits</strong> for your first booking!</p>
          <p style="margin: 0; color: #666; font-size: 14px;">Plus, ${senderName} will also get 50 credits as a thank you!</p>
        </div>

        <p><a href="${referralLink}" style="display: inline-block; background-color: #1890ff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Sign Up Now</a></p>
        
        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          Questions? Visit <a href="https://www.juniorpass.sg">juniorpass.sg</a>
        </p>
      </div>
    `;

    await sendEmail(
      email,
      `${senderName} invited you to join juniorPASS!`,
      emailContent,
    );

    res.status(200).json({
      message: "Referral link sent successfully",
      referral_code: referralCode,
    });
  } catch (error) {
    console.error("Error sharing referral:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get referral leaderboard (top referrers)
router.get("/leaderboard", async (req, res) => {
  try {
    const leaderboard = await pool.query(
      `
      SELECT
        u.user_id,
        u.name,
        u.display_picture,
        COUNT(r.id) as total_referrals,
        COUNT(CASE WHEN r.status = 'completed' THEN 1 END) as completed_referrals,
        COUNT(CASE WHEN r.status = 'completed' THEN 1 END) * $1 as total_credits_earned
      FROM users u
      LEFT JOIN referrals r ON u.user_id = r.referrer_id
      GROUP BY u.user_id, u.name, u.display_picture
      HAVING COUNT(r.id) > 0
      ORDER BY completed_referrals DESC, total_referrals DESC
      LIMIT 10
      `,
      [REFERRAL_REWARD_CREDITS],
    );

    res.status(200).json({
      leaderboard: leaderboard.rows,
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
