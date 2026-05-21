const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwtGenerator = require("../utils/jwtGenerator");
const validInfo = require("../middleware/validInfo");
const authorization = require("../middleware/authorization");
const etagMiddleware = require("../middleware/etagMiddleware");
const cacheMiddleware = require("../middleware/cacheMiddleware");
const jwt = require("jsonwebtoken");
const redisClient = require("../utils/redisClient");
const rateLimit = require("express-rate-limit");
const { generateReferralCode } = require("../utils/referralGenerator");

// Rate limiters for sensitive auth endpoints
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // max 5 login attempts per window
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const { OAuth2Client } = require("google-auth-library");
const sendEmail = require("../utils/emailSender");
const {
  resetPasswordHtmlTemplate,
} = require("../utils/resetPasswordHtmlTemplate");
const { otpHtmlTemplate } = require("../utils/otpHtmlTemplate");
const client = new OAuth2Client(process.env.googleClientID);

// function isStrongPassword(pw) {
//   if (typeof pw !== "string") return false;
//   const lengthOK = pw.length >= 8;
//   const lower = /[a-z]/.test(pw);
//   const upper = /[A-Z]/.test(pw);
//   const digit = /[0-9]/.test(pw);
//   return lengthOK && lower && upper && digit;
// }
router.use(etagMiddleware);

