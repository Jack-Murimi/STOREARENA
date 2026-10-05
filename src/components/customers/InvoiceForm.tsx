"use client";

import { useState } from "react";
import { raiseInvoice } from "@/app/customers/actions";
import { SubmitButton } from "./SubmitButton";

interface Row {
  key: number;
  description: string;
  quantity: string;
  price: string;
}

const CATALOG = [
  { label: "Afri Gas 13 kg refill", price: "2400" },
  { label: "Total 13 kg refill", price: "2450" },
  { label: "Rubis 13 kg refill", price: "2400" },
  { label: "Afri Gas 6 kg refill", price: "1050" },
  { label: "Total 6 kg refill", price: "1100" },
  { label: "Afri Gas 3 kg refill", price: "600" },
  { label: "Delivery charge", price: "200" },
];

/**
 * Raises an invoice: pick what went out, how many, at what price.
 *
 * Rows are added before saving, so a whole order is one trip to the database
 * rather than one per line.
 */
export function InvoiceForm({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([
    { key: 0, description: "", quantity: "1", price: "" },
  ]);
  const [nextKey, setNextKey] = useState(1);

  const patch = (key: number, field: keyof Row, value: string) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
    );

  const addRow = () => {
    setRows((current) => [
      ...current,
      { key: nextKey, description: "", quantity: "1", price: "" },
    ]);
    setNextKey((k) => k + 1);
  };

  const removeRow = (key: number) =>
    setRows((current) =>
      current.length === 1 ? current : current.filter((row) => row.key !== key),
    );

  const total = rows.reduce(
    (sum, row) => sum + (Number(row.quantity) || 0) * (Number(row.price) || 0),
    0,
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-lg bg-flame-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-flame-700"
      >
        + Raise an invoice
      </button>
    );
  }

  return (
    <form action={raiseInvoice} className="space-y-3 border-t border-line pt-4">
      <input type="hidden" name="customerId" value={customerId} />

      {rows.map((row, index) => (
        <div key={row.key} className="grid gap-2 sm:grid-cols-[1fr_88px_120px_32px]">
          <input
            name={`line_description_${index}`}
            value={row.description}
            onChange={(e) => patch(row.key, "description", e.target.value)}
            list="invoice-catalog"
            required={index === 0}
            placeholder="Afri Gas 13 kg refill"
            className="rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-flame-500"
          />
          <input
            name={`line_quantity_${index}`}
            value={row.quantity}
            onChange={(e) => patch(row.key, "quantity", e.target.value)}
            inputMode="decimal"
            placeholder="Qty"
            className="rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-flame-500"
          />
          <input
            name={`line_price_${index}`}
            value={row.price}
            onChange={(e) => patch(row.key, "price", e.target.value)}
            inputMode="decimal"
            placeholder="Unit price"
            className="rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-flame-500"
          />
          <button
            type="button"
            onClick={() => removeRow(row.key)}
            aria-label="Remove this line"
            className="rounded-lg border border-line text-[15px] leading-none text-ink-soft transition hover:border-bad/40 hover:text-bad"
          >
            ×
          </button>
        </div>
      ))}

      <datalist id="invoice-catalog">
        {CATALOG.map((item) => (
          <option key={item.label} value={item.label} />
        ))}
      </datalist>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addRow}
          className="text-[12.5px] font-semibold text-flame-700 hover:underline"
        >
          + Add a line
        </button>
        {CATALOG.filter((c) => !rows.some((r) => r.description === c.label)).length > 0 ? (
          <button
            type="button"
            onClick={() => {
              const next = CATALOG.find((c) => !rows.some((r) => r.description === c.label));
              if (!next) return;
              setRows((current) =>
                current.map((row) =>
                  row.description === "" && row.price === ""
                    ? { ...row, description: next.label, price: next.price }
                    : row,
                ),
              );
            }}
            className="text-[12.5px] font-semibold text-ink-soft hover:text-ink"
          >
            Use a common item
          </button>
        ) : null}
        <span className="ml-auto text-[13px] text-ink-soft">
          Total{" "}
          <strong className="font-semibold tabular-nums text-ink">
            KSh {total.toLocaleString("en-KE")}
          </strong>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          name="issuedOn"
          defaultValue={new Date().toISOString().slice(0, 10)}
          className="rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-flame-500"
        />
        <input
          name="notes"
          placeholder="Note on the invoice (optional)"
          className="min-w-[180px] flex-1 rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-flame-500"
        />
        <SubmitButton pendingLabel="Raising…">Raise invoice</SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[12.5px] font-medium text-ink-soft hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
