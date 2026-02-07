interface AuthFieldProps {
  id: string;
  name: string;
  type: "email" | "password";
  label: string;
  value: string;
  error?: string;
  autoComplete: string;
  onChange: (value: string) => void;
}

export function AuthField({
  id,
  name,
  type,
  label,
  value,
  error,
  autoComplete,
  onChange,
}: AuthFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-mono uppercase tracking-[0.15em] text-muted mb-2">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={error ? `${id}-error` : undefined}
        className="w-full rounded-md border border-border bg-abyss px-4 py-2.5 text-sm text-text-bright outline-none transition-colors duration-200 focus:border-amber placeholder:text-muted/70"
      />
      {error ? (
        <p id={`${id}-error`} className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
