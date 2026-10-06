"use client";

import { useState } from "react";
import { createProduct } from "@/app/inventory/actions";
import { SubmitButton } from "@/components/customers/SubmitButton";
import type { Brand, Category } from "@/lib/stock/types";

/**
 * Adds a product to the catalogue.
 *
 * The size field only appears for a category that is weighed, because the
 * database refuses a kilogram size on anything that is not a cylinder — better
 * to hide the box than to accept an answer and then reject it.
 */
export function NewProductForm({
  categories,
  brands,
  startOpen = false,
}: {
  categories: Category[];
  brands: Brand[];
  /** Set when the page was opened at /inventory?new=1. */
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [brandMode, setBrandMode] = useState<"existing" | "new">("existing");

  const category = categories.find((c) => c.id === categoryId);
  const isCylinder = category?.stockModel === "CYLINDER";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-lg bg-flame-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-flame-700"
      >
        + New product
      </button>
    );
  }

  return (
    <form
      action={createProduct}
      className="space-y-3 rounded-xl border border-line bg-card p-4 shadow-card"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Product name
          </span>
          <input
            name="name"
            required
            placeholder="Afri Gas 13 kg"
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-flame-500"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Category
          </span>
          <select
            name="categoryId"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-flame-500"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        {isCylinder ? (
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Cylinder size (kg)
            </span>
            <input
              name="sizeKg"
              inputMode="decimal"
              required
              placeholder="13"
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-flame-500"
            />
          </label>
        ) : (
          <p className="self-end rounded-lg bg-canvas px-3 py-2 text-xs text-ink-soft">
            {category?.name} are counted as plain stock, so there is no cylinder size.
          </p>
        )}

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            List price (KSh)
          </span>
          <input
            name="listPriceKsh"
            inputMode="decimal"
            placeholder="Optional — what a refill usually costs"
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-flame-500"
          />
        </label>
      </div>

      <div className="space-y-2 rounded-lg bg-canvas p-3">
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-xs text-ink">
            <input
              type="radio"
              checked={brandMode === "existing"}
              onChange={() => setBrandMode("existing")}
            />
            Existing brand
          </label>
          <label className="flex items-center gap-2 text-xs text-ink">
            <input
              type="radio"
              checked={brandMode === "new"}
              onChange={() => setBrandMode("new")}
            />
            New brand
          </label>
        </div>

        {brandMode === "existing" ? (
          <select
            name="brandId"
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-flame-500 sm:max-w-xs"
          >
            <option value="">Choose a brand…</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            name="newBrandName"
            placeholder="Brand name, e.g. Mengas"
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-flame-500 sm:max-w-xs"
          />
        )}
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Adding…">Add product</SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-medium text-ink-soft hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
