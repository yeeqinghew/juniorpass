const express = require("express");
const path = require("path"); // Import path module
const cors = require("cors");
const client = require("./utils/redisClient"); // Import the Redis client
const app = express();

// middleware
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      // 1. Allow Postman/Mobile apps (no origin)
      if (!origin) return callback(null, true);

      // 2. In Development, you might want to allow everything if no list is provided
      if (allowedOrigins.length === 0) {
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
  "/payment/webhook",
  express.raw({ type: "application/x-www-form-urlencoded" }),
);

app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(express.json());

// Cache-Control middleware - to instruct browsers and intermediate cache (CDNs) on how cache the response
// Only cache static assets, not API responses
app.use((req, res, next) => {
  // Don't cache API responses - they contain user-specific data that changes frequently
  const isApiRoute =
    req.path.startsWith("/auth") ||
    req.path.startsWith("/admins") ||
    req.path.startsWith("/partners") ||
    req.path.startsWith("/listings") ||
    req.path.startsWith("/misc") ||
    req.path.startsWith("/children") ||
    req.path.startsWith("/payment") ||
    req.path.startsWith("/referrals") ||
    req.path.startsWith("/bookings") ||
    req.path.startsWith("/transactions") ||
    req.path.startsWith("/notifications");

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
app.use("/auth", require("./routes/jwtAuth"));
app.use("/admins", require("./routes/admins"));
app.use("/partners", require("./routes/partners"));
app.use("/listings", require("./routes/listings"));
app.use("/misc", require("./routes/misc"));
app.use("/children", require("./routes/children"));
app.use("/payment", require("./routes/payment"));
app.use("/bookings", require("./routes/bookings"));
app.use("/transactions", require("./routes/transactions"));
app.use("/notifications", require("./routes/notifications"));
app.use("/referrals", require("./routes/referrals"));

// health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", message: "Server is up running ✨" });
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
