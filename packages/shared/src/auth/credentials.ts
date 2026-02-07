export const MIN_PASSWORD_LENGTH = 8;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isEmailFormatValid(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export function isPasswordLengthValid(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}
