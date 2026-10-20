const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const pool = require("../db");
const sendEmail = require("../utils/emailSender");
const { bookingPolicyFromSnapshot } = require("../utils/bookingPolicy");

const emailTemplate = fs.readFileSync(
  path.join(__dirname, "../templates/customerDocumentEmail.html"),
  "utf8",
);

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatDateTime = (value) =>
  new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));

const formatMoney = (value) => `SGD ${Number(value).toFixed(2)}`;

const getMainSiteUrl = (env = process.env) => {
  const configured = String(env.FRONTEND_URL || env.CLIENT_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (env.NODE_ENV === "staging") return "https://staging.juniorpass.sg";
  if (env.NODE_ENV === "production") return "https://www.juniorpass.sg";
  return "http://localhost:5173";
};

const formatAddress = (value) => {
  if (!value) return "To be confirmed";
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (!parsed || typeof parsed !== "object") return String(value);
  return [
    parsed.ADDRESS || parsed.address,
    parsed.BUILDING || parsed.building,
    parsed.POSTAL_CODE || parsed.postal_code,
  ]
    .filter(Boolean)
    .join(", ") || "To be confirmed";
};

const packageLabel = (value) =>
  ({
    "pay-as-you-go": "Pay as you go",
    "short-term": "Short term",
    "full-term": "Full term",
    trial: "Trial",
  })[value] || value || "Class package";

const bookingReference = (id) => `JPB-${String(id).toUpperCase()}`;
const receiptReference = (reference) =>
  `JPR-${String(reference).toUpperCase()}`;

async function getBookingConfirmation({
  db = pool,
  bookingId,
  userId = null,
}) {
  const result = await db.query(
    `SELECT b.booking_id, b.user_id, b.start_date, b.end_date,
            b.enrolled_package_type, b.classes_total, b.charged_credits,
            b.status, b.policy_snapshot, b.created_at,
            b.confirmation_email_sent_at,
            u.name AS customer_name, u.email AS customer_email,
            c.name AS child_name, l.listing_title, p.partner_name,
            o.outlet_name, o.address AS outlet_address
     FROM bookings b
     JOIN users u ON u.user_id = b.user_id
     JOIN children c ON c.child_id = b.child_id
     JOIN listings l ON l.listing_id = b.listing_id
     JOIN partners p ON p.partner_id = l.partner_id
     JOIN schedules s ON s.schedule_id = b.schedule_id
     JOIN listingOutlets lo ON lo.listing_outlet_id = s.listing_outlet_id
     JOIN outlets o ON o.outlet_id = lo.outlet_id
     WHERE b.booking_id = $1
       AND ($2::uuid IS NULL OR b.user_id = $2)`,
    [bookingId, userId],
  );
  if (result.rowCount === 0) return null;

  const row = result.rows[0];
  const policy = bookingPolicyFromSnapshot(row.policy_snapshot);
  const classStart = new Date(row.start_date);
  const cancellationDeadline = new Date(
    classStart.getTime() -
      policy.cancellation_notice_hours * 60 * 60 * 1000,
  );

  return {
    type: "booking_confirmation",
    reference: bookingReference(row.booking_id),
    record_id: row.booking_id,
    issued_at: row.created_at,
    status: row.status,
    customer_name: row.customer_name,
    customer_email: row.customer_email,
    automatic_email_sent_at: row.confirmation_email_sent_at,
    class_title: row.listing_title,
    partner_name: row.partner_name,
    child_name: row.child_name,
    outlet_name: row.outlet_name,
    outlet_address: formatAddress(row.outlet_address),
    start_date: row.start_date,
    end_date: row.end_date,
    package_type: row.enrolled_package_type,
    package_label: packageLabel(row.enrolled_package_type),
    classes_total: Number(row.classes_total || 0),
    credits_charged: Number(row.charged_credits || 0),
    policy: {
      ...policy,
      cancellation_deadline: cancellationDeadline.toISOString(),
    },
  };
}

async function getPaymentReceipt({
  db = pool,
  paymentRequestId,
  userId = null,
}) {
  const result = await db.query(
    `SELECT pr.request_id, pr.user_id, pr.amount, pr.credits,
            pr.reference_number, pr.hitpay_payment_id, pr.status,
            pr.settled_at, pr.created_at, pr.receipt_email_sent_at,
            u.name AS customer_name, u.email AS customer_email
     FROM payment_requests pr
     JOIN users u ON u.user_id = pr.user_id
     WHERE pr.request_id = $1
       AND pr.status = 'COMPLETED'
       AND ($2::uuid IS NULL OR pr.user_id = $2)`,
    [paymentRequestId, userId],
  );
  if (result.rowCount === 0) return null;

  const row = result.rows[0];
  return {
    type: "payment_receipt",
    reference: receiptReference(row.reference_number),
    record_id: row.request_id,
    issued_at: row.settled_at || row.created_at,
    status: row.status,
    customer_name: row.customer_name,
    customer_email: row.customer_email,
    automatic_email_sent_at: row.receipt_email_sent_at,
    amount: Number(row.amount),
    currency: "SGD",
    credits_purchased: Number(row.credits),
    payment_reference: row.reference_number,
    payment_provider: "HitPay",
    provider_payment_id: row.hitpay_payment_id,
  };
}

const rowHtml = (label, value) =>
  `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;

function buildDocumentEmail(document, env = process.env) {
  const isBooking = document.type === "booking_confirmation";
  const profileUrl = `${getMainSiteUrl(env)}/profile`;
  const details = isBooking
    ? [
        ["Class", document.class_title],
        ["Child", document.child_name],
        ["Partner", document.partner_name],
        ["Date and time", `${formatDateTime(document.start_date)} – ${formatDateTime(document.end_date)}`],
        ["Location", `${document.outlet_name || "Outlet"}, ${document.outlet_address}`],
        ["Package", `${document.package_label} · ${document.classes_total} classes`],
        ["Credits charged", `${document.credits_charged} credits`],
        ["Status", document.status],
      ]
    : [
        ["Payment date", formatDateTime(document.issued_at)],
        ["Amount paid", formatMoney(document.amount)],
        ["Credits purchased", `${document.credits_purchased} credits`],
        ["Payment method", document.payment_provider],
        ["Payment reference", document.payment_reference],
        ["Status", document.status],
      ];

  const policy = isBooking
    ? `<div class="policy"><h2>Booking policy</h2>
         <p>Cancel by ${escapeHtml(formatDateTime(document.policy.cancellation_deadline))} to receive ${escapeHtml(document.policy.refund_before_deadline_percent)}% of the charged credits back. After that deadline, the refund is ${escapeHtml(document.policy.refund_after_deadline_percent)}%.</p>
         <p>${document.policy.makeup_allowed ? `Make-up requests are allowed with at least ${escapeHtml(document.policy.makeup_notice_hours)} hours’ notice, subject to availability.` : "Make-up requests are not available for this booking."}</p>
         <p>${escapeHtml(document.policy.class_requirements || "No additional class requirements were provided.")}</p></div>`
    : "";

  const values = {
    logoUrl: `${getMainSiteUrl(env)}/juniorpass-logo.png`,
    eyebrow: isBooking ? "Booking confirmation" : "Payment receipt",
    title: isBooking ? "Your class is confirmed" : "Your credit top-up is complete",
    customerName: document.customer_name || "there",
    intro: isBooking
      ? "your class booking has been confirmed. Keep this confirmation for your records."
      : "your payment was completed and the credits have been added to your JuniorPASS wallet.",
    referenceLabel: isBooking ? "Booking reference" : "Receipt number",
    reference: document.reference,
    detailRows: details.map(([label, value]) => rowHtml(label, value)).join(""),
    policySection: policy,
    profileUrl,
    currentYear: new Date().getFullYear(),
  };

  return Object.entries(values).reduce(
    (html, [key, value]) =>
      html.replaceAll(`{{${key}}}`, ["detailRows", "policySection"].includes(key) ? value : escapeHtml(value)),
    emailTemplate,
  );
}

const idempotencyKey = (prefix, id) => {
  const digest = crypto.createHash("sha256").update(String(id)).digest("hex");
  return `${prefix}-${digest}`;
};

async function sendBookingConfirmation({
  db = pool,
  bookingId,
  userId = null,
  automatic = false,
  sendEmailImpl = sendEmail,
  env = process.env,
}) {
  const document = await getBookingConfirmation({ db, bookingId, userId });
  if (!document) return null;
  if (automatic && document.automatic_email_sent_at) return document;
  await sendEmailImpl(
    document.customer_email,
    `Booking confirmed: ${document.class_title}`,
    buildDocumentEmail(document, env),
    automatic
      ? { idempotencyKey: idempotencyKey("booking-confirmation", bookingId) }
      : {},
  );
  if (automatic) {
    await db.query(
      `UPDATE bookings
       SET confirmation_email_sent_at = COALESCE(confirmation_email_sent_at, NOW())
       WHERE booking_id = $1`,
      [bookingId],
    );
  }
  return document;
}

async function sendPaymentReceipt({
  db = pool,
  paymentRequestId,
  userId = null,
  automatic = false,
  sendEmailImpl = sendEmail,
  env = process.env,
}) {
  const document = await getPaymentReceipt({ db, paymentRequestId, userId });
  if (!document) return null;
  if (automatic && document.automatic_email_sent_at) return document;
  await sendEmailImpl(
    document.customer_email,
    `JuniorPASS receipt ${document.reference}`,
    buildDocumentEmail(document, env),
    automatic
      ? { idempotencyKey: idempotencyKey("payment-receipt", paymentRequestId) }
      : {},
  );
  if (automatic) {
    await db.query(
      `UPDATE payment_requests
       SET receipt_email_sent_at = COALESCE(receipt_email_sent_at, NOW()),
           updated_at = NOW()
       WHERE request_id = $1`,
      [paymentRequestId],
    );
  }
  return document;
}

module.exports = {
  formatAddress,
  getBookingConfirmation,
  getPaymentReceipt,
  buildDocumentEmail,
  sendBookingConfirmation,
  sendPaymentReceipt,
};
