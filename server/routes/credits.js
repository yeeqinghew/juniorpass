const express = require("express");
const router = express.Router();
const pool = require("../db");
const authorization = require("../middleware/authorization");

/**
 * GET /api/credits/balance
 * Get user's credit balance with validity information
 * Auto-expires credits if expired
 */
router.get("/balance", authorization, async (req, res) => {
  try {
    const { user_id } = req.user;

    const result = await pool.query(
      `SELECT
        credit,
        credit_validity_date,
        credit_last_topup_date
      FROM users
      WHERE user_id = $1`,
      [user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = result.rows[0];

    // AUTO-EXPIRE: If credits expired, zero them out immediately
    if (user.credit > 0 && user.credit_validity_date &&
        new Date(user.credit_validity_date) <= new Date()) {

      const expiredAmount = user.credit;

      // Zero out credits
      await pool.query(
        `UPDATE users SET credit = 0, credit_validity_date = NULL WHERE user_id = $1`,
        [user_id]
      );

      // Log expiry transaction
      await pool.query(
        `INSERT INTO transactions (parent_id, child_id, listing_id, used_credit, transaction_type, description)
         VALUES ($1, NULL, NULL, $2, 'DEBIT', $3)`,
        [user_id, expiredAmount, `Credits expired - ${expiredAmount} credits removed due to 90-day validity`]
      );

      // Create notification for user
      await pool.query(
        `INSERT INTO notifications (recipient_type, recipient_id, type, title, message)
         VALUES ('user', $1, 'credit_expired', 'Credits Expired', $2)`,
        [user_id, `Your ${expiredAmount} credits have expired due to the 90-day validity period.`]
      );

      return res.json({
        credit: 0,
        validity_date: null,
        days_remaining: 0,
        is_expired: true,
        just_expired: true, // Flag to show immediate notification
        expired_amount: expiredAmount,
      });
    }

    // Calculate days remaining
    const daysRemaining = user.credit_validity_date
      ? Math.max(0, Math.floor(
          (new Date(user.credit_validity_date) - new Date()) / (1000 * 60 * 60 * 24)
        ))
      : 0;

    res.json({
      credit: user.credit || 0,
      validity_date: user.credit_validity_date,
      days_remaining: daysRemaining,
      is_expired: daysRemaining <= 0,
      is_expiring_soon: daysRemaining > 0 && daysRemaining <= 30,
      last_topup_date: user.credit_last_topup_date,
      just_expired: false,
    });
  } catch (error) {
    console.error("Error fetching credit balance:", error);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /api/credits/calculate-topup
 * Calculate new validity after top-up (preview before payment)
 */
router.post("/calculate-topup", authorization, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { amount_usd, credit_amount } = req.body;

    if (!amount_usd || !credit_amount) {
      return res.status(400).json({ error: "Missing amount or credits" });
    }

    // Get current validity
    const userResult = await pool.query(
      `SELECT credit, credit_validity_date FROM users WHERE user_id = $1`,
      [user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];
    const currentValidity = user.credit_validity_date;

    // Calculate new validity using database function
    const calcResult = await pool.query(
      `SELECT calculate_new_validity($1::TIMESTAMP, 90) as new_validity`,
      [currentValidity]
    );

    const newValidity = calcResult.rows[0].new_validity;

    // Calculate days remaining for current and new validity
    const currentDaysRemaining =
      currentValidity && new Date(currentValidity) > new Date()
        ? Math.floor(
            (new Date(currentValidity) - new Date()) / (1000 * 60 * 60 * 24)
          )
        : 0;

    const newDaysRemaining = Math.floor(
      (new Date(newValidity) - new Date()) / (1000 * 60 * 60 * 24)
    );

    res.json({
      current_credit: user.credit || 0,
      current_validity: currentValidity,
      current_days_remaining: currentDaysRemaining,
      topup_amount_usd: amount_usd,
      topup_credits: credit_amount,
      new_credit: (user.credit || 0) + credit_amount,
      new_validity: newValidity,
      new_days_remaining: newDaysRemaining,
      days_added: newDaysRemaining - currentDaysRemaining,
      is_capped: newDaysRemaining >= 365, // At or near cap
    });
  } catch (error) {
    console.error("Error calculating top-up:", error);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /api/credits/extend-validity
 * Extend credit validity after successful payment
 * Called by payment webhook after top-up
 */
router.post("/extend-validity", authorization, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { credits, amount_usd, credit_rate } = req.body;

    if (!credits) {
      return res.status(400).json({ error: "Missing credits amount" });
    }

    // Use database function to top up and extend validity
    const result = await pool.query(
      `SELECT * FROM topup_credits($1, $2, $3, $4)`,
      [user_id, credits, amount_usd || null, credit_rate || 100]
    );

    if (result.rows.length === 0) {
      return res.status(500).json({ error: "Failed to extend validity" });
    }

    const { new_credit, new_validity_date, days_remaining } = result.rows[0];

    res.json({
      success: true,
      credit: new_credit,
      validity_date: new_validity_date,
      days_remaining: days_remaining,
      message: `Credits extended to ${new Date(new_validity_date).toLocaleDateString()}`,
    });
  } catch (error) {
    console.error("Error extending validity:", error);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /api/credits/expiring-soon
 * Get users with credits expiring within specified days
 * Admin endpoint for notifications
 */
router.get("/expiring-soon/:days", authorization, async (req, res) => {
  try {
    const { days } = req.params;
    const daysInt = parseInt(days) || 30;

    const result = await pool.query(
      `SELECT
        u.user_id,
        u.email,
        u.name,
        u.credit,
        u.credit_validity_date,
        EXTRACT(DAY FROM (u.credit_validity_date - NOW()))::INTEGER as days_remaining
      FROM users u
      WHERE u.credit > 0
      AND u.credit_validity_date IS NOT NULL
      AND u.credit_validity_date > NOW()
      AND u.credit_validity_date <= NOW() + INTERVAL '${daysInt} days'
      ORDER BY u.credit_validity_date ASC`,
      []
    );

    res.json({
      count: result.rows.length,
      users: result.rows,
    });
  } catch (error) {
    console.error("Error fetching expiring credits:", error);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /api/credits/expire-credits
 * Manually trigger credit expiry (for testing or admin use)
 * Should normally be called by cron job
 */
router.post("/expire-credits", authorization, async (req, res) => {
  try {
    // Check if user is admin (you may want to add admin authorization middleware)
    // For now, let's allow it for testing

    const result = await pool.query(`SELECT * FROM expire_user_credits()`);

    const expiredUsers = result.rows;

    // You can trigger notifications here
    // for (const user of expiredUsers) {
    //   await sendNotification(user.expired_user_id, {
    //     type: 'credit_expired',
    //     title: 'Credits Expired',
    //     message: `Your ${user.expired_amount} credits have expired`,
    //   });
    // }

    res.json({
      success: true,
      expired_count: expiredUsers.length,
      users: expiredUsers,
    });
  } catch (error) {
    console.error("Error expiring credits:", error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
