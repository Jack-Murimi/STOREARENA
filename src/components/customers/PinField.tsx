"use client";

import { useRef, useState } from "react";

const controlClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-soft/50 focus:border-flame-400 focus:ring-2 focus:ring-flame-400/20";

/**
 * Parses a Google Maps URL or a plain "lat, lng" string.
 * Handles the common formats:
 *   https://www.google.com/maps?q=-1.284100,36.751900
 *   https://maps.app.goo.gl/... (after redirect — tries @lat,lng in URL)
 *   https://www.google.com/maps/@-1.284100,36.751900,17z
 *   -1.284100, 36.751900
 *   -1.284100,36.751900
 */
function parse(raw: string): { lat: number; lng: number } | null {
  const s = raw.trim();
  if (!s) return null;

  // Try extracting coordinates from Google Maps URL patterns
  const patterns = [
    /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,   // ?q=lat,lng
    /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,          // @lat,lng (/@lat,lng,zoom)
    /ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/,        // ll=lat,lng
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const lat = Number(m[1]), lng = Number(m[2]);
      if (isValid(lat, lng)) return { lat, lng };
    }
  }

  // Plain "lat, lng" or "lat,lng"
  const parts = s.split(/,\s*/);
  if (parts.length === 2) {
    const lat = Number(parts[0]), lng = Number(parts[1]);
    if (isValid(lat, lng)) return { lat, lng };
  }

  return null;
}

function isValid(lat: number, lng: number) {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180
  );
}

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
  const latRef = useRef<HTMLInputElement>(null);
  const lngRef = useRef<HTMLInputElement>(null);

  const defaultPaste =
    defaultLat != null && defaultLng != null
      ? `${defaultLat}, ${defaultLng}`
      : "";

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    defaultLat != null && defaultLng != null
      ? { lat: Number(defaultLat), lng: Number(defaultLng) }
      : null,
  );
  const [error, setError] = useState<string | null>(null);

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (!raw.trim()) {
      setCoords(null);
      setError(null);
      if (latRef.current) latRef.current.value = "";
      if (lngRef.current) lngRef.current.value = "";
      return;
    }
    const parsed = parse(raw);
    if (parsed) {
      setCoords(parsed);
      setError(null);
      if (latRef.current) latRef.current.value = String(parsed.lat);
      if (lngRef.current) lngRef.current.value = String(parsed.lng);
    } else {
      setCoords(null);
      setError("Paste a Google Maps link or coordinates like -1.2841, 36.7519");
      if (latRef.current) latRef.current.value = "";
      if (lngRef.current) lngRef.current.value = "";
    }
  }

  return (
    <div className="space-y-1.5">
      {/* hidden inputs carry the actual values to the form */}
      <input ref={latRef} type="hidden" name={latName} defaultValue={defaultLat ?? ""} />
      <input ref={lngRef} type="hidden" name={lngName} defaultValue={defaultLng ?? ""} />

      <div className="flex items-center gap-2">
        <input
          type="text"
          className={controlClass}
          defaultValue={defaultPaste}
          placeholder="Paste a Google Maps link or -1.2841, 36.7519"
          onChange={onInput}
        />
        {coords ? (
          <a
            href={`https://www.google.com/maps?q=${coords.lat},${coords.lng}`}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-info ring-1 ring-info/25 transition hover:bg-info-soft"
          >
            Verify ↗
          </a>
        ) : null}
      </div>
      {error ? (
        <p className="text-xs text-bad">{error}</p>
      ) : coords ? (
        <p className="text-xs text-good">
          Pin set · {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
        </p>
      ) : (
        <p className="text-xs text-ink-soft/70">Optional. Paste a Google Maps link or coordinates.</p>
      )}
    </div>
  );
}
