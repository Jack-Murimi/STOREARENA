import type { CustomerBalance } from "@/lib/billing";

const ksh = (amount: number) =>
  `KSh ${amount.toLocaleString("en-KE")}`;

export function AccountStrip({
  balance,
  showBilling,
}: {
  balance: CustomerBalance;
  showBilling: boolean;
}) {
  if (!showBilling) return null;

  const owed = balance.balance;
  const balanceLabel =
    owed === 0 ? "Settled" : owed < 0 ? `In credit ${ksh(Math.abs(owed))}` : ksh(owed);
  const balanceColor =
    owed === 0
      ? "text-good font-semibold"
      : owed < 0
        ? "text-warn font-semibold"
        : "text-bad font-semibold";

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card shadow-card">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 text-sm">
        <span className="flex items-baseline gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">
            Invoiced
          </span>
          <span className="num font-semibold text-ink">{ksh(balance.invoiced)}</span>
          <span className="text-xs text-ink-soft/60">
            {balance.invoiceCount} invoice{balance.invoiceCount !== 1 ? "s" : ""}
          </span>
        </span>

        <span className="hidden text-ink-soft/40 sm:inline" aria-hidden>·</span>

        <span className="flex items-baseline gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">
            Paid
          </span>
          <span className="num font-semibold text-ink">{ksh(balance.paid)}</span>
          <span className="text-xs text-ink-soft/60">
            {balance.paymentCount} payment{balance.paymentCount !== 1 ? "s" : ""}
          </span>
        </span>

        <span className="hidden text-ink-soft/40 sm:inline" aria-hidden>·</span>

        <span className="flex items-baseline gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">
            Balance
          </span>
          <span className={`num ${balanceColor}`}>{balanceLabel}</span>
        </span>
      </div>
    </div>
  );
}
