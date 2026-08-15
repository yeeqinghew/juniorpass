const test = require("node:test");
const assert = require("node:assert/strict");

const {
  LOGIN_METHODS,
  getLoginMethodConflict,
} = require("../utils/authMethod");

test("allows users to sign in with their registered method", () => {
  assert.equal(
    getLoginMethodConflict({ method: "email" }, LOGIN_METHODS.EMAIL),
    null,
  );
  assert.equal(
    getLoginMethodConflict({ method: "gmail" }, LOGIN_METHODS.GOOGLE),
    null,
  );
});

test("rejects Google sign-in for a password account", () => {
  assert.equal(
    getLoginMethodConflict({ method: "email" }, LOGIN_METHODS.GOOGLE),
    "This account was created with email and password. Please sign in with your email and password.",
  );
});

test("rejects password sign-in for a Google account", () => {
  assert.equal(
    getLoginMethodConflict({ method: "gmail" }, LOGIN_METHODS.EMAIL),
    "This account was created with Google. Please continue with Google.",
  );
});
