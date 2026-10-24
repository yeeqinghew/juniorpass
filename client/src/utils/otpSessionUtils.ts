const MAX_OTP_ATTEMPTS = 5;
const COOLDOWN_SECONDS = 60;

export const SESSION_KEYS = {
  attempts: "register_otpAttempts",
  locked: "register_isOtpLocked",
  requested: "register_hasRequestedOtp",
  cooldownExpiresAt: "register_otpCooldownExpiresAt",
} as const;

export type SessionOtpState = {
  attempts: number;
  locked: boolean;
  requested: boolean;
};

export const getSessionOtpState = (): SessionOtpState => ({
  attempts: Number(sessionStorage.getItem(SESSION_KEYS.attempts)) || 0,
  locked: sessionStorage.getItem(SESSION_KEYS.locked) === "true",
  requested: sessionStorage.getItem(SESSION_KEYS.requested) === "true",
});

export const saveOtpState = (attempts: number, locked: boolean): void => {
  sessionStorage.setItem(SESSION_KEYS.attempts, attempts.toString());
  sessionStorage.setItem(SESSION_KEYS.locked, locked.toString());
};

export const clearOtpState = (): void => {
  Object.values(SESSION_KEYS).forEach((key) => sessionStorage.removeItem(key));
};

export const setCooldownExpiry = (): void => {
  const expiresAt = Date.now() + COOLDOWN_SECONDS * 1000;
  sessionStorage.setItem(SESSION_KEYS.cooldownExpiresAt, expiresAt.toString());
};

export const getCooldownTimeLeft = (): number => {
  const expiresAt = Number(
    sessionStorage.getItem(SESSION_KEYS.cooldownExpiresAt) || 0
  );
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
};

export { MAX_OTP_ATTEMPTS, COOLDOWN_SECONDS };
