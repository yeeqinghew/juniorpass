const LOGIN_METHODS = Object.freeze({
  EMAIL: "email",
  GOOGLE: "gmail",
});

const getLoginMethodConflict = (user, attemptedMethod) => {
  if (!user || user.method === attemptedMethod) return null;

  if (
    user.method === LOGIN_METHODS.EMAIL &&
    attemptedMethod === LOGIN_METHODS.GOOGLE
  ) {
    return "This account was created with email and password. Please sign in with your email and password.";
  }

  if (
    user.method === LOGIN_METHODS.GOOGLE &&
    attemptedMethod === LOGIN_METHODS.EMAIL
  ) {
    return "This account was created with Google. Please continue with Google.";
  }

  return "Please use the sign-in method associated with this account.";
};

module.exports = { LOGIN_METHODS, getLoginMethodConflict };
