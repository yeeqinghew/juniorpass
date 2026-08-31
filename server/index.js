const express = require("express");
const cors = require("cors");
const client = require("./utils/redisClient");
const app = express();

// Trust proxy - required for Railway/Heroku/etc. to properly read X-Forwarded-* headers
// This is necessary for rate limiting, IP detection, and proper HTTPS detection
app.set('trust proxy', 1);

// middleware
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const isDevelopment = !["production", "staging"].includes(
  process.env.NODE_ENV,
);
const isLocalOrigin = (origin) =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

app.use(
  cors({
    origin: function (origin, callback) {
      // 1. Allow Postman/Mobile apps (no origin)
      if (!origin) return callback(null, true);

      // 2. Local development may use any localhost port. Deployed
      // environments must explicitly list every trusted frontend origin.
      if (isDevelopment && isLocalOrigin(origin)) {
        return callback(null, true);
      }

      // 3. Check against whitelist
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.error(`CORS Blocked: ${origin}`); // Debugging help
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

// CRITICAL: Handle webhook route BEFORE general body parsing middleware
// This must come before express.json() and express.urlencoded()
app.use(
  ["/payment/webhook", "/api/payment/webhook"],
  express.raw({ type: "application/x-www-form-urlencoded" }),
);

app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(express.json());

// This service is API-only. Never cache user-specific API responses in the
// browser or at an intermediate CDN.
app.use((req, res, next) => {
  res.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

// ROUTES
const apiRouter = express.Router();

apiRouter.use("/auth", require("./routes/jwtAuth"));
apiRouter.use("/admins", require("./routes/admins"));
apiRouter.use("/partners", require("./routes/partners"));
apiRouter.use("/listings", require("./routes/listings"));
apiRouter.use("/misc", require("./routes/misc"));
apiRouter.use("/media", require("./routes/media"));
apiRouter.use("/children", require("./routes/children"));
apiRouter.use("/payment", require("./routes/payment"));
apiRouter.use("/bookings", require("./routes/bookings"));
apiRouter.use("/class-occurrences", require("./routes/classOccurrences"));
apiRouter.use("/transactions", require("./routes/transactions"));
apiRouter.use("/notifications", require("./routes/notifications"));
apiRouter.use("/outlets", require("./routes/outlets"));
apiRouter.use("/referrals", require("./routes/referrals"));
apiRouter.use("/categories", require("./routes/categories"));

// health check endpoint
apiRouter.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", message: "Server is up running ✨" });
});

// Keep direct Railway endpoints working while also accepting Vercel's /api proxy.
app.use(apiRouter);
app.use("/api", apiRouter);

// The frontends are hosted separately on Vercel. Unknown backend routes must
// return JSON instead of trying to serve a local frontend build.
app.use((req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});

const port = process.env.PORT || 5000;
const server = app.listen(port, () => {
  console.log(`Server has started on port ${port}`);
});

// Properly handle shutdown
const shutdown = () => {
  server.close(() => {
    console.log("HTTP server closed.");
    client.quit(() => {
      console.log("Redis client closed.");
      process.exit(0);
    });
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
