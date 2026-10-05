"use client";

import { useState } from "react";
import { createCustomer } from "@/app/customers/actions";
import { SubmitButton } from "./SubmitButton";

const controlClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-[13.5px] text-ink outline-none transition placeholder:text-ink-soft/50 focus:border-flame-400 focus:ring-2 focus:ring-flame-400/20";

const ROLES = [
  "",
  "Wife",
  "Husband",
  "Father",
  "Mother",
  "Son",
  "Daughter",
  "Children",
  "Maid",
  "Caretaker",
  "Guard",
  "Manager",
  "Landlord",
  "Tenant",
];

interface LocationRow {
  key: number;
  label: string;
  address: string;
  details: string;
}

interface ContactRow {
  key: number;
  name: string;
  phone: string;
  role: string;
}

/**
 * The new-customer form.
 *
 * Deliberately short: a name, then as many places and numbers as the customer
 * actually has, added with one click each. The pin, area, town and notes live
 * on the customer's own page, where there is room for them.
 */
export function CustomerCreateForm() {
  const [locations, setLocations] = useState<LocationRow[]>([
    { key: 0, label: "", address: "", details: "" },
  ]);
  const [contacts, setContacts] = useState<ContactRow[]>([
    { key: 0, name: "", phone: "", role: "" },
  ]);

  const nextKey = Math.max(
    0,
    ...locations.map((l) => l.key),
    ...contacts.map((c) => c.key),
  ) + 1;

  return (
    <form action={createCustomer} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <label>
          <span className="mb-1 block text-[11.5px] font-medium text-ink-soft">
            Customer name
          </span>
          <input
            className={controlClass}
            name="name"
            placeholder="Jamry Apartment"
            required
          />
        </label>
        <label>
          <span className="mb-1 block text-[11.5px] font-medium text-ink-soft">
            Type
          </span>
          <select className={controlClass} name="kind" defaultValue="HOUSEHOLD">
            <option value="HOUSEHOLD">Household</option>
            <option value="BUSINESS">Business</option>
          </select>
        </label>
      </div>

      {/* ------------------------------------------------------- locations */}
      <fieldset className="rounded-lg border border-line bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <legend className="float-left text-[12.5px] font-semibold text-ink">
            Where do we deliver?
          </legend>
          <button
            type="button"
            onClick={() =>
              setLocations((rows) => [
                ...rows,
                { key: nextKey, label: "", address: "", details: "" },
              ])
            }
            className="rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-semibold text-flame-600 ring-1 ring-flame-500/30 transition hover:bg-flame-500/10"
          >
            + Add location
          </button>
        </div>

        <div className="space-y-4">
          {locations.map((row, index) => (
            <div
              key={row.key}
              className="rounded-lg border border-line bg-canvas/60 p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11.5px] font-medium text-ink-soft">
                  Location {index + 1}
                </span>
                {locations.length > 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setLocations((rows) =>
                        rows.filter((r) => r.key !== row.key),
                      )
                    }
                    className="text-[11.5px] font-semibold text-bad hover:underline"
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label>
                  <span className="mb-1 block text-[11px] text-ink-soft">
                    Name for it
                  </span>
                  <input
                    className={controlClass}
                    name={`loc_label_${index}`}
                    defaultValue={row.label}
                    placeholder="Main house"
                    required={index === 0}
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className="mb-1 block text-[11px] text-ink-soft">
                    Address
                  </span>
                  <input
                    className={controlClass}
                    name={`loc_address_${index}`}
                    defaultValue={row.address}
                    placeholder="house no 46 on Kinyajui road off Naivasha road"
                  />
                </label>
                <label className="sm:col-span-3">
                  <span className="mb-1 block text-[11px] text-ink-soft">
                    Additional details
                  </span>
                  <input
                    className={controlClass}
                    name={`loc_details_${index}`}
                    defaultValue={row.details}
                    placeholder="opposite Fryz Inn hotel"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      {/* -------------------------------------------------------- contacts */}
      <fieldset className="rounded-lg border border-line bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <legend className="float-left text-[12.5px] font-semibold text-ink">
            Who do we call?
          </legend>
          <button
            type="button"
            onClick={() =>
              setContacts((rows) => [
                ...rows,
                { key: nextKey, name: "", phone: "", role: "" },
              ])
            }
            className="rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-semibold text-flame-600 ring-1 ring-flame-500/30 transition hover:bg-flame-500/10"
          >
            + Add number
          </button>
        </div>

        <div className="space-y-4">
          {contacts.map((row, index) => (
            <div
              key={row.key}
              className="rounded-lg border border-line bg-canvas/60 p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11.5px] font-medium text-ink-soft">
                  Number {index + 1}
                </span>
                {contacts.length > 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setContacts((rows) => rows.filter((r) => r.key !== row.key))
                    }
                    className="text-[11.5px] font-semibold text-bad hover:underline"
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label>
                  <span className="mb-1 block text-[11px] text-ink-soft">
                    Name
                  </span>
                  <input
                    className={controlClass}
                    name={`con_name_${index}`}
                    defaultValue={row.name}
                    placeholder="Jane Wanjiku"
                    required={index === 0}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-[11px] text-ink-soft">
                    Phone number
                  </span>
                  <input
                    className={controlClass}
                    name={`con_phone_${index}`}
                    defaultValue={row.phone}
                    placeholder="0712 345 678"
                    required={index === 0}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-[11px] text-ink-soft">
                    Role (optional)
                  </span>
                  <select
                    className={controlClass}
                    name={`con_role_${index}`}
                    defaultValue={row.role}
                  >
                    {ROLES.map((role) => (
                      <option key={role || "none"} value={role}>
                        {role || "—"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingLabel="Saving customer…">Save customer</SubmitButton>
        <a
          href="/customers"
          className="inline-flex items-center rounded-lg bg-white px-3 py-2 text-[12.5px] font-semibold text-ink ring-1 ring-line transition hover:bg-canvas"
        >
          Cancel
        </a>
        <span className="text-[11.5px] text-ink-soft">
          Pin, area, town and notes can be added on the next screen.
        </span>
      </div>
    </form>
  );
}
