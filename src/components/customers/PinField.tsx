"use client";

import { useId, useRef, useState } from "react";

const controlClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] text-ink outline-none transition placeholder:text-ink-soft/50 focus:border-flame-400 focus:ring-2 focus:ring-flame-400/20";

/**
 * An optional map pin.
 *
 * Coordinates rather than an embedded map: no API key, nothing to load, and a
 * rider can be sent a link that opens in whatever map app they already use.
 * "Use my location" reads the browser's own position, so standing at the gate
 * is enough to pin a place.
 */
export function PinField({
  latName,
  lngName,
  defaultLat,
  defaultLng,
}: {
  latName: string;
  lngName: string;
  defaultLat?: number | null;
  defaultLng?: number | null;
}) {
  const id = useId();
  const latRef = useRef<HTMLInputElement>(null);
  const lngRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    defaultLat != null && defaultLng != null
      ? { lat: Number(defaultLat), lng: Number(defaultLng) }
      : null,
  );

  function useMyLocation() {
    if (!navigator.geolocation) {
      setStatus("This browser cannot share a location — type the coordinates instead.");
      return;
    }
    setStatus("Reading your position…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        if (latRef.current) latRef.current.value = lat;
        if (lngRef.current) lngRef.current.value = lng;
        setCoords({ lat: Number(lat), lng: Number(lng) });
        setStatus("Pin set from your current position.");
      },
      (error) => {
        setStatus(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied — type the coordinates instead."
            : "Could not read your position — type the coordinates instead.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function onInput() {
    const lat = Number(latRef.current?.value);
    const lng = Number(lngRef.current?.value);
    setCoords(
      latRef.current?.value && lngRef.current?.value &&
        Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat, lng }
        : null,
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[110px] flex-1">
          <span className="mb-1 block text-[11.5px] font-medium text-ink-soft">
            Pin latitude
          </span>
          <input
            ref={latRef}
            id={id}
            className={controlClass}
            type="text"
            inputMode="decimal"
            name={latName}
            defaultValue={defaultLat ?? ""}
            placeholder="-1.284100"
            onInput={onInput}
          />
        </label>
        <label className="min-w-[110px] flex-1">
          <span className="mb-1 block text-[11.5px] font-medium text-ink-soft">
            Pin longitude
          </span>
          <input
            ref={lngRef}
            className={controlClass}
            type="text"
            inputMode="decimal"
            name={lngName}
            defaultValue={defaultLng ?? ""}
            placeholder="36.751900"
            onInput={onInput}
          />
        </label>
        <button
          type="button"
          onClick={useMyLocation}
          className="rounded-lg bg-white px-3 py-2 text-[12.5px] font-semibold text-ink ring-1 ring-line transition hover:bg-canvas"
        >
          Use my location
        </button>
        {coords ? (
          <a
            href={`https://www.google.com/maps?q=${coords.lat},${coords.lng}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-white px-3 py-2 text-[12.5px] font-semibold text-info ring-1 ring-info/25 transition hover:bg-info-soft"
          >
            View on map
          </a>
        ) : null}
      </div>
      {status ? <p className="text-[11.5px] text-ink-soft">{status}</p> : null}
      {!status ? (
        <p className="text-[11.5px] text-ink-soft/80">
          Optional. Both coordinates together, or leave both blank.
        </p>
      ) : null}
    </div>
  );
}
