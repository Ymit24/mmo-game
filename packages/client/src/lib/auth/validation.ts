import {
  MIN_PASSWORD_LENGTH,
  isEmailFormatValid,
  normalizeEmail,
} from "@mmo/shared";

export interface AuthFormValues {
  email: string;
  password: string;
}

export interface AuthFormErrors {
  email?: string;
  password?: string;
}

export function validateAuthForm(values: AuthFormValues): AuthFormErrors {
  const errors: AuthFormErrors = {};

  const normalizedEmail = normalizeEmail(values.email);
  if (!normalizedEmail) {
    errors.email = "Email is required.";
  } else if (!isEmailFormatValid(normalizedEmail)) {
    errors.email = "Enter a valid email address.";
  }

  if (!values.password) {
    errors.password = "Password is required.";
  } else if (values.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  return errors;
}
