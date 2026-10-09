"use client";

import { useRouter } from "next/navigation";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, StatusBadge } from "@/components/ui";
import { CheckIcon, ReceiptIcon, SearchIcon } from "@/components/icons";
import { formatKsh } from "@/lib/format";
import type { PosCatalogueItem, PosData, SaleLineType } from "@/lib/sales/pos-data";
import {
  completeSale,
  type CompleteSaleInput,
  type CompleteSaleState,
  type PaymentMethod,
  type SalePaymentInput,
} from "../actions";

type CartLine = {
  key: string;
  variantId: string;
  lineType: SaleLineType;
  quantity: number;
  emptiesReturned: number;
  emptyBrandId: string;
  requestedUnitPrice: string;
  discountAmount: string;
  priceOverrideReason: string;
};

type Draft = {
  receiptNo: string;
  saleDate: string;
  saleType: "counter" | "delivery";
  customerId: string;
  customerLocationId: string;
  riderId: string;
  creditDueDate: string;
  notes: string;
  onAccount: boolean;
  checkoutStep: "sale" | "payment";
  idempotencyKey: string;
  payments: PaymentRow[];
  lines: CartLine[];
};

type PaymentRow = { key: string; method: PaymentMethod; amount: string; reference: string };
type ReceiptFormat = "80" | "58" | "a5";

const DRAFT_KEY = "gateway-gas:sales-draft:v1";
const emptyState: CompleteSaleState = {};
const textField =
  "min-h-[var(--touch-target)] w-full rounded-md border border-border bg-surface px-3 text-base text-ink placeholder:text-ink-subtle focus:border-orange-500 focus:outline-none";
const compactField =
  "min-h-[var(--touch-target)] w-full rounded-md border border-border bg-surface px-2 text-sm text-ink placeholder:text-ink-subtle focus:border-orange-500 focus:outline-none";
const secondaryChip =
  "min-h-[var(--touch-target)] rounded-md border border-border bg-surface px-3 text-sm font-medium text-ink transition-colors duration-150 hover:bg-surface-muted";
const selectedChip =
  "min-h-[var(--touch-target)] rounded-md border border-ink bg-surface-muted px-3 text-sm font-semibold text-ink";

function newKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Older embedded browsers still need a syntactically valid UUID because the
  // database, correctly, refuses an opaque idempotency key.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const nibble = Math.floor(Math.random() * 16);
    return (character === "x" ? nibble : (nibble & 0x3) | 0x8).toString(16);
  });
}

function dateInThreeDays(): string {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  return date.toISOString().slice(0, 10);
}

