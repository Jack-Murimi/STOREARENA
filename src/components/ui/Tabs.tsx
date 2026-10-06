"use client";

import { useState, type ReactNode } from "react";

/**
 * Tabs inside a card. Client state is fine here — the content is already on
 * the page, so switching is instant and nothing is refetched.
 */
export function Tabs({
  label,
  tabs,
}: {
  label: string;
  tabs: { id: string; label: string; content: ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.id);

  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        className="inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-muted p-0.5"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => setActive(tab.id)}
            className={`inline-flex h-8 items-center rounded-sm px-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 ${
              active === tab.id
                ? "bg-surface text-ink shadow-card"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-3">
        {tabs.find((tab) => tab.id === active)?.content}
      </div>
    </div>
  );
}
