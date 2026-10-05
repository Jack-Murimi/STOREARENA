import { recordPayment } from "@/app/customers/actions";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/billing";
import type { CustomerBalance, Invoice, Payment } from "@/lib/billing";
import { SubmitButton } from "./SubmitButton";
import { InvoiceForm } from "./InvoiceForm";

const ksh = (amount: number) => `KSh ${amount.toLocaleString("en-KE")}`;

function statusOf(invoice: Invoice): { label: string; tone: string } {
  if (invoice.cancelled) return { label: "Cancelled", tone: "text-ink-soft bg-canvas" };
  if (invoice.outstanding <= 0) return { label: "Settled", tone: "text-good bg-good-soft" };
  if (invoice.allocated > 0) return { label: "Part-paid", tone: "text-warn bg-warn-soft" };
  return { label: "Open", tone: "text-bad bg-bad-soft" };
}

/**
 * What this customer owes, what they have paid, and the trail behind both.
 *
 * Credit is normal here, so the balance is a fact to know rather than a reason
 * to refuse an order.
 */
export function AccountPanel({
  customerId,
  invoices,
  payments,
  balance,
}: {
  customerId: string;
  invoices: Invoice[];
  payments: Payment[];
  balance: CustomerBalance;
}) {
  const owed = balance.balance;

  return (
    <section className="space-y-5">
      {/* ---- the balance, big enough to settle an argument ---- */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Invoiced", value: ksh(balance.invoiced), hint: `${balance.invoiceCount} invoice(s)` },
          { label: "Paid", value: ksh(balance.paid), hint: `${balance.paymentCount} payment(s)` },
          {
            label: owed > 0 ? "Owes you" : owed < 0 ? "In credit" : "Balance",
            value: owed === 0 ? "Settled" : ksh(Math.abs(owed)),
            hint: owed > 0 ? "outstanding" : owed < 0 ? "on account" : "nothing outstanding",
            tone: owed > 0 ? "text-bad" : owed < 0 ? "text-good" : "text-ink",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-line bg-card px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
          >
            <div className="text-[11px] uppercase tracking-[0.08em] text-ink-soft">
              {card.label}
            </div>
            <div className={`mt-1 text-[19px] font-semibold tabular-nums ${card.tone ?? "text-ink"}`}>
              {card.value}
            </div>
            <div className="text-[11.5px] text-ink-soft/80">{card.hint}</div>
          </div>
        ))}
      </div>

      {/* ---- invoices ---- */}
      <div className="overflow-hidden rounded-xl border border-line bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
          <h2 className="text-[14.5px] font-semibold tracking-tight text-ink">Invoices</h2>
          <InvoiceForm customerId={customerId} />
        </div>

        {invoices.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-ink-soft">
            Nothing invoiced yet. Raise an invoice when gas goes out — or let a recorded sale
            raise one automatically.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-[0.08em] text-ink-soft">
                  <th className="px-5 py-2.5 font-semibold">Invoice</th>
                  <th className="px-3 py-2.5 font-semibold">Issued</th>
                  <th className="px-3 py-2.5 font-semibold">Items</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Total</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Paid</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {invoices.map((invoice) => {
                  const status = statusOf(invoice);
                  return (
                    <tr key={invoice.id} className="text-[13px] hover:bg-canvas/60">
                      <td className="px-5 py-3">
                        <span className="font-mono text-[12px] text-ink-soft">
                          {invoice.reference}
                        </span>
                        <span
                          className={`ml-2 rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${status.tone}`}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-ink-soft">{invoice.issuedOn}</td>
                      <td className="px-3 py-3 text-ink-soft">
                        {invoice.lines
                          .map((line) => `${line.quantity} × ${line.description}`)
                          .join(", ")}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{ksh(invoice.total)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-ink-soft">
                        {ksh(invoice.allocated)}
                      </td>
                      <td
                        className={`px-5 py-3 text-right font-semibold tabular-nums ${
                          invoice.outstanding > 0 ? "text-bad" : "text-good"
                        }`}
                      >
                        {ksh(invoice.outstanding)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- payments ---- */}
      <div className="overflow-hidden rounded-xl border border-line bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="border-b border-line px-5 py-3">
          <h2 className="text-[14.5px] font-semibold tracking-tight text-ink">Payments</h2>
        </div>

        <form action={recordPayment} className="grid gap-2 border-b border-line px-5 py-4 sm:grid-cols-[130px_1fr_150px_150px_auto]">
          <input type="hidden" name="customerId" value={customerId} />
          <input
            name="amount"
            inputMode="decimal"
            required
            placeholder="Amount"
            className="rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-flame-500"
          />
          <input
            name="reference"
            placeholder="M-Pesa code / cheque no."
            className="rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-flame-500"
          />
          <select
            name="method"
            defaultValue="MPESA"
            className="rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-flame-500"
          >
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {PAYMENT_METHOD_LABELS[method]}
              </option>
            ))}
          </select>
          <input
            type="date"
            name="receivedOn"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-flame-500"
          />
          <SubmitButton pendingLabel="Saving…">Record payment</SubmitButton>
        </form>

        {payments.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-ink-soft">
            No payments recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-[0.08em] text-ink-soft">
                  <th className="px-5 py-2.5 font-semibold">Date</th>
                  <th className="px-3 py-2.5 font-semibold">Method</th>
                  <th className="px-3 py-2.5 font-semibold">Reference</th>
                  <th className="px-3 py-2.5 font-semibold">Put against</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {payments.map((payment) => (
                  <tr key={payment.id} className="text-[13px] hover:bg-canvas/60">
                    <td className="px-5 py-3 text-ink-soft">{payment.receivedOn}</td>
                    <td className="px-3 py-3">{PAYMENT_METHOD_LABELS[payment.method]}</td>
                    <td className="px-3 py-3 font-mono text-[12px] text-ink-soft">
                      {payment.reference ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-ink-soft">
                      {payment.allocations.length === 0
                        ? "On account"
                        : payment.allocations
                            .map((a) => `${a.invoiceReference} (${ksh(a.amount)})`)
                            .join(", ")}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums text-good">
                      {ksh(payment.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
