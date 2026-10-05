import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

function Icon({ className = "h-5 w-5", children, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {children}
    </svg>
  );
}

export function GaugeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 18a9 9 0 1 1 17 0" />
      <path d="m12 14 3.8-3.4" />
      <circle cx="12" cy="15" r="1.4" />
    </Icon>
  );
}

export function CylinderIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8.5 6.5h7v12a2.5 2.5 0 0 1-2.5 2.5h-2A2.5 2.5 0 0 1 8.5 18.5z" />
      <path d="M10 6.5V4.8c0-.6.5-1.1 1.1-1.1h1.8c.6 0 1.1.5 1.1 1.1v1.7" />
      <path d="M8.5 11h7" />
    </Icon>
  );
}

export function ReceiptIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12.5h6" />
    </Icon>
  );
}

export function TruckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 7h10.5v9H3z" />
      <path d="M13.5 10.5H17l3.5 3V16h-7" />
      <circle cx="7" cy="18.2" r="1.8" />
      <circle cx="16.8" cy="18.2" r="1.8" />
    </Icon>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 20h17" />
      <path d="M6.5 20v-6M11.5 20V6.5M16.5 20v-8.5" />
    </Icon>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 19.5v-1.2A3.8 3.8 0 0 1 6.8 14.5h2.4a3.8 3.8 0 0 1 3.8 3.8v1.2" />
      <path d="M9 4.4a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4z" />
      <path d="M17 19.5v-1.2a3.8 3.8 0 0 0-2.6-3.6" />
      <path d="M15.6 4.9a3.2 3.2 0 0 1 0 6.2" />
    </Icon>
  );
}

export function SlidersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7.5h9M18.5 7.5H20M4 16.5h3M12.5 16.5H20" />
      <circle cx="15.5" cy="7.5" r="2.2" />
      <circle cx="9.5" cy="16.5" r="2.2" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </Icon>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 15.5V10.4a6 6 0 1 0-12 0v5.1L4 18.5h16z" />
      <path d="M10 21.3h4" />
    </Icon>
  );
}

export function FlameIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 2.8c.7 2.6 2.4 3.7 3.8 5.6a6.6 6.6 0 0 1 1.4 4.1 5.2 5.2 0 1 1-10.4 0c0-1.7.6-3.2 1.8-4.4.2 1.5 1.1 2.3 2.1 2.6-.2-3.6 1-6.2 1.3-7.9z" />
    </Icon>
  );
}

export function TrendUpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 16.5 9.5 10l4 4 7-7.5" />
      <path d="M15 6.5h5.5V12" />
    </Icon>
  );
}

export function TrendDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 7.5 9.5 14l4-4 7 7.5" />
      <path d="M15 17.5h5.5V12" />
    </Icon>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4.3 21 19.5H3z" />
      <path d="M12 10v3.6M12 16.6h.01" />
    </Icon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </Icon>
  );
}

export function CashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.8" y="6.5" width="18.4" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 10v4M18 10v4" />
    </Icon>
  );
}

export function CardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.8" y="5.5" width="18.4" height="13" rx="2" />
      <path d="M2.8 10h18.4" />
    </Icon>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="6.5" y="2.8" width="11" height="18.4" rx="2.4" />
      <path d="M10.5 5.8h3" />
      <path d="M12 18h.01" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </Icon>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4v10.5" />
      <path d="m7.8 10.5 4.2 4.2 4.2-4.2" />
      <path d="M4.5 19.5h15" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12.8 4.4 4.2L19 7" />
    </Icon>
  );
}

export function SparklineIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 17.5 8 11l3.5 3.2 4-6 4.5 9.3" />
    </Icon>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  );
}

/** Small inline badge label, used for nav items that are not built yet. */
export function SoonBadge({ className }: { className?: string }) {
  const content: ReactNode = (
    <span
      className={
        className ??
        "rounded-full border border-current/25 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide opacity-70"
      }
    >
      soon
    </span>
  );
  return content;
}
