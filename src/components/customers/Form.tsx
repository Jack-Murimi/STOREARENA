import type { ReactNode } from "react";

/**
 * Form controls shared by the customer screens. Plain HTML inputs posting to
 * server actions — no client JavaScript needed to run the CRUD.
 */

const controlClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-soft/50 focus:border-flame-400 focus:ring-2 focus:ring-flame-400/20";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1 block text-xs font-medium text-ink-soft">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-xs text-ink-soft/80">{hint}</span>
      ) : null}
    </label>
  );
}

export function TextInput({
  name,
  defaultValue,
  placeholder,
  required,
  type = "text",
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <input
      className={controlClass}
      type={type}
      name={name}
      defaultValue={defaultValue ?? ""}
      placeholder={placeholder}
      required={required}
    />
  );
}

export function SelectInput({
  name,
  defaultValue,
  options,
}: {
  name: string;
  defaultValue?: string;
  options: readonly string[];
}) {
  return (
    <select className={controlClass} name={name} defaultValue={defaultValue ?? ""}>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({
  name,
  defaultChecked,
  label,
}: {
  name: string;
  defaultChecked?: boolean;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-line accent-flame-500"
      />
      {label}
    </label>
  );
}

export function SubmitButton({
  children,
  tone = "primary",
}: {
  children: ReactNode;
  tone?: "primary" | "ghost" | "danger";
}) {
  const tones = {
    primary:
      "bg-flame-500 text-white hover:bg-flame-600 ring-1 ring-flame-600/20",
    ghost: "bg-white text-ink hover:bg-canvas ring-1 ring-line",
    danger: "bg-bad-soft text-bad hover:bg-bad-soft/70 ring-1 ring-bad/20",
  } as const;

  return (
    <button
      type="submit"
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

export function Banner({
  tone,
  children,
}: {
  tone: "info" | "bad" | "good" | "warn";
  children: ReactNode;
}) {
  const tones = {
    info: "border-info/25 bg-info-soft text-info",
    bad: "border-bad/25 bg-bad-soft text-bad",
    good: "border-good/25 bg-good-soft text-good",
    warn: "border-warn/30 bg-warn-soft text-warn",
  } as const;

  return (
    <div
      className={`rounded-lg border px-4 py-3 text-xs leading-relaxed ${tones[tone]}`}
    >
      {children}
    </div>
  );
}