router.get("/", authorization, async (req, res) => {
  try {
    const user = await pool.query("SELECT * FROM users WHERE user_id = $1", [
      req.user,
    ]);

    return res.status(200).json(user.rows[0]);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post("/register", registerLimiter, validInfo, async (req, res) => {
  const { name, phoneNumber, email, password } = req.body;
  // if (!isStrongPassword(password)) {
  //   return res
  //     .status(400)
  //     .json({ message: "Password does not meet complexity requirements" });
  // }

  try {
    // check if user exists
    const user = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    // decode phone number from base64
    const decodedPhoneNumber = Buffer.from(phoneNumber, "base64").toString(
      "utf-8",
    );

    // check if phone number exists
    const phoneExist = await pool.query(
      "SELECT * FROM users WHERE phone_number = $1",
      [decodedPhoneNumber],
    );

    if (user.rows.length !== 0) {
      return res
        .status(401)
        .json({ message: "User already exist in database. Please login" });
    }

    if (phoneExist.rows.length !== 0) {
      return res.status(401).json({
        message: "Phone number already in use. Please use a different number.",
      });
    }

    // bcrypt password
    const saltRound = 10;
    const bcryptedPassword = bcrypt.hashSync(password, saltRound);

    const newUser = await pool.query(
      `INSERT INTO users(name, user_type, email, password, phone_number, method)
       VALUES($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, "parent", email, bcryptedPassword, decodedPhoneNumber, "email"],
    );

    if (newUser) {
      await pool.query(
        "INSERT INTO parents (parent_id) VALUES($1) RETURNING *",
        [newUser.rows[0].user_id],
      );
    }

    // generate referral code for new user
    const referralCode = await generateReferralCode(newUser.rows[0].user_id);

    // generate jwt token
    const token = jwtGenerator(newUser.rows[0].user_id);

    // Admin notifications: new user registration
    try {
      await pool.query(
        `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data)
         SELECT 'admin', admin_id, 'user_registration', 'New user registered', 'A new user has signed up.',
                jsonb_build_object('user_id', $1, 'email', $2)
         FROM admins`,
        [newUser.rows[0].user_id, email],
      );
    } catch (notifyErr) {
      console.error(
        "Failed to insert admin notification (registration):",
        notifyErr.message,
      );
    }

    return res.status(200).json({ token, newUser: true, referralCode });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post("/login", loginLimiter, validInfo, async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (user.rows.length === 0) {
      return res.status(401).json("Invalid Credential");
    }

    const validPassword = bcrypt.compareSync(password, user.rows[0].password);
    if (!validPassword) {
      return res.status(401).json("Password or Email is incorrect");
    }

    const token = jwtGenerator(user.rows[0].user_id);
    return res.status(200).json({ token });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post("/login/google", async (req, res) => {
  try {
    const { googleCredential } = req.body;

    const ticket = await client.verifyIdToken({
      idToken: googleCredential,
      audience: process.env.googleClientID,
    });
    const payload = ticket.getPayload();
    const { email, name, picture, email_verified, iss, aud } = payload;

    // Strict Google token checks
    if (email_verified !== true) {
      return res.status(400).json({ message: "Google email not verified" });
    }
    if (
      iss !== "https://accounts.google.com" &&
      iss !== "accounts.google.com"
    ) {
      return res.status(400).json({ message: "Invalid Google token issuer" });
    }
    if (aud !== process.env.googleClientID) {
      return res.status(400).json({ message: "Invalid Google token audience" });
    }

    const existingUser = await pool.query(
      `SELECT * FROM users WHERE email = $1`,
      [email],
    );

    if (existingUser.rows.length === 0) {
      // new user, register
      const newUser = await pool.query(
        `INSERT INTO users (email, name, user_type, method, display_picture) 
        VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [email, name, "parent", "gmail", picture],
      );

      if (newUser) {
        await pool.query(
          "INSERT INTO parents (parent_id) VALUES($1) RETURNING *",
          [newUser.rows[0].user_id],
        );
      }

      const referralCode = await generateReferralCode(newUser.rows[0].user_id);

      const token = jwtGenerator(newUser.rows[0].user_id);
      return res.status(200).json({ token, newUser: true, referralCode });
    }

    // existing Gmail user
    const token = jwtGenerator(existingUser.rows[0].user_id);
    return res.status(200).json({ token, newUser: false });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  const { email } = req.body;

  try {
    const userResult = await pool.query(
      `SELECT * FROM users WHERE email = $1`,
      [email],
    );

    if (userResult.rowCount === 0)
      return res.status(200).json({
        message: "If that account exists, we've sent a reset email",
      });

    const userId = userResult.rows[0].user_id;

    // check if user is using google or email
    const user = await pool.query("SELECT * FROM users WHERE user_id = $1", [
      userId,
    ]);

    if (user && user.rows[0].method === "gmail")
      return res.status(200).json({
        message: "If that account exists, we've sent a reset email",
      });

    const token = crypto.randomBytes(32).toString("hex");
    const hashedToken = bcrypt.hashSync(token, 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await pool.query(
      `INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [userId, hashedToken, expiresAt],
    );

    const resetURL = `https://www.juniorpass.sg/reset-password?token=${hashedToken}`;
    const emailContent = resetPasswordHtmlTemplate(resetURL);

    await sendEmail(email, "Password Reset Request", emailContent);
    res.status(200).json({ message: "Password reset email sent" });
  } catch (err) {
    console.error("Error in forgot-password route:", err);
    res.status(500).json({ error: err });
  }
});

router.post("/reset-password", resetPasswordLimiter, async (req, res) => {
  const { token, newPassword } = req.body;
  // if (!isStrongPassword(newPassword)) {
  //   return res.status(400).json({ message: "Password does not meet complexity requirements" });
  // }

  try {
    const resetResult = await pool.query(
      `SELECT user_id, expires_at FROM password_resets WHERE token = $1`,
      [token],
    );

    if (resetResult.rows.length === 0)
      return res.status(400).json({ message: "Invalid or expired token" });

    const { user_id, expires_at } = resetResult.rows[0];

    if (new Date() > new Date(expires_at)) {
      return res.status(400).json({ message: "Token expired" });
    }

    const saltRound = 10;
    const bcryptedPassword = bcrypt.hashSync(newPassword, saltRound);

    await pool.query(`UPDATE users SET password = $1 WHERE user_id = $2`, [
      bcryptedPassword,
      user_id,
    ]);

    await pool.query(`DELETE FROM password_resets WHERE user_id = $1`, [
      user_id,
    ]);

    res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Error in reset-password route:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/change-password", authorization, async (req, res) => {
  const userId = req.user;
  const { oldPassword, newPassword } = req.body;
  // if (!isStrongPassword(newPassword)) {
  //   return res.status(400).json({ message: "Password does not meet complexity requirements" });
  // }

  try {
    const userResult = await pool.query(
      `SELECT password FROM users WHERE user_id = $1`,
      [userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const validPassword = bcrypt.compareSync(
      oldPassword,
      userResult.rows[0].password,
    );

    if (!validPassword) {
      return res.status(401).json({ message: "Old password is incorrect" });
    }

    const saltRound = 10;
    const bcryptedPassword = bcrypt.hashSync(newPassword, saltRound);
    await pool.query(`UPDATE users SET password = $1 WHERE user_id = $2`, [
      bcryptedPassword,
      userId,
    ]);

    const token = jwtGenerator(userId);
    return res
      .status(200)
      .json({ message: "Password changed successfully", token });
  } catch (err) {
    console.error("Error in change-password route:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/check-email", async (req, res) => {
  const { email } = req.body;

  try {
    // check if user exists
    const user = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (user.rows.length !== 0) {
      return res
        .status(401)
        .json({ message: "User already exist in database. Please login" });
    }

    // email is available
    return res.status(200).json({
      available: true,
      message: "Email is available",
    });
  } catch (err) {
    console.error("Error in check-email route: ", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/send-otp", otpLimiter, async (req, res) => {
  const { email } = req.body;

  try {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

    await pool.query(
      `
    INSERT INTO otpRequests(email, otp, expires_at) VALUES($1, $2, $3)`,
      [email, code, expiresAt],
    );

    const emailContent = otpHtmlTemplate(code);
    await sendEmail(email, "OTP Request", emailContent);

    return res.status(200).json({ message: "OTP sent successfully" });
  } catch (err) {
    console.error("Error in send-otp route:", err);
    res.status(500).json({ error: err });
  }
});

router.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  // Throttle brute-force attempts per email using Redis
  try {
    const attemptsKey = `otpAttempts:${email}`;
    const currentAttempts = await new Promise((resolve) => {
      redisClient.get(attemptsKey, (err, data) =>
        resolve(parseInt(data || "0", 10)),
      );
    });
    if (currentAttempts >= 5) {
      return res
        .status(429)
        .json({ message: "Too many attempts. Please try again later." });
    }
  } catch (e) {
    console.error("OTP attempts check failed:", e);
  }

  try {
    const otpResult = await pool.query(
      `SELECT * FROM otpRequests WHERE email = $1 AND otp = $2 AND expires_at > NOW() AND is_verified = false`,
      [email, otp],
    );
    if (otpResult.rows.length === 0) {
      // increment attempts with TTL 15 minutes
      const attemptsKey = `otpAttempts:${email}`;
      try {
        redisClient
          .multi()
          .incr(attemptsKey)
          .expire(attemptsKey, 15 * 60)
          .exec(() => {});
      } catch (e) {
        console.error("Failed to increment OTP attempts:", e);
      }
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // mark OTP as verified
    await pool.query(
      `UPDATE otpRequests SET is_verified = true WHERE email = $1 AND otp = $2`,
      [email, otp],
    );

    // Clear attempts on success
    try {
      redisClient.del(`otpAttempts:${email}`, () => {});
    } catch (e) {
      console.error("Failed to clear OTP attempts:", e);
    }

    return res.status(200).json({ message: "OTP verified successfully" });
  } catch (err) {
    console.error("Error in verify-otp route:", err);
    res.status(500).json({ error: err });
  }
});

router.get("/is-verify", authorization, async (req, res) => {
  try {
    return res.status(200).json(true);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: error.message });
  }
});

router.patch("/:id", authorization, async (req, res) => {
  try {
    const userId = req.user;
    const { name, phone_number, display_picture } = req.body;

    await pool.query(
      `
      UPDATE users 
      SET name = COALESCE($1, name),
       phone_number = COALESCE($2, phone_number),
       display_picture = COALESCE($3, display_picture)
      WHERE user_id = $4
      `,
      [name, phone_number, display_picture, userId],
    );

    return res.status(200).json({ message: "Profile updated successfully" });
  } catch (error) {
    console.error(error.message);
  }
});

router.get("/getAllUsers", cacheMiddleware, async (req, res) => {
  try {
    const user = await pool.query("SELECT * FROM users");
    return res.status(200).json(user.rows);
  } catch (error) {
    console.error(err.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Logout: blacklist the current JWT so it cannot be used again.
 * Uses Redis with TTL equal to the remaining token lifetime.
 */
router.post("/logout", authorization, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(400).json({ error: "Authorization header missing" });
    }
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res.status(400).json({ error: "Invalid authorization header" });
    }
    const token = parts[1];

    // Decode token to get expiry (exp in seconds since epoch)
    const decoded = jwt.decode(token);
    let ttlSeconds = 0;
    const nowSec = Math.floor(Date.now() / 1000);
    if (decoded && decoded.exp) {
      ttlSeconds = Math.max(decoded.exp - nowSec, 0);
    } else {
      // Fallback to default TTL (matches jwtGenerator "2h")
      ttlSeconds = 2 * 60 * 60;
    }

    // Store blacklist entry in Redis
    redisClient.setex(`blacklist:${token}`, ttlSeconds, "1", (err) => {
      if (err) {
        console.error("Redis error during logout:", err);
        return res.status(500).json({ error: "Server error" });
      }
      return res.status(200).json({ message: "Logged out successfully" });
    });
  } catch (error) {
    console.error("Error in /auth/logout:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
