"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { postTransfer } from "./actions";

type Branch = { id: string; label: string };
type Variant = { id: string; label: string };
type Line = { key: string; variantId: string; refills: string; emptiesSent: string; emptiesReturned: string };
const newLine = (): Line => ({ key: crypto.randomUUID(), variantId: "", refills: "0", emptiesSent: "0", emptiesReturned: "0" });

/** A single transfer number can carry several brands/sizes. The server action
 * submits all rows to the atomic database function as one transaction. */
export function TransferForm({
  branches,
  sourceBranches = branches,
  variants,
}: {
  branches: Branch[];
  sourceBranches?: Branch[];
  variants: Variant[];
}) {
  const [workflow, setWorkflow] = useState<"STOCK_MOVE" | "REFILL_EXCHANGE">("STOCK_MOVE");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const update = (key: string, patch: Partial<Line>) => setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  const exchange = workflow === "REFILL_EXCHANGE";
  return <form action={postTransfer} className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="space-y-1"><span className="text-xs font-medium text-ink-subtle">Workflow</span><select name="workflow" value={workflow} onChange={(event) => setWorkflow(event.target.value as typeof workflow)} className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"><option value="STOCK_MOVE">Stock move</option><option value="REFILL_EXCHANGE">Refill exchange</option></select></label>
      <label className="space-y-1"><span className="text-xs font-medium text-ink-subtle">From branch</span><select name="from_branch_id" required defaultValue="" className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"><option disabled value="">Choose source…</option>{sourceBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.label}</option>)}</select></label>
      <label className="space-y-1"><span className="text-xs font-medium text-ink-subtle">To branch</span><select name="to_branch_id" required defaultValue="" className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"><option disabled value="">Choose destination…</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.label}</option>)}</select></label>
    </div>
    <div className="overflow-x-auto rounded-md border border-border"><table className="w-full min-w-[720px] border-collapse text-sm"><thead><tr className="border-b border-border bg-surface-muted text-left text-xs font-semibold tracking-wide text-ink-subtle uppercase"><th className="px-3 py-2">Cylinder product</th><th className="px-3 py-2 text-right">Refills sent</th><th className="px-3 py-2 text-right">{exchange ? "Empties returned" : "Empties sent"}</th><th className="w-12 px-3 py-2" /></tr></thead><tbody>{lines.map((line) => <tr key={line.key} className="border-b border-border last:border-0"><td className="p-2"><select name="variant_id" required value={line.variantId} onChange={(event) => update(line.key, { variantId: event.target.value })} className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"><option value="">Choose cylinder…</option>{variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.label}</option>)}</select></td><td className="p-2"><input name="refills_sent" value={line.refills} onChange={(event) => update(line.key, { refills: event.target.value })} type="number" min="0" required className="h-10 w-24 rounded-md border border-border bg-surface px-2 text-right num" /></td><td className="p-2"><input name={exchange ? "empties_returned" : "empties_sent"} value={exchange ? line.emptiesReturned : line.emptiesSent} onChange={(event) => update(line.key, exchange ? { emptiesReturned: event.target.value } : { emptiesSent: event.target.value })} type="number" min="0" required className="h-10 w-24 rounded-md border border-border bg-surface px-2 text-right num" />{exchange ? <input type="hidden" name="empties_sent" value="0" /> : <input type="hidden" name="empties_returned" value="0" />}</td><td className="p-2 text-right">{lines.length > 1 ? <button type="button" onClick={() => setLines((current) => current.filter((candidate) => candidate.key !== line.key))} className="min-h-[var(--touch-target)] px-2 text-sm font-medium text-critical hover:underline">Remove</button> : null}</td></tr>)}</tbody></table></div>
    <button type="button" onClick={() => setLines((current) => [...current, newLine()])} className="text-sm font-semibold text-orange-700 hover:underline">+ Add another cylinder</button>
    <div className="grid gap-3 sm:grid-cols-3"><label className="space-y-1"><span className="text-xs font-medium text-ink-subtle">Delivery note / waybill</span><input name="delivery_note" className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm" /></label><label className="space-y-1 sm:col-span-2"><span className="text-xs font-medium text-ink-subtle">Notes</span><input name="notes" minLength={3} className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm" /></label></div>
    <div className="flex items-center justify-between gap-3 rounded-md bg-surface-muted p-3 text-sm text-ink-muted"><span>{exchange ? "Enter filled cylinders sent and any empties returned for each product. A short return remains at the receiving branch." : "Move refills and/or empties in the same direction across one or more cylinder products."}</span><Button type="submit" variant="primary">Post transfer</Button></div>
  </form>;
}
