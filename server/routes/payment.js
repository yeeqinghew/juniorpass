const express = require("express");
const router = express.Router();
const { AUTH_ROLES } = require("../constants/auth");
const fetch = require("node-fetch");
const pool = require("../db");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const querystring = require("querystring");
const authorization = require("../middleware/authorization").forRole(
  AUTH_ROLES.USER,
);
const { calculateCreditPrice } = require("../utils/creditPricing");
const {
  PaymentSettlementError,
  settleCompletedPayment,
} = require("../services/paymentSettlement.service");

const hitpaySandboxApiKey = process.env.HITPAY_SANDBOX_API_KEY;
const hitpaySandboxSecretKey = process.env.HITPAY_SANDBOX_SECRET_KEY;

const handlePaymentRoute = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (error) {
    console.error("Payment route error:", error);
    if (res.headersSent) return next(error);
    return res.status(500).json({ error: "Unable to process payment request" });
  }
};

function formatSGDateTime(date) {
  // Convert to Singapore time (GMT+8)
  const sgOffset = 8 * 60; // in minutes
  const localOffset = date.getTimezoneOffset(); // in minutes
  const diff = sgOffset + localOffset;

  const sgTime = new Date(date.getTime() + diff * 60 * 1000);

  const pad = (n) => n.toString().padStart(2, "0");

  const year = sgTime.getFullYear();
  const month = pad(sgTime.getMonth() + 1);
  const day = pad(sgTime.getDate());
  const hours = pad(sgTime.getHours());
  const minutes = pad(sgTime.getMinutes());
  const seconds = pad(sgTime.getSeconds());

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// initiates payment and stores it.
router.post(
  "/init",
  authorization,
  handlePaymentRoute(async (req, res) => {
    const credits = Number(req.body.credits);
    const amount = calculateCreditPrice(credits);
    if (!amount) {
      return res
        .status(400)
        .json({ error: "Credits must be a positive whole number" });
    }

    const userResult = await pool.query(
      "SELECT user_id, email, name FROM users WHERE user_id = $1",
      [req.user],
    );
    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const { user_id, email, name } = userResult.rows[0];

    const ref_num = uuidv4(); // Generate a unique reference number
    // Generate expiry 10 minutes from now
    const expiryDate = formatSGDateTime(new Date(Date.now() + 10 * 60 * 1000));

    // Determine webhook URL based on environment
    // Priority: WEBHOOK_URL > NODE_ENV-specific > fallback
    let webhookUrl;
    const nodeEnv = process.env.NODE_ENV || "development";

    if (process.env.WEBHOOK_URL) {
      // Explicit webhook URL takes highest priority
      webhookUrl = process.env.WEBHOOK_URL;
    } else {
      // Auto-detect based on NODE_ENV
      switch (nodeEnv) {
        case "production":
          webhookUrl = process.env.PRODUCTION_URL
            ? `${process.env.PRODUCTION_URL}/payment/webhook`
            : "https://api.juniorpass.sg/payment/webhook";
          break;
        case "staging":
          webhookUrl = process.env.STAGING_URL
            ? `${process.env.STAGING_URL}/payment/webhook`
            : "https://juniorpass-staging.up.railway.app/payment/webhook";
          break;
        default: // development
          webhookUrl = process.env.NGROK_URL
            ? `${process.env.NGROK_URL}/payment/webhook`
            : "https://063e-116-15-191-147.ngrok-free.app/payment/webhook";
      }
    }

    const resp = await fetch(
      "https://api.sandbox.hit-pay.com/v1/payment-requests",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BUSINESS-API-KEY": hitpaySandboxApiKey,
        },
        body: JSON.stringify({
          amount,
          currency: "SGD",
          email,
          purpose: "",
          name,
          reference_number: ref_num,
          description: "Top up store credit",
          redirect_url: "", // Not redirecting to any URL after payment due to Drop-In UI
          webhook: webhookUrl,
          expiry_date: expiryDate, // 10 minutes expiry
        }),
      },
    );

    const response = await resp.json();
    const {
      id,
      name: resName,
      email: resEmail,
      phone,
      amount: resAmount,
      currency,
      status,
      purpose,
      reference_number,
      payment_methods,
      url,
      redirect_url,
      webhook,
      send_sms,
      send_email,
      sms_status,
      email_status,
      allow_repeated_payments,
      expiry_date,
      created_at,
      updated_at,
    } = response;

    await pool.query(
      `INSERT INTO payment_requests
      (user_id, amount, credits, reference_number, hitpay_payment_id)
      VALUES ($1, $2, $3, $4, $5)`,
      [user_id, amount, credits, reference_number, response.id],
    );

    res.status(200).json({
      id: response.id,
      url: response.url,
      reference_number,
      amount,
      credits,
    });
  }),
);

