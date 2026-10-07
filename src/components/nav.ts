import { CashIcon, CylinderIcon, GaugeIcon, ReceiptIcon, TruckIcon, UsersIcon } from "./icons";

/**
 * The navigation, in one place, used by the sidebar and the mobile tab bar so
 * the two cannot drift apart.
 *
 * Only screens that exist are listed. Unbuilt ones were removed rather than
 * shown greyed out with a "soon" badge — a control that does nothing teaches
 * people to distrust the ones that work. They are recorded in the redesign
 * report so they can come back when they ship.
 */
export interface NavItem {
  label: string;
  icon: typeof GaugeIcon;
  href: string;
  /** Short label for the mobile tab bar. */
  short: string;
}

export const navItems: NavItem[] = [
  { label: "Dashboard", short: "Home", icon: GaugeIcon, href: "/" },
  { label: "Inventory", short: "Stock", icon: CylinderIcon, href: "/inventory" },
  { label: "Purchases", short: "Buy", icon: ReceiptIcon, href: "/purchases" },
  { label: "Suppliers", short: "Suppliers", icon: TruckIcon, href: "/suppliers" },
  { label: "Payments", short: "Pay", icon: CashIcon, href: "/payments" },
  { label: "Customers", short: "Customers", icon: UsersIcon, href: "/customers" },
];

/** Kept for callers that still expect the old grouped shape. */
export const navGroups = [{ label: "Operations", items: navItems }];
