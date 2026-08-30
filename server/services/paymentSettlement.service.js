const pool = require("../db");
const { AUTH_ROLES } = require("../constants/auth");

const REFERRAL_REWARD_CREDITS = 50;

class PaymentSettlementError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PaymentSettlementError";
    this.code = code;
  }
}

function amountsMatch(received, expected) {
  const receivedAmount = Number(received);
  const expectedAmount = Number(expected);
  return (
    Number.isFinite(receivedAmount) &&
    Number.isFinite(expectedAmount) &&
    receivedAmount.toFixed(2) === expectedAmount.toFixed(2)
  );
}

async function lockUsers(client, userIds) {
  const uniqueUserIds = [...new Set(userIds)].sort();
  const result = await client.query(
    `SELECT user_id
     FROM users
     WHERE user_id = ANY($1::uuid[])
     ORDER BY user_id
     FOR UPDATE`,
    [uniqueUserIds],
  );

  if (result.rowCount !== uniqueUserIds.length) {
    throw new PaymentSettlementError(
      "USER_NOT_FOUND",
      "A wallet owner required for settlement no longer exists",
    );
  }
}

async function insertReferralNotifications(client, referral) {
  await client.query(
    `INSERT INTO notifications
       (recipient_type, recipient_id, type, title, message, data)
     VALUES
       ($1, $2, 'referral_completed', 'Referral Bonus Earned!',
        'Your friend completed their first top-up. You earned ' || $3 || ' credits!',
        jsonb_build_object(
          'reward_credits', $3,
          'referral_id', $4,
          'payment_request_id', $5
        )),
       ($1, $6, 'referral_bonus', 'Welcome Bonus!',
        'Thanks for joining! You earned ' || $3 || ' welcome credits!',
        jsonb_build_object(
          'reward_credits', $3,
          'referral_id', $4,
          'payment_request_id', $5
        ))`,
    [
      AUTH_ROLES.USER,
      referral.referrer_id,
      REFERRAL_REWARD_CREDITS,
      referral.id,
      referral.payment_request_id,
      referral.referee_id,
    ],
  );
}

async function awardLockedReferral(client, referral, paymentRequestId) {
  if (referral.referrer_id === referral.referee_id) {
    await client.query(
      `UPDATE referrals
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND status = 'pending'`,
      [referral.id],
    );
    return false;
  }

  const completion = await client.query(
    `UPDATE referrals
     SET status = 'completed',
         completed_at = NOW(),
         rewarded_payment_request_id = $2,
         updated_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING id`,
    [referral.id, paymentRequestId],
  );

  if (completion.rowCount === 0) return false;

  await client.query(
    `UPDATE users
     SET credit = COALESCE(credit, 0) + $1
     WHERE user_id = ANY($2::uuid[])`,
    [
      REFERRAL_REWARD_CREDITS,
      [referral.referrer_id, referral.referee_id],
    ],
  );

  await client.query(
    `INSERT INTO transactions
       (parent_id, child_id, listing_id, used_credit, transaction_type, referral_id)
     VALUES
       ($1, NULL, NULL, $3, 'CREDIT', $4),
       ($2, NULL, NULL, $3, 'CREDIT', $4)`,
    [
      referral.referrer_id,
      referral.referee_id,
      REFERRAL_REWARD_CREDITS,
      referral.id,
    ],
  );

  await insertReferralNotifications(client, {
    ...referral,
    payment_request_id: paymentRequestId,
  });

  return true;
}

