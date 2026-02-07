interface AuthErrorBannerProps {
  message: string | null;
}

export function AuthErrorBanner({ message }: AuthErrorBannerProps) {
  if (!message) {
    return null;
  }

  return (
    <div
      role="alert"
      className="rounded-md border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger"
    >
      {message}
    </div>
  );
}
