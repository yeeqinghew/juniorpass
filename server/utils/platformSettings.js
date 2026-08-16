const pool = require("../db");

const DEFAULT_DOLLARS_PER_CREDIT = 9.5;

const getDollarsPerCredit = async (db = pool) => {
  const result = await db.query(
    `SELECT new_value AS setting_value
     FROM platform_setting_history
     WHERE setting_key = 'partner_dollars_per_credit'
       AND effective_from <= NOW()
     ORDER BY effective_from DESC, history_id DESC
     LIMIT 1`,
  );
  const rate = Number(result.rows[0]?.setting_value);
  return Number.isFinite(rate) && rate > 0
    ? rate
    : DEFAULT_DOLLARS_PER_CREDIT;
};

module.exports = { DEFAULT_DOLLARS_PER_CREDIT, getDollarsPerCredit };
