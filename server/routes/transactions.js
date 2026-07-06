const express = require("express");
const router = express.Router();
const pool = require("../db");
const authorization = require("../middleware/authorization");

// GET all transactions for a user (parent)
router.get("/user", authorization, async (req, res) => {
  try {
    const user_id = req.user;

    const transactions = await pool.query(
      `
      SELECT
        t.transaction_id,
        t.parent_id,
        t.child_id,
        t.listing_id,
        t.used_credit,
        t.transaction_type,
        t.created_at,
        c.name as child_name,
        l.listing_title,
        l.images,
        p.partner_name,
        p.picture as partner_picture
      FROM transactions t
      LEFT JOIN children c ON t.child_id = c.child_id
      LEFT JOIN listings l ON t.listing_id = l.listing_id
      LEFT JOIN partners p ON l.partner_id = p.partner_id
      WHERE t.parent_id = $1
      ORDER BY t.created_at DESC
    `,
      [user_id],
    );

    res.json({
      success: true,
      transactions: transactions.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET transaction statistics for a user
router.get("/user/stats", authorization, async (req, res) => {
  try {
    const user_id = req.user;

    const stats = await pool.query(
      `
      SELECT 
        transaction_type,
        COUNT(*) as count,
        SUM(used_credit) as total_credits
      FROM transactions
      WHERE parent_id = $1
      GROUP BY transaction_type
    `,
      [user_id],
    );

    const result = {
      total_debit: 0,
      total_credit: 0,
      debit_count: 0,
      credit_count: 0,
    };

    stats.rows.forEach((row) => {
      if (row.transaction_type === "DEBIT") {
        result.total_debit = parseInt(row.total_credits);
        result.debit_count = parseInt(row.count);
      } else if (row.transaction_type === "CREDIT") {
        result.total_credit = parseInt(row.total_credits);
        result.credit_count = parseInt(row.count);
      }
    });

    res.json({
      success: true,
      stats: result,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
