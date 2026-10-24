import { getCustomerContext } from "@/lib/db";
import { canViewBilling, currentStaffAccess } from "@/lib/auth";
import { csvDocument, isoDate } from "@/lib/reports/csv";

export const dynamic = "force-dynamic";

const reportIds = new Set(["sales", "customers", "inventory", "purchases", "deliveries"]);

function nairobiToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());
}

function nairobiDaysAgo(days: number): string {
  const start = new Date();
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(
    new Date(start.getTime() - days * 24 * 60 * 60 * 1000),
  );
}

/** A runaway export is a denial-of-service on the database, not a feature. */
const MAX_ROWS = 20_000;

export async function GET(request: Request): Promise<Response> {
  const staff = await currentStaffAccess();
  if (!staff) {
    return new Response("Sign in is required.", { status: 401 });
  }
  if (staff.role === "rider") {
    return new Response("Rider accounts cannot export reports.", { status: 403 });
  }

  const url = new URL(request.url);
  const requested = url.searchParams.get("report") ?? "sales";
  const report = reportIds.has(requested) ? requested : "sales";

  // Customer balances and supplier spend are management data. Before this
  // check, an attendant could download the whole company's debtors by typing
  // the URL, even though the report screen did not show the tab.
  if ((report === "customers" || report === "purchases") && !canViewBilling(staff)) {
    return new Response("This report is restricted to managers.", { status: 403 });
  }

  const branch = url.searchParams.get("branch") ?? "";
  const from = isoDate(url.searchParams.get("from"), nairobiDaysAgo(6));
  const to = isoDate(url.searchParams.get("to"), nairobiToday());
  const customer = url.searchParams.get("customer") ?? "";
  const rider = url.searchParams.get("rider") ?? "";
  const type = url.searchParams.get("type") ?? "";
  const payment = url.searchParams.get("payment") ?? "";
  const status = url.searchParams.get("status") ?? "posted";
  const lookup = url.searchParams.get("q") ?? "";

  const { products } = await getCustomerContext();
  if (!products) return new Response("Reports database is unavailable.", { status: 503 });

  let heading: string[];
  // The query's alias for each heading, in the same order. Reading
  // `Object.keys(rows[0])` produced columns that no longer lined up with the
  // header whenever a SELECT gained or lost a column.
  let fields: string[];
  let rows: Record<string, unknown>[];
  try {
    if (report === "customers") {
      heading = ["Customer", "Code", "Invoiced", "Paid", "Balance"];
      fields = ["name", "code", "invoiced", "paid", "balance"];
      rows = await products.db.query<Record<string, unknown>>(
        "select c.name, c.code, coalesce(v.invoiced, 0) invoiced, coalesce(v.paid, 0) paid, coalesce(v.balance, 0) balance from customers c left join v_customer_balance v on v.id = c.id order by balance desc, c.name limit $1",
        [MAX_ROWS],
      );
    } else if (report === "inventory") {
      heading = ["Branch", "Product", "Brand", "Size kg", "Refills", "Empties"];
      fields = ["branch", "product", "brand", "size_kg", "refills", "empties"];
      rows = await products.db.query<Record<string, unknown>>(
        `select l.name branch, pv.name product, b.name brand, pv.size_kg,
                coalesce(sum(p.quantity) filter (where p.state = 'REFILL'), 0) refills,
                coalesce(sum(p.quantity) filter (where p.state = 'EMPTY'), 0) empties
           from inventory_positions p
           join stock_locations l on l.id = p.location_id
           join product_variants pv on pv.id = p.variant_id
           join brands b on b.id = pv.brand_id
          where ($1 = '' or p.location_id = $1)
          group by l.name, pv.id, b.name
          order by l.name, pv.name
          limit $2`,
        [branch, MAX_ROWS],
      );
    } else if (report === "purchases") {
      heading = ["Invoice", "Date", "Supplier", "Branch", "Status", "Total"];
      fields = ["invoice", "date", "supplier", "branch", "status", "total"];
      rows = await products.db.query<Record<string, unknown>>(
        `select p.invoice_no invoice, p.invoice_date date, s.name supplier, b.name branch, p.status, p.total
           from purchase_invoices p
           join suppliers s on s.id = p.supplier_id
           join stock_locations b on b.id = p.branch_id
          where ($1 = '' or p.branch_id = $1)
            and p.invoice_date >= $2::date
            and p.invoice_date <= $3::date
          order by p.invoice_date desc
          limit $4`,
        [branch, from, to, MAX_ROWS],
      );
    } else if (report === "deliveries") {
      heading = ["Rider", "Phone", "Branch", "Deliveries", "Delivered value", "Credit due"];
      fields = ["rider", "phone", "branch", "deliveries", "delivered_value", "credit_due"];
      rows = await products.db.query<Record<string, unknown>>(
        `select r.name rider, r.phone, b.name branch,
                count(s.id) filter (where s.status = 'posted') deliveries,
                coalesce(sum(s.total) filter (where s.status = 'posted'), 0) delivered_value,
                coalesce(sum(s.balance_due) filter (where s.status = 'posted'), 0) credit_due
           from riders r
           join stock_locations b on b.id = r.branch_id
      left join sales s on s.rider_id = r.id
                and s.sale_date >= ($2::date::timestamp at time zone 'Africa/Nairobi')
                and s.sale_date < (($3::date + 1)::timestamp at time zone 'Africa/Nairobi')
          where ($1 = '' or r.branch_id = $1)
          group by r.id, b.name
          order by delivered_value desc
          limit $4`,
        [branch, from, to, MAX_ROWS],
      );
    } else {
      heading = [
        "Receipt",
        "Date",
        "Branch",
        "Customer",
        "Rider",
        "Type",
        "Total",
        "Paid",
        "Balance due",
        "Status",
      ];
      fields = [
        "receipt",
        "date",
        "branch",
        "customer",
        "rider",
        "type",
        "total",
        "paid",
        "balance_due",
        "status",
      ];
      rows = await products.db.query<Record<string, unknown>>(
        `select s.receipt_no receipt,
                to_char(s.sale_date at time zone 'Africa/Nairobi', 'YYYY-MM-DD HH24:MI') date,
                b.name branch,
                coalesce(c.name, 'Walk-in') customer,
                coalesce(r.name, '') rider,
                s.sale_type type, s.total, s.amount_paid paid, s.balance_due, s.status
           from sales s
           join stock_locations b on b.id = s.branch_id
      left join customers c on c.id = s.customer_id
      left join riders r on r.id = s.rider_id
          where ($1 = '' or s.branch_id = $1)
            and s.sale_date >= ($2::date::timestamp at time zone 'Africa/Nairobi')
            and s.sale_date < (($3::date + 1)::timestamp at time zone 'Africa/Nairobi')
            and ($4 = '' or s.customer_id = $4)
            and ($5 = '' or s.rider_id::text = $5)
            and ($6 = '' or s.sale_type = $6)
            and ($7 = 'all' or s.status = $7)
            and ($8 = '' or exists (select 1 from sale_payments p where p.sale_id = s.id and p.method = $8))
            and ($9 = '' or s.receipt_no ilike '%' || $9 || '%'
                 or c.name ilike '%' || $9 || '%'
                 or exists (select 1 from invoices i where i.sale_id = s.id::text and i.reference ilike '%' || $9 || '%')
                 or exists (select 1 from sale_payments p where p.sale_id = s.id and coalesce(p.reference, '') ilike '%' || $9 || '%'))
          order by s.sale_date desc
          limit $10`,
        [branch, from, to, customer, rider, type, status, payment, lookup, MAX_ROWS],
      );
    }
  } catch (error) {
    console.error(`[reports/export] ${report} failed:`, error);
    return new Response("The report could not be generated.", { status: 500 });
  }

  const document = csvDocument(heading, fields, rows);

  return new Response(document, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gateway-gas-${report}-report.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
