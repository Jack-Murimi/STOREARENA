import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import { SavedToast } from "@/components/customers/SavedToast";
import { CustomerPageHeader } from "@/components/customers/CustomerPageHeader";
import { AccountStrip } from "@/components/customers/AccountStrip";
import { ActivityLedger } from "@/components/customers/ActivityLedger";
import { ContactCard } from "@/components/customers/ContactCard";
import { DeliveryPlacesCard } from "@/components/customers/DeliveryPlacesCard";
import { UnknownCustomerError } from "@/lib/customers";
import { currentStaff, stationName } from "@/lib/data";
import { canViewBilling, currentStaffAccess } from "@/lib/auth";
import { getCustomerContext } from "@/lib/db";

export const metadata: Metadata = { title: "Customer" };
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CustomerPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const error = typeof query.error === "string" ? query.error : null;
  const saved = typeof query.saved === "string" ? query.saved : null;

  const [{ service, billing, notice, diagnostic }, staffAccess] = await Promise.all([
    getCustomerContext(),
    currentStaffAccess(),
  ]);

  const showBilling =
    Boolean(billing) && staffAccess !== null && canViewBilling(staffAccess);

  if (!service) {
    return (
      <AppShell
        title="Customers"
        staff={currentStaff}
        branch={stationName}
        activeHref="/customers"
      >
        <DatabaseUnavailable notice={notice} diagnostic={diagnostic} />
      </AppShell>
    );
  }

  let customer;
  try {
    customer = await service.get(id);
  } catch (exception) {
    if (exception instanceof UnknownCustomerError) notFound();
    throw exception;
  }
  if (!customer) notFound();

  const statement =
    showBilling && billing
      ? await billing.statement(customer.id)
      : {
          invoices: [],
          payments: [],
          balance: { invoiced: 0, paid: 0, balance: 0, invoiceCount: 0, paymentCount: 0 },
        };

  return (
    <>
      <SavedToast
        key={saved ?? error ?? "none"}
        message={saved ?? error}
        tone={error ? "bad" : "good"}
      />
      <AppShell
        title="Customers"
        staff={currentStaff}
        branch={stationName}
        activeHref="/customers"
      >
        {notice ? (
          <div className="rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-xs leading-relaxed text-warn">
            {notice}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-lg border border-bad/25 bg-bad-soft px-4 py-3 text-xs leading-relaxed text-bad">
            {error}
          </div>
        ) : null}
        {saved ? (
          <div className="rounded-lg border border-good/25 bg-good-soft px-4 py-3 text-xs leading-relaxed text-good">
            {saved}
          </div>
        ) : null}

        <CustomerPageHeader
          customerId={customer.id}
          name={customer.name}
          code={customer.code}
          kind={customer.kind}
          active={customer.active}
          notes={customer.notes}
          showBilling={showBilling}
          currentName={customer.name}
          currentKind={customer.kind}
          currentNotes={customer.notes}
        />

        {/* Two-column layout: side cards first (mobile: above ledger), main second */}
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_340px] lg:gap-6">
          {/* Side column — first in DOM = top on mobile, right on desktop */}
          <aside className="flex flex-col gap-4 lg:order-2">
            <ContactCard
              customerId={customer.id}
              contacts={customer.contacts}
            />
            <DeliveryPlacesCard
              customerId={customer.id}
              locations={customer.locations}
            />
          </aside>

          {/* Main column — second in DOM = bottom on mobile, left on desktop */}
          <main className="flex min-w-0 flex-col gap-4 lg:order-1">
            <AccountStrip balance={statement.balance} showBilling={showBilling} />
            <ActivityLedger
              customerId={customer.id}
              invoices={statement.invoices}
              payments={statement.payments}
              showBilling={showBilling}
            />
          </main>
        </div>
      </AppShell>
    </>
  );
}
