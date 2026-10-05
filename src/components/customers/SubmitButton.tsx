"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/**
 * A submit button that knows when its form is in flight.
 *
 * Without this the button stays clickable for the second or two a server
 * action takes, and a second click posts the same customer twice.
 */
export function SubmitButton({
  children,
  tone = "primary",
  pendingLabel = "Saving…",
}: {
  children: ReactNode;
  tone?: "primary" | "ghost" | "danger";
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  const tones = {
    primary: "bg-flame-500 text-white hover:bg-flame-600 ring-1 ring-flame-600/20",
    ghost: "bg-white text-ink hover:bg-canvas ring-1 ring-line",
    danger: "bg-bad-soft text-bad hover:bg-bad-soft/70 ring-1 ring-bad/20",
  } as const;

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold transition disabled:cursor-wait disabled:opacity-60 ${tones[tone]}`}
    >
      {pending ? (
        <>
          <span
            aria-hidden
            className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
          />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
