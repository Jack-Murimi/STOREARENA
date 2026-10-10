import { CashIcon, ChartIcon, CylinderIcon, GaugeIcon, ReceiptIcon, TruckIcon, UsersIcon } from "./icons";

/** Navigation data shared by sidebar and mobile tabs. `matchPrefix` prevents
 * descendants such as /sales/new and /sales/[id] from losing their active
 * state just because the navigation destination is the register. */
export interface NavItem {
  label: string;
  icon: typeof GaugeIcon;
  href: string;
  short: string;
  matchPrefix?: string;
}

export const navItems: NavItem[] = [
  { label: "Dashboard", short: "Home", icon: GaugeIcon, href: "/" },
  { label: "Inventory", short: "Stock", icon: CylinderIcon, href: "/inventory", matchPrefix: "/inventory" },
  { label: "Sales", short: "Sales", icon: CashIcon, href: "/sales", matchPrefix: "/sales" },
  { label: "Purchases", short: "Buy", icon: ReceiptIcon, href: "/purchases", matchPrefix: "/purchases" },
  { label: "Suppliers", short: "Suppliers", icon: TruckIcon, href: "/suppliers", matchPrefix: "/suppliers" },
  { label: "Payments", short: "Pay", icon: CashIcon, href: "/payments", matchPrefix: "/payments" },
  { label: "Reports", short: "Reports", icon: ChartIcon, href: "/reports", matchPrefix: "/reports" },
  { label: "Customers", short: "Customers", icon: UsersIcon, href: "/customers", matchPrefix: "/customers" },
  { label: "Riders", short: "Riders", icon: TruckIcon, href: "/riders", matchPrefix: "/riders" },
];

export function navItemIsActive(item: NavItem, path = "/"): boolean {
  if (item.href === "/") return path === "/";
  const prefix = item.matchPrefix ?? item.href;
  return path === prefix || path.startsWith(`${prefix}/`);
}

export const navGroups = [{ label: "Operations", items: navItems }];
