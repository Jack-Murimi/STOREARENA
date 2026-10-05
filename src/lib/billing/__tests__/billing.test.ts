import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgliteDatabase } from "../../customers/pglite";
import { CustomerKind, CustomerService } from "../../customers/index";
import { BillingService, BillingError } from "../service";

const CUSTOMER_DDL = readFileSync(
  new URL("../../customers/schema.sql", import.meta.url),
  "utf8",
);
const BILLING_DDL = readFileSync(new URL("../../customers/billing.sql", import.meta.url), "utf8");

let db: PGlite;
let customers: CustomerService;
let billing: BillingService;
let id: string;

async function makeCustomer(name = "Jamry Apartment") {
  const created = await customers.create({
    name,
    kind: CustomerKind.Business,
    locations: [{ label: "Main house", addressLine: "House no 46, Kinyajui road" }],
    contacts: [{ phone: "0715482059", name: "Sam K." }],
  });
  return created.id;
}

/** A typical order: two refills and an empty swap. */
const twoCylinders = [
  { description: "Afri Gas 13 kg refill", quantity: 2, unitPrice: 2400 },
  { description: "Delivery to Kinyajui road", quantity: 1, unitPrice: 200 },
];

beforeEach(async () => {
  db = new PGlite();
  await db.exec(CUSTOMER_DDL);
  await db.exec(BILLING_DDL);
  const adapter = pgliteDatabase(db);
  customers = new CustomerService(adapter);
  billing = new BillingService(adapter);
  id = await makeCustomer();
});

// PGlite is a WASM PostgreSQL; leaving instances open runs this box out of RAM.
afterEach(async () => {
  await db.close();
});

describe("raising an invoice", () => {
  it("numbers itself, totals its lines and starts fully outstanding", async () => {
    const invoice = await billing.raiseInvoice({ customerId: id, lines: twoCylinders });

    expect(invoice.reference).toBe("INV-0001");
    expect(invoice.total).toBe(5000);
    expect(invoice.outstanding).toBe(5000);
    expect(invoice.allocated).toBe(0);
    expect(invoice.lines).toHaveLength(2);
    expect(invoice.lines[1].lineTotal).toBe(200);

    const second = await billing.raiseInvoice({ customerId: id, lines: twoCylinders });
    expect(second.reference).toBe("INV-0002");
  });

  it("refuses an empty invoice, a zero quantity and a negative price", async () => {
    await expect(billing.raiseInvoice({ customerId: id, lines: [] })).rejects.toThrow(BillingError);
    await expect(
      billing.raiseInvoice({
        customerId: id,
        lines: [{ description: "Refill", quantity: 0, unitPrice: 100 }],
      }),
    ).rejects.toThrow(/more than zero/);
    await expect(
      billing.raiseInvoice({
        customerId: id,
        lines: [{ description: "Refill", quantity: 1, unitPrice: -5 }],
      }),
    ).rejects.toThrow(/cannot be negative/);
  });

  it("takes quantities and prices the way a form sends them, as text", async () => {
    const invoice = await billing.raiseInvoice({
      customerId: id,
      lines: [{ description: "Afri Gas 6 kg refill", quantity: "3", unitPrice: "1050.50" }],
    });
    expect(invoice.total).toBeCloseTo(3151.5);
  });

  it("drops out of the debt when it is cancelled", async () => {
    const invoice = await billing.raiseInvoice({ customerId: id, lines: twoCylinders });
    await billing.cancelInvoice(invoice.id);

    const balance = await billing.balance(id);
    expect(balance.invoiced).toBe(0);
    expect(balance.balance).toBe(0);
  });
});

