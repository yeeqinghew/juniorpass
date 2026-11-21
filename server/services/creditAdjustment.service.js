const { getDollarsPerCredit } = require("../utils/platformSettings");
const {
  recordAuditEvent,
} = require("./auditLog.service");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCOUNT_TYPES = Object.freeze({
  parent: {
    table: "users",
    idColumn: "user_id",
    nameColumn: "name",
    targetColumn: "parent_id",
  },
  partner: {
    table: "partners",
    idColumn: "partner_id",
    nameColumn: "partner_name",
    targetColumn: "partner_id",
  },
});

class CreditAdjustmentError extends Error {
  constructor(message, status = 400, code = "INVALID_CREDIT_ADJUSTMENT") {
    super(message);
    this.name = "CreditAdjustmentError";
    this.status = status;
    this.code = code;
  }
}

function normalizeCreditAdjustment(input = {}) {
  const accountType = String(input.account_type || "").toLowerCase();
  const accountId = String(input.account_id || "");
  const direction = String(input.direction || "").toLowerCase();
  const credits = Number(input.credits);
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  const reference =
    typeof input.reference === "string" ? input.reference.trim() : "";
  const idempotencyKey = String(input.idempotency_key || "").trim();

  if (!ACCOUNT_TYPES[accountType] || !UUID_PATTERN.test(accountId)) {
    throw new CreditAdjustmentError("A valid parent or partner account is required");
  }
  if (!new Set(["credit", "debit"]).has(direction)) {
    throw new CreditAdjustmentError("Direction must be credit or debit");
  }
  if (!Number.isSafeInteger(credits) || credits < 1 || credits > 1_000_000) {
    throw new CreditAdjustmentError("Credits must be a whole number between 1 and 1,000,000");
  }
  if (reason.length < 10 || reason.length > 1000) {
    throw new CreditAdjustmentError("Reason must be between 10 and 1,000 characters");
  }
  if (reference.length > 200) {
    throw new CreditAdjustmentError("Reference cannot exceed 200 characters");
  }
  if (!/^[A-Za-z0-9:_-]{8,100}$/.test(idempotencyKey)) {
    throw new CreditAdjustmentError("A valid idempotency key is required");
  }

  return {
    accountType,
    accountId,
    credits,
    creditDelta: direction === "credit" ? credits : -credits,
    direction,
    reason,
    reference: reference || null,
    idempotencyKey,
  };
}

