/**
 * Typed errors for the customer domain, mirroring the stock domain: every
 * failure carries a stable `code` so an API layer can map it to a status and
 * the UI can show a message without string matching.
 */

export const CustomerErrorCode = {
  UnknownCustomer: "UNKNOWN_CUSTOMER",
  UnknownLocation: "UNKNOWN_LOCATION",
  UnknownContact: "UNKNOWN_CONTACT",
  DuplicateCode: "DUPLICATE_CODE",
  DuplicateLabel: "DUPLICATE_LABEL",
  DuplicatePhone: "DUPLICATE_PHONE",
  InvalidName: "INVALID_NAME",
  InvalidPhone: "INVALID_PHONE",
  InvalidRole: "INVALID_ROLE",
  InvalidLabel: "INVALID_LABEL",
  InvalidNotes: "INVALID_NOTES",
  InvalidPin: "INVALID_PIN",
  NoLocations: "NO_LOCATIONS",
  NoContacts: "NO_CONTACTS",
  PrimaryRequired: "PRIMARY_REQUIRED",
} as const;

export type CustomerErrorCode =
  (typeof CustomerErrorCode)[keyof typeof CustomerErrorCode];

export class CustomerError extends Error {
  readonly code: CustomerErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    code: CustomerErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

export class UnknownCustomerError extends CustomerError {
  constructor(id: string) {
    super(
      CustomerErrorCode.UnknownCustomer,
      `Customer ${id} does not exist`,
      { id },
    );
  }
}

export class UnknownCustomerLocationError extends CustomerError {
  constructor(id: string) {
    super(
      CustomerErrorCode.UnknownLocation,
      `Delivery location ${id} does not exist`,
      { id },
    );
  }
}

export class UnknownContactError extends CustomerError {
  constructor(id: string) {
    super(CustomerErrorCode.UnknownContact, `Contact ${id} does not exist`, {
      id,
    });
  }
}

export class DuplicateCodeError extends CustomerError {
  constructor(code: string) {
    super(CustomerErrorCode.DuplicateCode, `Customer code ${code} is taken`, {
      code,
    });
  }
}

export class DuplicateLabelError extends CustomerError {
  constructor(customerId: string, label: string) {
    super(
      CustomerErrorCode.DuplicateLabel,
      `This customer already has a location called "${label}"`,
      { customerId, label },
    );
  }
}

/** A number belongs to one account, so the message says which one has it. */
export class DuplicatePhoneError extends CustomerError {
  constructor(phone: string, heldBy?: { code: string; name: string }) {
    super(
      CustomerErrorCode.DuplicatePhone,
      heldBy
        ? `${phone} is already on file for ${heldBy.name} (${heldBy.code}). A number can only belong to one customer.`
        : `${phone} is already on file. A number can only belong to one customer.`,
      { phone, heldBy: heldBy ?? null },
    );
  }
}

export class InvalidNameError extends CustomerError {
  constructor(value: string, what = "name") {
    super(
      CustomerErrorCode.InvalidName,
      `${what[0]?.toUpperCase()}${what.slice(1)} must be at least 2 characters`,
      { value, what },
    );
  }
}

export class InvalidPhoneError extends CustomerError {
  constructor(value: string) {
    super(
      CustomerErrorCode.InvalidPhone,
      `"${value}" is not a Kenyan mobile number. Use 07xxxxxxxx, +2547xxxxxxxx or 7xxxxxxxx.`,
      { value },
    );
  }
}

export class InvalidRoleError extends CustomerError {
  constructor(value: string) {
    super(
      CustomerErrorCode.InvalidRole,
      "A role must be at least 2 characters, or left blank",
      { value },
    );
  }
}

export class InvalidLabelError extends CustomerError {
  constructor(value: string) {
    super(
      CustomerErrorCode.InvalidLabel,
      "A location needs a label of at least 2 characters, e.g. \"Main house\"",
      { value },
    );
  }
}

export class InvalidNotesError extends CustomerError {
  constructor(value: string) {
    super(
      CustomerErrorCode.InvalidNotes,
      "Notes must be at least 3 characters, or left blank",
      { value },
    );
  }
}

/** A pin is both coordinates or neither, and they must be real coordinates. */
export class InvalidPinError extends CustomerError {
  constructor(lat: unknown, lng: unknown) {
    super(
      CustomerErrorCode.InvalidPin,
      "A map pin needs both latitude and longitude — latitude between -90 and 90, longitude between -180 and 180.",
      { lat, lng },
    );
  }
}

export class NoLocationsError extends CustomerError {
  constructor(customerId = "new customer") {
    super(
      CustomerErrorCode.NoLocations,
      `${customerId} needs at least one delivery location`,
      { customerId },
    );
  }
}

export class NoContactsError extends CustomerError {
  constructor(customerId = "new customer") {
    super(
      CustomerErrorCode.NoContacts,
      `${customerId} needs at least one phone number`,
      { customerId },
    );
  }
}

/** Thrown when a change would leave a customer with no primary at all. */
export class PrimaryRequiredError extends CustomerError {
  constructor(what: string) {
    super(
      CustomerErrorCode.PrimaryRequired,
      `Exactly one ${what} must be marked as primary`,
      { what },
    );
  }
}
