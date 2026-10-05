import {
  ChartIcon,
  CylinderIcon,
  GaugeIcon,
  ReceiptIcon,
  SlidersIcon,
  TruckIcon,
  UsersIcon,
} from "./icons";

/**
 * The navigation, in one place, used by both the desktop sidebar and the mobile
 * drawer so the two can never drift apart.
 */
export interface NavItem {
  label: string;
  icon: typeof GaugeIcon;
  href: string;
  /** Route not built yet — renders as a non-navigating item. */
  soon?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { label: "Dashboard", icon: GaugeIcon, href: "/" },
      { label: "Customers", icon: UsersIcon, href: "/customers" },
      { label: "Inventory", icon: CylinderIcon, href: "/inventory" },
      { label: "Record sale", icon: ReceiptIcon, href: "/sales/new", soon: true },
      { label: "Deliveries", icon: TruckIcon, href: "/deliveries", soon: true },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Reports", icon: ChartIcon, href: "/reports", soon: true },
      { label: "Team", icon: UsersIcon, href: "/team", soon: true },
    ],
  },
  {
    label: "Setup",
    items: [{ label: "Settings", icon: SlidersIcon, href: "/settings", soon: true }],
  },
];
