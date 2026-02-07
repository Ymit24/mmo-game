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
      className="w-full rounded-md bg-amber px-4 py-3 font-display font-semibold text-void transition-all duration-200 hover:bg-amber-glow hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-65"
    >
      {loading ? loadingLabel : label}
    </button>
  );
}
