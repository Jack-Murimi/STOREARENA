"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { SearchIcon } from "@/components/icons";

interface Props {
  defaultValue: string;
  cat: string;
  branch: string;
  zero: boolean;
}

export function InventorySearch({ defaultValue, cat, branch, zero }: Props) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (timer.current) clearTimeout(timer.current);
    const q = e.target.value;
    timer.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (cat) params.set("cat", cat);
      if (branch) params.set("branch", branch);
      if (zero) params.set("zero", "1");
      router.push(`/inventory${params.size ? `?${params}` : ""}`);
    }, 300);
  }

  return (
    <label className="relative block w-full sm:w-64">
      <span className="sr-only">Search products by name or brand</span>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="Search products…"
        onChange={handleChange}
        className="h-9 w-full rounded-md border border-border bg-surface pl-8 pr-2 text-sm text-ink placeholder:text-ink-subtle focus:border-orange-500 focus:outline-none"
      />
    </label>
  );
}
