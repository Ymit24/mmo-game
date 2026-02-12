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
      className="border border-vec-magenta/40 bg-vec-magenta/5 px-3 py-2 text-xs text-vec-magenta"
    >
      {message}
    </div>
  );
}
