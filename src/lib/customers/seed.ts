import type { NewCustomerInput } from "./types";
import { CustomerKind } from "./types";
import type { CustomerRecord } from "./types";
import type { CustomerService } from "./service";

/**
 * A handful of customers that look like the real book: households with several
 * places and several people to call, plus a business account.
 */
export const SEED_CUSTOMER_INPUTS: NewCustomerInput[] = [
  {
    name: "Kathomi Household",
    kind: CustomerKind.Household,
    notes: "Gate code 4417. Call before 7am or after 5pm.",
    locations: [
      {
        label: "Main house",
        addressLine: "Plot 214, Syokimau Road",
        area: "Syokimau",
        town: "Machakos",
        isPrimary: true,
      },
      {
        label: "Annex",
        addressLine: "Plot 214B, behind the main house",
        area: "Syokimau",
        town: "Machakos",
      },
    ],
    contacts: [
      { phone: "0712 345 678", name: "Jane Kathomi", role: "Wife", isPrimary: true },
      { phone: "0722 111 222", name: "Peter Kathomi", role: "Husband" },
      { phone: "0733 900 100", name: "Grace W.", role: "Maid", notes: "Answers during the day" },
    ],
  },
  {
    name: "Mwangangi Family",
    kind: CustomerKind.Household,
    locations: [
      {
        label: "Home",
        addressLine: "House 12, Mlolongo Estate",
        area: "Mlolongo",
        town: "Machakos",
      },
    ],
    contacts: [
      { phone: "+254720456789", name: "Samuel Mwangangi", role: "Father", isPrimary: true },
      { phone: "0715 666 777", name: "Ruth Mwangangi", role: "Mother" },
      { phone: "0741 222 333", name: "Kevin Mwangangi", role: "Children" },
    ],
  },
  {
    name: "Kirimi Hotels Ltd",
    kind: CustomerKind.Business,
    notes: "Standing order: four 13 kg every Monday.",
    locations: [
      {
        label: "Kitchen",
        addressLine: "Kirimi Plaza, ground floor",
        area: "Kitengela",
        town: "Kajiado",
        isPrimary: true,
      },
      {
        label: "Branch — Syokimau",
        addressLine: "Syokimau Shopping Centre",
        area: "Syokimau",
        town: "Machakos",
      },
    ],
    contacts: [
      { phone: "0700 111 222", name: "Alice Kirimi", role: "Manager", isPrimary: true },
      { phone: "0711 333 444", name: "Daniel Otieno", role: "Caretaker" },
    ],
  },
];

/** Creates the seed customers through the service, so the rules apply. */
export async function seedCustomers(
  service: CustomerService,
): Promise<CustomerRecord[]> {
  const created: CustomerRecord[] = [];
  for (const input of SEED_CUSTOMER_INPUTS) {
    created.push(await service.create(input));
  }
  return created;
}
