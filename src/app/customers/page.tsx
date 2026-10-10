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
} from "@/components/ui";
import type { DataColumn } from "@/components/ui";
import { formatKenyanPhone, type CustomerRecord } from "@/lib/customers";
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
      key: "customer-location",
      header: "Customer & location",
      priority: 1,
      cell: (customer) => {
        const location = customer.locations.find((entry) => entry.isPrimary) ?? customer.locations[0];
        const address = [location?.label, location?.addressLine].filter(Boolean).join(" · ");
        return (
          <span className="block min-w-0">
            <span className="block truncate font-medium text-ink">{customer.name}</span>
            {address ? <span className="block truncate text-sm text-ink-subtle">{address}</span> : null}
            {location?.details ? <span className="block truncate text-sm text-ink-subtle">{location.details}</span> : null}
          </span>
        );
      },
    },
    {
      key: "main-phone",
      header: "Main phone",
      priority: 2,
      cell: (customer) => {
        const contact = customer.contacts.find((entry) => entry.isPrimary) ?? customer.contacts[0];
        if (!contact) return <span className="text-ink-subtle">—</span>;
        return (
          <span className="block min-w-0">
            <span className="block truncate text-sm text-ink">{contact.name}</span>
            <a
              href={`tel:${contact.phone}`}
              className="num relative z-20 font-medium text-orange-700 hover:underline"
            >
              {formatKenyanPhone(contact.phone)}
            </a>
          </span>
        );
      },
    },
    {
      key: "balance",
      header: "Current balance",
      align: "right",
      num: true,
      priority: 3,
      cell: (customer) => <span className="num text-sm font-medium text-ink">{formatKsh(balances[customer.id]?.balance ?? 0)}</span>,
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
