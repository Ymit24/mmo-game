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
      <label
        htmlFor={id}
        className="block text-[10px] uppercase tracking-[0.15em] text-vec-green/60 mb-1.5"
      >
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
        className="w-full border border-border bg-deep px-3 py-2 text-sm text-text-bright outline-none transition-colors duration-150 focus:border-vec-green placeholder:text-muted/40"
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[11px] text-vec-magenta">
          {error}
        </p>
      ) : null}
    </div>
  );
}
