import type { ReactNode } from "react";

/**
 * One table component for the whole app.
 *
 * It exists because every screen had grown its own: different row heights,
 * different header casing, some with an "Open" button per row, some without.
 * Rows are 44px, headers 36px, cells 13px, and nothing is smaller than 12px.
 *
 * Two rules worth knowing:
 *
 * 1. It is a server component. `cell` is a render function, which cannot cross
 *    the server/client boundary, so collapsible groups use <details> rather
 *    than state — which also means grouping works with JavaScript off.
 * 2. Under 768px the table becomes stacked cards showing the columns marked
 *    `priority` 1-3. The rest are reachable by opening the row.
 */
export interface DataColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  /** Tabular figures, for anything numeric. */
  num?: boolean;
  /** 1-3: shown in the mobile card, in this order. */
  priority?: 1 | 2 | 3;
  cell: (row: T) => ReactNode;
}

export interface DataGroup<T> {
  key: string;
  label: string;
  /** Small print beside the label, e.g. "12 products". */
  meta?: string;
  subtotal?: string;
  rows: T[];
}

interface Shared<T> {
  columns: DataColumn<T>[];
  rowKey: (row: T) => string;
  /** Makes the whole row a link, so no per-row "Open" button is needed. */
  rowHref?: (row: T) => string;
  /** Rendered when there is nothing to show. */
  empty?: ReactNode;
  caption?: string;
}

function Head<T>({ columns }: { columns: DataColumn<T>[] }) {
  return (
    <thead>
      <tr className="h-[var(--row-table-head)] border-b border-border text-left">
        {columns.map((column) => (
          <th
            key={column.key}
            scope="col"
            className={`px-3 text-xs font-semibold tracking-wide text-ink-subtle uppercase first:pl-4 last:pr-4 ${
              column.align === "right" ? "text-right" : ""
            }`}
          >
            {column.header}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function Body<T>({
  rows,
  columns,
  rowKey,
  rowHref,
}: {
  rows: T[];
  columns: DataColumn<T>[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
}) {
  return (
    <tbody>
      {rows.map((row) => {
        const href = rowHref?.(row);
        return (
          <tr
            key={rowKey(row)}
            className="relative h-[var(--row-table)] border-b border-border last:border-0 hover:bg-surface-sunken"
          >
            {columns.map((column, index) => (
              <td
                key={column.key}
                className={`px-3 text-sm text-ink first:pl-4 last:pr-4 ${
                  column.align === "right" ? "text-right" : ""
                } ${column.num ? "num" : ""}`}
              >
                {/* The link covers the row; it lives in the first cell so the
                    markup stays a valid table. */}
                {href && index === 0 ? (
                  <a
                    href={href}
                    className="absolute inset-0 z-10"
                    aria-label={`Open ${rowKey(row)}`}
                  >
                    <span className="sr-only">Open</span>
                  </a>
                ) : null}
                {column.cell(row)}
              </td>
            ))}
          </tr>
        );
      })}
    </tbody>
  );
}

/** The stacked-card form shown under 768px. */
function Cards<T>({
  rows,
  columns,
  rowKey,
  rowHref,
}: {
  rows: T[];
  columns: DataColumn<T>[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
}) {
  const primary = columns.filter((c) => c.priority);
  const rest = columns.filter((c) => !c.priority);

  return (
    <ul className="divide-line divide-y md:hidden">
      {rows.map((row) => {
        const href = rowHref?.(row);
        return (
          <li key={rowKey(row)}>
            {/* A div with a stretched overlay link, not an <a> wrapping the
                card: cells may hold their own links (a phone number, say) and
                nesting anchors is invalid, so the browser discards one. */}
            <div className="relative block px-4 py-3 hover:bg-surface-sunken">
              {href ? (
                <a
                  href={href}
                  className="absolute inset-0 z-10"
                  aria-label={`Open ${rowKey(row)}`}
                >
                  <span className="sr-only">Open</span>
                </a>
              ) : null}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                {primary.map((column) => (
                  <div
                    key={column.key}
                    className={column.priority === 1 ? "col-span-2" : ""}
                  >
                    <dt className="text-xs text-ink-subtle">{column.header}</dt>
                    <dd
                      className={`text-sm text-ink ${column.num ? "num" : ""} ${
                        column.priority === 1 ? "font-semibold" : ""
                      }`}
                    >
                      {column.cell(row)}
                    </dd>
                  </div>
                ))}
              </dl>
              {rest.length > 0 ? (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs font-medium text-orange-700">
                    More
                  </summary>
                  <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                    {rest.map((column) => (
                      <div key={column.key}>
                        <dt className="text-xs text-ink-subtle">{column.header}</dt>
                        <dd className={`text-sm text-ink ${column.num ? "num" : ""}`}>
                          {column.cell(row)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Table<T>({
  rows,
  columns,
  rowKey,
  rowHref,
  caption,
}: {
  rows: T[];
  columns: DataColumn<T>[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  caption?: string;
}) {
  return (
    <>
      <div className="hidden md:block">
        <table className="w-full border-collapse">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <Head columns={columns} />
          <Body rows={rows} columns={columns} rowKey={rowKey} rowHref={rowHref} />
        </table>
      </div>
      <Cards rows={rows} columns={columns} rowKey={rowKey} rowHref={rowHref} />
    </>
  );
}

export function DataTable<T>(props: Shared<T> & { rows?: T[]; groups?: DataGroup<T>[] }) {
  const { columns, rowKey, rowHref, empty, caption } = props;
  const rows = props.rows ?? [];
  const groups = props.groups;

  const total = groups ? groups.reduce((sum, g) => sum + g.rows.length, 0) : rows.length;
  if (total === 0) return <>{empty}</>;

  if (!groups) {
    return (
      <Table
        rows={rows}
        columns={columns}
        rowKey={rowKey}
        rowHref={rowHref}
        caption={caption}
      />
    );
  }

  return (
    <div className="divide-line divide-y">
      {groups.map((group) => (
        <details key={group.key} open className="group">
          <summary className="flex h-[var(--row-table-head)] cursor-pointer list-none items-center gap-2 bg-surface-muted px-4 text-sm font-semibold text-ink marker:content-none hover:bg-border/60">
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3 w-3 shrink-0 transition-transform duration-150 group-open:rotate-90"
              aria-hidden="true"
            >
              <path d="M6 3l5 5-5 5" />
            </svg>
            <span className="flex-1">{group.label}</span>
            {group.meta ? (
              <span className="text-xs font-normal text-ink-subtle">{group.meta}</span>
            ) : null}
            {group.subtotal ? (
              <span className="num text-xs font-semibold text-ink-muted">
                {group.subtotal}
              </span>
            ) : null}
          </summary>
          <Table
            rows={group.rows}
            columns={columns}
            rowKey={rowKey}
            rowHref={rowHref}
            caption={`${group.label} — ${caption ?? ""}`}
          />
        </details>
      ))}
    </div>
  );
}
