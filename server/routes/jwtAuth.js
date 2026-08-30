const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcryptjs");
const validInfo = require("../middleware/validInfo");
const { AUTH_ROLES } = require("../constants/auth");
const authorizationMiddleware = require("../middleware/authorization");
const authorization = authorizationMiddleware.forRole(AUTH_ROLES.USER);
const adminAuthorization = authorizationMiddleware.forRole(AUTH_ROLES.ADMIN);
const adminOnly = require("../middleware/adminOnly");
const etagMiddleware = require("../middleware/etagMiddleware");
const redisClient = require("../utils/redisClient");
const rateLimit = require("express-rate-limit");
const { generateReferralCode } = require("../utils/referralGenerator");
const {
  LOGIN_METHODS,
  getLoginMethodConflict,
} = require("../utils/authMethod");
const {
  issueAuthSession,
  revokeAuthSession,
  revokeToken,
} = require("../utils/authSession");

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
const {
  buildResetPasswordUrl,
  createResetToken,
  hashResetToken,
  resolvePasswordResetTable,
} = require("../utils/passwordReset");
const { otpHtmlTemplate } = require("../utils/otpHtmlTemplate");
const googleClientId =
  process.env.GOOGLE_CLIENT_ID || process.env.googleClientID;
const client = new OAuth2Client(googleClientId);

function isStrongPassword(pw) {
  if (typeof pw !== "string") return false;
  // The current clients submit a SHA-256 digest after validating the raw
  // password in the form. Accept that established payload format here.
  if (/^[a-f0-9]{64}$/i.test(pw)) return true;
  const lengthOK = pw.length >= 8;
  const lower = /[a-z]/.test(pw);
  const upper = /[A-Z]/.test(pw);
  const digit = /[0-9]/.test(pw);
  return lengthOK && lower && upper && digit;
}
router.use(etagMiddleware);

