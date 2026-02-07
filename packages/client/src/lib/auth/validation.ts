export interface AuthFormValues {
  email: string;
  password: string;
}

export interface AuthFormErrors {
  email?: string;
  password?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateAuthForm(values: AuthFormValues): AuthFormErrors {
  const errors: AuthFormErrors = {};

  const normalizedEmail = values.email.trim();
  if (!normalizedEmail) {
    errors.email = "Email is required.";
  } else if (!EMAIL_PATTERN.test(normalizedEmail)) {
    errors.email = "Enter a valid email address.";
  }

  if (!values.password) {
    errors.password = "Password is required.";
  } else if (values.password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  }

  return errors;
}
