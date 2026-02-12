interface AuthSubmitButtonProps {
  label: string;
  loadingLabel: string;
  loading: boolean;
}

export function AuthSubmitButton({
  label,
  loadingLabel,
  loading,
}: AuthSubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full border border-vec-green bg-vec-green/10 px-4 py-2.5 font-display text-xs text-vec-green transition-all duration-150 hover:bg-vec-green/20 hover:glow-green active:bg-vec-green/30 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? loadingLabel : label}
    </button>
  );
}
