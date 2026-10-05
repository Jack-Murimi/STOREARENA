import { PlusIcon, ReceiptIcon, TruckIcon } from "@/components/icons";

interface QuickAction {
  label: string;
  description: string;
  icon: typeof ReceiptIcon;
  emphasis: "primary" | "secondary";
}

const actions: QuickAction[] = [
  {
    label: "Record a sale",
    description: "Log a refill, new cylinder or delivery",
    icon: PlusIcon,
    emphasis: "primary",
  },
  {
    label: "Receive delivery",
    description: "Add depot stock and update cylinders",
    icon: TruckIcon,
    emphasis: "secondary",
  },
  {
    label: "End of day cash-up",
    description: "Reconcile M-Pesa, cash and card takings",
    icon: ReceiptIcon,
    emphasis: "secondary",
  },
];

/**
 * Shortcut buttons for the daily staff tasks. The target screens ship in the
 * next build, so they render disabled with an explanatory tooltip rather than
 * linking to routes that do not exist yet.
 */
export function QuickActions() {
  return (
    <ul className="space-y-2.5">
      {actions.map((action) => {
        const Icon = action.icon;
        const primary = action.emphasis === "primary";
        return (
          <li key={action.label}>
            <button
              type="button"
              disabled
              title="Arrives with the next build of this portal"
              className={`flex w-full cursor-not-allowed items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition ${
                primary
                  ? "border-flame-600/40 bg-flame-500 text-navy-950 shadow-[0_1px_2px_rgba(180,83,9,0.25)]"
                  : "border-line bg-white text-ink hover:border-ink-faint"
              }`}
            >
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                  primary ? "bg-navy-950/10 text-navy-950" : "bg-canvas text-navy-800"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold">{action.label}</span>
                <span
                  className={`mt-0.5 block truncate text-[12px] ${
                    primary ? "text-navy-950/70" : "text-ink-soft"
                  }`}
                >
                  {action.description}
                </span>
              </span>
              <span
                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
                  primary ? "bg-navy-950/12 text-navy-950" : "bg-canvas text-ink-faint"
                }`}
              >
                soon
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
