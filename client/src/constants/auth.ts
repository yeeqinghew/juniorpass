export const AUTH_ROLES = Object.freeze({
  USER: "user",
  PARTNER: "partner",
  ADMIN: "admin",
} as const);

export type AuthRole = (typeof AUTH_ROLES)[keyof typeof AUTH_ROLES];
