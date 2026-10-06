"use client";

import { useState } from "react";

/**
 * The one place the signed-in person appears: avatar, first name, and the role
 * behind a disclosure. The sidebar used to repeat all three under "Signed in".
 */
export function UserMenu({
  name,
  role,
  initials,
}: {
  name: string;
  role: string;
  initials: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex min-h-[var(--touch-target)] items-center gap-2 rounded-md px-1.5 py-1 transition-colors duration-150 hover:bg-surface-muted sm:min-h-0"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-nav-bg text-xs font-semibold text-orange-300">
          {initials}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-medium text-ink">{name}</span>
          <span className="block text-xs text-ink-subtle">{role}</span>
        </span>
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="hidden h-3 w-3 text-ink-subtle sm:block"
          aria-hidden="true"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open ? (
        <>
          {/* Click anywhere else to close, without a focus trap. */}
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-border bg-surface p-1 shadow-raised">
            <p className="px-2 py-1.5 text-sm font-semibold text-ink">{name}</p>
            <p className="px-2 pb-1.5 text-xs text-ink-subtle">{role}</p>
          </div>
        </>
      ) : null}
    </div>
  );
}
