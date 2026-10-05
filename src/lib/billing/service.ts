import type {
  CustomerBalance,
  Invoice,
  InvoiceLine,
  NewInvoiceInput,
  NewPaymentInput,
  Payment,
  PaymentAllocation,
  PaymentMethod,
} from "./types";
import { PAYMENT_METHODS } from "./types";

type Row = Record<string, unknown>;

export interface Database {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
}

export class BillingError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "BillingError";
  }
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const strOrNull = (v: unknown): string | null =>
  v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim();
const dateOrToday = (v?: string | null): string => {
  if (!v || !v.trim()) return new Date().toISOString().slice(0, 10);
  return v.trim().slice(0, 10);
};

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 14)}`;
}

/** Money is compared in cents so 0.1 + 0.2 never leaves a phantom shilling. */
const cents = (amount: number): number => Math.round(amount * 100);

function toLine(row: Row): InvoiceLine {
  return {
    id: str(row.id),
    description: str(row.description),
    variantId: strOrNull(row.variant_id),
    quantity: num(row.quantity),
    unitPrice: num(row.unit_price),
    lineTotal: num(row.line_total),
  };
}

/**
 * Invoices, payments and the balance between them.
 *
 * Credit is normal here: nothing stops an order because a customer still owes
 * last month. The balance is simply everything invoiced minus everything paid.
 */
export class BillingService {
  constructor(private readonly db: Database) {}

  // ---------------------------------------------------------------- invoices

  /**
   * Raises an invoice. Normally called by the stock layer the moment a sale is
   * committed, but it can be raised directly for extras — a regulator, a
   * delivery charge — that never touched a cylinder.
   */
  async raiseInvoice(input: NewInvoiceInput): Promise<Invoice> {
    const lines = (input.lines ?? []).map((line) => {
      const quantity = Number(line.quantity);
      const unitPrice = Number(line.unitPrice);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new BillingError("BAD_QUANTITY", "A quantity has to be more than zero.");
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new BillingError("BAD_PRICE", "A price cannot be negative.");
      }
      const description = (line.description ?? "").trim();
      if (description.length < 2) {
        throw new BillingError("BAD_DESCRIPTION", "Say what the line is for.");
      }
      return {
        id: newId("ln"),
        description,
        variantId: line.variantId ?? null,
        quantity,
        unitPrice,
      };
    });
    if (lines.length === 0) {
      throw new BillingError("NO_LINES", "An invoice needs at least one line.");
    }

    const id = newId("inv");
    const issuedOn = dateOrToday(input.issuedOn);
    const notes = strOrNull(input.notes);

    await this.db.transaction(async (tx) => {
      const [made] = await tx.query<Row>(
        `INSERT INTO invoices (id, customer_id, sale_id, reference, issued_on, notes)
         SELECT $1, $2, $3,
                'INV-' || lpad(
                  (coalesce(max(substring(reference from '[0-9]+$')::int), 0) + 1)::text, 4, '0'),
                $4, $5
           FROM invoices
          RETURNING reference`,
        [id, input.customerId, input.saleId ?? null, issuedOn, notes],
      );
      if (!made) throw new BillingError("NO_CUSTOMER", "That customer no longer exists.");

      const values: unknown[] = [];
      const tuples = lines.map((line, i) => {
        const o = i * 7;
        values.push(
          line.id, id, line.description, line.variantId, line.quantity, line.unitPrice, i,
        );
        return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7})`;
      });
      await tx.query(
        `INSERT INTO invoice_lines
           (id, invoice_id, description, variant_id, quantity, unit_price, position)
         VALUES ${tuples.join(", ")}`,
        values,
      );
      (input as { reference?: string }).reference = str(made.reference);
    });

    const saved = await this.invoice(id);
    if (!saved) throw new BillingError("NOT_FOUND", "The invoice disappeared.");
    return saved;
  }

  /** Marks an invoice void. The record stays; it stops counting towards debt. */
  async cancelInvoice(invoiceId: string): Promise<void> {
    const rows = await this.db.query("UPDATE invoices SET cancelled = true WHERE id = $1 RETURNING id", [
      invoiceId,
    ]);
    if (rows.length === 0) throw new BillingError("NOT_FOUND", "There is no invoice with that id.");
  }

  async invoice(id: string): Promise<Invoice | null> {
    const rows = await this.db.query<Row>(
      `SELECT i.*, coalesce(l.total, 0) AS total, coalesce(a.allocated, 0) AS allocated
         FROM invoices i
         LEFT JOIN (SELECT invoice_id, sum(line_total) AS total
                      FROM invoice_lines GROUP BY invoice_id) l ON l.invoice_id = i.id
         LEFT JOIN (SELECT invoice_id, sum(amount) AS allocated
                      FROM payment_allocations GROUP BY invoice_id) a ON a.invoice_id = i.id
        WHERE i.id = $1`,
      [id],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    const lineRows = await this.db.query<Row>(
      "SELECT * FROM invoice_lines WHERE invoice_id = $1 ORDER BY position, id",
      [id],
    );
    const total = num(row.total);
    const allocated = Math.min(num(row.allocated), total);
    return {
      id: str(row.id),
      customerId: str(row.customer_id),
      reference: str(row.reference),
      saleId: strOrNull(row.sale_id),
      issuedOn: str(row.issued_on).slice(0, 10),
      notes: strOrNull(row.notes),
      cancelled: row.cancelled === true || row.cancelled === "t",
      total,
      allocated,
      outstanding: row.cancelled === true || row.cancelled === "t" ? 0 : total - allocated,
      lines: lineRows.map(toLine),
    };
  }

  /**
   * Everything on a customer's account: their invoices with what each still
   * owes, their payments with what each was put against, and the balance.
   */
  async statement(customerId: string): Promise<{
    invoices: Invoice[];
    payments: Payment[];
    balance: CustomerBalance;
  }> {
    const [invoices, payments, balance] = await Promise.all([
      this.invoices(customerId),
      this.payments(customerId),
      this.balance(customerId),
    ]);
    return { invoices, payments, balance };
  }

  async invoices(customerId: string): Promise<Invoice[]> {
    const rows = await this.db.query<Row>(
      `SELECT i.id, i.customer_id, i.reference, i.sale_id, i.issued_on, i.notes, i.cancelled,
              coalesce(l.total, 0) AS total, coalesce(a.allocated, 0) AS allocated
         FROM invoices i
         LEFT JOIN (SELECT invoice_id, sum(line_total) AS total
                      FROM invoice_lines GROUP BY invoice_id) l ON l.invoice_id = i.id
         LEFT JOIN (SELECT invoice_id, sum(amount) AS allocated
                      FROM payment_allocations GROUP BY invoice_id) a ON a.invoice_id = i.id
        WHERE i.customer_id = $1
        ORDER BY i.issued_on DESC, i.reference DESC`,
      [customerId],
    );
    const lineRows = await this.db.query<Row>(
      `SELECT l.* FROM invoice_lines l
         JOIN invoices i ON i.id = l.invoice_id
        WHERE i.customer_id = $1 ORDER BY l.position, l.id`,
      [customerId],
    );
    return rows.map((row) => {
      const total = num(row.total);
      const allocated = Math.min(num(row.allocated), total);
      const cancelled = row.cancelled === true || row.cancelled === "t";
      return {
        id: str(row.id),
        customerId: str(row.customer_id),
        reference: str(row.reference),
        saleId: strOrNull(row.sale_id),
        issuedOn: str(row.issued_on).slice(0, 10),
        notes: strOrNull(row.notes),
        cancelled,
        total,
        allocated,
        outstanding: cancelled ? 0 : total - allocated,
        lines: lineRows.filter((l) => str(l.invoice_id) === str(row.id)).map(toLine),
      };
    });
  }

  // ---------------------------------------------------------------- payments

  /**
   * Records money coming in and spreads it over the oldest unpaid invoices
   * first, the way a statement is meant to read. Anything left over stays on
   * the customer's account as credit.
   */
  async recordPayment(input: NewPaymentInput): Promise<Payment> {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BillingError("BAD_AMOUNT", "A payment has to be more than zero.");
    }
    const method = String(input.method ?? "").toUpperCase() as PaymentMethod;
    if (!PAYMENT_METHODS.includes(method)) {
      throw new BillingError(
        "BAD_METHOD",
        `Unknown payment method. Use one of: ${PAYMENT_METHODS.join(", ")}.`,
      );
    }

    const id = newId("pay");
    const receivedOn = dateOrToday(input.receivedOn);
    const reference = strOrNull(input.reference);
    const notes = strOrNull(input.notes);

    const allocations = await this.db.transaction<PaymentAllocation[]>(async (tx) => {
      const [made] = await tx.query<Row>(
        `INSERT INTO payments (id, customer_id, amount, method, reference, received_on, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [id, input.customerId, amount, method, reference, receivedOn, notes],
      );
      if (!made) throw new BillingError("NO_CUSTOMER", "That customer no longer exists.");

      const open = await tx.query<Row>(
        `SELECT i.id, i.reference,
                coalesce(sum(l.line_total), 0) - coalesce(sum(a.amount), 0) AS owed
           FROM invoices i
           LEFT JOIN invoice_lines l ON l.invoice_id = i.id
           LEFT JOIN payment_allocations a ON a.invoice_id = i.id
          WHERE i.customer_id = $1 AND NOT i.cancelled
          GROUP BY i.id, i.reference, i.issued_on
         HAVING coalesce(sum(l.line_total), 0) - coalesce(sum(a.amount), 0) > 0
          ORDER BY i.issued_on, i.reference`,
        [input.customerId],
      );

      const planned: PaymentAllocation[] = [];
      let left = cents(amount);
      for (const row of open) {
        if (left <= 0) break;
        const owed = cents(num(row.owed));
        const take = Math.min(left, owed);
        if (take <= 0) continue;
        planned.push({
          invoiceId: str(row.id),
          invoiceReference: str(row.reference),
          amount: take / 100,
        });
        left -= take;
      }

      for (const plan of planned) {
        await tx.query(
          `INSERT INTO payment_allocations (payment_id, invoice_id, amount)
           VALUES ($1, $2, $3)`,
          [id, plan.invoiceId, plan.amount],
        );
      }
      return planned;
    });

    return {
      id,
      customerId: input.customerId,
      amount,
      method,
      reference,
      receivedOn,
      notes,
      allocations,
    };
  }

  async payments(customerId: string): Promise<Payment[]> {
    const rows = await this.db.query<Row>(
      `SELECT * FROM payments WHERE customer_id = $1
        ORDER BY received_on DESC, created_at DESC`,
      [customerId],
    );
    if (rows.length === 0) return [];
    const ids = rows.map((r) => str(r.id));
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    const allocs = await this.db.query<Row>(
      `SELECT a.*, i.reference FROM payment_allocations a
         JOIN invoices i ON i.id = a.invoice_id
        WHERE a.payment_id IN (${placeholders})`,
      ids,
    );
    return rows.map((row) => ({
      id: str(row.id),
      customerId: str(row.customer_id),
      amount: num(row.amount),
      method: str(row.method) as PaymentMethod,
      reference: strOrNull(row.reference),
      receivedOn: str(row.received_on).slice(0, 10),
      notes: strOrNull(row.notes),
      allocations: allocs
        .filter((a) => str(a.payment_id) === str(row.id))
        .map((a) => ({
          invoiceId: str(a.invoice_id),
          invoiceReference: str(a.reference),
          amount: num(a.amount),
        })),
    }));
  }

  // ----------------------------------------------------------------- balance

  async balance(customerId: string): Promise<CustomerBalance> {
    const [row] = await this.db.query<Row>(
      `SELECT invoiced, paid, balance, invoice_count, payment_count
         FROM v_customer_balance WHERE id = $1`,
      [customerId],
    );
    if (!row) {
      return { invoiced: 0, paid: 0, balance: 0, invoiceCount: 0, paymentCount: 0 };
    }
    return {
      invoiced: num(row.invoiced),
      paid: num(row.paid),
      balance: num(row.balance),
      invoiceCount: num(row.invoice_count),
      paymentCount: num(row.payment_count),
    };
  }

  /** Balances for the customer list, keyed by customer id, in one query. */
  async balances(): Promise<Record<string, CustomerBalance>> {
    const rows = await this.db.query<Row>("SELECT * FROM v_customer_balance");
    const out: Record<string, CustomerBalance> = {};
    for (const row of rows) {
      out[str(row.id)] = {
        invoiced: num(row.invoiced),
        paid: num(row.paid),
        balance: num(row.balance),
        invoiceCount: num(row.invoice_count),
        paymentCount: num(row.payment_count),
      };
    }
    return out;
  }
}
