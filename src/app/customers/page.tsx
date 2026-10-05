import type { Metadata } from "next";
import Link from "next/link";
import { CustomerCreateForm } from "@/components/customers/CustomerCreateForm";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import { Banner } from "@/components/customers/Form";
import { SubmitButton } from "@/components/customers/SubmitButton";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { Pill } from "@/components/dashboard/Panel";
import { CustomerKind, formatKenyanPhone } from "@/lib/customers";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";

export const metadata: Metadata = {
  title: "Customers",
};

/** Customer data lives in a database, never in the prerendered HTML. */
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CustomersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const showNewForm = params.new === "1";
  const error = typeof params.error === "string" ? params.error : null;
  const justDeleted = params.deleted === "1";

  const { service, mode, notice, diagnostic } = await getCustomerContext();

  if (!service) {
    return (
      <div className="flex min-h-screen bg-canvas">
        <Sidebar staff={currentStaff} station={stationName} activeHref="/customers" />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            title="Customers"
            subtitle="Customer records"
            staff={currentStaff}
            activeHref="/customers"
          />
          <main className="flex-1 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
            <DatabaseUnavailable notice={notice} diagnostic={diagnostic} />
          </main>
        </div>
      </div>
    );
  }

  const customers = await service.list({
    includeInactive: true,
    search: query || undefined,
  });

  const activeCount = customers.filter((c) => c.active).length;

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar staff={currentStaff} station={stationName} activeHref="/customers" />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title="Customers"
          subtitle="Households and businesses we deliver to, with every place and every person to call"
          staff={currentStaff}
          activeHref="/customers"
        />

        <main className="flex-1 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
          {notice ? <Banner tone="warn">{notice}</Banner> : null}
          {error ? <Banner tone="bad">{error}</Banner> : null}
          {justDeleted ? (
            <Banner tone="good">Customer deleted, with all of their locations and numbers.</Banner>
          ) : null}

          <section className="overflow-hidden rounded-xl border border-line bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <h1 className="text-[15px] font-semibold tracking-tight text-ink">
                  Customer directory
                </h1>
                <p className="mt-0.5 text-[12.5px] text-ink-soft">
                  {customers.length} of {activeCount} active
                  {mode === "database" ? " · live Supabase data" : " · demo data"}
                </p>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <form className="flex items-end gap-2" action="/customers" method="get">
                  <input
                    className="w-56 rounded-lg border border-line bg-white px-3 py-2 text-[13px] text-ink outline-none transition placeholder:text-ink-soft/50 focus:border-flame-400 focus:ring-2 focus:ring-flame-400/20"
                    type="search"
                    name="q"
                    defaultValue={query}
                    placeholder="Name, code, person or number"
                  />
                  <SubmitButton tone="ghost">Search</SubmitButton>
                </form>
                <Link
                  href={showNewForm ? "/customers" : "/customers?new=1"}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-flame-500 px-3 py-2 text-[12.5px] font-semibold text-white ring-1 ring-flame-600/20 transition hover:bg-flame-600"
                >
                  {showNewForm ? "Close" : "New customer"}
                </Link>
              </div>
            </div>

            {showNewForm ? (
              <div className="border-b border-line bg-canvas/60 px-5 py-5">
                <CustomerCreateForm />
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="border-b border-line text-[11px] uppercase tracking-[0.08em] text-ink-soft">
                    <th className="px-5 py-3 font-semibold">Code</th>
                    <th className="px-3 py-3 font-semibold">Customer</th>
                    <th className="px-3 py-3 font-semibold">Places</th>
                    <th className="px-3 py-3 font-semibold">People to call</th>
                    <th className="px-3 py-3 font-semibold">Main number</th>
                    <th className="px-5 py-3 text-right font-semibold"> </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {customers.map((customer) => {
                    const primaryLocation =
                      customer.locations.find((l) => l.isPrimary) ??
                      customer.locations[0];
                    const primaryContact =
                      customer.contacts.find((c) => c.isPrimary) ??
                      customer.contacts[0];

                    return (
                      <tr key={customer.id} className="text-[13px] hover:bg-canvas/60">
                        <td className="px-5 py-3 font-mono text-[12px] text-ink-soft">
                          {customer.code}
                        </td>
                        <td className="px-3 py-3">
                          <Link
                            href={`/customers/${customer.id}`}
                            className="font-medium text-ink hover:text-flame-600"
                          >
                            {customer.name}
                          </Link>
                          <div className="mt-0.5 flex items-center gap-2">
                            <Pill
                              tone={
                                customer.kind === CustomerKind.Business
                                  ? "info"
                                  : "neutral"
                              }
                            >
                              {customer.kind === CustomerKind.Business
                                ? "Business"
                                : "Household"}
                            </Pill>
                            {customer.active ? null : <Pill tone="bad">Inactive</Pill>}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-ink-soft">
                          {customer.locations.length}
                          <span className="block text-[11.5px] text-ink-soft/80">
                            {primaryLocation?.area ?? primaryLocation?.label ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-ink-soft">
                          {customer.contacts.length}
                        </td>
                        <td className="px-3 py-3">
                          <span className="font-medium text-ink">
                            {primaryContact ? formatKenyanPhone(primaryContact.phone) : "—"}
                          </span>
                          <span className="block text-[11.5px] text-ink-soft/80">
                            {primaryContact
                              ? [primaryContact.name, primaryContact.role]
                                  .filter(Boolean)
                                  .join(" · ")
                              : ""}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Link
                            href={`/customers/${customer.id}`}
                            className="inline-flex items-center rounded-lg bg-white px-3 py-1.5 text-[12px] font-semibold text-ink ring-1 ring-line transition hover:bg-canvas"
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })}

                  {customers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-[13px] text-ink-soft">
                        {query
                          ? `No customer matches “${query}”.`
                          : "No customers yet — add the first one."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
