/**
 * API Configuration for Junior Pass
 * Centralized API base URL management and authenticated fetch utility
 */
import { AUTH_ROLES } from "../constants/auth";


/**
 * Get the API base URL based on environment
 * Priority: staging same-origin proxy > VITE_API_URL > local fallback
 */
const getBaseURL = (): string => {
  // Staging shares a Vercel project/configuration with other environments.
  // Keep staging API calls on the current origin so the staging-only Vercel
  // rewrite can proxy them to Railway without affecting production.
  const stagingHosts = new Set([
    "staging.juniorpass.sg",
    "www.staging.juniorpass.sg",
  ]);

  if (stagingHosts.has(window.location.hostname)) {
    return window.location.origin;
  }

  // 1. Use explicit API URL if provided (for production/staging)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // 2. Development mode - use localhost with configurable port
  const port = import.meta.env.VITE_API_PORT || "5000";
  const hostname = window.location.hostname;

  // Use https in production, http in development
  const protocol =
    hostname === "localhost" || hostname === "127.0.0.1" ? "http" : "https";

  return `${protocol}://${hostname}:${port}`;
};

/**
 * Authenticated fetch wrapper.
 * The browser sends the role-scoped HttpOnly session cookie automatically.
 *
 * @param {string} endpoint - API endpoint (e.g., "/auth/login")
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>}
 */
export const fetchWithAuth = async (
  endpoint: string,
  options: RequestInit = {},
): Promise<Response> => {
  const baseURL = getBaseURL();

  // Build full URL
  const url =
    typeof endpoint === "string" && endpoint.startsWith("http")
      ? endpoint
      : `${baseURL}${endpoint}`;

  // Default headers
  const defaultHeaders = {
    "Content-Type": "application/json",
    "X-Auth-Role": AUTH_ROLES.USER,
  };

  // Merge headers
  const config: RequestInit = {
    ...options,
    credentials: "include",
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);

    // Handle 401 Unauthorized - token expired or invalid
    if (response.status === 401) {
      console.warn("Unauthorized - session is missing or expired");
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`API Error [${endpoint}]:`, message);
    throw error;
  }
};

/**
 * API Endpoints
 * Centralized endpoint definitions
 */
type EndpointId = string | number;

export const API_ENDPOINTS = {
  // Auth
  LOGIN: "/auth/login",
  REGISTER: "/auth/register",
  GOOGLE_LOGIN: "/auth/login/google",
  VERIFY_OTP: "/auth/verify-otp",
  SEND_OTP: "/auth/send-otp",
  CHECK_EMAIL: "/auth/check-email",
  FORGOT_PASSWORD: "/auth/forgot-password",
  RESET_PASSWORD: "/auth/reset-password",
  CHANGE_PASSWORD: "/auth/change-password",
  VERIFY_TOKEN: "/auth/",
  REFRESH_SESSION: "/auth/refresh",
  UPDATE_PROFILE: (userId: EndpointId) => `/auth/${userId}`,
  LOGOUT: "/auth/logout",

  // Children
  GET_CHILDREN: (userId: EndpointId) => `/children/${userId}`,
  CREATE_CHILD: "/children",
  UPDATE_CHILD: (childId: EndpointId) => `/children/${childId}`,
  DELETE_CHILD: (childId: EndpointId) => `/children/${childId}`,

  // Transactions
  GET_TRANSACTIONS: "/transactions/user",

  // Bookings
  GET_BOOKINGS: "/bookings/user",
  GET_CLASS_OCCURRENCES: "/bookings/user/occurrences",
  CREATE_BOOKING: "/bookings",
  GET_BOOKING_WAIVER: "/bookings/waiver",
  CANCEL_BOOKING: (bookingId: EndpointId) => `/bookings/${bookingId}`,
  EXTEND_BOOKING: (bookingId: EndpointId) => `/bookings/${bookingId}/extend`,

  // Reviews
  GET_REVIEW_ELIGIBILITY: "/reviews/mine/eligibility",
  CREATE_REVIEW: "/reviews",
  UPDATE_REVIEW: (reviewId: EndpointId) => `/reviews/${reviewId}`,
  DELETE_REVIEW: (reviewId: EndpointId) => `/reviews/${reviewId}`,
  GET_LISTING_REVIEWS: (listingId: EndpointId) => `/reviews/listing/${listingId}`,
  GET_ELIGIBLE_PROMOTION: (scheduleId: EndpointId, packageType: string) =>
    `/promotions/eligible/${scheduleId}/${packageType}`,

  // Customer documents
  GET_BOOKING_CONFIRMATION: (bookingId: EndpointId) => `/documents/bookings/${bookingId}`,
  EMAIL_BOOKING_CONFIRMATION: (bookingId: EndpointId) =>
    `/documents/bookings/${bookingId}/email`,
  GET_PAYMENT_RECEIPT: (paymentRequestId: EndpointId) =>
    `/documents/payments/${paymentRequestId}`,
  EMAIL_PAYMENT_RECEIPT: (paymentRequestId: EndpointId) =>
    `/documents/payments/${paymentRequestId}/email`,

  // Make-up requests
  GET_USER_MAKEUP_REQUESTS: "/makeup-requests/user",
  CREATE_MAKEUP_REQUEST: "/makeup-requests",
  CONFIRM_MAKEUP_REQUEST: (requestId: EndpointId) =>
    `/makeup-requests/${requestId}/confirm`,
  WITHDRAW_MAKEUP_REQUEST: (requestId: EndpointId) =>
    `/makeup-requests/${requestId}/withdraw`,

  // Classes/Listings
  GET_ALL_LISTINGS: "/listings",
  GET_LISTING: (listingId: EndpointId) => `/listings/${listingId}`,
  SEARCH_LISTINGS: "/listings/search",
  GET_CREDIT_CONVERSION: "/misc/credit-conversion",

  // Partners
  GET_PARTNER: (partnerId: EndpointId | undefined) => `/partners/${partnerId}`,
  PARTNER_FORM: "/partners/partner-form",

  // Payment
  INIT_PAYMENT: "/payment/init",
  PAYMENT_STATUS: (referenceNumber: EndpointId) => `/payment/status/${referenceNumber}`,
  PAYMENT_VERIFY: (referenceNumber: EndpointId) => `/payment/verify/${referenceNumber}`,

  // Referrals
  GET_REFERRAL_CODE: "/referrals/code",
  GET_REFERRALS: "/referrals",
  GET_REFERRAL_STATS: "/referrals/stats",
  MY_REFERRAL: "/referrals/my-referral",
  SHARE_REFERRAL_EMAIL: "/referrals/share-email",
  REGISTER_WITH_CODE: "/referrals/register-with-code",
  CREATE_REFERRAL: "/referrals/create",

  // Notifications
  GET_NOTIFICATIONS: "/notifications",
  GET_UNREAD_COUNT: "/notifications/unread-count",
  MARK_NOTIFICATION_READ: (notificationId: EndpointId) =>
    `/notifications/${notificationId}/read`,
  MARK_ALL_NOTIFICATIONS_READ: "/notifications/read-all",

  // Media Upload
  UPLOAD_USER_DP: "/media/upload/user-dp",
  DELETE_MEDIA: "/media/delete",

  // Miscellaneous
  GET_ALL_CATEGORIES: "/categories",
  GET_ALL_AGE_GROUPS: "/misc/getAllAgeGroups",
  GET_ALL_PACKAGES: "/misc/getAllPackages",
};

export default getBaseURL;
