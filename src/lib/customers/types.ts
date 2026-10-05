/**
 * A customer is a household or a business — the thing we deliver gas to.
 *
 * One customer, many places, many people: a single account can cover a main
 * house, an annex and a shop, and each phone number says whose it is and, if
 * the customer wants to say, what their place in the house is.
 */

export enum CustomerKind {
  Household = "HOUSEHOLD",
  Business = "BUSINESS",
}

/** Where the gas goes. One customer may have several. */
export interface CustomerLocation {
  id: string;
  customerId: string;
  /** "Main house", "Annex", "Shop" — unique within the customer. */
  label: string;
  /** Free text: "house no 46 on Kinyajui road off Naivasha road". */
  addressLine: string | null;
  /** The bit that gets you through the gate: "opposite Fryz Inn hotel". */
  details: string | null;
  area: string | null;
  town: string | null;
  /** Optional map pin, both together or neither. */
  pinLat: number | null;
  pinLng: number | null;
  isPrimary: boolean;
  active: boolean;
  createdAt: string;
}

/**
 * A phone number and the person who answers it.
 *
 * `role` is optional: a house can have wife, father, children, maid, caretaker,
 * and the list is open-ended, so it is free text rather than an enum. The
 * common ones are offered as suggestions by the UI.
 */
export interface CustomerContact {
  id: string;
  customerId: string;
  /** Normalised to +254 7xx xxx xxx so M-Pesa and lookups match. */
  phone: string;
  name: string;
  role: string | null;
  isPrimary: boolean;
  notes: string | null;
  createdAt: string;
}

export interface Customer {
  id: string;
  /** Human-friendly reference: CUS-0001. */
  code: string;
  name: string;
  kind: CustomerKind;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A customer with everything attached — what the screens actually render. */
export interface CustomerRecord extends Customer {
  locations: CustomerLocation[];
  contacts: CustomerContact[];
}

/** Shape accepted when creating a customer. */
export interface NewCustomerInput {
  name: string;
  kind?: CustomerKind;
  notes?: string | null;
  locations: NewLocationInput[];
  contacts: NewContactInput[];
}

export interface NewLocationInput {
  label: string;
  addressLine?: string | null;
  details?: string | null;
  area?: string | null;
  town?: string | null;
  /** Accepted as text because that is what a form posts; parsed on the way in. */
  pinLat?: number | string | null;
  pinLng?: number | string | null;
  isPrimary?: boolean;
}

export interface NewContactInput {
  phone: string;
  name: string;
  role?: string | null;
  isPrimary?: boolean;
  notes?: string | null;
}

/** Everything about a customer that may be changed after creation. */
export interface CustomerPatch {
  name?: string;
  kind?: CustomerKind;
  notes?: string | null;
  active?: boolean;
}

/**
 * Suggested roles for the form. Free text is still accepted — the list exists
 * so staff stop inventing spellings of the same thing.
 */
export const ROLE_SUGGESTIONS = [
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
] as const;
