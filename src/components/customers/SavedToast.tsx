"use client";

import { useEffect, useState } from "react";

/**
 * The badge that says a save actually landed.
 *
 * It exists because a form that takes a second to reach a database in another
 * continent leaves people guessing whether the click counted — which is how
 * one customer ended up on the books eighteen times.
 */
export function SavedToast({
  message,
  tone = "good",
}: {
  message?: string | null;
  tone?: "good" | "bad";
}) {
  // The parent keys this on the message, so a fresh save remounts it and the
  // badge shows again even if the previous one had already faded.
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (!message || !visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4"
    >
      <div
        className={`pointer-events-auto flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium shadow-lg ${
          tone === "bad"
            ? "border-bad/30 bg-bad-soft text-bad"
            : "border-good/30 bg-good-soft text-good"
        }`}
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0"
          aria-hidden="true"
        >
          {tone === "bad" ? (
            <>
              <circle cx="10" cy="10" r="7.5" strokeWidth="1.6" />
              <path d="M10 6.5v4.2" />
              <path d="M10 13.6h.01" />
            </>
          ) : (
            <path d="M4 10.5 8 14.5 16 6.5" />
          )}
        </svg>
        {message}
      </div>
    </div>
  );
}
