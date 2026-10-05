import { InvalidPhoneError } from "./errors";

/**
 * Kenyan mobile numbers, normalised.
 *
 * Staff type them every which way — `0712 345 678`, `+254 712 345 678`,
 * `712345678` — but M-Pesa, SMS and duplicate detection all need one canonical
 * form. Everything is stored as `+254` followed by nine digits.
 */
export const KENYAN_MOBILE = /^\+254[17][0-9]{8}$/;

/** Normalises a phone number, or throws `InvalidPhoneError`. */
export function normalizeKenyanPhone(raw: string): string {
  const digitsOnly = raw.replace(/[\s\-().]/g, "");

  const candidates = [
    digitsOnly.startsWith("+") ? digitsOnly : `+${digitsOnly.replace(/^\+/, "")}`,
    digitsOnly.startsWith("00") ? `+${digitsOnly.slice(2)}` : null,
    digitsOnly.startsWith("254") ? `+${digitsOnly}` : null,
    digitsOnly.startsWith("0") ? `+254${digitsOnly.slice(1)}` : null,
    /^[17][0-9]{8}$/.test(digitsOnly) ? `+254${digitsOnly}` : null,
  ].filter((c): c is string => c !== null);

  for (const candidate of candidates) {
    if (KENYAN_MOBILE.test(candidate)) return candidate;
  }

  throw new InvalidPhoneError(raw);
}

/** True when the number is already in canonical form. */
export function isNormalisedPhone(value: string): boolean {
  return KENYAN_MOBILE.test(value);
}

/** `+254712345678` -> `0712 345 678`, the way it is read out loud. */
export function formatKenyanPhone(phone: string): string {
  if (!isNormalisedPhone(phone)) return phone;
  const local = `0${phone.slice(4)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}