async function settleCompletedPayment({
  dbPool = pool,
  referenceNumber,
  hitpayPaymentId,
  paidAmount,
  expectedUserId,
  source = "webhook",
}) {
  const client = await dbPool.connect();

  try {
    await client.query("BEGIN");

    // The payment row is always the first lock acquired. The webhook and the
    // fallback verifier therefore serialize on one idempotency record.
    const paymentResult = await client.query(
      `SELECT request_id, user_id, amount, credits, reference_number,
              hitpay_payment_id, status, webhook_received, settled_at,
              created_at
       FROM payment_requests
       WHERE reference_number = $1
       FOR UPDATE`,
      [referenceNumber],
    );

    if (paymentResult.rowCount === 0) {
      throw new PaymentSettlementError(
        "PAYMENT_NOT_FOUND",
        "Payment request not found",
      );
    }

    const payment = paymentResult.rows[0];

    if (payment.hitpay_payment_id !== hitpayPaymentId) {
      throw new PaymentSettlementError(
        "PAYMENT_ID_MISMATCH",
        "HitPay payment identifier does not match the stored request",
      );
    }
    if (expectedUserId && payment.user_id !== expectedUserId) {
      throw new PaymentSettlementError(
        "PAYMENT_OWNER_MISMATCH",
        "Payment request does not belong to the signed-in user",
      );
    }
    if (!amountsMatch(paidAmount, payment.amount)) {
      throw new PaymentSettlementError(
        "PAYMENT_AMOUNT_MISMATCH",
        "Paid amount does not match the stored payment request",
      );
    }

    if (String(payment.status).toUpperCase() === "COMPLETED") {
      if (source === "webhook" && !payment.webhook_received) {
        await client.query(
          `UPDATE payment_requests
           SET webhook_received = true, updated_at = NOW()
           WHERE request_id = $1`,
          [payment.request_id],
        );
      }
      await client.query("COMMIT");
      return {
        completed: true,
        alreadyCompleted: true,
        paymentRequestId: payment.request_id,
        referralRewarded: false,
      };
    }

    const previousPaymentResult = await client.query(
      `SELECT EXISTS (
         SELECT 1
         FROM payment_requests
         WHERE user_id = $1
           AND request_id <> $2
           AND status = 'COMPLETED'
       ) AS has_previous_completed_payment`,
      [payment.user_id, payment.request_id],
    );
    const isFirstCompletedPayment =
      !previousPaymentResult.rows[0].has_previous_completed_payment;

    // Lock a pending referral before wallet rows. All referral completion
    // paths use payment -> referral -> users ordering to prevent deadlocks.
    let referral = null;
    if (isFirstCompletedPayment) {
      const referralResult = await client.query(
        `SELECT id, referrer_id, referee_id, status
         FROM referrals
         WHERE referee_id = $1
           AND status = 'pending'
           AND created_at <= $2
         ORDER BY id
         LIMIT 1
         FOR UPDATE`,
        [payment.user_id, payment.created_at],
      );
      referral = referralResult.rows[0] || null;
    }

    await lockUsers(
      client,
      referral
        ? [payment.user_id, referral.referrer_id]
        : [payment.user_id],
    );

    await client.query(
      `UPDATE payment_requests
       SET status = 'COMPLETED',
           webhook_received = webhook_received OR $2,
           settled_at = NOW(),
           updated_at = NOW()
       WHERE request_id = $1`,
      [payment.request_id, source === "webhook"],
    );

    const walletResult = await client.query(
      `UPDATE users
       SET credit = COALESCE(credit, 0) + $1
       WHERE user_id = $2
       RETURNING credit`,
      [payment.credits, payment.user_id],
    );

    await client.query(
      `INSERT INTO transactions
         (parent_id, child_id, listing_id, used_credit, transaction_type,
          payment_request_id)
       VALUES ($1, NULL, NULL, $2, 'CREDIT', $3)`,
      [payment.user_id, payment.credits, payment.request_id],
    );

    const referralRewarded = referral
      ? await awardLockedReferral(client, referral, payment.request_id)
      : false;

    await client.query("COMMIT");
    return {
      completed: true,
      alreadyCompleted: false,
      paymentRequestId: payment.request_id,
      walletCredit: Number(walletResult.rows[0].credit),
      referralRewarded,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Payment settlement rollback failed:", rollbackError.message);
    }
    throw error;
  } finally {
    client.release();
  }
}

async function reconcileReferralReward({ dbPool = pool, referralId }) {
  const client = await dbPool.connect();

  try {
    await client.query("BEGIN");

    // Read only to discover the referee. The payment lock is still acquired
    // before the referral lock, matching normal settlement lock order.
    const referralLookup = await client.query(
      `SELECT id, referee_id, created_at
       FROM referrals
       WHERE id = $1`,
      [referralId],
    );
    if (referralLookup.rowCount === 0) {
      throw new PaymentSettlementError("REFERRAL_NOT_FOUND", "Referral not found");
    }

    const paymentResult = await client.query(
      `SELECT request_id
       FROM payment_requests
       WHERE user_id = $1
         AND status = 'COMPLETED'
         AND created_at >= $2
       ORDER BY created_at, request_id
       LIMIT 1
       FOR UPDATE`,
      [
        referralLookup.rows[0].referee_id,
        referralLookup.rows[0].created_at,
      ],
    );
    if (paymentResult.rowCount === 0) {
      throw new PaymentSettlementError(
        "NO_COMPLETED_PAYMENT",
        "Referral cannot be rewarded before the referee completes a payment",
      );
    }

    const referralResult = await client.query(
      `SELECT id, referrer_id, referee_id, status,
              rewarded_payment_request_id
       FROM referrals
       WHERE id = $1
       FOR UPDATE`,
      [referralId],
    );
    const referral = referralResult.rows[0];

    if (referral.status === "completed") {
      await client.query("COMMIT");
      return {
        completed: true,
        alreadyCompleted: true,
        referralRewarded: false,
      };
    }
    if (referral.status !== "pending") {
      throw new PaymentSettlementError(
        "REFERRAL_NOT_PENDING",
        `Referral is ${referral.status}`,
      );
    }

    await lockUsers(client, [referral.referrer_id, referral.referee_id]);
    const referralRewarded = await awardLockedReferral(
      client,
      referral,
      paymentResult.rows[0].request_id,
    );

    await client.query("COMMIT");
    return {
      completed: referralRewarded,
      alreadyCompleted: false,
      referralRewarded,
      rewardCredits: referralRewarded ? REFERRAL_REWARD_CREDITS : 0,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Referral reconciliation rollback failed:", rollbackError.message);
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  REFERRAL_REWARD_CREDITS,
  PaymentSettlementError,
  amountsMatch,
  settleCompletedPayment,
  reconcileReferralReward,
};
