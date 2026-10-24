const jwt = require("jsonwebtoken");
require("dotenv").config();
const { AUTH_ROLES } = require("../constants/auth");

function jwtGenerator(user_id, role = AUTH_ROLES.USER) {
  const payload = {
    user: user_id,
    role,
  };

  const jwtSecret = process.env.JWT_SECRET;
  const expiresIn = role === AUTH_ROLES.ADMIN ? "8h" : "2h";

  return jwt.sign(payload, jwtSecret, {
    expiresIn,
  });
}

module.exports = jwtGenerator;
