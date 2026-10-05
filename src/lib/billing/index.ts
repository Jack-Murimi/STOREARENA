/**
 * The billing ledger: what has been invoiced, what has been paid, and the
 * balance in between.
 *
 * Invoices normally arrive from the stock layer the moment a sale is committed;
 * they can also be raised directly for extras that never touched a cylinder.
 */
export { BillingService, BillingError } from "./service";
export type { Database } from "./service";
export {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from "./types";
export type {
  CustomerBalance,
  Invoice,
  InvoiceLine,
  NewInvoiceInput,
  NewInvoiceLineInput,
  NewPaymentInput,
  Payment,
  PaymentAllocation,
  PaymentMethod,
} from "./types";
export { BILLING_SCHEMA } from "../customers/schemaText";
