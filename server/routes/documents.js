const express = require("express");
const rateLimit = require("express-rate-limit");
const { AUTH_ROLES } = require("../constants/auth");
const authorization = require("../middleware/authorization").forRole(
  AUTH_ROLES.USER,
);
const {
  getBookingConfirmation,
  getPaymentReceipt,
  sendBookingConfirmation,
  sendPaymentReceipt,
} = require("../services/customerDocuments.service");

const router = express.Router();

const presentDocument = (document) => {
  const presented = { ...document };
  delete presented.automatic_email_sent_at;
  return presented;
};

const resendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user,
  handler: (_req, res) =>
    res.status(429).json({
      error: "Too many email requests. Please try again later.",
    }),
});

router.get("/bookings/:bookingId", authorization, async (req, res) => {
  try {
    const document = await getBookingConfirmation({
      bookingId: req.params.bookingId,
      userId: req.user,
    });
    if (!document) {
      return res.status(404).json({ error: "Booking confirmation not found" });
    }
    return res.json({ document: presentDocument(document) });
  } catch (error) {
    console.error("Unable to load booking confirmation:", error.message);
    return res.status(500).json({ error: "Unable to load booking confirmation" });
  }
});

router.post(
  "/bookings/:bookingId/email",
  authorization,
  resendLimiter,
  async (req, res) => {
    try {
      const document = await sendBookingConfirmation({
        bookingId: req.params.bookingId,
        userId: req.user,
      });
      if (!document) {
        return res.status(404).json({ error: "Booking confirmation not found" });
      }
      return res.json({ message: "Booking confirmation sent" });
    } catch (error) {
      console.error("Unable to email booking confirmation:", error.message);
      return res.status(502).json({ error: "Unable to send the confirmation email" });
    }
  },
);

router.get("/payments/:paymentRequestId", authorization, async (req, res) => {
  try {
    const document = await getPaymentReceipt({
      paymentRequestId: req.params.paymentRequestId,
      userId: req.user,
    });
    if (!document) {
      return res.status(404).json({ error: "Payment receipt not found" });
    }
    return res.json({ document: presentDocument(document) });
  } catch (error) {
    console.error("Unable to load payment receipt:", error.message);
    return res.status(500).json({ error: "Unable to load payment receipt" });
  }
});

router.post(
  "/payments/:paymentRequestId/email",
  authorization,
  resendLimiter,
  async (req, res) => {
    try {
      const document = await sendPaymentReceipt({
        paymentRequestId: req.params.paymentRequestId,
        userId: req.user,
      });
      if (!document) {
        return res.status(404).json({ error: "Payment receipt not found" });
      }
      return res.json({ message: "Payment receipt sent" });
    } catch (error) {
      console.error("Unable to email payment receipt:", error.message);
      return res.status(502).json({ error: "Unable to send the receipt email" });
    }
  },
);

module.exports = router;