async function applyCreditAdjustment(pool, input) {
  const normalized = normalizeCreditAdjustment(input);
  const config = ACCOUNT_TYPES[normalized.accountType];
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `credit-adjustment:${normalized.idempotencyKey}`,
    ]);

    const existing = await client.query(
      `SELECT adjustment_id, account_type, parent_id, partner_id, credit_delta,
              balance_before, balance_after, reason, reference, created_by, created_at
       FROM credit_adjustments WHERE idempotency_key = $1`,
      [normalized.idempotencyKey],
    );
    if (existing.rowCount > 0) {
      const prior = existing.rows[0];
      const priorAccountId = prior.parent_id || prior.partner_id;
      if (
        prior.account_type !== normalized.accountType ||
        priorAccountId !== normalized.accountId ||
        Number(prior.credit_delta) !== normalized.creditDelta ||
        prior.reason !== normalized.reason ||
        (prior.reference || null) !== normalized.reference ||
        prior.created_by !== input.admin_id
      ) {
        throw new CreditAdjustmentError(
          "This idempotency key was already used for another adjustment",
          409,
          "IDEMPOTENCY_KEY_REUSED",
        );
      }
      await client.query("COMMIT");
      return {
        adjustment: prior,
        account: {
          account_id: priorAccountId,
          credit: Number(prior.balance_after),
        },
        alreadyApplied: true,
      };
    }

    const account = await client.query(
      `SELECT ${config.idColumn} AS account_id, ${config.nameColumn} AS account_name,
              email, COALESCE(credit, 0)::integer AS stored_credit
              ${normalized.accountType === "parent" ? ", credit_expires_at, user_type" : ""}
       FROM ${config.table}
       WHERE ${config.idColumn} = $1
       FOR UPDATE`,
      [normalized.accountId],
    );
    if (account.rowCount === 0) {
      throw new CreditAdjustmentError("Account not found", 404, "ACCOUNT_NOT_FOUND");
    }

    const accountRow = account.rows[0];
    if (normalized.accountType === "parent") {
      if (accountRow.user_type !== "parent") {
        throw new CreditAdjustmentError("Account is not a parent", 400, "INVALID_PARENT_ACCOUNT");
      }

      // Older accounts can predate the parents row. Keep the parent account
      // and its immutable transaction record in sync before the ledger write.
      await client.query(
        `INSERT INTO parents (parent_id) VALUES ($1)
         ON CONFLICT (parent_id) DO NOTHING`,
        [normalized.accountId],
      );
    }

    const isExpired =
      normalized.accountType === "parent" &&
      accountRow.credit_expires_at &&
      new Date(accountRow.credit_expires_at) <= new Date();
    const balanceBefore = isExpired ? 0 : Number(accountRow.stored_credit);
    const balanceAfter = balanceBefore + normalized.creditDelta;
    if (balanceAfter < 0) {
      throw new CreditAdjustmentError(
        "The adjustment would make the balance negative",
        409,
        "INSUFFICIENT_CREDITS",
      );
    }

    if (normalized.accountType === "parent") {
      await client.query(
        `UPDATE users
         SET credit = $1,
             credit_expires_at = CASE
               WHEN $2::integer > 0
                 AND (credit_expires_at IS NULL OR credit_expires_at <= NOW())
               THEN NOW() + INTERVAL '90 days'
               ELSE credit_expires_at
             END,
             updated_at = NOW()
         WHERE user_id = $3`,
        [balanceAfter, normalized.creditDelta, normalized.accountId],
      );
    } else {
      await client.query(
        `UPDATE partners SET credit = $1, updated_at = NOW()
         WHERE partner_id = $2`,
        [balanceAfter, normalized.accountId],
      );
    }

    const adjustment = await client.query(
      `INSERT INTO credit_adjustments
         (account_type, parent_id, partner_id, credit_delta, balance_before,
          balance_after, reason, reference, idempotency_key, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        normalized.accountType,
        normalized.accountType === "parent" ? normalized.accountId : null,
        normalized.accountType === "partner" ? normalized.accountId : null,
        normalized.creditDelta,
        balanceBefore,
        balanceAfter,
        normalized.reason,
        normalized.reference,
        normalized.idempotencyKey,
        input.admin_id,
      ],
    );
    const adjustmentRow = adjustment.rows[0];

    if (normalized.accountType === "partner") {
      const dollarsPerCredit = await getDollarsPerCredit(client);
      await client.query(
        `INSERT INTO partner_earnings
           (partner_id, source, credits, dollars_per_credit, gross_amount,
            status, available_at, credit_adjustment_id)
         VALUES ($1, 'MANUAL_ADJUSTMENT', $2, $3,
                 ROUND($2::numeric * $3::numeric, 2),
                 'AVAILABLE', NOW(), $4)`,
        [
          normalized.accountId,
          normalized.creditDelta,
          dollarsPerCredit,
          adjustmentRow.adjustment_id,
        ],
      );
    }

    await recordAuditEvent(client, {
      actorType: "admin",
      actorId: input.admin_id,
      action: "CREDIT_BALANCE_ADJUSTED",
      entityType: "credit",
      entityId: normalized.accountId,
      before: { balance: balanceBefore },
      after: { balance: balanceAfter },
      metadata: {
        adjustment_id: adjustmentRow.adjustment_id,
        account_type: normalized.accountType,
        credit_delta: normalized.creditDelta,
        reason: normalized.reason,
        reference: normalized.reference,
      },
      requestId: input.request_id,
    });

    await client.query("COMMIT");
    return {
      adjustment: adjustmentRow,
      account: {
        account_id: accountRow.account_id,
        account_name: accountRow.account_name,
        email: accountRow.email,
        credit: balanceAfter,
      },
      alreadyApplied: false,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  ACCOUNT_TYPES,
  CreditAdjustmentError,
  applyCreditAdjustment,
  normalizeCreditAdjustment,
};
