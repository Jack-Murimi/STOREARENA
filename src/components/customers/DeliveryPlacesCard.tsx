"use client";

import { useState } from "react";
import type { CustomerLocation } from "@/lib/customers/types";
import {
  addLocation,
  updateLocation,
  removeLocation,
} from "@/app/(portal)/customers/actions";
import { PinField } from "./PinField";
import { SubmitButton } from "./SubmitButton";

const controlClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-soft/50 focus:border-flame-400 focus:ring-2 focus:ring-flame-400/20";

function LocationRow({
  location,
  customerId,
}: {
  location: CustomerLocation;
  customerId: string;
}) {
  const [editing, setEditing] = useState(false);
  const mapsHref =
    location.pinLat !== null && location.pinLng !== null
      ? `https://www.google.com/maps?q=${location.pinLat},${location.pinLng}`
      : null;

  return (
    <li className="px-5 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold text-ink">{location.label}</span>
            {location.isPrimary ? (
              <span className="rounded-full bg-ok-bg px-2 py-0.5 text-xs font-medium text-ok">
                Main
              </span>
            ) : null}
            {!location.active ? (
              <span className="rounded-full bg-critical-bg px-2 py-0.5 text-xs font-medium text-critical">
                Inactive
              </span>
            ) : null}
          </div>
          {location.addressLine ? (
            <p className="mt-0.5 text-xs text-ink-soft">{location.addressLine}</p>
          ) : null}
          {location.details ? (
            <p className="mt-0.5 text-xs text-ink-soft/70">{location.details}</p>
          ) : null}
          {mapsHref ? (
            <a
              href={mapsHref}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-block text-xs font-medium text-info hover:underline"
            >
              Open in Maps ↗
            </a>
          ) : null}
        </div>

        {/* ⋯ menu */}
        <details className="relative shrink-0">
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
              {editing ? "Cancel edit" : "Edit"}
            </button>
            <form action={removeLocation}>
              <input type="hidden" name="customerId" value={customerId} />
              <input type="hidden" name="locationId" value={location.id} />
              <button
                type="submit"
                className="w-full px-4 py-2.5 text-left text-sm text-critical hover:bg-critical-bg"
                onClick={(e) => {
                  if (!confirm(`Remove "${location.label}"?`)) e.preventDefault();
                }}
              >
                Remove
              </button>
            </form>
          </div>
        </details>
      </div>

      {/* Inline edit form */}
      {editing && (
        <form
          action={updateLocation}
          className="mt-3 grid gap-3 rounded-lg border border-line bg-canvas p-4 sm:grid-cols-2"
        >
          <input type="hidden" name="customerId" value={customerId} />
          <input type="hidden" name="locationId" value={location.id} />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Label</span>
            <input
              name="label"
              defaultValue={location.label}
              required
              className={controlClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Address</span>
            <input
              name="addressLine"
              defaultValue={location.addressLine ?? ""}
              placeholder="e.g. house no 46 on Kinyajui road"
              className={controlClass}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-ink-soft">
              Landmark / gate instructions
            </span>
            <input
              name="details"
              defaultValue={location.details ?? ""}
              placeholder="e.g. opposite Fryz Inn hotel"
              className={controlClass}
            />
          </label>
          <div className="sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Map pin</span>
            <PinField
              latName="pinLat"
              lngName="pinLng"
              defaultLat={location.pinLat}
              defaultLng={location.pinLng}
            />
          </div>
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
              <input
                type="checkbox"
                name="isPrimary"
                defaultChecked={location.isPrimary}
                className="h-4 w-4 rounded border-line accent-flame-500"
              />
              This is the main delivery place
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

export function DeliveryPlacesCard({
  customerId,
  locations,
}: {
  customerId: string;
  locations: CustomerLocation[];
}) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold tracking-tight text-ink">
            Delivery places
          </h2>
          {locations.length > 0 ? (
            <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-canvas px-1.5 text-xs font-semibold text-ink-soft ring-1 ring-line">
              {locations.length}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setAddOpen((o) => !o)}
          className="text-xs font-medium text-orange-700 hover:underline"
        >
          {addOpen ? "Cancel" : "+ Add place"}
        </button>
      </div>

      {/* Add place form */}
      {addOpen && (
        <form
          action={addLocation}
          className="grid gap-3 border-b border-line bg-canvas/60 px-5 py-4 sm:grid-cols-2"
        >
          <input type="hidden" name="customerId" value={customerId} />
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">
              Name for it
            </span>
            <input
              name="label"
              required
              placeholder="e.g. Annex"
              className={controlClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Address</span>
            <input
              name="addressLine"
              placeholder="e.g. house no 46 on Kinyajui road"
              className={controlClass}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-ink-soft">
              Landmark / gate instructions
            </span>
            <input
              name="details"
              placeholder="e.g. opposite Fryz Inn hotel"
              className={controlClass}
            />
          </label>
          <div className="sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-ink-soft">
              Map pin (optional)
            </span>
            <PinField latName="pinLat" lngName="pinLng" />
          </div>
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
              <input
                type="checkbox"
                name="isPrimary"
                className="h-4 w-4 rounded border-line accent-flame-500"
              />
              Make this the main place
            </label>
            <SubmitButton pendingLabel="Adding…">Add place</SubmitButton>
          </div>
        </form>
      )}

      {/* Location list */}
      {locations.length === 0 ? (
        <div className="px-5 py-4 text-sm text-ink-soft">
          No delivery places yet.{" "}
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="font-medium text-orange-700 hover:underline"
          >
            Add the first place →
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {locations.map((loc) => (
            <LocationRow key={loc.id} location={loc} customerId={customerId} />
          ))}
        </ul>
      )}
    </div>
  );
}