describe("the balance", () => {
  it("is everything invoiced minus everything paid", async () => {
    await billing.raiseInvoice({ customerId: id, lines: twoCylinders }); // 5,000
    await billing.recordPayment({ customerId: id, amount: 2000, method: "MPESA" });

    const balance = await billing.balance(id);
    expect(balance.invoiced).toBe(5000);
    expect(balance.paid).toBe(2000);
    expect(balance.balance).toBe(3000);
    expect(balance.invoiceCount).toBe(1);
    expect(balance.paymentCount).toBe(1);
  });

  it("goes into credit when they pay more than they owe", async () => {
    await billing.raiseInvoice({ customerId: id, lines: twoCylinders }); // 5,000
    await billing.recordPayment({ customerId: id, amount: 6000, method: "CASH" });

    expect((await billing.balance(id)).balance).toBe(-1000);
  });

  it("starts at zero for a customer who has never been invoiced", async () => {
    expect(await billing.balance(id)).toEqual({
      invoiced: 0,
      paid: 0,
      balance: 0,
      invoiceCount: 0,
      paymentCount: 0,
    });
  });
});

describe("paying an invoice", () => {
  it("puts money against the oldest unpaid invoice first", async () => {
    const older = await billing.raiseInvoice({
      customerId: id,
      issuedOn: "2026-09-01",
      lines: [{ description: "September refill", quantity: 1, unitPrice: 1000 }],
    });
    const newer = await billing.raiseInvoice({
      customerId: id,
      issuedOn: "2026-10-01",
      lines: [{ description: "October refill", quantity: 1, unitPrice: 3000 }],
    });

    const payment = await billing.recordPayment({
      customerId: id,
      amount: 1500,
      method: "MPESA",
      reference: "SJK40QW71P",
    });

    expect(payment.allocations).toEqual([
      { invoiceId: older.id, invoiceReference: "INV-0001", amount: 1000 },
      { invoiceId: newer.id, invoiceReference: "INV-0002", amount: 500 },
    ]);

    const invoices = await billing.invoices(id);
    expect(invoices.find((i) => i.id === older.id)?.outstanding).toBe(0);
    expect(invoices.find((i) => i.id === newer.id)?.outstanding).toBe(2500);
  });

  it("leaves an over-payment on account rather than forcing it onto an invoice", async () => {
    await billing.raiseInvoice({
      customerId: id,
      lines: [{ description: "Refill", quantity: 1, unitPrice: 1000 }],
    });

    const payment = await billing.recordPayment({ customerId: id, amount: 1400, method: "CASH" });

    expect(payment.allocations).toHaveLength(1);
    expect(payment.allocations[0].amount).toBe(1000);
    expect((await billing.balance(id)).balance).toBe(-400);
  });

  it("never allocates more than an invoice totals, even if asked to", async () => {
    const invoice = await billing.raiseInvoice({
      customerId: id,
      lines: [{ description: "Refill", quantity: 1, unitPrice: 1000 }],
    });

    await expect(
      db.exec(
        `INSERT INTO payments (id, customer_id, amount, method)
         VALUES ('pay-x', '${id}', 9999, 'CASH');
         INSERT INTO payment_allocations (payment_id, invoice_id, amount)
         VALUES ('pay-x', '${invoice.id}', 9999);`,
      ),
    ).rejects.toThrow(/over-allocated/);
  });

  it("refuses a zero amount and a payment method we do not take", async () => {
    await expect(
      billing.recordPayment({ customerId: id, amount: 0, method: "CASH" }),
    ).rejects.toThrow(/more than zero/);
    await expect(
      billing.recordPayment({ customerId: id, amount: 500, method: "BITCOIN" }),
    ).rejects.toThrow(/Unknown payment method/);
  });

  it("takes all five methods, upper-casing what a form sends", async () => {
    for (const method of ["mpesa", "cash", "bank_transfer", "cheque", "card"]) {
      const payment = await billing.recordPayment({ customerId: id, amount: 100, method });
      expect(payment.method).toBe(method.toUpperCase());
    }
  });
});

describe("a statement", () => {
  it("gives the invoices, the payments and the balance together", async () => {
    await billing.raiseInvoice({ customerId: id, lines: twoCylinders });
    await billing.recordPayment({
      customerId: id,
      amount: 2000,
      method: "MPESA",
      reference: "SJK40QW71P",
    });

    const statement = await billing.statement(id);
    expect(statement.invoices).toHaveLength(1);
    expect(statement.payments).toHaveLength(1);
    expect(statement.payments[0].reference).toBe("SJK40QW71P");
    expect(statement.balance.balance).toBe(3000);
  });
});