function numberOrZero(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function defaultLine(item: PosCatalogueItem): CartLine {
  return {
    key: newKey(),
    variantId: item.id,
    lineType: item.lineType,
    quantity: 1,
    emptiesReturned: item.lineType === "refill" ? 1 : 0,
    emptyBrandId: item.lineType === "refill" ? item.brandId : "",
    requestedUnitPrice: "",
    discountAmount: "",
    priceOverrideReason: "",
  };
}

function linePrice(line: CartLine, item: PosCatalogueItem | undefined): number {
  const requested = numberOrZero(line.requestedUnitPrice);
  return requested > 0 ? requested : item?.listPrice ?? 0;
}

function lineDiscount(line: CartLine): number {
  return Math.max(0, numberOrZero(line.discountAmount));
}

function lineTotal(line: CartLine, item: PosCatalogueItem | undefined): number {
  return Math.max(0, line.quantity * linePrice(line, item) - lineDiscount(line));
}

function readablePayment(method: string): string {
  return method === "mpesa" ? "M-Pesa" : method.charAt(0).toUpperCase() + method.slice(1);
}

export function SaleTerminal({ data }: { data: PosData }) {
  const [serverState, action, pending] = useActionState(completeSale, emptyState);
  const [search, setSearch] = useState("");
  const [receiptNo, setReceiptNo] = useState("");
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saleType, setSaleType] = useState<"counter" | "delivery">("counter");
  const [customerId, setCustomerId] = useState("");
  const [customerLocationId, setCustomerLocationId] = useState("");
  const [riderId, setRiderId] = useState("");
  const [creditDueDate, setCreditDueDate] = useState(dateInThreeDays);
  const [notes, setNotes] = useState("");
  const [onAccount, setOnAccount] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [localError, setLocalError] = useState("");
  const [receiptFormat, setReceiptFormat] = useState<ReceiptFormat>("80");
  const [hydrated, setHydrated] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<"sale" | "payment">("sale");
  const searchRef = useRef<HTMLInputElement>(null);

  const itemById = useMemo(
    () => new Map(data.catalogue.map((item) => [item.id, item])),
    [data.catalogue],
  );
  const selectedCustomer = data.customers.find((customer) => customer.id === customerId);
  const isDelivery = saleType === "delivery";

  // Restore only after hydration, so a blank server render never overwrites a
  // valid local draft. A corrupted old draft is ignored rather than crashing a
  // cashier at the till.
  useEffect(() => {
    const restore = () => {
      try {
        const saved = window.localStorage.getItem(`${DRAFT_KEY}:${data.branch.id}`);
        if (saved) {
          const draft = JSON.parse(saved) as Partial<Draft>;
          if (Array.isArray(draft.lines)) {
            setLines(
              draft.lines.filter(
                (line): line is CartLine =>
                  Boolean(line?.variantId) && itemById.has(line.variantId) && Number(line.quantity) > 0,
              ),
            );
          }
          if (typeof draft.receiptNo === "string") setReceiptNo(draft.receiptNo);
          if (typeof draft.saleDate === "string") setSaleDate(draft.saleDate);
          if (draft.saleType === "counter" || draft.saleType === "delivery") setSaleType(draft.saleType);
          if (typeof draft.customerId === "string") setCustomerId(draft.customerId);
          if (typeof draft.customerLocationId === "string") setCustomerLocationId(draft.customerLocationId);
          if (typeof draft.riderId === "string") setRiderId(draft.riderId);
          if (typeof draft.creditDueDate === "string") setCreditDueDate(draft.creditDueDate);
          if (typeof draft.notes === "string") setNotes(draft.notes);
          if (typeof draft.onAccount === "boolean") setOnAccount(draft.onAccount);
          if (draft.checkoutStep === "sale" || draft.checkoutStep === "payment") {
            setCheckoutStep(draft.checkoutStep);
          }
          if (typeof draft.idempotencyKey === "string" && draft.idempotencyKey.length > 0) {
            setIdempotencyKey(draft.idempotencyKey);
          }
          if (Array.isArray(draft.payments)) {
            setPayments(
              draft.payments.filter(
                (payment): payment is PaymentRow =>
                  ["cash", "mpesa", "bank", "card"].includes(payment?.method),
              ),
            );
          }
        }
      } catch {
        window.localStorage.removeItem(`${DRAFT_KEY}:${data.branch.id}`);
      } finally {
        setHydrated(true);
      }
    };
    // Defer restoring a local draft until after the hydration commit. It keeps
    // the server and first client render identical, and avoids an effect loop.
    const timer = window.setTimeout(restore, 0);
    return () => window.clearTimeout(timer);
  }, [data.branch.id, itemById]);

  useEffect(() => {
    if (!hydrated || serverState.receipt) return;
    const draft: Draft = {
      receiptNo,
      saleDate,
      saleType,
      customerId,
      customerLocationId,
      riderId,
      creditDueDate,
      notes,
      onAccount,
      checkoutStep,
      idempotencyKey,
      payments,
      lines,
    };
    window.localStorage.setItem(`${DRAFT_KEY}:${data.branch.id}`, JSON.stringify(draft));
  }, [
    creditDueDate,
    customerId,
    customerLocationId,
    checkoutStep,
    data.branch.id,
    hydrated,
    idempotencyKey,
    lines,
    notes,
    onAccount,
    payments,
    receiptNo,
    saleDate,
    riderId,
    saleType,
    serverState.receipt,
  ]);

  useEffect(() => {
    if (serverState.receipt) window.localStorage.removeItem(`${DRAFT_KEY}:${data.branch.id}`);
  }, [data.branch.id, serverState.receipt]);

  const usedElsewhere = useCallback(
    (line: CartLine) =>
      lines
        .filter((candidate) => candidate.key !== line.key && candidate.variantId === line.variantId)
        .reduce((sum, candidate) => sum + candidate.quantity, 0),
    [lines],
  );

  const maxFor = useCallback(
    (line: CartLine, item: PosCatalogueItem | undefined) => {
      if (!item || item.available === null) return Number.POSITIVE_INFINITY;
      return Math.max(0, item.available - usedElsewhere(line));
    }, [usedElsewhere]);

  const patchLine = useCallback((key: string, patch: Partial<CartLine>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
    setLocalError("");
  }, []);

  const setQuantity = useCallback(
    (line: CartLine, next: number) => {
      const item = itemById.get(line.variantId);
      const maximum = maxFor(line, item);
      patchLine(line.key, { quantity: Math.max(1, Math.min(Math.floor(next), maximum)) });
    },
    [itemById, maxFor, patchLine],
  );

  const addItem = useCallback((item: PosCatalogueItem) => {
    setLines((current) => {
      const existing = current.find(
        (line) => line.variantId === item.id && line.lineType === item.lineType,
      );
      if (existing) {
        const totalElsewhere = current
          .filter((line) => line.key !== existing.key && line.variantId === item.id)
          .reduce((sum, line) => sum + line.quantity, 0);
        const maximum = item.available === null ? Number.POSITIVE_INFINITY : Math.max(0, item.available - totalElsewhere);
        if (existing.quantity < maximum) {
          return current.map((line) =>
            line.key === existing.key ? { ...line, quantity: line.quantity + 1 } : line,
          );
        }
        return current;
      }
      if (item.available === 0) return current;
      return [...current, defaultLine(item)];
    });
    setSearch("");
    setLocalError("");
  }, []);

  const estimateSubtotal = lines.reduce(
    (sum, line) => sum + line.quantity * linePrice(line, itemById.get(line.variantId)),
    0,
  );
  const estimateDiscount = lines.reduce((sum, line) => sum + lineDiscount(line), 0);
  const estimateTotal = Math.max(0, estimateSubtotal - estimateDiscount);

  const enteredTender = payments.reduce((sum, payment) => sum + Math.max(0, numberOrZero(payment.amount)), 0);
  const cashChange = Math.max(0, enteredTender - estimateTotal);
  const paymentCalculation = payments.reduce(
    (state, payment) => {
      const amount = Math.max(0, numberOrZero(payment.amount));
      const reduction = payment.method === "cash" ? Math.min(amount, state.excess) : 0;
      return {
        excess: state.excess - reduction,
        rows: [
          ...state.rows,
          { method: payment.method, amount: amount - reduction, reference: payment.reference.trim() || null },
        ],
      };
    },
    { excess: cashChange, rows: [] as SalePaymentInput[] },
  );
  const recordedPayments = paymentCalculation.rows.filter((payment) => payment.amount > 0);
  const recordedPaid = recordedPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const estimatedDue = Math.max(0, estimateTotal - recordedPaid);
  const hasLargeQuantity = lines.some((line) => line.quantity > 20);
  const [largeConfirmed, setLargeConfirmed] = useState(false);

  const addPayment = (method: PaymentMethod) => {
    setPayments((current) => [...current, { key: newKey(), method, amount: "", reference: "" }]);
    setOnAccount(false);
    setLocalError("");
  };

  const validateSaleDetails = useCallback((): boolean => {
    setLocalError("");
    if (lines.length === 0) {
      setLocalError("Add at least one product line before saving the sale.");
      return false;
    }
    if (receiptNo.trim() === "") {
      setLocalError("Enter the receipt number.");
      return false;
    }
    if (lines.some((line) => line.lineType === "refill" && !line.emptyBrandId)) {
      setLocalError("Choose the returned empty-cylinder brand on every refill line.");
      return false;
    }
    if (saleType === "delivery" && (!customerId || !customerLocationId || !riderId)) {
      setLocalError("Delivery needs a customer, delivery location and rider.");
      return false;
    }
    if (hasLargeQuantity && !largeConfirmed) {
      setLocalError("Confirm the unusually large quantity before continuing.");
      return false;
    }
    return true;
  }, [customerId, customerLocationId, hasLargeQuantity, largeConfirmed, lines, receiptNo, riderId, saleType]);

  const continueToPayment = useCallback(() => {
    if (validateSaleDetails()) setCheckoutStep("payment");
  }, [validateSaleDetails]);

  const submit = useCallback(() => {
    if (!validateSaleDetails()) return;
    if (onAccount && !customerId) return setLocalError("Credit needs a customer account.");
    if (!onAccount && Math.abs(recordedPaid - estimateTotal) > 0.01) {
      return setLocalError("Payment must match the estimated total, or choose Credit for the outstanding amount.");
    }
    const electronicWithoutReference = recordedPayments.find(
      (payment) => ["mpesa", "bank", "card"].includes(payment.method) && !payment.reference,
    );
    if (electronicWithoutReference) {
      return setLocalError(`Add the ${readablePayment(electronicWithoutReference.method)} reference.`);
    }
    const payload: CompleteSaleInput = {
      receiptNo,
      saleDate,
      saleType,
      customerId: customerId || null,
      customerLocationId: customerLocationId || null,
      riderId: riderId || null,
      creditDueDate: onAccount || estimatedDue > 0 ? creditDueDate : null,
      notes,
      confirmLargeQuantity: largeConfirmed,
      // One key is retained for this draft so an interrupted request can be
      // safely retried. It is regenerated only with the next sale draft.
      idempotencyKey,
      lines: lines.map((line) => ({
        variantId: line.variantId,
        lineType: line.lineType,
        quantity: line.quantity,
        emptiesReturned: line.lineType === "refill" ? line.emptiesReturned : 0,
        emptyBrandId: line.lineType === "refill" ? line.emptyBrandId || null : null,
        requestedUnitPrice: line.requestedUnitPrice ? numberOrZero(line.requestedUnitPrice) : null,
        discountAmount: lineDiscount(line),
        priceOverrideReason: line.priceOverrideReason || null,
      })),
      payments: recordedPayments,
    };
    action(payload);
  }, [
    action,
    creditDueDate,
    customerId,
    customerLocationId,
    estimateTotal,
    estimatedDue,
    idempotencyKey,
    largeConfirmed,
    lines,
    notes,
    onAccount,
    receiptNo,
    recordedPaid,
    recordedPayments,
    riderId,
    saleDate,
    saleType,
    validateSaleDetails,
  ]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT";
      if ((event.key === "/" || event.key === "F2") && !editing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        if (!pending && !serverState.receipt) {
          if (checkoutStep === "payment") submit();
          else continueToPayment();
        }
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [checkoutStep, continueToPayment, pending, serverState.receipt, submit]);

  const filteredCatalogue = data.catalogue.filter((item) => {
    const term = search.trim().toLowerCase();
    return (
      term !== "" &&
      (item.name.toLowerCase().includes(term) ||
      item.brandName.toLowerCase().includes(term) ||
      item.categoryName.toLowerCase().includes(term))
    );
  });

  if (serverState.receipt) {
    return (
      <SaleReceipt
        receipt={serverState.receipt}
        branch={data.branch}
        format={receiptFormat}
        onFormat={setReceiptFormat}
      />
    );
  }

  return (
    <div className="space-y-4">
      <section aria-labelledby="sale-information-title" className="rounded-lg border border-border bg-surface shadow-card">
        <header className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Step {checkoutStep === "sale" ? "1 of 2" : "2 of 2"}</p>
            <h1 id="sale-information-title" className="text-xl font-semibold text-ink">Sale information</h1>
          </div>
          <p className="text-sm text-ink-muted">Draft first, payment second, stock only after confirmation</p>
        </header>
        <div className="grid gap-3 px-4 py-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1">
            <span className="text-xs font-medium text-ink-subtle">Receipt no.</span>
            <input value={receiptNo} onChange={(event) => setReceiptNo(event.target.value)} className={textField} placeholder="Enter receipt no." aria-required="true" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-ink-subtle">Sale date</span>
            <input type="date" value={saleDate} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setSaleDate(event.target.value)} className={textField} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-ink-subtle">Source</span>
            <select value={saleType} onChange={(event) => setSaleType(event.target.value as "counter" | "delivery")} className={textField}>
              <option value="counter">Counter sale</option>
              <option value="delivery">Completed delivery</option>
            </select>
          </label>
          <div className="space-y-1">
            <span className="text-xs font-medium text-ink-subtle">Stock location</span>
            <p className="flex min-h-[var(--touch-target)] items-center rounded-md border border-border bg-surface-muted px-3 text-base font-medium text-ink">{data.branch.name}</p>
          </div>
        </div>
        <div className="grid gap-3 px-4 py-3 lg:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs font-medium text-ink-subtle">Customer {isDelivery || onAccount ? "(required)" : "(optional)"}</span>
            <select
              value={customerId}
              onChange={(event) => {
                setCustomerId(event.target.value);
                setCustomerLocationId("");
              }}
              className={textField}
            >
              <option value="">Walk-in customer</option>
              {data.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name} · {customer.code}</option>
              ))}
            </select>
          </label>
          {isDelivery ? (
            <>
              <label className="space-y-1">
                <span className="text-xs font-medium text-ink-subtle">Delivery location</span>
                <select value={customerLocationId} onChange={(event) => setCustomerLocationId(event.target.value)} className={textField} disabled={!selectedCustomer}>
                  <option value="">Choose location…</option>
                  {selectedCustomer?.locations.map((location) => (
                    <option key={location.id} value={location.id}>{location.label}{location.area ? ` · ${location.area}` : ""}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-ink-subtle">Rider</span>
                <select value={riderId} onChange={(event) => setRiderId(event.target.value)} className={textField}>
                  <option value="">Choose rider…</option>
                  {data.riders.map((rider) => <option key={rider.id} value={rider.id}>{rider.name}</option>)}
                </select>
              </label>
            </>
          ) : (
            <label className="space-y-1 lg:col-span-2">
              <span className="text-xs font-medium text-ink-subtle">Sale note</span>
              <input value={notes} onChange={(event) => setNotes(event.target.value)} className={textField} placeholder="Optional note" />
            </label>
          )}
        </div>
      </section>

      {checkoutStep === "sale" ? (
      <section aria-labelledby="product-lines-title" className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Product lines</p><h2 id="product-lines-title" className="text-lg font-semibold text-ink">Search products and record returned cylinders</h2></div>
          <p className="text-sm text-ink-muted">Only explicit search results can be added to a sale.</p>
        </div>
      <div className="space-y-4">
        <section className="space-y-3">
          <div className="rounded-lg border border-border bg-surface p-3 shadow-card">
            <label className="relative block">
              <span className="sr-only">Search products</span>
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-subtle" />
              <input
                ref={searchRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={`${textField} pl-10`}
                placeholder="Search product or brand"
              />
            </label>
            <p className="mt-2 text-xs text-ink-subtle"><kbd className="rounded border border-border bg-surface-muted px-1 py-0.5">/</kbd> or <kbd className="rounded border border-border bg-surface-muted px-1 py-0.5">F2</kbd> to search</p>
          </div>

          <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-card">
            <header className="flex items-center justify-between border-b border-border px-3 py-2">
              <h2 className="text-base font-semibold text-ink">Search results</h2>
              <span className="text-xs text-ink-subtle">{search.trim() ? `${filteredCatalogue.length} match${filteredCatalogue.length === 1 ? "" : "es"}` : "Start typing to find a product"}</span>
            </header>
            <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
              {filteredCatalogue.slice(0, 12).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addItem(item)}
                  disabled={item.available === 0}
                  className="flex min-h-[var(--touch-target)] w-full items-center justify-between gap-3 bg-surface px-3 py-2 text-left transition-colors duration-150 hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span>
                    <span className="block text-sm font-medium text-ink">{item.name}</span>
                    <span className="block text-xs text-ink-subtle">{item.categoryName}{item.sizeKg ? ` · ${item.sizeKg} kg` : ""}</span>
                  </span>
                  <span className="text-right">
                    <span className="num block text-sm font-semibold text-ink">{formatKsh(item.listPrice)}</span>
                    {item.available !== null ? <span className="num block text-xs text-ink-subtle">{item.available} refill{item.available === 1 ? "" : "s"} available</span> : null}
                  </span>
                </button>
              ))}
              {search.trim() === "" ? <p className="px-3 py-6 text-center text-sm text-ink-muted">Type a product name, brand or category above to add it.</p> : null}
              {search.trim() !== "" && filteredCatalogue.length === 0 ? <p className="px-3 py-6 text-center text-sm text-ink-muted">No matching product.</p> : null}
            </div>
          </section>
        </section>

        <section className="min-w-0 space-y-3">
          <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-card">
            <header className="flex min-h-[var(--row-table)] items-center justify-between border-b border-border px-4">
              <div>
                <h2 className="text-base font-semibold text-ink">Product lines</h2>
                <p className="text-xs text-ink-subtle">Returned empties and their brand are captured on each refill line</p>
              </div>
              <span className="num text-sm text-ink-muted">{lines.reduce((sum, line) => sum + line.quantity, 0)} item{lines.reduce((sum, line) => sum + line.quantity, 0) === 1 ? "" : "s"}</span>
            </header>
            {lines.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <ReceiptIcon className="mx-auto h-7 w-7 text-ink-subtle" />
                <p className="mt-2 text-base font-medium text-ink">Your cart is empty</p>
                <p className="mt-1 text-sm text-ink-muted">Search or choose a quick-add product to start.</p>
              </div>
            ) : (
              <div className="divide-line">
                {lines.map((line) => {
                  const item = itemById.get(line.variantId);
                  if (!item) return null;
                  const maximum = maxFor(line, item);
                  const serverLineError = serverState.lineName === item.name ? serverState.error : "";
                  const noAvailability = item.available !== null && maximum < 1;
                  return (
                    <article key={line.key} className="space-y-3 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-ink">{item.name}</h3>
                          <p className="text-xs text-ink-subtle">{item.brandName} · {item.categoryName}{item.available !== null ? ` · ${maximum} available` : ""}</p>
                        </div>
                        <button type="button" onClick={() => setLines((current) => current.filter((candidate) => candidate.key !== line.key))} className="min-h-[var(--touch-target)] px-2 text-sm font-medium text-critical hover:bg-critical-bg" aria-label={`Remove ${item.name}`}>Remove</button>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        {item.categoryCode === "LPG" ? (
                          <label className="space-y-1">
                            <span className="text-xs font-medium text-ink-subtle">Gas sale</span>
                            <select
                              value={line.lineType}
                              onChange={(event) => {
                                const type = event.target.value as SaleLineType;
                                patchLine(line.key, { lineType: type, emptiesReturned: type === "refill" ? line.quantity : 0, emptyBrandId: type === "refill" ? item.brandId : "" });
                              }}
                              className={compactField}
                            >
                              <option value="refill">Refill — empty returned</option>
                              <option value="new_cylinder">Complete gas — new cylinder</option>
                            </select>
                          </label>
                        ) : <div />}
                        <div className="space-y-1">
                          <span className="text-xs font-medium text-ink-subtle">Quantity</span>
                          <div className="flex min-h-[var(--touch-target)] items-center rounded-md border border-border bg-surface">
                            <button type="button" onClick={() => setQuantity(line, line.quantity - 1)} className="min-h-[var(--touch-target)] min-w-[var(--touch-target)] text-md text-ink hover:bg-surface-muted" aria-label={`Reduce ${item.name}`}>−</button>
                            <output className="num flex-1 text-center text-base font-semibold text-ink">{line.quantity}</output>
                            <button type="button" onClick={() => setQuantity(line, line.quantity + 1)} disabled={line.quantity >= maximum} className="min-h-[var(--touch-target)] min-w-[var(--touch-target)] text-md text-ink hover:bg-surface-muted disabled:opacity-40" aria-label={`Increase ${item.name}`}>+</button>
                          </div>
                        </div>
                      </div>

                      {line.lineType === "refill" ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="space-y-1">
                            <span className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Returned empties</span>
                            <input type="number" min="0" value={line.emptiesReturned} onChange={(event) => patchLine(line.key, { emptiesReturned: Math.max(0, Math.floor(numberOrZero(event.target.value))) })} className={compactField} />
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs font-medium text-ink-subtle">Empty-cylinder brand</span>
                            <select value={line.emptyBrandId} onChange={(event) => patchLine(line.key, { emptyBrandId: event.target.value })} className={compactField}>
                              <option value="">Choose brand…</option>
                              {data.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                            </select>
                          </label>
                        </div>
                      ) : null}

                      <details className="rounded-md border border-border bg-surface-sunken p-2">
                        <summary className="cursor-pointer text-sm font-medium text-ink">Price or discount request</summary>
                        <p className="mt-1 text-xs text-ink-subtle">The server approves the final price. Floors and costs are never shown here.</p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-3">
                          <label className="space-y-1"><span className="text-xs text-ink-subtle">Requested unit price</span><input inputMode="decimal" value={line.requestedUnitPrice} onChange={(event) => patchLine(line.key, { requestedUnitPrice: event.target.value })} placeholder={String(item.listPrice)} className={compactField} /></label>
                          <label className="space-y-1"><span className="text-xs text-ink-subtle">Discount KSh</span><input inputMode="decimal" value={line.discountAmount} onChange={(event) => patchLine(line.key, { discountAmount: event.target.value })} placeholder="0" className={compactField} /></label>
                          <label className="space-y-1"><span className="text-xs text-ink-subtle">Override reason</span><input value={line.priceOverrideReason} onChange={(event) => patchLine(line.key, { priceOverrideReason: event.target.value })} placeholder="If needed" className={compactField} /></label>
                        </div>
                      </details>

                      <div className="flex items-center justify-between gap-3">
                        {noAvailability ? <StatusBadge tone="critical">No refill stock</StatusBadge> : <span className="text-xs text-ink-subtle">List {formatKsh(item.listPrice)} each</span>}
                        <span className="num text-base font-semibold text-ink">{formatKsh(lineTotal(line, item))}</span>
                      </div>
                      {serverLineError ? <p role="alert" className="rounded-md border border-critical bg-critical-bg px-3 py-2 text-sm text-critical">{serverLineError}</p> : null}
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          {hasLargeQuantity ? (
            <label className="flex min-h-[var(--touch-target)] items-start gap-2 rounded-lg border border-warn bg-warn-bg px-3 py-2 text-sm text-ink">
              <input type="checkbox" checked={largeConfirmed} onChange={(event) => setLargeConfirmed(event.target.checked)} className="mt-1" />
              <span><strong>Large quantity confirmation.</strong> At least one line has more than 20 items. Confirm before completing.</span>
            </label>
          ) : null}
        </section>
      </div>
      </section>
      ) : (
        <PaymentStep
          lines={lines}
          items={itemById}
          payments={payments}
          onAddPayment={addPayment}
          onUpdatePayment={setPayments}
          onAccount={onAccount}
          onToggleAccount={() => { setOnAccount((value) => !value); setLocalError(""); }}
          creditDueDate={creditDueDate}
          onCreditDueDate={setCreditDueDate}
          estimateTotal={estimateTotal}
          recordedPaid={recordedPaid}
          estimatedDue={estimatedDue}
          cashChange={cashChange}
          onBack={() => setCheckoutStep("sale")}
        />
      )}

      <section className="sticky bottom-0 z-10 rounded-lg border border-border bg-surface p-4 shadow-raised">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{checkoutStep === "sale" ? "Sale total" : "Payment review"}</p>
            <p className="mt-1 text-sm text-ink-muted">{checkoutStep === "sale" ? "Save this device draft, then choose payment. Nothing has been sold yet." : "The final total, credit and stock are checked by the database when you confirm."}</p>
          </div>
          <dl className="num grid grid-cols-2 gap-x-6 gap-y-1 text-right text-sm sm:flex sm:justify-end">
            <div><dt className="text-ink-subtle">Items</dt><dd>{lines.reduce((sum, line) => sum + line.quantity, 0)}</dd></div>
            <div><dt className="text-ink-subtle">Subtotal</dt><dd>{formatKsh(estimateSubtotal)}</dd></div>
            <div><dt className="text-ink-subtle">Discount</dt><dd>{formatKsh(estimateDiscount)}</dd></div>
            <div className="text-md font-semibold"><dt>Total</dt><dd>{formatKsh(estimateTotal)}</dd></div>
            {checkoutStep === "payment" && cashChange > 0 ? <div className="text-ok"><dt>Cash change</dt><dd>{formatKsh(cashChange)}</dd></div> : null}
            {checkoutStep === "payment" && estimatedDue > 0 ? <div className="text-warn"><dt>Credit due</dt><dd>{formatKsh(estimatedDue)}</dd></div> : null}
          </dl>
          <div className="space-y-2 lg:min-w-60">
            {checkoutStep === "sale" ? (
              <Button type="button" variant="primary" size="md" onClick={continueToPayment} disabled={lines.length === 0} className="w-full">Save sale & choose payment</Button>
            ) : (
              <Button type="button" variant="primary" size="md" onClick={submit} disabled={pending || lines.length === 0} className="w-full">{pending ? "Confirming sale…" : "Confirm sale"}</Button>
            )}
            <p className="text-center text-xs text-ink-subtle"><kbd className="rounded border border-border bg-surface-muted px-1 py-0.5">Ctrl</kbd> + <kbd className="rounded border border-border bg-surface-muted px-1 py-0.5">Enter</kbd></p>
          </div>
        </div>
        {localError || serverState.error ? <p role="alert" className="mt-3 rounded-md border border-critical bg-critical-bg px-3 py-2 text-sm text-critical">{localError || serverState.error}</p> : null}
      </section>
    </div>
  );
}

function PaymentStep({
  lines,
  items,
  payments,
  onAddPayment,
  onUpdatePayment,
  onAccount,
  onToggleAccount,
  creditDueDate,
  onCreditDueDate,
  estimateTotal,
  recordedPaid,
  estimatedDue,
  cashChange,
  onBack,
}: {
  lines: CartLine[];
  items: Map<string, PosCatalogueItem>;
  payments: PaymentRow[];
  onAddPayment: (method: PaymentMethod) => void;
  onUpdatePayment: (update: (current: PaymentRow[]) => PaymentRow[]) => void;
  onAccount: boolean;
  onToggleAccount: () => void;
  creditDueDate: string;
  onCreditDueDate: (value: string) => void;
  estimateTotal: number;
  recordedPaid: number;
  estimatedDue: number;
  cashChange: number;
  onBack: () => void;
}) {
  return (
    <section aria-labelledby="payment-title" className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="rounded-lg border border-border bg-surface shadow-card">
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Step 2 of 2</p>
            <h2 id="payment-title" className="text-lg font-semibold text-ink">Choose payment</h2>
            <p className="text-sm text-ink-muted">Add one or more actual payment methods. Credit is the unpaid balance.</p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={onBack}>Back to sale</Button>
        </header>
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            {(["cash", "mpesa", "card", "bank"] as PaymentMethod[]).map((method) => (
              <button key={method} type="button" onClick={() => onAddPayment(method)} className={secondaryChip}>Add {readablePayment(method)}</button>
            ))}
            <button type="button" onClick={onToggleAccount} className={onAccount ? selectedChip : secondaryChip}>Credit / on account</button>
          </div>
          {payments.length === 0 ? <p className="rounded-md border border-border bg-surface-sunken px-3 py-2 text-sm text-ink-muted">No payment method added yet. Use Credit / on account only for a selected customer.</p> : null}
          <div className="space-y-2">
            {payments.map((payment) => (
              <div key={payment.key} className="grid gap-2 rounded-md border border-border bg-surface-sunken p-2 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-center">
                <span className="text-sm font-semibold text-ink">{readablePayment(payment.method)}</span>
                <input inputMode="decimal" value={payment.amount} onChange={(event) => onUpdatePayment((current) => current.map((candidate) => candidate.key === payment.key ? { ...candidate, amount: event.target.value } : candidate))} placeholder={payment.method === "cash" ? "Tendered cash" : "Amount"} className={compactField} aria-label={`${readablePayment(payment.method)} amount`} />
                {["mpesa", "bank", "card"].includes(payment.method) ? <input value={payment.reference} onChange={(event) => onUpdatePayment((current) => current.map((candidate) => candidate.key === payment.key ? { ...candidate, reference: event.target.value } : candidate))} placeholder="Reference" className={compactField} aria-label={`${readablePayment(payment.method)} reference`} /> : <span className="text-xs text-ink-subtle">Change is not recorded as a payment.</span>}
                <button type="button" onClick={() => onUpdatePayment((current) => current.filter((candidate) => candidate.key !== payment.key))} className="min-h-[var(--touch-target)] px-2 text-sm font-medium text-critical hover:bg-critical-bg">Remove</button>
              </div>
            ))}
          </div>
          {onAccount || estimatedDue > 0 ? (
            <div className="grid gap-2 rounded-md border border-warn bg-warn-bg p-3 sm:grid-cols-2">
              <label className="space-y-1"><span className="text-xs font-medium text-ink-muted">Credit due date</span><input type="date" value={creditDueDate} onChange={(event) => onCreditDueDate(event.target.value)} className={compactField} /></label>
              <p className="self-end text-sm text-ink-muted">The selected customer’s approved credit limit is checked before the sale is posted.</p>
            </div>
          ) : null}
        </div>
      </div>

      <aside className="rounded-lg border border-border bg-surface shadow-card">
        <header className="border-b border-border px-4 py-3"><h2 className="text-base font-semibold text-ink">Sale review</h2><p className="text-sm text-ink-muted">Confirm products before final posting.</p></header>
        <div className="divide-line">
          {lines.map((line) => {
            const item = items.get(line.variantId);
            if (!item) return null;
            return <div key={line.key} className="flex justify-between gap-3 px-4 py-3 text-sm"><span><strong className="font-medium text-ink">{item.name}</strong><span className="block text-xs text-ink-subtle">{line.quantity} × {formatKsh(linePrice(line, item))}{line.lineType === "refill" ? ` · ${line.emptiesReturned} returned` : ""}</span></span><span className="num font-semibold text-ink">{formatKsh(lineTotal(line, item))}</span></div>;
          })}
        </div>
        <dl className="num space-y-2 border-t border-border p-4 text-sm"><div className="flex justify-between gap-4"><dt className="text-ink-muted">Sale total</dt><dd className="text-base font-semibold text-ink">{formatKsh(estimateTotal)}</dd></div><div className="flex justify-between gap-4"><dt className="text-ink-muted">Recorded payment</dt><dd>{formatKsh(recordedPaid)}</dd></div>{cashChange > 0 ? <div className="flex justify-between gap-4 text-ok"><dt>Cash change</dt><dd>{formatKsh(cashChange)}</dd></div> : null}{estimatedDue > 0 ? <div className="flex justify-between gap-4 text-warn"><dt>Credit due</dt><dd>{formatKsh(estimatedDue)}</dd></div> : null}</dl>
      </aside>
    </section>
  );
}

function SaleReceipt({
  receipt,
  branch,
  format,
  onFormat,
}: {
  receipt: NonNullable<CompleteSaleState["receipt"]>;
  branch: PosData["branch"];
  format: ReceiptFormat;
  onFormat: (format: ReceiptFormat) => void;
}) {
  const router = useRouter();
  return (
    <div className="space-y-4">
      <section className="flex flex-col justify-between gap-3 rounded-lg border border-ok bg-ok-bg p-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3"><CheckIcon className="mt-0.5 h-6 w-6 text-ok" /><div><h1 className="text-lg font-semibold text-ink">Sale recorded</h1><p className="text-sm text-ink-muted">Receipt {receipt.receiptNo} has been posted. Stock changed only now, after completion.</p></div></div>
        <Button type="button" onClick={() => router.push("/sales/new")}>Start next sale</Button>
      </section>
      <section className="no-print flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3 shadow-card">
        <span className="text-sm font-medium text-ink">Receipt layout</span>
        {(["80", "58", "a5"] as ReceiptFormat[]).map((option) => <button key={option} type="button" onClick={() => onFormat(option)} className={format === option ? selectedChip : secondaryChip}>{option === "a5" ? "A5 PDF" : `${option} mm thermal`}</button>)}
        <Button type="button" variant="secondary" onClick={() => window.print()}>Print / save PDF</Button>
      </section>
      <article className={`sale-receipt sale-receipt-${format} mx-auto rounded-lg border border-border bg-surface p-5 shadow-card`}>
        <header className="border-b border-border pb-3 text-center"><h2 className="text-lg font-semibold text-ink">Gateway Gas Enterprises</h2><p className="text-sm text-ink-muted">{branch.name}</p><p className="mt-2 text-xs text-ink-subtle">Receipt {receipt.receiptNo} · {new Date(receipt.saleDate).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}</p></header>
        <div className="divide-line mt-3"><div className="flex justify-between gap-3 py-2 text-sm"><span>Sale type</span><span className="capitalize">{receipt.saleType}</span></div>{receipt.customerName ? <div className="flex justify-between gap-3 py-2 text-sm"><span>Customer</span><span>{receipt.customerName}</span></div> : null}</div>
        <div className="mt-3 divide-line border-y border-border">{receipt.lines.map((line, index) => <div key={`${line.name}-${index}`} className="py-2 text-sm"><div className="flex justify-between gap-3"><span>{line.name} × {line.quantity}</span><span className="num">{formatKsh(line.lineTotal)}</span></div><p className="num text-xs text-ink-subtle">{formatKsh(line.unitPrice)} each{line.discount > 0 ? ` · discount ${formatKsh(line.discount)}` : ""}</p></div>)}</div>
        <dl className="num mt-3 space-y-1 text-sm"><div className="flex justify-between gap-3 text-base font-semibold"><dt>Total</dt><dd>{formatKsh(receipt.total)}</dd></div><div className="flex justify-between gap-3"><dt>Paid</dt><dd>{formatKsh(receipt.amountPaid)}</dd></div>{receipt.balanceDue > 0 ? <div className="flex justify-between gap-3 text-warn"><dt>Credit due</dt><dd>{formatKsh(receipt.balanceDue)}</dd></div> : null}</dl>
        {receipt.payments.length > 0 ? <div className="mt-3 border-t border-border pt-3 text-xs text-ink-muted">{receipt.payments.map((payment, index) => <p key={`${payment.method}-${index}`}>{readablePayment(payment.method)} {formatKsh(payment.amount)}{payment.reference ? ` · ${payment.reference}` : ""}</p>)}</div> : null}
        <p className="mt-5 text-center text-xs text-ink-subtle">Thank you for choosing Gateway Gas.</p>
      </article>
    </div>
  );
}
