/* ============================================
   JUNIOR PASS - GLOBAL CONSTANTS
   Consolidated constants used across the application
   ============================================ */

// ===== Time & Date =====
export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// ===== Age Groups =====
export const AGE_GROUPS = [
  "0-2 years",
  "3-5 years",
  "6-8 years",
  "9-12 years",
  "13+ years",
];

// ===== Payment & Pricing =====
export const CREDIT_PACKAGES = [
  { amount: 20, label: "$20", bonus: 0, popular: false },
  { amount: 50, label: "$50", bonus: 5, popular: true },
  { amount: 100, label: "$100", bonus: 15, popular: false },
  { amount: 200, label: "$200", bonus: 40, popular: false },
];

// ===== Session & Timeout =====
export const SESSION_CONFIG = {
  IDLE_TIMEOUT: 7200000, // 2 hours in milliseconds
  POLL_INTERVAL: 5000, // 5 seconds
  MAX_POLL_ATTEMPTS: 12,
};

// ===== Brand Info =====
export const BRAND = {
  NAME: "Junior Pass",
  TAGLINE:
    "Connecting parents with trusted enrichment partners across Singapore",
  CONTACT_EMAIL: "admin@juniorpass.sg",
  LOCATION: "Singapore",
};

// ===== User Roles =====
export const USER_ROLES = Object.freeze({
  PARENT: "parent",
  PARTNER: "partner",
  ADMIN: "admin",
});

// ===== Booking Status =====
export const BOOKING_STATUS = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
};

// ===== Payment Status =====
export const PAYMENT_STATUS = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
};

// ===== Routes =====
export const ROUTES = {
  HOME: "/",
  CLASSES: "/classes",
  CLASS_DETAIL: "/class/:classId",
  PRICING: "/pricing",
  ABOUT: "/about-us",
  LOGIN: "/login",
  REGISTER: "/register",
  PROFILE: "/profile",
  PARTNER: "/partner/:partnerId",
  CONTACT: "/partner-contact",
  VERIFY_OTP: "/verify-otp",
  FORGOT_PASSWORD: "/forgot-password",
  RESET_PASSWORD: "/reset-password",
};

// ===== Regex Patterns =====
export const PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE_SG: /^[689]\d{7}$/,
  POSTAL_CODE_SG: /^\d{6}$/,
};

// ===== Error Messages =====
export const ERROR_MESSAGES = {
  NETWORK_ERROR: "Network error. Please check your connection.",
  SESSION_EXPIRED: "Your session has expired. Please login again.",
  PAYMENT_FAILED: "Payment failed. Please try again.",
  INVALID_CREDENTIALS: "Invalid email or password.",
  MIN_TOPUP: "Minimum top-up amount is $5.",
  MAX_TOPUP: "Maximum top-up amount is $1000.",
};

// ===== Success Messages =====
export const SUCCESS_MESSAGES = {
  LOGIN_SUCCESS: "Login successful!",
  REGISTER_SUCCESS: "Registration successful!",
  TOPUP_SUCCESS: "Top-up successful!",
  BOOKING_SUCCESS: "Class booked successfully!",
  PROFILE_UPDATED: "Profile updated successfully!",
};
