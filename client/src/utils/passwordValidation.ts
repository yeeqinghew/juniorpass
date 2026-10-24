export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{8,}$/;
export const PASSWORD_REQUIREMENTS_MESSAGE =
  "Use at least 8 characters with uppercase, lowercase, and a number.";

export const strongPasswordRule = {
  pattern: PASSWORD_PATTERN,
  message: PASSWORD_REQUIREMENTS_MESSAGE,
};
