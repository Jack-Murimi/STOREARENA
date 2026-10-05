import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DatabaseUnavailable } from "@/components/customers/DatabaseUnavailable";
import { PinField } from "@/components/customers/PinField";
import {
  Banner,
  Checkbox,
  Field,
  SelectInput,
  SubmitButton,
  TextInput,
} from "@/components/customers/Form";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { Pill } from "@/components/dashboard/Panel";
import {
  CustomerKind,
  ROLE_SUGGESTIONS,
  UnknownCustomerError,
  formatKenyanPhone,
} from "@/lib/customers";
import { currentStaff, stationName } from "@/lib/data";
import { getCustomerContext } from "@/lib/db";
import { AccountPanel } from "@/components/customers/AccountPanel";
import { SavedToast } from "@/components/customers/SavedToast";
import {
  addContact,
  addLocation,
  deleteCustomer,
  removeContact,
  removeLocation,
  updateContact,
  updateCustomer,
  updateLocation,
} from "../actions";

export const metadata: Metadata = {
  title: "Customer",
};

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

  const { service, billing, notice, diagnostic } = await getCustomerContext();


  if (!service) {
    return (
      <div className="flex min-h-screen bg-canvas">
        <Sidebar staff={currentStaff} station={stationName} activeHref="/customers" />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            title="Customer"
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

  let customer;
  try {
    customer = await service.get(id);
  } catch (exception) {
    if (exception instanceof UnknownCustomerError) notFound();
    throw exception;
  }

  if (!customer) notFound();

  // One statement: the invoices, the payments and the balance between them.
  const statement = billing
    ? await billing.statement(customer.id)
    : {
        invoices: [],
        payments: [],
        balance: { invoiced: 0, paid: 0, balance: 0, invoiceCount: 0, paymentCount: 0 },
      };

  const roles = ["", ...ROLE_SUGGESTIONS];

  return (
    <>
      <SavedToast key={saved ?? error ?? "none"} message={saved ?? error} tone={error ? "bad" : "good"} />
      <div className="flex min-h-screen bg-canvas">
      <Sidebar staff={currentStaff} station={stationName} activeHref="/customers" />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title={customer.name}
          subtitle={`${customer.code} · ${
            customer.kind === CustomerKind.Business ? "Business" : "Household"
          } · ${customer.locations.length} place${
            customer.locations.length === 1 ? "" : "s"
          } · ${customer.contacts.length} number${
            customer.contacts.length === 1 ? "" : "s"
          }`}
          staff={currentStaff}
          activeHref="/customers"
        />

        <main className="flex-1 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/customers"
              className="text-[12.5px] font-medium text-ink-soft transition hover:text-ink"
            >
              ← All customers
            </Link>
            <div className="flex items-center gap-2">
              <Pill tone={customer.kind === CustomerKind.Business ? "info" : "neutral"}>
                {customer.kind === CustomerKind.Business ? "Business" : "Household"}
              </Pill>
              <Pill tone={customer.active ? "good" : "bad"}>
                {customer.active ? "Active" : "Inactive"}
              </Pill>
            </div>
          </div>

          {notice ? <Banner tone="warn">{notice}</Banner> : null}
          {error ? <Banner tone="bad">{error}</Banner> : null}
          {saved ? <Banner tone="good">{saved}.</Banner> : null}

          {/* ---------------------------------------------------- customer */}
          <section className="overflow-hidden rounded-xl border border-line bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-[14.5px] font-semibold tracking-tight text-ink">
                Customer details
              </h2>
              <p className="mt-0.5 text-[12.5px] text-ink-soft">
                Added {new Date(customer.createdAt).toLocaleDateString("en-KE")}
              </p>
            </div>
            <form action={updateCustomer} className="space-y-4 p-5">
              <input type="hidden" name="id" value={customer.id} />
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Customer name" className="sm:col-span-2">
                  <TextInput name="name" defaultValue={customer.name} required />
                </Field>
                <Field label="Type">
                  <SelectInput
                    name="kind"
                    defaultValue={customer.kind}
                    options={[CustomerKind.Household, CustomerKind.Business]}
                  />
                </Field>
              </div>
              <Field label="Notes" hint="Gate codes, delivery windows, standing orders.">
                <TextInput name="notes" defaultValue={customer.notes ?? ""} />
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Checkbox
                  name="active"
                  defaultChecked={customer.active}
                  label="Active customer"
                />
                <SubmitButton>Save changes</SubmitButton>
              </div>
            </form>
          </section>

          {/* --------------------------------------------------- locations */}
          <section className="overflow-hidden rounded-xl border border-line bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-[14.5px] font-semibold tracking-tight text-ink">
                Delivery places
              </h2>
              <p className="mt-0.5 text-[12.5px] text-ink-soft">
                One customer can have a main house, an annex and a shop.
              </p>
            </div>

            <ul className="divide-y divide-line">
              {customer.locations.map((location) => (
                <li key={location.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-semibold text-ink">
                          {location.label}
                        </span>
                        {location.isPrimary ? <Pill tone="good">Main</Pill> : null}
                        {location.active ? null : <Pill tone="bad">Inactive</Pill>}
                      </div>
                      <p className="mt-1 text-[12.5px] text-ink-soft">
                        {location.addressLine || "No address recorded"}
                      </p>
                      {location.details ? (
                        <p className="mt-0.5 text-[12.5px] text-ink-soft/85">
                          {location.details}
                        </p>
                      ) : null}
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-soft/75">
                        {[location.area, location.town].filter(Boolean).join(" · ")}
                        {location.pinLat !== null && location.pinLng !== null ? (
                          <a
                            className="font-medium text-info hover:underline"
                            target="_blank"
                            rel="noreferrer"
                            href={`https://www.google.com/maps?q=${location.pinLat},${location.pinLng}`}
                          >
                            Pinned · open map
                          </a>
                        ) : (
                          <span>No pin yet</span>
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <details className="rounded-lg ring-1 ring-line">
                        <summary className="cursor-pointer list-none rounded-lg bg-white px-3 py-1.5 text-[12px] font-semibold text-ink transition hover:bg-canvas">
                          Edit
                        </summary>
                        <form
                          action={updateLocation}
                          className="mt-3 grid w-[min(92vw,640px)] gap-3 rounded-lg border border-line bg-canvas p-4 sm:grid-cols-2"
                        >
                          <input type="hidden" name="customerId" value={customer.id} />
                          <input type="hidden" name="locationId" value={location.id} />
                          <Field label="Label">
                            <TextInput name="label" defaultValue={location.label} required />
                          </Field>
                          <Field label="Address">
                            <TextInput
                              name="addressLine"
                              defaultValue={location.addressLine ?? ""}
                              placeholder="house no 46 on Kinyajui road off Naivasha road"
                            />
                          </Field>
                          <Field
                            label="Additional details"
                            className="sm:col-span-2"
                            hint="The bit that gets you through the gate."
                          >
                            <TextInput
                              name="details"
                              defaultValue={location.details ?? ""}
                              placeholder="opposite Fryz Inn hotel"
                            />
                          </Field>
                          <Field label="Area">
                            <TextInput name="area" defaultValue={location.area ?? ""} />
                          </Field>
                          <Field label="Town">
                            <TextInput name="town" defaultValue={location.town ?? ""} />
                          </Field>
                          <div className="sm:col-span-2">
                            <span className="mb-1 block text-[11.5px] font-medium text-ink-soft">
                              Map pin
                            </span>
                            <PinField
                              latName="pinLat"
                              lngName="pinLng"
                              defaultLat={location.pinLat}
                              defaultLng={location.pinLng}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3 sm:col-span-2">
                            <Checkbox
                              name="isPrimary"
                              defaultChecked={location.isPrimary}
                              label="This is the main delivery place"
                            />
                            <div className="flex gap-2">
                              <SubmitButton tone="ghost">Save</SubmitButton>
                            </div>
                          </div>
                        </form>
                      </details>

                      <form action={removeLocation}>
                        <input type="hidden" name="customerId" value={customer.id} />
                        <input type="hidden" name="locationId" value={location.id} />
                        <SubmitButton tone="danger">Remove</SubmitButton>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <form
              action={addLocation}
              className="grid gap-4 border-t border-line bg-canvas/60 p-5 sm:grid-cols-3"
            >
              <input type="hidden" name="customerId" value={customer.id} />
              <Field label="Name for it">
                <TextInput name="label" placeholder="Annex" required />
              </Field>
              <Field
                label="Address"
                className="sm:col-span-2"
              >
                <TextInput
                  name="addressLine"
                  placeholder="house no 46 on Kinyajui road off Naivasha road"
                />
              </Field>
              <Field
                label="Additional details"
                className="sm:col-span-3"
                hint="Landmarks and gate instructions: opposite Fryz Inn hotel."
              >
                <TextInput name="details" placeholder="opposite Fryz Inn hotel" />
              </Field>
              <Field label="Area">
                <TextInput name="area" placeholder="Kangemi" />
              </Field>
              <Field label="Town">
                <TextInput name="town" placeholder="Nairobi" />
              </Field>
              <div className="flex items-end justify-end">
                <Checkbox name="isPrimary" label="Make this the main place" />
              </div>
              <div className="sm:col-span-2">
                <span className="mb-1 block text-[11.5px] font-medium text-ink-soft">
                  Map pin (optional)
                </span>
                <PinField latName="pinLat" lngName="pinLng" />
              </div>
              <div className="flex items-end justify-end">
                <SubmitButton>Add place</SubmitButton>
              </div>
            </form>
          </section>

          {/* ------------------------------------------------------------ contacts */}
          <section className="overflow-hidden rounded-xl border border-line bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="border-b border-line px-5 py-4">
              <h2 className="text-[14.5px] font-semibold tracking-tight text-ink">
                People to call
              </h2>
              <p className="mt-0.5 text-[12.5px] text-ink-soft">
                Every number says whose it is. The role is optional — wife, father,
                children, maid, caretaker.
              </p>
            </div>

            <ul className="divide-y divide-line">
              {customer.contacts.map((contact) => (
                <li key={contact.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-semibold text-ink">
                          {contact.name}
                        </span>
                        {contact.role ? <Pill tone="info">{contact.role}</Pill> : null}
                        {contact.isPrimary ? <Pill tone="good">Main</Pill> : null}
                      </div>
                      <p className="mt-1 font-mono text-[12.5px] text-ink-soft">
                        {formatKenyanPhone(contact.phone)}
                      </p>
                      {contact.notes ? (
                        <p className="mt-1 text-[12px] text-ink-soft/80">{contact.notes}</p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <details className="rounded-lg ring-1 ring-line">
                        <summary className="cursor-pointer list-none rounded-lg bg-white px-3 py-1.5 text-[12px] font-semibold text-ink transition hover:bg-canvas">
                          Edit
                        </summary>
                        <form
                          action={updateContact}
                          className="mt-3 grid w-[min(92vw,640px)] gap-3 rounded-lg border border-line bg-canvas p-4 sm:grid-cols-2"
                        >
                          <input type="hidden" name="customerId" value={customer.id} />
                          <input type="hidden" name="contactId" value={contact.id} />
                          <Field label="Name">
                            <TextInput name="name" defaultValue={contact.name} required />
                          </Field>
                          <Field label="Phone number">
                            <TextInput name="phone" defaultValue={contact.phone} required />
                          </Field>
                          <Field label="Role (optional)">
                            <SelectInput
                              name="role"
                              defaultValue={contact.role ?? ""}
                              options={roles}
                            />
                          </Field>
                          <Field label="Notes">
                            <TextInput name="notes" defaultValue={contact.notes ?? ""} />
                          </Field>
                          <div className="flex items-center justify-between gap-3 sm:col-span-2">
                            <Checkbox
                              name="isPrimary"
                              defaultChecked={contact.isPrimary}
                              label="This is the main number"
                            />
                            <SubmitButton tone="ghost">Save</SubmitButton>
                          </div>
                        </form>
                      </details>

                      <form action={removeContact}>
                        <input type="hidden" name="customerId" value={customer.id} />
                        <input type="hidden" name="contactId" value={contact.id} />
                        <SubmitButton tone="danger">Remove</SubmitButton>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <form
              action={addContact}
              className="grid gap-4 border-t border-line bg-canvas/60 p-5 sm:grid-cols-5"
            >
              <input type="hidden" name="customerId" value={customer.id} />
              <Field label="Name">
                <TextInput name="name" placeholder="Grace W." required />
              </Field>
              <Field label="Phone number">
                <TextInput name="phone" placeholder="0733 900 100" required />
              </Field>
              <Field label="Role (optional)">
                <SelectInput name="role" options={roles} />
              </Field>
              <Field label="Notes">
                <TextInput name="notes" placeholder="Answers during the day" />
              </Field>
              <div className="flex items-end justify-between gap-2">
                <Checkbox name="isPrimary" label="Make main" />
                <SubmitButton>Add person</SubmitButton>
              </div>
            </form>
          </section>

          {/* ------------------------------------------------------- danger */}
          <section className="space-y-3">
            <h2 className="text-[14.5px] font-semibold tracking-tight text-ink">
              Account — invoices and payments
            </h2>
            {billing ? (
              <AccountPanel
                customerId={customer.id}
                invoices={statement.invoices}
                payments={statement.payments}
                balance={statement.balance}
              />
            ) : (
              <p className="rounded-xl border border-line bg-card px-5 py-4 text-[13px] text-ink-soft">
                Billing is unavailable without a database connection.
              </p>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-bad/25 bg-bad-soft/40">
            <div className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <h2 className="text-[13.5px] font-semibold text-bad">
                  Delete this customer
                </h2>
                <p className="mt-0.5 text-[12.5px] text-ink-soft">
                  Removes {customer.locations.length} delivery place
                  {customer.locations.length === 1 ? "" : "s"} and{" "}
                  {customer.contacts.length} phone number
                  {customer.contacts.length === 1 ? "" : "s"}. Sales already
                  recorded are not touched.
                </p>
              </div>
              <form action={deleteCustomer}>
                <input type="hidden" name="id" value={customer.id} />
                <SubmitButton tone="danger">Delete customer</SubmitButton>
              </form>
            </div>
          </section>
        </main>
      </div>
    </div>
    </>
  );
}
