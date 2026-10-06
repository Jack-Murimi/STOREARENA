import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { CustomerCreateForm } from "@/components/customers/CustomerCreateForm";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import { Banner } from "@/components/customers/Form";
import { SavedToast } from "@/components/customers/SavedToast";
import { UsersIcon } from "@/components/icons";
import {
  ButtonLink,
  Card,
  DataTable,
  EmptyState,
  FilterBar,
  PageHeader,
  SearchInput,
  StatusBadge,
} from "@/components/ui";
import type { DataColumn } from "@/components/ui";
import { CustomerKind, formatKenyanPhone, type CustomerRecord } from "@/lib/customers";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";
import { formatKsh } from "@/lib/format";

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
  const saved = typeof params.saved === "string" ? params.saved : null;

  const { service, billing, mode, notice, diagnostic } = await getCustomerContext();

  if (!service) {
    return (
      <AppShell
        title="Customers"
        subtitle="Customer records"
        staff={currentStaff}
        branch={stationName}
        activeHref="/customers"
      >
        <DatabaseUnavailable notice={notice} diagnostic={diagnostic} />
      </AppShell>
    );
  }

  const customers = await service.list(query ? { search: query } : undefined);
  const balances = billing ? await billing.balances() : {};
  const activeCount = customers.filter((c) => c.active).length;

  const columns: DataColumn<CustomerRecord>[] = [
    {
      key: "customer",
      header: "Customer",
      priority: 1,
      cell: (customer) => (
        <span className="block min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium text-ink">{customer.name}</span>
            {customer.active ? null : <StatusBadge tone="critical">Inactive</StatusBadge>}
          </span>
          {/* The code is an identifier, so it is the one thing here in mono. */}
          <span className="code block truncate text-xs text-ink-subtle">
            {customer.code} ·{" "}
            {customer.kind === CustomerKind.Business ? "Business" : "Household"}
          </span>
        </span>
      ),
    },
    {
      key: "places",
      header: "Places",
      align: "right",
      num: true,
      cell: (customer) => {
        const primary =
          customer.locations.find((l) => l.isPrimary) ?? customer.locations[0];
        return (
          <span className="block">
            {customer.locations.length}
            <span className="block text-xs text-ink-subtle">
              {primary?.area ?? primary?.label ?? "—"}
            </span>
          </span>
        );
      },
    },
    {
      key: "contacts",
      header: "Contacts",
      priority: 2,
      /* One column instead of a count plus a separate "main number" column.
         The count on its own told you nothing you could act on. */
      cell: (customer) => {
        const ordered = [
          ...customer.contacts.filter((c) => c.isPrimary),
          ...customer.contacts.filter((c) => !c.isPrimary),
        ];
        const primary = ordered[0];
        if (!primary) return <span className="text-ink-subtle">—</span>;
        const rest = ordered.length - 1;
        return (
          <span className="block min-w-0">
            <span className="flex items-baseline gap-2">
              <span className="truncate text-sm text-ink">{primary.name}</span>
              {/* The only tappable number in the row. Two numbers in one row
                  means two targets close together on a phone, and dialling the
                  wrong one is worse than tapping twice. */}
              <a
                href={`tel:${primary.phone}`}
                className="num relative z-20 shrink-0 font-medium text-orange-700 hover:underline"
              >
                {formatKenyanPhone(primary.phone)}
              </a>
            </span>
            {primary.role || rest > 0 ? (
              <span className="block truncate text-xs text-ink-subtle">
                {[primary.role, rest > 0 ? `+${rest} more` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      num: true,
      priority: 3,
      /* Only money that is owed gets a chip. A screen full of red "Settled"
         badges makes the ones that matter invisible. */
      cell: (customer) => {
        const owed = balances[customer.id]?.balance ?? 0;
        if (owed > 0) {
          return (
            <StatusBadge tone="critical">
              {formatKsh(owed)} owed
            </StatusBadge>
          );
        }
        if (owed < 0) {
          return (
            <span className="text-sm text-ink-subtle">{formatKsh(Math.abs(owed))} credit</span>
          );
        }
        return <span className="text-ink-subtle">—</span>;
      },
    },
  ];

  return (
    <>
      <SavedToast
        key={saved ?? (justDeleted ? "deleted" : "none")}
        message={saved ?? (justDeleted ? "Customer deleted." : null)}
      />
      <AppShell
        title="Customers"
        subtitle={`${customers.length} of ${activeCount} active`}
        staff={currentStaff}
        branch={stationName}
        activeHref="/customers"
      >
        <PageHeader
          title="Customers"
          subtitle={`Households and businesses we deliver to${
            mode === "database" ? " · live Supabase data" : " · demo data"
          }`}
          action={
            <ButtonLink href={showNewForm ? "/customers" : "/customers?new=1"} variant="primary">
              {showNewForm ? "Close" : "New customer"}
            </ButtonLink>
          }
        />

        {notice ? <Banner tone="warn">{notice}</Banner> : null}
        {error ? <Banner tone="bad">{error}</Banner> : null}
        {justDeleted ? (
          <Banner tone="good">
            Customer deleted, with all of their locations and numbers.
          </Banner>
        ) : null}

        {showNewForm ? (
          <Card title="New customer">
            <CustomerCreateForm />
          </Card>
        ) : null}

        {/* One toolbar: search and the counts. The "Open" button that used to
            end every row is gone — the whole row is the link now. */}
        <FilterBar
          search={
            <form action="/customers" method="get" role="search">
              <SearchInput
                name="q"
                defaultValue={query}
                placeholder="Name, code, person or number"
                label="Search customers"
              />
            </form>
          }
          filters={
            <p className="num text-sm text-ink-subtle">
              {customers.length} shown
              {query ? ` for “${query}”` : ""} · {activeCount} active
            </p>
          }
        />

        <Card flush>
          <DataTable
            rows={customers}
            columns={columns}
            rowKey={(customer) => customer.id}
            rowHref={(customer) => `/customers/${customer.id}`}
            empty={
              <EmptyState
                icon={UsersIcon}
                title={query ? `No customer matches “${query}”` : "No customers yet"}
                description={
                  query
                    ? "Check the spelling, or search by code or phone number."
                    : "Add the first customer to start recording deliveries and balances."
                }
                action={
                  query ? (
                    <ButtonLink href="/customers">Clear the search</ButtonLink>
                  ) : (
                    <ButtonLink href="/customers?new=1" variant="primary">
                      New customer
                    </ButtonLink>
                  )
                }
              />
            }
          />
        </Card>
      </AppShell>
    </>
  );
}
