"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useActionState,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Button, StatusBadge } from "@/components/ui";
import { CheckIcon, ReceiptIcon, SearchIcon } from "@/components/icons";
import { formatKsh } from "@/lib/format";
import type { PosCatalogueItem, PosCustomer, PosData, SaleLineType } from "@/lib/sales/pos-data";
import { normaliseSearch, searchCatalogue } from "./search";
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

type PaymentRow = { key: string; method: PaymentMethod; amount: string; reference: string };
type ReceiptFormat = "80" | "58" | "a5";
type CheckoutStep = "sale" | "payment";

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
  checkoutStep: CheckoutStep;
  idempotencyKey: string;
  payments: PaymentRow[];
  lines: CartLine[];
};

const DRAFT_KEY = "gateway-gas:sales-draft:v2";
const emptyState: CompleteSaleState = {};
const field = "pos-field w-full rounded-md border border-border bg-surface px-3 text-base text-ink placeholder:text-ink-subtle focus:border-orange-500 focus:outline-none";
const compactField = "pos-field w-full rounded-md border border-border bg-surface px-2 text-sm text-ink placeholder:text-ink-subtle focus:border-orange-500 focus:outline-none";
const secondaryChip = "min-h-[var(--touch-target)] rounded-md border border-border bg-surface px-3 text-sm font-medium text-ink transition-colors duration-150 hover:bg-surface-muted";
const selectedChip = "min-h-[var(--touch-target)] rounded-md border border-ink bg-surface-muted px-3 text-sm font-semibold text-ink";

function newKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const nibble = Math.floor(Math.random() * 16);
    return (character === "x" ? nibble : (nibble & 0x3) | 0x8).toString(16);
  });
}

function kenyaDate(value = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function today(): string {
  return kenyaDate();
}

function dueDate(): string {
  return kenyaDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));
}

