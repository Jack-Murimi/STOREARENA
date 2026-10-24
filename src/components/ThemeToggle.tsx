"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

function getStored(): Theme {
  try {
    const v = localStorage.getItem("theme");
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {}
  return "system";
}

function apply(theme: Theme) {
  const html = document.documentElement;
  if (theme === "dark") {
    html.setAttribute("data-theme", "dark");
  } else if (theme === "light") {
    html.setAttribute("data-theme", "light");
  } else {
    html.removeAttribute("data-theme");
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = getStored();
    setTheme(stored);
    apply(stored);
  }, []);

  function cycle() {
    const next: Theme = theme === "system" ? "dark" : theme === "dark" ? "light" : "system";
    setTheme(next);
    apply(next);
    try { localStorage.setItem("theme", next); } catch {}
  }

  const label = theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System";
  const icon = theme === "dark" ? "🌙" : theme === "light" ? "☀️" : "⚙️";

  return (
    <button
      type="button"
      onClick={cycle}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm font-medium text-ink-muted hover:bg-surface-muted hover:text-ink"
      title={`Theme: ${label} — click to cycle`}
    >
      <span aria-hidden="true">{icon}</span>
      {label} theme
    </button>
  );
}