// updates payment and credit if successful.
router.post("/webhook", async (req, res) => {
  const secret = hitpaySandboxSecretKey;

  // req.body is a Buffer, convert to string first
  const rawBodyString = req.body.toString("utf8");

  // Parse the body to extract parameters
  const parsed = querystring.parse(rawBodyString);

  const receivedHmac = parsed.hmac;

  if (!receivedHmac) {
    console.error("❌ No HMAC received");
    return res.status(400).send("Bad Request - No HMAC");
  }

  // Step 1: Remove the hmac parameter
  const { hmac, ...dataWithoutHmac } = parsed;

  // Step 2: Sort keys alphabetically
  const sortedKeys = Object.keys(dataWithoutHmac).sort();

  // Step 3: Concatenate keys and values WITHOUT "&" and "=" separators
  let concatenatedString = "";
  for (const key of sortedKeys) {
    concatenatedString += key + dataWithoutHmac[key];
  }

  // Step 4: Calculate HMAC using the concatenated string
  const calculatedHmac = crypto
    .createHmac("sha256", secret)
    .update(concatenatedString)
    .digest("hex");

  if (calculatedHmac !== receivedHmac) {
    console.error("❌ Invalid HMAC!");
    console.error("String used for HMAC calculation:", concatenatedString);
    return res.status(401).send("Unauthorized");
  }

  const { payment_request_id, reference_number, amount, status } = parsed;
  try {
    if (String(status).toLowerCase() === "completed") {
      await settleCompletedPayment({
        hitpayPaymentId: payment_request_id, // Use payment_request_id, not payment_id
        referenceNumber: reference_number,
        paidAmount: amount,
        source: "webhook",
      });
    }
  } catch (error) {
    console.error("❌ Error processing webhook:", error);
    if (error instanceof PaymentSettlementError) {
      return res.status(400).send("Invalid payment settlement data");
    }
    // A transient database failure must remain retryable by HitPay.
    return res.status(500).send("Unable to settle payment");
  }

  // Respond after processing to ensure DB is updated before frontend polls
  res.status(200).send("OK");
});

// polls for frontend status checking.
router.get("/status/:reference_number", authorization, async (req, res) => {
  const { reference_number } = req.params;

  try {
    const result = await pool.query(
      `SELECT status, webhook_received, updated_at
       FROM payment_requests
       WHERE reference_number = $1 AND user_id = $2`,
      [reference_number, req.user],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Not found" });
    }

    const data = result.rows[0];

    res.json(data);
  } catch (err) {
    console.error("❌ Status check error:", err);
    res.status(500).send("Error checking status");
  }
});

// fallback when webhook fails (manual confirmation).
router.get("/verify/:reference_number", authorization, async (req, res) => {
  const { reference_number } = req.params;

  try {
    // Get payment request ID from DB
    const result = await pool.query(
      `SELECT user_id, hitpay_payment_id, status FROM payment_requests
       WHERE reference_number = $1 AND user_id = $2`,
      [reference_number, req.user],
    );

    if (result.rowCount === 0) {
      console.error(
        `❌ Payment request not found for reference: ${reference_number}`,
      );
      return res.status(404).json({ error: "Payment request not found" });
    }

    const { user_id, hitpay_payment_id, status } = result.rows[0];

    // Either webhook settlement or fallback verification can complete it.
    if (status && status.toUpperCase() === "COMPLETED") {
      return res.status(200).json({ status: "COMPLETED" });
    }

    // Keep the external request outside the database settlement transaction so
    // row locks are held only for local writes.
    let response;
    try {
      response = await fetch(
        `https://api.sandbox.hit-pay.com/v1/payment-requests/${hitpay_payment_id}`,
        {
          method: "GET",
          headers: {
            "X-BUSINESS-API-KEY": hitpaySandboxApiKey,
          },
        },
      );

    } catch (fetchError) {
      console.error("❌ HitPay API error:", fetchError.message);
      return res.status(200).json({ status: status || "PENDING" });
    }

    if (!response.ok) {
      console.error(`❌ HitPay API returned status ${response.status}`);
      return res.status(200).json({ status: status || "PENDING" });
    }

    const data = await response.json();

    if (data.status === "completed") {
      await settleCompletedPayment({
        hitpayPaymentId: data.id,
        referenceNumber: reference_number,
        paidAmount: data.amount,
        expectedUserId: user_id,
        source: "verification",
      });
      return res.status(200).json({ status: "COMPLETED" });
    }

    return res.status(200).json({ status: data.status });
  } catch (err) {
    console.error("❌ Error in verify endpoint:", err);
    res.status(500).send("Error verifying payment");
  }
});

module.exports = router;
