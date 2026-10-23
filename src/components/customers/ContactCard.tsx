"use client";

import { useState } from "react";
import type { CustomerContact } from "@/lib/customers/types";
import { ROLE_SUGGESTIONS } from "@/lib/customers/types";
import { formatKenyanPhone } from "@/lib/customers";
import {
  addContact,
  updateContact,
  removeContact,
} from "@/app/(portal)/customers/actions";
import { SubmitButton } from "./SubmitButton";

const controlClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-soft/50 focus:border-flame-400 focus:ring-2 focus:ring-flame-400/20";

const roles = ["", ...ROLE_SUGGESTIONS];

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.137.563 4.14 1.548 5.867L.057 23.267a.75.75 0 0 0 .92.92l5.4-1.491A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.869 0-3.61-.519-5.094-1.418l-.363-.222-3.763 1.04 1.04-3.763-.222-.363A9.953 9.953 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
    </svg>
  );
}

function ContactRow({
  contact,
  customerId,
  isPrimary,
}: {
  contact: CustomerContact;
  customerId: string;
  isPrimary: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const waHref = `https://wa.me/${contact.phone.replace("+", "")}`;

  return (
    <li className={`px-5 py-3 ${isPrimary ? "bg-canvas/40" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold text-ink">{contact.name}</span>
            {contact.role ? (
              <span className="rounded-full bg-info-soft px-2 py-0.5 text-xs font-medium text-info">
                {contact.role}
              </span>
            ) : null}
            {isPrimary ? (
              <span className="rounded-full bg-ok-bg px-2 py-0.5 text-xs font-medium text-ok">
                Main
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <a
              href={`tel:${contact.phone}`}
              className="text-sm text-ink-soft hover:text-ink hover:underline"
            >
              {formatKenyanPhone(contact.phone)}
            </a>
            {contact.notes ? (
              <span className="text-xs text-ink-soft/70">{contact.notes}</span>
            ) : null}
          </div>
        </div>

        {/* Action icons */}
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={`tel:${contact.phone}`}
            aria-label={`Call ${contact.name}`}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft transition hover:bg-canvas hover:text-ink"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.16 12 19.79 19.79 0 0 1 1.07 3.4 2 2 0 0 1 3.06 1.2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21 16z" />
            </svg>
          </a>
          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            aria-label={`WhatsApp ${contact.name}`}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft transition hover:bg-canvas hover:text-ok"
          >
            <WhatsAppIcon />
          </a>

          {/* ⋯ menu */}
          <details className="relative">
            <summary
              className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg text-ink-soft transition hover:bg-canvas hover:text-ink"
              aria-label="More actions"
            >
              <span className="text-base leading-none tracking-widest">···</span>
            </summary>
            <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-line bg-white shadow-raised">
              <button
                type="button"
                onClick={() => setEditing((e) => !e)}
                className="w-full px-4 py-2.5 text-left text-sm hover:bg-canvas"
              >
                {editing ? "Cancel" : "Edit"}
              </button>
              <form action={removeContact}>
                <input type="hidden" name="customerId" value={customerId} />
                <input type="hidden" name="contactId" value={contact.id} />
                <button
                  type="submit"
                  className="w-full px-4 py-2.5 text-left text-sm text-critical hover:bg-critical-bg"
                  onClick={(e) => {
                    if (!confirm(`Remove ${contact.name}?`)) e.preventDefault();
                  }}
                >
                  Remove
                </button>
              </form>
            </div>
          </details>
        </div>
      </div>

      {/* Inline edit form */}
      {editing && (
        <form
          action={updateContact}
          className="mt-3 grid gap-3 rounded-lg border border-line bg-canvas p-4 sm:grid-cols-2"
        >
          <input type="hidden" name="customerId" value={customerId} />
          <input type="hidden" name="contactId" value={contact.id} />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Name</span>
            <input
              name="name"
              defaultValue={contact.name}
              required
              className={controlClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Phone</span>
            <input
              name="phone"
              defaultValue={contact.phone}
              required
              className={controlClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">
              Role (optional)
            </span>
            <select name="role" defaultValue={contact.role ?? ""} className={controlClass}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Notes</span>
            <input
              name="notes"
              defaultValue={contact.notes ?? ""}
              placeholder="e.g. Answers during the day"
              className={controlClass}
            />
          </label>
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
              <input
                type="checkbox"
                name="isPrimary"
                defaultChecked={contact.isPrimary}
                className="h-4 w-4 rounded border-line accent-flame-500"
              />
              Make this the main number
            </label>
            <SubmitButton tone="ghost" pendingLabel="Saving…">
              Save
            </SubmitButton>
          </div>
        </form>
      )}
    </li>
  );
}

export function ContactCard({
  customerId,
  contacts,
}: {
  customerId: string;
  contacts: CustomerContact[];
}) {
  const [addOpen, setAddOpen] = useState(false);

  const primary = contacts.find((c) => c.isPrimary);
  const others = contacts.filter((c) => !c.isPrimary);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
        <h2 className="text-base font-semibold tracking-tight text-ink">Contacts</h2>
        <button
          type="button"
          onClick={() => setAddOpen((o) => !o)}
          className="text-xs font-medium text-orange-700 hover:underline"
        >
          {addOpen ? "Cancel" : "+ Add person"}
        </button>
      </div>

      {/* Add person form */}
      {addOpen && (
        <form
          action={addContact}
          className="grid gap-3 border-b border-line bg-canvas/60 px-5 py-4 sm:grid-cols-2"
        >
          <input type="hidden" name="customerId" value={customerId} />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Name</span>
            <input
              name="name"
              required
              placeholder="e.g. Grace W."
              className={controlClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Phone</span>
            <input
              name="phone"
              required
              placeholder="e.g. 0733 900 100"
              className={controlClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">
              Role (optional)
            </span>
            <select name="role" className={controlClass}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Notes</span>
            <input
              name="notes"
              placeholder="e.g. Answers during the day"
              className={controlClass}
            />
          </label>
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
              <input
                type="checkbox"
                name="isPrimary"
                className="h-4 w-4 rounded border-line accent-flame-500"
              />
              Make this the main number
            </label>
            <SubmitButton pendingLabel="Adding…">Add person</SubmitButton>
          </div>
        </form>
      )}

      {/* Contact list */}
      {contacts.length === 0 ? (
        <div className="px-5 py-4 text-sm text-ink-soft">
          No contacts yet.{" "}
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="font-medium text-orange-700 hover:underline"
          >
            Add the first person →
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {primary ? (
            <ContactRow
              key={primary.id}
              contact={primary}
              customerId={customerId}
              isPrimary
            />
          ) : null}
          {others.map((c) => (
            <ContactRow key={c.id} contact={c} customerId={customerId} isPrimary={false} />
          ))}
        </ul>
      )}
    </div>
  );
}
