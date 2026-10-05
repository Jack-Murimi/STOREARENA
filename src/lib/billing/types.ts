/** What a customer owes, and the invoices and payments behind it. */

export const PAYMENT_METHODS = [
  "MPESA",
  "CASH",
  "BANK_TRANSFER",
  "CHEQUE",
  "CARD",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  MPESA: "M-Pesa",
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  CHEQUE: "Cheque",
  CARD: "Card",
};

export interface InvoiceLine {
  id: string;
  description: string;
  /** Set when the line came from a stock sale. */
  variantId: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Invoice {
  id: string;
  customerId: string;
  reference: string;
  saleId: string | null;
  issuedOn: string;
  notes: string | null;
  cancelled: boolean;
  total: number;
  allocated: number;
  outstanding: number;
  lines: InvoiceLine[];
}

export interface PaymentAllocation {
  invoiceId: string;
  invoiceReference: string;
  amount: number;
}

export interface Payment {
  id: string;
  customerId: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  receivedOn: string;
  notes: string | null;
  allocations: PaymentAllocation[];
}

export interface CustomerBalance {
  invoiced: number;
  paid: number;
  balance: number;
  invoiceCount: number;
  paymentCount: number;
}

export interface NewInvoiceLineInput {
  description: string;
  variantId?: string | null;
  quantity: number | string;
  unitPrice: number | string;
}

export interface NewInvoiceInput {
  customerId: string;
  saleId?: string | null;
  issuedOn?: string | null;
  notes?: string | null;
  lines: NewInvoiceLineInput[];
}

export interface NewPaymentInput {
  customerId: string;
  amount: number | string;
  method: PaymentMethod | string;
  reference?: string | null;
  receivedOn?: string | null;
  notes?: string | null;
}
