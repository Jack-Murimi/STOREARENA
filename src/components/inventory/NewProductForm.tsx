"use client";

import { useActionState, useState } from "react";
import { createCategory, createProductState } from "@/app/(portal)/inventory/actions";
import { SubmitButton } from "@/components/customers/SubmitButton";
import { StockModel, type Brand, type Category } from "@/lib/stock/types";

const caps = (value: string) => value.replace(/\s+/g, " ").toUpperCase();
const PRESET_SIZES = ["3", "6", "13", "22.5", "50"];

function normaliseSize(value: string): string | null {
  const parsed = Number(value.trim().replace(/\s*kg$/i, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return String(parsed);
}

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
  const [simpleName, setSimpleName] = useState("");
  const [simplePrice, setSimplePrice] = useState("");
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [customSize, setCustomSize] = useState("");
  const [customSizeError, setCustomSizeError] = useState("");
  const [sizePrices, setSizePrices] = useState<Record<string, string>>({});
  const [sizeError, setSizeError] = useState("");
  const [productState, productAction] = useActionState(createProductState, {});

  const category = categories.find((item) => item.id === categoryId);
  const isCylinder = category?.stockModel === StockModel.Cylinder;
  const selectedBrand = brands.find((brand) => brand.id === brandId);
  const brandForPreview = brandMode === "existing" ? selectedBrand?.name ?? "BRAND" : newBrandName || "BRAND";
  const orderedSizes = [...selectedSizes].sort((left, right) => Number(left) - Number(right));
  const cylinderPreviews = (orderedSizes.length > 0 ? orderedSizes : ["SIZE"])
    .map((size) => `${caps(brandForPreview)} ${size} KG`)
    .join(", ");
  const toggleSize = (size: string) => {
    setSizeError("");
    setSelectedSizes((current) =>
      current.includes(size) ? current.filter((item) => item !== size) : [...current, size],
    );
    setSizePrices((current) => {
      const next = { ...current };
      if (size in next) delete next[size];
      return next;
    });
  };
  const addCustomSize = () => {
    const size = normaliseSize(customSize);
    if (!size) {
      setCustomSizeError("Enter a cylinder size greater than zero.");
      return;
    }
    setCustomSizeError("");
    setSizeError("");
    setSelectedSizes((current) => (current.includes(size) ? current : [...current, size]));
    setCustomSize("");
  };

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
      action={productAction}
      onSubmit={(event) => {
        if (isCylinder && selectedSizes.length === 0) {
          event.preventDefault();
          setSizeError("Choose at least one cylinder size.");
        }
      }}
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

      {productState.error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          {productState.error}
        </p>
      ) : null}

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
        {productState.field === "category" ? <span className="block text-xs font-medium text-red-700">{productState.error}</span> : null}
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
          {productState.field === "brand" ? <p className="text-xs font-medium text-red-700">{productState.error}</p> : null}
        </fieldset>

        {isCylinder ? (
          <div className="space-y-3 sm:col-span-2">
            <input type="hidden" name="sizeKgs" value={orderedSizes.join(",")} />
            <input type="hidden" name="sizePrices" value={JSON.stringify(sizePrices)} />
            <div className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Cylinder sizes (kg)</span>
              <div className="flex flex-wrap gap-2">
                {PRESET_SIZES.map((size) => {
                  const selected = selectedSizes.includes(size);
                  return (
                    <button
                      key={size}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleSize(size)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        selected
                          ? "border-flame-600 bg-flame-600 text-white"
                          : "border-line bg-white text-ink hover:border-flame-400"
                      }`}
                    >
                      {size} KG
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex max-w-sm gap-2">
              <input
                inputMode="decimal"
                value={customSize}
                aria-invalid={customSizeError ? true : undefined}
                aria-describedby={customSizeError ? "custom-size-error" : undefined}
                onChange={(event) => {
                  setCustomSize(event.target.value);
                  setCustomSizeError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCustomSize();
                  }
                }}
                placeholder="Custom size"
                className="min-w-0 flex-1 rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-flame-500"
              />
              <button
                type="button"
                onClick={addCustomSize}
                className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink hover:bg-canvas"
              >
                Add size
              </button>
            </div>
            {customSizeError ? <p id="custom-size-error" role="alert" className="text-xs font-medium text-red-700">{customSizeError}</p> : null}
            {sizeError ? <p role="alert" className="text-xs font-medium text-red-700">{sizeError}</p> : null}
            {productState.field === "size" ? <p className="text-xs font-medium text-red-700">{productState.error}</p> : null}
            {orderedSizes.length === 0 ? (
              <p className="text-xs text-ink-soft">Choose at least one size to set its selling price.</p>
            ) : (
              <div className="grid gap-3 rounded-lg border border-line bg-canvas/40 p-3 sm:grid-cols-2 lg:grid-cols-3">
                {orderedSizes.map((size) => (
                  <label key={size} className="space-y-1">
                    <span className="text-xs font-semibold text-ink">{size} KG selling price (KSh)</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="0.01"
                      required
                      value={sizePrices[size] ?? ""}
                      onChange={(event) =>
                        setSizePrices((current) => ({ ...current, [size]: event.target.value }))
                      }
                      placeholder="e.g. 2500"
                      className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-flame-500"
                    />
                  </label>
                ))}
              </div>
            )}
            {productState.field === "price" ? <p className="text-xs font-medium text-red-700">{productState.error}</p> : null}
            <span className="block text-xs text-ink-soft">
              Product names: <strong className="text-ink">{cylinderPreviews}</strong>
            </span>
          </div>
        ) : (
          <>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Product name</span>
              <input
                name="name"
                required
                minLength={2}
                placeholder="REGULATOR"
                value={simpleName}
                onChange={(event) => setSimpleName(caps(event.currentTarget.value))}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm uppercase outline-none focus:border-flame-500"
              />
              {productState.field === "name" ? <span className="block text-xs font-medium text-red-700">{productState.error}</span> : null}
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Standard selling price (KSh)</span>
              <input
                type="number"
                name="listPriceKsh"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={simplePrice}
                onChange={(event) => setSimplePrice(event.target.value)}
                placeholder="Optional"
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-flame-500"
              />
              {productState.field === "price" ? <span className="block text-xs font-medium text-red-700">{productState.error}</span> : null}
            </label>
          </>
        )}
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
