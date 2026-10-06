"use client";

import { useEffect, useRef } from "react";

/**
 * A search box that submits itself as you type.
 *
 * It submits the surrounding form rather than reaching for a client router:
 * the search is server-side, so the results have to come from the server
 * anyway, and a form works with JavaScript off (you just press Enter).
 *
 * 250ms of quiet before it fires, so typing "Jamhuri" does not issue seven
 * requests on a weak connection.
 */
export function SearchInput({
  name,
  defaultValue = "",
  placeholder,
  label,
  delayMs = 250,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  /** Accessible name, also shown to screen readers. */
  label: string;
  delayMs?: number;
}) {
  const form = useRef<HTMLFormElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <label className="relative block w-full sm:w-64">
      <span className="sr-only">{label}</span>
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-ink-subtle"
        aria-hidden="true"
      >
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5 14 14" />
      </svg>
      <input
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={label}
        onChange={(event) => {
          if (timer.current) clearTimeout(timer.current);
          const target = event.currentTarget.form;
          form.current = target;
          timer.current = setTimeout(() => target?.requestSubmit(), delayMs);
        }}
        className="h-9 w-full rounded-md border border-border bg-surface pl-8 pr-2 text-sm text-ink placeholder:text-ink-subtle focus:border-orange-500 focus:outline-none"
      />
    </label>
  );
}
