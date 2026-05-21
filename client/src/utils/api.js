/**
 * API Configuration for JuniorPASS
 * Centralized API base URL management and authenticated fetch utility
 */

/**
 * Get the API base URL based on environment
 * Priority: VITE_API_URL > hostname:port > fallback
 */
const getBaseURL = () => {
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
 * Authenticated fetch wrapper
 * Automatically adds Authorization header with JWT token
 *
 * @param {string} endpoint - API endpoint (e.g., "/auth/login")
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>}
 */
export const fetchWithAuth = async (endpoint, options = {}) => {
  const baseURL = getBaseURL();
  const token = localStorage.getItem("token");

  // Build full URL
  const url =
    typeof endpoint === "string" && endpoint.startsWith("http")
      ? endpoint
      : `${baseURL}${endpoint}`;

  // Default headers
  const defaultHeaders = {
    "Content-Type": "application/json",
  };

  // Add Authorization header if token exists
  if (token) {
    defaultHeaders.Authorization = `Bearer ${token}`;
  }

  // Merge headers
  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);

    // Handle 401 Unauthorized - token expired or invalid
    if (response.status === 401) {
      console.warn("Unauthorized - clearing token");
      localStorage.removeItem("token");
      // Optionally redirect to login
      // window.location.href = '/login';
    }

    return response;
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error.message);
    throw error;
  }
};

/**
 * API Endpoints
 * Centralized endpoint definitions
 */
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
  UPDATE_PROFILE: (userId) => `/auth/${userId}`,
  LOGOUT: "/auth/logout",

  // Children
  GET_CHILDREN: (userId) => `/children/${userId}`,
  CREATE_CHILD: "/children",
  UPDATE_CHILD: (childId) => `/children/${childId}`,
  DELETE_CHILD: (childId) => `/children/${childId}`,

  // Transactions
  GET_TRANSACTIONS: "/transactions/user",

  // Bookings
  GET_BOOKINGS: "/bookings/user",
  CREATE_BOOKING: "/bookings",
  CANCEL_BOOKING: (bookingId) => `/bookings/${bookingId}`,

  // Classes/Listings
  GET_ALL_LISTINGS: "/listings",
  GET_LISTING: (listingId) => `/listings/${listingId}`,
  SEARCH_LISTINGS: "/listings/search",

  // Partners
  GET_PARTNER: (partnerId) => `/partners/${partnerId}`,
  PARTNER_FORM: "/partners/partner-form",

  // Payment
  INIT_PAYMENT: "/payment/init",
  PAYMENT_STATUS: (referenceNumber) => `/payment/status/${referenceNumber}`,
  PAYMENT_VERIFY: (referenceNumber) => `/payment/verify/${referenceNumber}`,

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
  MARK_NOTIFICATION_READ: (notificationId) =>
    `/notifications/${notificationId}/read`,
  MARK_ALL_NOTIFICATIONS_READ: "/notifications/read-all",

  // Media Upload
  UPLOAD_USER_DP: "/media/upload/user-dp",
  DELETE_MEDIA: "/media/delete",

  // Miscellaneous
  GET_ALL_CATEGORIES: "/misc/getAllCategories",
  GET_ALL_AGE_GROUPS: "/misc/getAllAgeGroups",
  GET_ALL_PACKAGES: "/misc/getAllPackages",
};

export default getBaseURL;
