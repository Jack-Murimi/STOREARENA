import { CashIcon, ChartIcon, CylinderIcon, GaugeIcon, ReceiptIcon, TruckIcon, UsersIcon } from "./icons";

/** One source of truth for desktop groups and the compact mobile navigation. */
export interface NavItem {
  label: string;
  icon: typeof GaugeIcon;
  href: string;
  short: string;
  matchPrefix?: string;
}
export interface NavGroup { label: string; items: NavItem[]; }

export const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", short: "Home", icon: GaugeIcon, href: "/" },
      { label: "Reports", short: "Reports", icon: ChartIcon, href: "/reports", matchPrefix: "/reports" },
    ],
  },
  {
    label: "Sales & customers",
    items: [
      { label: "Sales", short: "Sales", icon: CashIcon, href: "/sales", matchPrefix: "/sales" },
      { label: "Customers", short: "Customers", icon: UsersIcon, href: "/customers", matchPrefix: "/customers" },
      { label: "Payments", short: "Pay", icon: CashIcon, href: "/payments", matchPrefix: "/payments" },
      { label: "Riders", short: "Riders", icon: TruckIcon, href: "/riders", matchPrefix: "/riders" },
    ],
  },
  {
    label: "Stock & supply",
    items: [
      { label: "Inventory", short: "Stock", icon: CylinderIcon, href: "/inventory", matchPrefix: "/inventory" },
      { label: "Transfers", short: "Move", icon: TruckIcon, href: "/transfers", matchPrefix: "/transfers" },
      { label: "Purchases", short: "Buy", icon: ReceiptIcon, href: "/purchases", matchPrefix: "/purchases" },
      { label: "Suppliers", short: "Suppliers", icon: TruckIcon, href: "/suppliers", matchPrefix: "/suppliers" },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Users", short: "Users", icon: UsersIcon, href: "/users", matchPrefix: "/users" },
    ],
  },
];

export const navItems = navGroups.flatMap((group) => group.items);
/** Four everyday destinations; the More drawer exposes the remaining groups. */
export const mobileNavItems = [navGroups[0].items[0], navGroups[1].items[0], navGroups[2].items[0], navGroups[0].items[1]];
export const mobileMoreGroups: NavGroup[] = navGroups.map((group) => ({ ...group, items: group.items.filter((item) => !mobileNavItems.includes(item)) })).filter((group) => group.items.length > 0);

export function navItemIsActive(item: NavItem, path = "/"): boolean {
  if (item.href === "/") return path === "/";
  const prefix = item.matchPrefix ?? item.href;
  return path === prefix || path.startsWith(`${prefix}/`);
}
