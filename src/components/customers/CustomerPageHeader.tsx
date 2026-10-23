"use client";

import { useState, useRef, useEffect } from "react";
import type { CustomerKind } from "@/lib/customers/types";
import { CustomerKind as CK } from "@/lib/customers/types";
import {
  updateCustomer,
  deactivateCustomer,
} from "@/app/(portal)/customers/actions";
import { SubmitButton } from "./SubmitButton";

const controlClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-soft/50 focus:border-flame-400 focus:ring-2 focus:ring-flame-400/20";

function KindBadge({ kind }: { kind: CustomerKind }) {
  return (
    <span className="inline-flex items-center rounded-full bg-info-bg px-2 py-0.5 text-xs font-medium text-info">
      {kind === CK.Business ? "Business" : "Household"}
    </span>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        active ? "bg-ok-bg text-ok" : "bg-critical-bg text-critical"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export function CustomerPageHeader({
  customerId,
  name,
  code,
  kind,
  active,
  notes,
  showBilling,
  currentName,
  currentKind,
  currentNotes,
}: {
  customerId: string;
  name: string;
  code: string;
  kind: CustomerKind;
  active: boolean;
  notes: string | null;
  showBilling: boolean;
  currentName: string;
  currentKind: CustomerKind;
  currentNotes: string | null;
}) {
  const [panel, setPanel] = useState<"edit" | "deactivate" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="sticky top-[56px] z-10 -mx-6 border-b border-line bg-bg px-6 py-3 max-md:-mx-4 max-md:px-4">
      {/* Top row: back + name + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <a
          href="/customers"
          className="shrink-0 text-xs font-medium text-ink-soft transition hover:text-ink"
        >
          ← Customers
        </a>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <h1 className="text-md font-semibold text-ink truncate">{name}</h1>
          <span className="code shrink-0 rounded bg-surface-muted px-2 py-0.5 text-ink-soft">
            {code}
          </span>
          <KindBadge kind={kind} />
          <ActiveBadge active={active} />
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          {showBilling ? null : (
            <span className="hidden text-xs text-ink-soft sm:inline">
              Billing visible to managers
            </span>
          )}

          {/* ⋯ overflow menu */}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="More actions"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-ink-soft transition hover:bg-canvas hover:text-ink"
            >
              <span className="text-base leading-none tracking-widest">···</span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-lg border border-line bg-white shadow-raised">
                <button
                  type="button"
                  onClick={() => {
                    setPanel(panel === "edit" ? null : "edit");
                    setMenuOpen(false);
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-canvas"
                >
                  Edit details
                </button>
                {active ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPanel(panel === "deactivate" ? null : "deactivate");
                      setMenuOpen(false);
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm text-critical hover:bg-critical-bg"
                  >
                    Deactivate customer
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      {notes ? (
        <p className="mt-1.5 rounded-md bg-canvas px-3 py-1.5 text-xs text-ink-soft">
          {notes}
        </p>
      ) : null}

      {/* Edit details panel */}
      {panel === "edit" && (
        <form
          action={updateCustomer}
          className="mt-3 grid gap-3 rounded-xl border border-line bg-canvas p-4 sm:grid-cols-3"
        >
          <input type="hidden" name="id" value={customerId} />
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-ink-soft">
              Customer name
            </span>
            <input
              name="name"
              defaultValue={currentName}
              required
              className={controlClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Type</span>
            <select name="kind" defaultValue={currentKind} className={controlClass}>
              <option value={CK.Household}>Household</option>
              <option value={CK.Business}>Business</option>
            </select>
          </label>
          <label className="block sm:col-span-3">
            <span className="mb-1 block text-xs font-medium text-ink-soft">
              Notes
            </span>
            <input
              name="notes"
              defaultValue={currentNotes ?? ""}
              placeholder="e.g. Gate codes, delivery windows, standing orders"
              className={controlClass}
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
              <input
                type="checkbox"
                name="active"
                defaultChecked={active}
                className="h-4 w-4 rounded border-line accent-flame-500"
              />
              Active customer
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPanel(null)}
                className="text-xs font-medium text-ink-soft hover:text-ink"
              >
                Cancel
              </button>
              <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
            </div>
          </div>
        </form>
      )}

      {/* Deactivate confirm panel */}
      {panel === "deactivate" && (
        <div className="mt-3 rounded-xl border border-critical/30 bg-critical-bg/40 p-4">
          <p className="text-sm font-semibold text-critical">Deactivate this customer?</p>
          <p className="mt-1 text-xs text-ink-soft">
            Keeps all delivery places, phone numbers and every recorded sale, but hides
            the customer from the list. Records are never deleted.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <form action={deactivateCustomer}>
              <input type="hidden" name="id" value={customerId} />
              <SubmitButton tone="danger" pendingLabel="Deactivating…">
                Deactivate customer
              </SubmitButton>
            </form>
            <button
              type="button"
              onClick={() => setPanel(null)}
              className="text-xs font-medium text-ink-soft hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
