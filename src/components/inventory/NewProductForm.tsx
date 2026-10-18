"use client";

import { useState } from "react";
import { createCategory, createProduct } from "@/app/inventory/actions";
import { SubmitButton } from "@/components/customers/SubmitButton";
import { StockModel, type Brand, type Category } from "@/lib/stock/types";

const caps = (value: string) => value.replace(/\s+/g, " ").toUpperCase();

/**
 * Catalogue entry is intentionally short. A cylinder is one brand + one size;
 * REFILL and EMPTY are balances for that product, never extra catalogue rows.
 */
export function NewProductForm({
  categories,
  brands,
  startOpen = false,
  initialCategoryId,
  startCategoryCreation = false,
}: {
  categories: Category[];
  brands: Brand[];
  /** Set when the page was opened at /inventory?new=1. */
  startOpen?: boolean;
  /** The category just created, preserved after the server-action redirect. */
  initialCategoryId?: string;
  /** Re-opens the small category form after a category validation error. */
  startCategoryCreation?: boolean;
}) {
  const initialCategory = categories.some((category) => category.id === initialCategoryId)
    ? initialCategoryId!
    : (categories[0]?.id ?? "");
  const [open, setOpen] = useState(startOpen);
  const [creatingCategory, setCreatingCategory] = useState(
    startCategoryCreation || categories.length === 0,
  );
  const [categoryId, setCategoryId] = useState(initialCategory);
  const [brandMode, setBrandMode] = useState<"existing" | "new">(
    brands.length > 0 ? "existing" : "new",
  );
  const [brandId, setBrandId] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [sizeKgs, setSizeKgs] = useState("");

  const category = categories.find((item) => item.id === categoryId);
  const isCylinder = category?.stockModel === StockModel.Cylinder;
  const selectedBrand = brands.find((brand) => brand.id === brandId);
  const brandForPreview = brandMode === "existing" ? selectedBrand?.name ?? "BRAND" : newBrandName || "BRAND";
  const previewSizes = sizeKgs
    .split(/[,;\n]+/)
    .map((size) => size.trim())
    .filter(Boolean);
  const cylinderPreviews = (previewSizes.length > 0 ? previewSizes : ["SIZE"])
    .map((size) => `${caps(brandForPreview)} ${size} KG`)
    .join(", ");

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

  if (creatingCategory) {
    return (
      <form
        action={createCategory}
        className="space-y-4 rounded-xl border border-line bg-card p-4 shadow-card"
      >
        <div>
          <p className="text-sm font-semibold text-ink">Create a category</p>
          <p className="mt-1 text-xs leading-5 text-ink-soft">
            Choose <strong>Cylinder</strong> for LPG products that have REFILL and EMPTY balances.
            Choose <strong>Simple item</strong> for water, accessories, and other counted stock.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_210px]">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Category name</span>
            <input
              name="categoryName"
              required
              minLength={2}
              autoFocus
              placeholder="LPG CYLINDERS"
              onInput={(event) => {
                event.currentTarget.value = caps(event.currentTarget.value);
              }}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm uppercase outline-none focus:border-flame-500"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">How it is stocked</span>
            <select
              name="stockModel"
              defaultValue={StockModel.Cylinder}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-flame-500"
            >
              <option value={StockModel.Cylinder}>Cylinder</option>
              <option value={StockModel.Simple}>Simple item</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pendingLabel="Creating…">Create category</SubmitButton>
          {categories.length > 0 ? (
            <button
              type="button"
              onClick={() => setCreatingCategory(false)}
              className="text-xs font-medium text-ink-soft hover:text-ink"
            >
              Back to product
            </button>
          ) : null}
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

  return (
    <form
      action={createProduct}
      className="space-y-4 rounded-xl border border-line bg-card p-4 shadow-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">Add a product</p>
          <p className="mt-1 text-xs leading-5 text-ink-soft">
            Names are saved in CAPITAL LETTERS. A cylinder is one product per brand and size.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreatingCategory(true)}
          className="rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:bg-canvas hover:text-ink"
        >
          + Create category
        </button>
      </div>

      <label className="block max-w-md space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Category</span>
        <select
          name="categoryId"
          required
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-flame-500"
        >
          <option value="">Choose a category…</option>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.stockModel === StockModel.Cylinder ? "Cylinder" : "Simple item"}
            </option>
          ))}
        </select>
      </label>

      {isCylinder ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs leading-5 text-sky-950">
          <strong>REFILL and EMPTY are stock states.</strong> Create this cylinder once; receiving,
          selling, returns, and transfers update its separate refill and empty balances.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Brand</legend>
          {brands.length > 0 ? (
            <div className="flex flex-wrap gap-x-4 gap-y-2">
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
                Create new brand
              </label>
            </div>
          ) : (
            <p className="text-xs leading-5 text-ink-soft">
              No brands exist yet. Enter the first one below; it will be created with this product.
            </p>
          )}

          {brandMode === "existing" ? (
            <select
              name="brandId"
              required
              value={brandId}
              onChange={(event) => setBrandId(event.target.value)}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-flame-500"
            >
              <option value="">Choose a brand…</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          ) : (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-ink-soft">New brand name</span>
              <input
                name="newBrandName"
                required
                minLength={2}
                value={newBrandName}
                onChange={(event) => setNewBrandName(caps(event.target.value))}
                placeholder="AFRIGAS"
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm uppercase outline-none focus:border-flame-500"
              />
            </label>
          )}
        </fieldset>

        {isCylinder ? (
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Cylinder sizes (kg)</span>
            <input
              name="sizeKgs"
              inputMode="text"
              required
              value={sizeKgs}
              onChange={(event) => setSizeKgs(event.target.value)}
              placeholder="3, 6, 13"
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-flame-500"
            />
            <span className="block text-xs text-ink-soft">
              Separate sizes with commas. Product names: <strong className="text-ink">{cylinderPreviews}</strong>
            </span>
          </label>
        ) : (
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Product name</span>
            <input
              name="name"
              required
              minLength={2}
              placeholder="REGULATOR"
              onInput={(event) => {
                event.currentTarget.value = caps(event.currentTarget.value);
              }}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm uppercase outline-none focus:border-flame-500"
            />
          </label>
        )}

        <label className="space-y-1 sm:col-span-2 sm:max-w-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Standard selling price (KSh)</span>
          <input
            name="listPriceKsh"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="Optional"
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-flame-500"
          />
          <span className="block text-xs text-ink-soft">Optional now; if you add several sizes, this price applies to each of them.</span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
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
