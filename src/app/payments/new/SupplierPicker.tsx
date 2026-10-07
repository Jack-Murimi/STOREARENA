"use client";

import { useRouter } from "next/navigation";

/** The allocation grid depends on which supplier is chosen, and the invoices
 *  are read on the server, so changing supplier reloads with ?supplier=. */
export function SupplierPicker({
  suppliers, value,
}: {
  suppliers: { id: string; name: string }[]; value: string;
}) {
  const router = useRouter();
  return (
    <select
      id="supplier"
      name="supplier"
      defaultValue={value}
      aria-label="Supplier"
      onChange={(e) => {
        const id = e.target.value;
        router.push(id ? `/payments/new?supplier=${encodeURIComponent(id)}` : "/payments/new");
      }}
      className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[var(--text-sm)] text-[var(--text-primary)] outline-none focus:border-[var(--orange-400)] focus:ring-2 focus:ring-[var(--orange-100)]"
    >
      <option value="">Choose a supplier…</option>
      {suppliers.map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  );
}
