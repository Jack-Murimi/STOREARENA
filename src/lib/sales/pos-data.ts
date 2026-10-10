import type { Database } from "@/lib/stock/products";

export type SaleLineType = "refill" | "new_cylinder" | "accessory" | "water" | "other";

export interface PosCatalogueItem {
  id: string;
  name: string;
  brandId: string;
  brandName: string;
  categoryCode: string;
  categoryName: string;
  lineType: SaleLineType;
  listPrice: number;
  available: number | null;
  sizeKg: number | null;
}

export interface PosBrand {
  id: string;
  name: string;
}

export interface PosCustomer {
  id: string;
  code: string;
  name: string;
  locations: { id: string; label: string; area: string | null }[];
}

export interface PosRider {
  id: string;
  name: string;
  phone: string | null;
}

export interface PosBranch {
  id: string;
  name: string;
  code: string;
}

export interface PosData {
  branch: PosBranch;
  branches: PosBranch[];
  catalogue: PosCatalogueItem[];
  /** Recent branch sellers, used only inside the empty search dropdown. */
  quickAddIds: string[];
  brands: PosBrand[];
  customers: PosCustomer[];
  riders: PosRider[];
}

const text = (value: unknown): string => (value === null || value === undefined ? "" : String(value));
const nullableText = (value: unknown): string | null =>
  value === null || value === undefined || String(value).trim() === "" ? null : String(value);
const number = (value: unknown): number => Number(value ?? 0);

/**
 * A deliberately cost-free, branch-specific POS snapshot.
 *
 * This is cached by the client for the life of the sale, but the snapshot is
 * only advisory: create_sale locks the current position and computes prices,
 * stock and totals again on the server when completing the transaction.
 */
export async function getPosData(db: Database, branchId: string): Promise<PosData | null> {
  // Keep each wave below the shared five-connection pool. Sending all seven
  // reads together can leave a POS request queued behind other staff screens.
  const [branchRows, catalogueRows, quickRows] = await Promise.all([
    db.query<Record<string, unknown>>(
      "select id, name, code from stock_locations where id = $1 and kind = 'BRANCH' and active",
      [branchId],
    ),
    db.query<Record<string, unknown>>(
      `select pv.id, pv.name, pv.size_kg, pv.list_price_ksh,
              b.id as brand_id, b.name as brand_name,
              c.code as category_code, c.name as category_name,
              coalesce(sum(ip.quantity) filter (where ip.state = 'REFILL'), 0)::integer as available
         from product_variants pv
         join categories c on c.id = pv.category_id
         join brands b on b.id = pv.brand_id
    left join inventory_positions ip
           on ip.variant_id = pv.id and ip.location_id = $1
        where pv.active
        group by pv.id, pv.name, pv.size_kg, pv.list_price_ksh,
                 b.id, b.name, c.code, c.name
        order by c.name, pv.size_kg nulls last, b.name, pv.name`,
      [branchId],
    ),
    db.query<Record<string, unknown>>(
      `select l.variant_id, sum(l.quantity)::integer as units
         from sale_lines l join sales s on s.id = l.sale_id
        where s.branch_id = $1 and s.status = 'posted'
          and s.sale_date >= now() - interval '30 days'
        group by l.variant_id
        order by units desc, l.variant_id
        limit 8`,
      [branchId],
    ),
  ]);
  const [branchOptionsRows, brandRows, customerRows] = await Promise.all([
    db.query<Record<string, unknown>>(
      "select id, name, code from stock_locations where kind = 'BRANCH' and active order by name",
    ),
    db.query<Record<string, unknown>>("select id, name from brands order by name"),
    db.query<Record<string, unknown>>(
      "select id, code, name from customers where active order by name",
    ),
  ]);
  const [locationRows, riderRows] = await Promise.all([
    db.query<Record<string, unknown>>(
      `select id, customer_id, label, area
         from customer_locations
        where active
        order by is_primary desc, label`,
    ),
    db.query<Record<string, unknown>>(
      `select id, name, phone from riders
        where branch_id = $1 and is_active
        order by name`,
      [branchId],
    ),
  ]);

  const branch = branchRows[0];
  if (!branch) return null;

  const lineType = (categoryCode: string): SaleLineType => {
    if (categoryCode === "LPG") return "refill";
    if (categoryCode === "WATER") return "water";
    if (categoryCode === "ACC") return "accessory";
    return "other";
  };

  return {
    branch: { id: text(branch.id), name: text(branch.name), code: text(branch.code) },
    branches: branchOptionsRows.map((row) => ({ id: text(row.id), name: text(row.name), code: text(row.code) })),
    catalogue: catalogueRows.map((row) => ({
      id: text(row.id),
      name: text(row.name),
      brandId: text(row.brand_id),
      brandName: text(row.brand_name),
      categoryCode: text(row.category_code),
      categoryName: text(row.category_name),
      lineType: lineType(text(row.category_code)),
      listPrice: number(row.list_price_ksh),
      available: text(row.category_code) === "LPG" ? number(row.available) : null,
      sizeKg: row.size_kg === null || row.size_kg === undefined ? null : number(row.size_kg),
    })),
    quickAddIds: quickRows.map((row) => text(row.variant_id)),
    brands: brandRows.map((row) => ({ id: text(row.id), name: text(row.name) })),
    customers: customerRows.map((customer) => ({
      id: text(customer.id),
      code: text(customer.code),
      name: text(customer.name),
      locations: locationRows
        .filter((location) => text(location.customer_id) === text(customer.id))
        .map((location) => ({
          id: text(location.id),
          label: text(location.label),
          area: nullableText(location.area),
        })),
    })),
    riders: riderRows.map((row) => ({
      id: text(row.id),
      name: text(row.name),
      phone: nullableText(row.phone),
    })),
  };
}