router.get("/", authorization, async (req, res) => {
  try {
    const user = await pool.query(
      `SELECT user_id, name, email, phone_number, user_type, method, credit,
              display_picture, created_at, updated_at
       FROM users
       WHERE user_id = $1`,
      [req.user],
    );

    return res.status(200).json(user.rows[0]);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post("/register", registerLimiter, validInfo, async (req, res) => {
  const { name, phoneNumber, email, password } = req.body;
  if (!isStrongPassword(password)) {
    return res
      .status(400)
      .json({ message: "Password does not meet complexity requirements" });
  }

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

    // Admin notifications: new user registration
    try {
      await pool.query(
        `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data)
         SELECT $3, admin_id, 'user_registration', 'New user registered', 'A new user has signed up.',
                jsonb_build_object('user_id', $1, 'email', $2)
         FROM admins`,
        [newUser.rows[0].user_id, email, AUTH_ROLES.ADMIN],
      );
    } catch (notifyErr) {
      console.error(
        "Failed to insert admin notification (registration):",
        notifyErr.message,
      );
    }

    return res.status(200).json(
      issueAuthSession(res, newUser.rows[0].user_id, AUTH_ROLES.USER, {
        newUser: true,
        user_id: newUser.rows[0].user_id,
        referralCode,
      }),
    );
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

    const methodConflict = getLoginMethodConflict(
      user.rows[0],
      LOGIN_METHODS.EMAIL,
    );
    if (methodConflict) {
      return res.status(409).json({ message: methodConflict });
    }

    const validPassword = bcrypt.compareSync(password, user.rows[0].password);
    if (!validPassword) {
      return res.status(401).json("Password or Email is incorrect");
    }

    return res
      .status(200)
      .json(issueAuthSession(res, user.rows[0].user_id, AUTH_ROLES.USER));
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
      audience: googleClientId,
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
    if (aud !== googleClientId) {
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

      return res.status(200).json(
        issueAuthSession(res, newUser.rows[0].user_id, AUTH_ROLES.USER, {
          newUser: true,
          user_id: newUser.rows[0].user_id,
          referralCode,
        }),
      );
    }

    const methodConflict = getLoginMethodConflict(
      existingUser.rows[0],
      LOGIN_METHODS.GOOGLE,
    );
    if (methodConflict) {
      return res.status(409).json({ message: methodConflict });
    }

    // Existing Google user
    return res.status(200).json(
      issueAuthSession(res, existingUser.rows[0].user_id, AUTH_ROLES.USER, {
        newUser: false,
      }),
    );
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  const email = req.body?.email?.trim();
  const genericMessage = "If that account exists, we've sent a reset email";

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    const userResult = await pool.query(
      `SELECT * FROM users WHERE email = $1`,
      [email],
    );

    if (userResult.rowCount === 0)
      return res.status(200).json({ message: genericMessage });

    const user = userResult.rows[0];
    const userId = user.user_id;

    if (user.method === LOGIN_METHODS.GOOGLE) {
      return res.status(200).json({ message: genericMessage });
    }

    const token = createResetToken();
    const hashedToken = hashResetToken(token);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    const resetTable = await resolvePasswordResetTable(pool);

    await pool.query(`DELETE FROM ${resetTable} WHERE user_id = $1`, [userId]);

    const resetRequest = await pool.query(
      `INSERT INTO ${resetTable} (user_id, token, expires_at)
       VALUES ($1, $2, $3)
       RETURNING reset_id`,
      [userId, hashedToken, expiresAt],
    );

    const resetURL = buildResetPasswordUrl(req, token);
    const emailContent = resetPasswordHtmlTemplate(resetURL);

    try {
      await sendEmail(email, "Password Reset Request", emailContent);
    } catch (emailError) {
      await pool.query(`DELETE FROM ${resetTable} WHERE reset_id = $1`, [
        resetRequest.rows[0].reset_id,
      ]);
      throw emailError;
    }

    res.status(200).json({ message: genericMessage });
  } catch (err) {
    console.error("Error in forgot-password route:", err.message);
    res.status(500).json({
      message: "We couldn't send the reset email. Please try again shortly.",
    });
  }
});

router.post("/reset-password", resetPasswordLimiter, async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res
      .status(400)
      .json({ message: "Reset token and password are required" });
  }

  if (!isStrongPassword(newPassword)) {
    return res
      .status(400)
      .json({ message: "Password does not meet complexity requirements" });
  }

  try {
    const hashedToken = hashResetToken(token);
    const resetTable = await resolvePasswordResetTable(pool);
    const resetResult = await pool.query(
      `SELECT reset_id, user_id, expires_at
       FROM ${resetTable}
       WHERE token IN ($1, $2)
       ORDER BY CASE WHEN token = $1 THEN 0 ELSE 1 END
       LIMIT 1`,
      [hashedToken, token],
    );

    if (resetResult.rows.length === 0)
      return res.status(400).json({ message: "Invalid or expired token" });

    const { reset_id, user_id, expires_at } = resetResult.rows[0];

    if (new Date() > new Date(expires_at)) {
      await pool.query(`DELETE FROM ${resetTable} WHERE reset_id = $1`, [
        reset_id,
      ]);
      return res.status(400).json({ message: "Token expired" });
    }

    const saltRound = 10;
    const bcryptedPassword = bcrypt.hashSync(newPassword, saltRound);

    const dbClient = await pool.connect();
    try {
      await dbClient.query("BEGIN");
      await dbClient.query(
        `UPDATE users SET password = $1 WHERE user_id = $2`,
        [bcryptedPassword, user_id],
      );
      await dbClient.query(`DELETE FROM ${resetTable} WHERE user_id = $1`, [
        user_id,
      ]);
      await dbClient.query("COMMIT");
    } catch (transactionError) {
      await dbClient.query("ROLLBACK");
      throw transactionError;
    } finally {
      dbClient.release();
    }

    res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Error in reset-password route:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/change-password", authorization, async (req, res) => {
  const userId = req.user;
  const { oldPassword, newPassword } = req.body;
  if (!isStrongPassword(newPassword)) {
    return res
      .status(400)
      .json({ message: "Password does not meet complexity requirements" });
  }

  try {
    const userResult = await pool.query(
      `SELECT password, method FROM users WHERE user_id = $1`,
      [userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // Prevent Gmail users from changing password
    if (userResult.rows[0].method === "gmail") {
      return res.status(403).json({
        message: "Cannot change password for Google-authenticated accounts",
      });
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

    await revokeAuthSession(req, res, AUTH_ROLES.USER);
    return res.status(200).json({
      message: "Password changed successfully",
      authenticated: false,
    });
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

router.post("/refresh", authorization, async (req, res) => {
  try {
    await revokeToken(req.authToken);
    const responseBody = issueAuthSession(res, req.user, AUTH_ROLES.USER, {
      message: "Session renewed successfully",
    });
    return res.status(200).json(responseBody);
  } catch (error) {
    console.error("Error in /auth/refresh:", error);
    return res.status(500).json({ error: "Unable to renew session" });
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

router.get(
  "/getAllUsers",
  adminAuthorization,
  adminOnly,
  async (req, res) => {
    try {
      const user = await pool.query(
        `SELECT user_id, name, email, phone_number, user_type, method, credit,
                display_picture, created_at, updated_at
         FROM users`,
      );
      return res.status(200).json(user.rows);
    } catch (error) {
      console.error(error.message);
      res.status(500).json({ error: error.message });
    }
  },
);

/**
 * Logout: blacklist the current JWT so it cannot be used again.
 * Uses Redis with TTL equal to the remaining token lifetime.
 */
router.post("/logout", authorization, async (req, res) => {
  try {
    await revokeAuthSession(req, res, AUTH_ROLES.USER);
    return res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Error in /auth/logout:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
