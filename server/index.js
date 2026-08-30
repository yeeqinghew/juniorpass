const express = require("express");
const path = require("path"); // Import path module
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

// Serve static files from the React app
app.use(express.static(path.join(__dirname, "../client/build")));

// CRITICAL: Handle webhook route BEFORE general body parsing middleware
// This must come before express.json() and express.urlencoded()
app.use(
  ["/payment/webhook", "/api/payment/webhook"],
  express.raw({ type: "application/x-www-form-urlencoded" }),
);

app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(express.json());

// Cache-Control middleware - to instruct browsers and intermediate cache (CDNs) on how cache the response
// Only cache static assets, not API responses
app.use((req, res, next) => {
  // Vercel proxies browser requests through /api so authentication cookies stay
  // first-party. Treat the optional proxy prefix exactly like a direct API call.
  const requestPath = req.path.replace(/^\/api(?=\/|$)/, "");

  // Don't cache API responses - they contain user-specific data that changes frequently
  const isApiRoute =
    requestPath.startsWith("/auth") ||
    requestPath.startsWith("/admins") ||
    requestPath.startsWith("/partners") ||
    requestPath.startsWith("/listings") ||
    requestPath.startsWith("/misc") ||
    requestPath.startsWith("/media") ||
    requestPath.startsWith("/children") ||
    requestPath.startsWith("/payment") ||
    requestPath.startsWith("/referrals") ||
    requestPath.startsWith("/bookings") ||
    requestPath.startsWith("/class-occurrences") ||
    requestPath.startsWith("/transactions") ||
    requestPath.startsWith("/outlets") ||
    requestPath.startsWith("/notifications");

  if (isApiRoute) {
    // Don't cache API responses
    res.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  } else {
    // Cache static assets for 1 hour
    res.set("Cache-Control", "public, max-age=3600");
  }
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

// health check endpoint
apiRouter.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", message: "Server is up running ✨" });
});

// Keep direct Railway endpoints working while also accepting Vercel's /api proxy.
app.use(apiRouter);
app.use("/api", apiRouter);

app.use("/api", (req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});

// Catch-all route to serve React app for any non-API route
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/build", "index.html"));
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