function numberOrZero(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function readablePayment(method: string): string {
  return method === "mpesa" ? "M-Pesa" : method.charAt(0).toUpperCase() + method.slice(1);
}

function lineTypeLabel(type: SaleLineType): string {
  return ({ refill: "Refill", new_cylinder: "Complete gas", accessory: "Accessory", water: "Water", other: "Other" })[type];
}

function stockStatus(item: PosCatalogueItem): { tone: "ok" | "warn" | "critical"; label: string } {
  if (item.available === 0) return { tone: "critical", label: "Out" };
  if (item.available !== null && item.available <= 3) return { tone: "warn", label: "Low" };
  return { tone: "ok", label: "Healthy" };
}

function highlight(text: string, query: string): ReactNode {
  const tokens = normaliseSearch(query).filter((token) => token.length > 1 && !/^\d+$/.test(token));
  if (tokens.length === 0) return text;
  const expression = new RegExp(`(${tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
  return text.split(expression).map((part, index) =>
    tokens.some((token) => part.toLowerCase() === token || part.toLowerCase().startsWith(token)) ? (
      <mark key={index} className="rounded-sm bg-orange-100 px-0.5 text-ink">{part}</mark>
    ) : part,
  );
}

function CustomerCombobox({
  customers,
  customerId,
  onChange,
  required,
}: {
  customers: PosCustomer[];
  customerId: string;
  onChange: (id: string) => void;
  required: boolean;
}) {
  const selected = customers.find((customer) => customer.id === customerId);
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const listId = useId();
  const matches = customers.filter((customer) => customer.name.toLowerCase().includes(term.toLowerCase()) || customer.code.toLowerCase().includes(term.toLowerCase())).slice(0, 8);
  const visibleValue = selected && !open ? `${selected.name} · ${selected.code}` : term;

  return (
    <label className="relative block space-y-1">
      <span className="text-xs font-medium text-ink-subtle">Customer {required ? "(required)" : ""}</span>
      <input
        value={visibleValue}
        onFocus={() => { setOpen(true); if (selected) setTerm(""); }}
        onChange={(event) => { setTerm(event.target.value); onChange(""); setOpen(true); }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className={field}
        role="combobox"
        aria-controls={listId}
        aria-expanded={open}
        aria-autocomplete="list"
        placeholder="Walk-in"
      />
      {open ? (
        <div id={listId} role="listbox" className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-border bg-surface shadow-raised">
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(""); setTerm(""); setOpen(false); }} className="flex min-h-[var(--touch-target)] w-full items-center px-3 text-left text-sm text-ink hover:bg-surface-muted">Walk-in customer</button>
          {matches.map((customer) => <button key={customer.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(customer.id); setTerm(""); setOpen(false); }} className="flex min-h-[var(--touch-target)] w-full items-center px-3 text-left text-sm text-ink hover:bg-surface-muted">{customer.name}<span className="ml-1 text-xs text-ink-subtle">· {customer.code}</span></button>)}
          <a href="/customers" className="flex min-h-[var(--touch-target)] items-center border-t border-border px-3 text-sm font-medium text-orange-700 hover:bg-surface-muted">+ New customer</a>
        </div>
      ) : null}
    </label>
  );
}

export function SaleTerminal({ data }: { data: PosData }) {
  const router = useRouter();
  const [serverState, action, pending] = useActionState(completeSale, emptyState);
  const [receiptNo, setReceiptNo] = useState("");
  const [saleDate, setSaleDate] = useState(today);
  const [saleType, setSaleType] = useState<"counter" | "delivery">("counter");
  const [customerId, setCustomerId] = useState("");
  const [customerLocationId, setCustomerLocationId] = useState("");
  const [riderId, setRiderId] = useState("");
  const [creditDueDate, setCreditDueDate] = useState(dueDate);
  const [notes, setNotes] = useState("");
  const [onAccount, setOnAccount] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("sale");
  const [localError, setLocalError] = useState("");
  const [receiptFormat, setReceiptFormat] = useState<ReceiptFormat>("80");
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeResult, setActiveResult] = useState(0);
  const [focusedLine, setFocusedLine] = useState<string | null>(null);
  const [flashLine, setFlashLine] = useState<string | null>(null);
  const [noteSheetOpen, setNoteSheetOpen] = useState(false);
  const receiptRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const lastAddedKey = useRef<string | null>(null);

  const itemById = useMemo(() => new Map(data.catalogue.map((item) => [item.id, item])), [data.catalogue]);
  const selectedCustomer = data.customers.find((customer) => customer.id === customerId);
  const selectedRider = data.riders.find((rider) => rider.id === riderId);
  const isDelivery = saleType === "delivery";
  const search = useMemo(() => searchCatalogue(query, data.catalogue, data.quickAddIds), [data.catalogue, data.quickAddIds, query]);
  const quickItems = useMemo(() => {
    const index = new Map(data.quickAddIds.map((id, position) => [id, position]));
    return data.catalogue
      .filter((item) => item.available !== 0 && index.has(item.id))
      .sort((left, right) => (index.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (index.get(right.id) ?? Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name))
      .slice(0, 8);
  }, [data.catalogue, data.quickAddIds]);
  const showQuickAdd = lines.length === 0 && query.trim() === "" && quickItems.length > 0;
  const dropdownItems = showQuickAdd ? quickItems : query.trim() === "" ? [] : search.results.map((result) => result.item).slice(0, 8);

  useEffect(() => {
    const restore = () => {
      try {
        const saved = window.localStorage.getItem(`${DRAFT_KEY}:${data.branch.id}`);
        if (saved) {
          const draft = JSON.parse(saved) as Partial<Draft>;
          if (typeof draft.receiptNo === "string") setReceiptNo(draft.receiptNo);
          if (typeof draft.saleDate === "string") setSaleDate(draft.saleDate);
          if (draft.saleType === "counter" || draft.saleType === "delivery") setSaleType(draft.saleType);
          if (typeof draft.customerId === "string") setCustomerId(draft.customerId);
          if (typeof draft.customerLocationId === "string") setCustomerLocationId(draft.customerLocationId);
          if (typeof draft.riderId === "string") setRiderId(draft.riderId);
          if (typeof draft.creditDueDate === "string") setCreditDueDate(draft.creditDueDate);
          if (typeof draft.notes === "string") setNotes(draft.notes);
          if (typeof draft.onAccount === "boolean") setOnAccount(draft.onAccount);
          if (draft.checkoutStep === "sale" || draft.checkoutStep === "payment") setCheckoutStep(draft.checkoutStep);
          if (typeof draft.idempotencyKey === "string") setIdempotencyKey(draft.idempotencyKey);
          if (Array.isArray(draft.lines)) setLines(draft.lines.filter((line): line is CartLine => Boolean(line?.variantId) && itemById.has(line.variantId) && Number(line.quantity) > 0));
          if (Array.isArray(draft.payments)) setPayments(draft.payments.filter((payment): payment is PaymentRow => ["cash", "mpesa", "bank", "card"].includes(payment?.method)));
        }
      } catch {
        window.localStorage.removeItem(`${DRAFT_KEY}:${data.branch.id}`);
      } finally {
        setHydrated(true);
      }
    };
    const timer = window.setTimeout(restore, 0);
    return () => window.clearTimeout(timer);
  }, [data.branch.id, itemById]);

  useEffect(() => {
    if (!hydrated || serverState.receipt) return;
    const draft: Draft = { receiptNo, saleDate, saleType, customerId, customerLocationId, riderId, creditDueDate, notes, onAccount, checkoutStep, idempotencyKey, payments, lines };
    window.localStorage.setItem(`${DRAFT_KEY}:${data.branch.id}`, JSON.stringify(draft));
  }, [checkoutStep, creditDueDate, customerId, customerLocationId, data.branch.id, hydrated, idempotencyKey, lines, notes, onAccount, payments, receiptNo, riderId, saleDate, saleType, serverState.receipt]);

  useEffect(() => {
    if (serverState.receipt) window.localStorage.removeItem(`${DRAFT_KEY}:${data.branch.id}`);
  }, [data.branch.id, serverState.receipt]);

  useEffect(() => {
    const refreshStock = () => router.refresh();
    window.addEventListener("focus", refreshStock);
    return () => window.removeEventListener("focus", refreshStock);
  }, [router]);

  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      if (!searchBoxRef.current?.contains(event.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, []);

  const usedElsewhere = useCallback((line: CartLine) => lines.filter((candidate) => candidate.key !== line.key && candidate.variantId === line.variantId).reduce((sum, candidate) => sum + candidate.quantity, 0), [lines]);
  const maxFor = useCallback((line: CartLine, item: PosCatalogueItem | undefined) => item?.available === null || !item ? Number.POSITIVE_INFINITY : Math.max(0, item.available - usedElsewhere(line)), [usedElsewhere]);
  const patchLine = useCallback((key: string, patch: Partial<CartLine>) => { setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line)); setLocalError(""); }, []);

  const addProduct = useCallback((item: PosCatalogueItem, requestedQuantity = 1, keepDropdownOpen = false) => {
    if (item.available === 0) return;
    const existing = lines.find((line) => line.variantId === item.id && line.lineType === item.lineType);
    const key = existing?.key ?? newKey();
    const totalElsewhere = lines.filter((line) => line.key !== existing?.key && line.variantId === item.id).reduce((sum, line) => sum + line.quantity, 0);
    const maximum = item.available === null ? Number.POSITIVE_INFINITY : Math.max(0, item.available - totalElsewhere);
    if (existing && existing.quantity >= maximum) return;
    setLines((current) => existing
      ? current.map((line) => line.key === existing.key ? { ...line, quantity: Math.min(maximum, line.quantity + requestedQuantity), emptiesReturned: line.lineType === "refill" ? Math.min(maximum, line.quantity + requestedQuantity) : line.emptiesReturned } : line)
      : [...current, { ...defaultLine(item), key, quantity: Math.min(maximum, requestedQuantity), emptiesReturned: item.lineType === "refill" ? Math.min(maximum, requestedQuantity) : 0 }]);
    lastAddedKey.current = key;
    setFlashLine(key);
    window.setTimeout(() => setFlashLine((current) => current === key ? null : current), 180);
    setQuery("");
    setActiveResult(0);
    setSearchOpen(keepDropdownOpen);
    setLocalError("");
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }, [lines]);

  const setQuantity = useCallback((line: CartLine, next: number) => {
    const maximum = maxFor(line, itemById.get(line.variantId));
    patchLine(line.key, { quantity: Math.max(1, Math.min(Math.floor(next), maximum)), emptiesReturned: line.lineType === "refill" ? Math.max(0, Math.min(Math.floor(next), maximum)) : line.emptiesReturned });
  }, [itemById, maxFor, patchLine]);

  const estimateSubtotal = lines.reduce((sum, line) => sum + line.quantity * linePrice(line, itemById.get(line.variantId)), 0);
  const estimateDiscount = lines.reduce((sum, line) => sum + lineDiscount(line), 0);
  const estimateTotal = Math.max(0, estimateSubtotal - estimateDiscount);
  const enteredTender = payments.reduce((sum, payment) => sum + Math.max(0, numberOrZero(payment.amount)), 0);
  const cashChange = Math.max(0, enteredTender - estimateTotal);
  const paymentCalculation = payments.reduce((state, payment) => {
    const amount = Math.max(0, numberOrZero(payment.amount));
    const reduction = payment.method === "cash" ? Math.min(amount, state.excess) : 0;
    return { excess: state.excess - reduction, rows: [...state.rows, { method: payment.method, amount: amount - reduction, reference: payment.reference.trim() || null }] };
  }, { excess: cashChange, rows: [] as SalePaymentInput[] });
  const recordedPayments = paymentCalculation.rows.filter((payment) => payment.amount > 0);
  const recordedPaid = recordedPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const estimatedDue = Math.max(0, estimateTotal - recordedPaid);
  const hasLargeQuantity = lines.some((line) => line.quantity > 20);
  const cylinderCount = lines.filter((line) => ["refill", "new_cylinder"].includes(line.lineType)).reduce((sum, line) => sum + line.quantity, 0);
  const [largeConfirmed, setLargeConfirmed] = useState(false);

  const missing = useMemo(() => {
    if (!receiptNo.trim()) return "Enter receipt no.";
    if (lines.length === 0) return "Add a product";
    if (lines.some((line) => line.lineType === "refill" && !line.emptyBrandId)) return "Choose empty-cylinder brand";
    if (isDelivery && (!customerId || !customerLocationId || !riderId)) return "Choose delivery details";
    if (hasLargeQuantity && !largeConfirmed) return "Confirm large quantity";
    if (checkoutStep === "payment" && onAccount && !customerId) return "Choose a customer for credit";
    if (checkoutStep === "payment" && !onAccount && Math.abs(recordedPaid - estimateTotal) > 0.01) return "Match payment to total";
    return "";
  }, [checkoutStep, customerId, customerLocationId, hasLargeQuantity, isDelivery, largeConfirmed, lines, onAccount, receiptNo, recordedPaid, riderId, estimateTotal]);

  const validateSaleDetails = useCallback((): boolean => {
    if (missing && !(checkoutStep === "payment" && missing.startsWith("Match payment"))) { setLocalError(missing); return false; }
    return true;
  }, [checkoutStep, missing]);

  const continueToPayment = useCallback(() => {
    if (validateSaleDetails()) setCheckoutStep("payment");
  }, [validateSaleDetails]);

  const submit = useCallback(() => {
    setLocalError("");
    if (!validateSaleDetails()) return;
    if (onAccount && !customerId) return setLocalError("Credit needs a customer account.");
    if (!onAccount && Math.abs(recordedPaid - estimateTotal) > 0.01) return setLocalError("Payment must match the estimated total, or choose Credit for the outstanding amount.");
    const electronicWithoutReference = recordedPayments.find((payment) => ["mpesa", "bank", "card"].includes(payment.method) && !payment.reference);
    if (electronicWithoutReference) return setLocalError(`Add the ${readablePayment(electronicWithoutReference.method)} reference.`);
    const payload: CompleteSaleInput = {
      receiptNo, saleDate, saleType, customerId: customerId || null, customerLocationId: customerLocationId || null, riderId: riderId || null,
      creditDueDate: onAccount || estimatedDue > 0 ? creditDueDate : null, notes, confirmLargeQuantity: largeConfirmed, idempotencyKey,
      lines: lines.map((line) => ({ variantId: line.variantId, lineType: line.lineType, quantity: line.quantity, emptiesReturned: line.lineType === "refill" ? line.emptiesReturned : 0, emptyBrandId: line.lineType === "refill" ? line.emptyBrandId || null : null, requestedUnitPrice: line.requestedUnitPrice ? numberOrZero(line.requestedUnitPrice) : null, discountAmount: lineDiscount(line), priceOverrideReason: line.priceOverrideReason || null })),
      payments: recordedPayments,
    };
    action(payload);
  }, [action, creditDueDate, customerId, customerLocationId, estimateTotal, estimatedDue, idempotencyKey, largeConfirmed, lines, notes, onAccount, receiptNo, recordedPaid, recordedPayments, riderId, saleDate, saleType, validateSaleDetails]);

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setSearchOpen(true); setActiveResult((current) => Math.min(current + 1, Math.max(0, dropdownItems.length - 1))); }
    if (event.key === "ArrowUp") { event.preventDefault(); setSearchOpen(true); setActiveResult((current) => Math.max(current - 1, 0)); }
    if (event.key === "Escape") { event.preventDefault(); setSearchOpen(false); }
    if (event.key === "Enter" && dropdownItems[activeResult]) { event.preventDefault(); addProduct(dropdownItems[activeResult], search.requestedQuantity, event.shiftKey); }
    if (event.key === "Tab" && lastAddedKey.current) {
      event.preventDefault();
      document.getElementById(`quantity-${lastAddedKey.current}`)?.focus();
    }
  };

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT";
      if ((event.key === "/" || event.key === "F2") && !editing) { event.preventDefault(); setSearchOpen(true); searchRef.current?.focus(); }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        if (!pending && !serverState.receipt) {
          if (checkoutStep === "sale") continueToPayment();
          else submit();
        }
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [checkoutStep, continueToPayment, pending, serverState.receipt, submit]);

  if (serverState.receipt) return <SaleReceipt receipt={serverState.receipt} branch={data.branch} format={receiptFormat} onFormat={setReceiptFormat} />;

  const renderInfoFields = () => <>
    <label className="space-y-1"><span className="text-xs font-medium text-ink-subtle">Receipt no.</span><input ref={receiptRef} value={receiptNo} onChange={(event) => { setReceiptNo(event.target.value); if (event.target.value.trim()) window.setTimeout(() => searchRef.current?.focus(), 0); }} className={field} placeholder="Receipt no." required autoFocus /></label>
    <label className="space-y-1"><span className="text-xs font-medium text-ink-subtle">Date</span><input type="date" value={saleDate} max={today()} onChange={(event) => setSaleDate(event.target.value)} className={field} /></label>
    <fieldset className="space-y-1"><legend className="text-xs font-medium text-ink-subtle">Source</legend><div className="flex h-[var(--pos-field-height)] rounded-md border border-border bg-surface p-0.5"><button type="button" onClick={() => setSaleType("counter")} className={`flex-1 rounded-sm text-sm font-medium ${saleType === "counter" ? "bg-surface-muted text-ink" : "text-ink-muted"}`}>Counter</button><button type="button" onClick={() => setSaleType("delivery")} className={`flex-1 rounded-sm text-sm font-medium ${saleType === "delivery" ? "bg-surface-muted text-ink" : "text-ink-muted"}`}>Delivery</button></div></fieldset>
    <CustomerCombobox customers={data.customers} customerId={customerId} onChange={(id) => { setCustomerId(id); setCustomerLocationId(""); }} required={isDelivery || onAccount} />
  </>;

  return (
    <div className="sales-terminal space-y-3">
      <section className="sales-info-card">
        <div className="hidden items-end gap-3 md:grid md:grid-cols-4">
          {renderInfoFields()}
          <span className="sales-branch-chip md:col-start-4">{data.branch.code}</span>
        </div>
        <details className="md:hidden"><summary className="flex min-h-[var(--touch-target)] cursor-pointer list-none items-center justify-between gap-2 text-sm text-ink"><span className="truncate">{receiptNo ? `Receipt ${receiptNo}` : "New receipt"} · {saleDate} · {saleType === "counter" ? "Counter" : "Delivery"} · {selectedCustomer?.name ?? "Walk-in"}</span><span className="text-orange-700">Edit</span></summary><div className="grid gap-3 border-t border-border pt-3">{renderInfoFields()}</div></details>
        {isDelivery ? <div className="pos-delivery grid gap-3 border-t border-border pt-3 md:mt-3 md:grid-cols-3"><label className="space-y-1"><span className="text-xs font-medium text-ink-subtle">Location</span><select value={customerLocationId} onChange={(event) => setCustomerLocationId(event.target.value)} className={field} disabled={!selectedCustomer}><option value="">Choose location…</option>{selectedCustomer?.locations.map((location) => <option key={location.id} value={location.id}>{location.label}{location.area ? ` · ${location.area}` : ""}</option>)}</select></label><label className="space-y-1"><span className="text-xs font-medium text-ink-subtle">Rider</span><select value={riderId} onChange={(event) => setRiderId(event.target.value)} className={field}><option value="">Choose rider…</option>{data.riders.map((rider) => <option key={rider.id} value={rider.id}>{rider.name}</option>)}</select></label><p className="self-end pb-2 text-sm text-ink-muted">From: {data.branch.name}{selectedRider ? ` · Rider ${selectedRider.name}` : ""}</p></div> : null}
      </section>

      {checkoutStep === "sale" ? <>
        <div ref={searchBoxRef} className="sales-search-sticky relative">
          <div className="relative"><SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-subtle" /><input ref={searchRef} value={query} onFocus={() => { setSearchOpen(true); setActiveResult(0); }} onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); setActiveResult(0); }} onKeyDown={onSearchKeyDown} className={`${field} pl-10 pr-20`} placeholder="Search product, brand or size" role="combobox" aria-expanded={searchOpen} aria-controls="product-search-results" aria-activedescendant={dropdownItems[activeResult] ? `product-${dropdownItems[activeResult].id}` : undefined} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border bg-surface-muted px-1.5 py-0.5 text-xs text-ink-subtle">/ · F2</span></div>
          {searchOpen ? <div id="product-search-results" role="listbox" className="sales-search-popover">{showQuickAdd ? <div className="p-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Quick add</p><div className="flex flex-wrap gap-2">{quickItems.map((item) => <button key={item.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => addProduct(item)} className={secondaryChip}>{item.name}</button>)}</div></div> : query.trim() === "" ? <p className="p-4 text-sm text-ink-muted">Start typing to search this branch’s catalogue.</p> : dropdownItems.length > 0 ? <div className="max-h-[var(--pos-search-results-height)] overflow-y-auto">{dropdownItems.map((item, index) => { const status = stockStatus(item); const cartQuantity = lines.filter((line) => line.variantId === item.id).reduce((sum, line) => sum + line.quantity, 0); return <button id={`product-${item.id}`} key={item.id} type="button" role="option" aria-selected={index === activeResult} disabled={item.available === 0} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveResult(index)} onClick={() => addProduct(item, search.requestedQuantity)} className={`sales-search-result ${index === activeResult ? "bg-surface-muted" : ""}`}><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{highlight(item.name, query)}</span><span className="mt-1 flex flex-wrap gap-1"><span className="sales-mini-chip">{item.sizeKg ? `${item.sizeKg} kg` : item.categoryName}</span><span className="sales-mini-chip">{lineTypeLabel(item.lineType)}</span><StatusBadge tone={status.tone}>{item.available === 0 ? "Out of stock" : status.label}</StatusBadge>{cartQuantity > 0 ? <span className="sales-mini-chip num">{cartQuantity} in cart</span> : null}</span></span><span className="num shrink-0 text-sm font-semibold text-ink">{formatKsh(item.listPrice)}</span></button>; })}</div> : <div className="p-4 text-sm text-ink-muted"><strong className="font-medium text-ink">No product matches “{query}”.</strong>{search.suggestion ? <p className="mt-1">Did you mean {search.suggestion}?</p> : null}</div>}</div> : null}
        </div>

        <section className="sales-cart" aria-label="Sale items">
          <header className="flex h-[var(--row-table)] items-center justify-between border-b border-border px-3"><h2 className="text-base font-semibold text-ink">Items</h2><span className="num text-sm text-ink-muted">{lines.reduce((sum, line) => sum + line.quantity, 0)} items · {cylinderCount} cylinders</span></header>
          {lines.length > 0 ? <div className="sales-cart-column-head" aria-hidden="true"><span>Product</span><span>Available</span><span>Quantity</span><span>Returned empties</span><span>Unit price</span><span>Line total</span><span /></div> : null}
          {lines.length === 0 ? <div className="sales-empty-cart"><ReceiptIcon className="h-6 w-6 text-ink-subtle" /><p className="text-sm text-ink-muted">Search for a product to start this sale.</p></div> : <div>{lines.map((line) => { const item = itemById.get(line.variantId); if (!item) return null; const maximum = maxFor(line, item); const error = serverState.lineName === item.name ? serverState.error : ""; return <article key={line.key} className={`sales-cart-row ${flashLine === line.key ? "sales-line-flash" : ""}`}><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{item.name}</p><div className="mt-1 flex flex-wrap gap-1"><span className="sales-mini-chip">{item.sizeKg ? `${item.sizeKg} kg` : item.categoryName}</span><button type="button" onClick={() => item.categoryCode === "LPG" && patchLine(line.key, { lineType: line.lineType === "refill" ? "new_cylinder" : "refill", emptiesReturned: line.lineType === "refill" ? 0 : line.quantity, emptyBrandId: line.lineType === "refill" ? "" : item.brandId })} className="sales-mini-chip">{lineTypeLabel(line.lineType)}</button></div></div><span className="num text-sm text-ink-muted">{item.available === null ? "—" : maximum}</span><div className="relative flex items-center rounded-md border border-border"><button type="button" onClick={() => setQuantity(line, line.quantity - 1)} className="min-h-[var(--touch-target)] min-w-[var(--touch-target)] text-md hover:bg-surface-muted">−</button><input id={`quantity-${line.key}`} inputMode="numeric" value={line.quantity} onFocus={() => setFocusedLine(line.key)} onChange={(event) => setQuantity(line, numberOrZero(event.target.value))} className="num min-w-0 flex-1 bg-transparent text-center text-sm font-semibold outline-none" aria-label={`${item.name} quantity`} /><button type="button" onClick={() => setQuantity(line, line.quantity + 1)} disabled={line.quantity >= maximum} className="min-h-[var(--touch-target)] min-w-[var(--touch-target)] text-md hover:bg-surface-muted disabled:opacity-40">+</button>{focusedLine === line.key ? <div className="absolute top-full z-20 mt-1 flex gap-1 rounded-md border border-border bg-surface p-1 shadow-card">{[1,2,3,5].map((quantity) => <button key={quantity} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setQuantity(line, quantity)} className="min-h-[var(--touch-target)] min-w-[var(--touch-target)] rounded-sm text-sm hover:bg-surface-muted">{quantity}</button>)}</div> : null}</div>{line.lineType === "refill" ? <div className="grid gap-1 sm:grid-cols-2"><input type="number" min="0" value={line.emptiesReturned} onChange={(event) => patchLine(line.key, { emptiesReturned: Math.max(0, Math.floor(numberOrZero(event.target.value))) })} className={compactField} aria-label="Returned empties" /><select value={line.emptyBrandId} onChange={(event) => patchLine(line.key, { emptyBrandId: event.target.value })} className={compactField} aria-label="Empty-cylinder brand"><option value="">Brand…</option>{data.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></div> : <span className="text-sm text-ink-subtle">—</span>}<div><input inputMode="decimal" value={line.requestedUnitPrice} onChange={(event) => patchLine(line.key, { requestedUnitPrice: event.target.value })} className={compactField} placeholder={String(item.listPrice)} aria-label="Requested unit price" /><details className="mt-1"><summary className="cursor-pointer text-xs text-orange-700">Discount / override</summary><div className="mt-1 grid gap-1"><input inputMode="decimal" value={line.discountAmount} onChange={(event) => patchLine(line.key, { discountAmount: event.target.value })} className={compactField} placeholder="Discount" /><input value={line.priceOverrideReason} onChange={(event) => patchLine(line.key, { priceOverrideReason: event.target.value })} className={compactField} placeholder="Override reason" /></div></details></div><span className="num text-sm font-semibold text-ink">{formatKsh(lineTotal(line, item))}</span><button type="button" onClick={() => setLines((current) => current.filter((candidate) => candidate.key !== line.key))} className="min-h-[var(--touch-target)] min-w-[var(--touch-target)] text-md text-critical hover:bg-critical-bg" aria-label={`Remove ${item.name}`}>×</button>{error ? <p role="alert" className="sales-line-error">{error}</p> : null}</article>; })}</div>}
          {hasLargeQuantity ? <label className="m-3 flex min-h-[var(--touch-target)] items-start gap-2 rounded-md border border-warn bg-warn-bg px-3 py-2 text-sm text-ink"><input type="checkbox" checked={largeConfirmed} onChange={(event) => setLargeConfirmed(event.target.checked)} className="mt-1" /><span><strong>Large quantity confirmation.</strong> Confirm a line above 20 items.</span></label> : null}
        </section>
      </> : <PaymentStep lines={lines} items={itemById} payments={payments} onAddPayment={(method) => { setPayments((current) => [...current, { key: newKey(), method, amount: "", reference: "" }]); setOnAccount(false); }} onUpdatePayment={setPayments} onAccount={onAccount} onToggleAccount={() => setOnAccount((value) => !value)} creditDueDate={creditDueDate} onCreditDueDate={setCreditDueDate} estimateTotal={estimateTotal} recordedPaid={recordedPaid} estimatedDue={estimatedDue} cashChange={cashChange} onBack={() => setCheckoutStep("sale")} />}

      <footer className="sales-footer"><div className="sales-footer-inner"><div className="hidden min-w-0 flex-1 md:block"><input value={notes} onChange={(event) => setNotes(event.target.value)} className="w-full max-w-[var(--pos-note-width)] border-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle" placeholder="Add note" aria-label="Sale note" /></div><button type="button" onClick={() => setNoteSheetOpen(true)} className={`relative min-h-[var(--touch-target)] min-w-[var(--touch-target)] rounded-md text-sm text-ink md:hidden ${notes ? "after:absolute after:right-1 after:top-1 after:h-1.5 after:w-1.5 after:rounded-full after:bg-orange-500" : ""}`}>Note</button><div className="num flex items-center gap-3 text-right text-sm"><span className="hidden lg:inline">{lines.reduce((sum, line) => sum + line.quantity, 0)} items · {cylinderCount} cylinders</span><span className="hidden sm:inline">Subtotal {formatKsh(estimateSubtotal)}</span>{estimateDiscount > 0 ? <span className="hidden sm:inline">Discount {formatKsh(estimateDiscount)}</span> : null}<strong className="text-md text-ink">{formatKsh(estimateTotal)}</strong></div>{missing ? <span className="sales-missing-text truncate text-xs text-ink-muted sm:text-sm">{missing}</span> : null}<Button type="button" variant="primary" size="md" title={checkoutStep === "sale" ? "Save sale and choose payment. Ctrl/Cmd+Enter." : "Confirm sale. Ctrl/Cmd+Enter."} onClick={checkoutStep === "sale" ? continueToPayment : submit} disabled={pending || Boolean(missing)} className="sales-footer-primary whitespace-nowrap">{checkoutStep === "sale" ? "Save sale & choose payment" : pending ? "Confirming…" : "Confirm sale"}</Button></div>{localError || serverState.error ? <p role="alert" className="sales-footer-error">{localError || serverState.error}</p> : null}</footer>
      {noteSheetOpen ? <div className="sales-note-sheet md:hidden"><div className="rounded-t-lg border border-border bg-surface p-4 shadow-raised"><div className="flex items-center justify-between"><h2 className="text-base font-semibold text-ink">Sale note</h2><button type="button" onClick={() => setNoteSheetOpen(false)} className="min-h-[var(--touch-target)] px-2 text-sm text-orange-700">Done</button></div><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-3 w-full rounded-md border border-border bg-surface p-3 text-base text-ink" rows={3} placeholder="Add note" autoFocus /></div></div> : null}
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
