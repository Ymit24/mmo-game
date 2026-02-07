import { useState, type FormEvent } from "react";

import { validateAuthForm, type AuthFormErrors } from "../../lib/auth/validation";
import { AuthErrorBanner } from "./AuthErrorBanner";
import { AuthField } from "./AuthField";
import { AuthSubmitButton } from "./AuthSubmitButton";

interface AuthCredentialsFormProps {
  submitLabel: string;
  loadingLabel: string;
  onSubmit: (credentials: { email: string; password: string }) => Promise<void>;
}

export function AuthCredentialsForm({
  submitLabel,
  loadingLabel,
  onSubmit,
}: AuthCredentialsFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<AuthFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const nextFieldErrors = validateAuthForm({ email, password });
    setFieldErrors(nextFieldErrors);

    if (Object.keys(nextFieldErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({ email: email.trim().toLowerCase(), password });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <AuthErrorBanner message={formError} />
      <AuthField
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        value={email}
        error={fieldErrors.email}
        onChange={(value) => {
          setEmail(value);
          if (fieldErrors.email) {
            setFieldErrors((prev) => ({ ...prev, email: undefined }));
          }
        }}
      />
      <AuthField
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        value={password}
        error={fieldErrors.password}
        onChange={(value) => {
          setPassword(value);
          if (fieldErrors.password) {
            setFieldErrors((prev) => ({ ...prev, password: undefined }));
          }
        }}
      />
      <AuthSubmitButton label={submitLabel} loadingLabel={loadingLabel} loading={isSubmitting} />
    </form>
  );
}
