/**
 * Customer domain.
 *
 * Storage is plain SQL against PostgreSQL (Supabase in production, PGlite in
 * tests), and every rule lives in `CustomerService` so the same behaviour holds
 * whichever screen or script calls it.
 */

export {
  CustomerKind,
  ROLE_SUGGESTIONS,
  type Customer,
  type CustomerContact,
  type CustomerLocation,
  type CustomerPatch,
  type CustomerRecord,
  type NewContactInput,
  type NewCustomerInput,
  type NewLocationInput,
} from "./types";

export {
  CustomerError,
  CustomerErrorCode,
  DuplicateCodeError,
  DuplicateLabelError,
  DuplicatePhoneError,
  InvalidLabelError,
  InvalidNameError,
  InvalidNotesError,
  InvalidPhoneError,
  InvalidPinError,
  InvalidRoleError,
  NoContactsError,
  NoLocationsError,
  PrimaryRequiredError,
  UnknownContactError,
  UnknownCustomerError,
  UnknownCustomerLocationError,
} from "./errors";

export {
  KENYAN_MOBILE,
  formatKenyanPhone,
  isNormalisedPhone,
  normalizeKenyanPhone,
} from "./phone";

export {
  CustomerRepository,
  type Database,
  type Row,
} from "./repository";

export { CustomerService } from "./service";

export { SEED_CUSTOMER_INPUTS, seedCustomers } from "./seed";
