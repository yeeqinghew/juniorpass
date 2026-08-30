const rateLimit = require("express-rate-limit");

const MINUTE_MS = 60 * 1000;

const AUTH_RATE_LIMIT_POLICIES = Object.freeze({
  USER_LOGIN: Object.freeze({
    windowMs: 15 * MINUTE_MS,
    max: 5,
    skipSuccessfulRequests: true,
    message: "Too many failed login attempts. Please try again in 15 minutes.",
  }),
  PARTNER_LOGIN: Object.freeze({
    windowMs: 15 * MINUTE_MS,
    max: 5,
    skipSuccessfulRequests: true,
    message: "Too many failed partner login attempts. Please try again in 15 minutes.",
  }),
  ADMIN_LOGIN: Object.freeze({
    windowMs: 15 * MINUTE_MS,
    max: 5,
    skipSuccessfulRequests: true,
    message: "Too many failed admin login attempts. Please try again in 15 minutes.",
  }),
  GOOGLE_LOGIN: Object.freeze({
    windowMs: 15 * MINUTE_MS,
    max: 10,
    skipSuccessfulRequests: true,
    message: "Too many failed Google login attempts. Please try again in 15 minutes.",
  }),
  REGISTER: Object.freeze({
    windowMs: 60 * MINUTE_MS,
    max: 10,
    skipSuccessfulRequests: false,
    message: "Too many registration attempts. Please try again later.",
  }),
  SEND_OTP: Object.freeze({
    windowMs: 15 * MINUTE_MS,
    max: 5,
    skipSuccessfulRequests: false,
    message: "Too many OTP requests. Please try again in 15 minutes.",
  }),
  VERIFY_OTP: Object.freeze({
    windowMs: 15 * MINUTE_MS,
    max: 10,
    skipSuccessfulRequests: true,
    message: "Too many OTP verification attempts. Please try again in 15 minutes.",
  }),
  FORGOT_PASSWORD: Object.freeze({
    windowMs: 60 * MINUTE_MS,
    max: 5,
    skipSuccessfulRequests: false,
    message: "Too many password reset requests. Please try again later.",
  }),
  RESET_PASSWORD: Object.freeze({
    windowMs: 60 * MINUTE_MS,
    max: 10,
    skipSuccessfulRequests: false,
    message: "Too many password reset attempts. Please try again later.",
  }),
});

function createAuthRateLimiter(policy) {
  return rateLimit({
    windowMs: policy.windowMs,
    max: policy.max,
    skipSuccessfulRequests: policy.skipSuccessfulRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler(req, res) {
      return res.status(429).json({ message: policy.message });
    },
  });
}

const userLoginLimiter = createAuthRateLimiter(
  AUTH_RATE_LIMIT_POLICIES.USER_LOGIN,
);
const partnerLoginLimiter = createAuthRateLimiter(
  AUTH_RATE_LIMIT_POLICIES.PARTNER_LOGIN,
);
const adminLoginLimiter = createAuthRateLimiter(
  AUTH_RATE_LIMIT_POLICIES.ADMIN_LOGIN,
);
const googleLoginLimiter = createAuthRateLimiter(
  AUTH_RATE_LIMIT_POLICIES.GOOGLE_LOGIN,
);
const registerLimiter = createAuthRateLimiter(
  AUTH_RATE_LIMIT_POLICIES.REGISTER,
);
const sendOtpLimiter = createAuthRateLimiter(
  AUTH_RATE_LIMIT_POLICIES.SEND_OTP,
);
const verifyOtpLimiter = createAuthRateLimiter(
  AUTH_RATE_LIMIT_POLICIES.VERIFY_OTP,
);
const forgotPasswordLimiter = createAuthRateLimiter(
  AUTH_RATE_LIMIT_POLICIES.FORGOT_PASSWORD,
);
const resetPasswordLimiter = createAuthRateLimiter(
  AUTH_RATE_LIMIT_POLICIES.RESET_PASSWORD,
);

module.exports = {
  AUTH_RATE_LIMIT_POLICIES,
  createAuthRateLimiter,
  userLoginLimiter,
  partnerLoginLimiter,
  adminLoginLimiter,
  googleLoginLimiter,
  registerLimiter,
  sendOtpLimiter,
  verifyOtpLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
};
