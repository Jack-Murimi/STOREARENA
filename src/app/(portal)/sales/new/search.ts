import type { PosCatalogueItem } from "@/lib/sales/pos-data";

export interface CatalogueSearchResult {
  item: PosCatalogueItem;
  score: number;
}

export interface CatalogueSearchResponse {
  results: CatalogueSearchResult[];
  requestedQuantity: number;
  suggestion: string | null;
}

const synonym: Record<string, string[]> = {
  gas: ["lpg"],
  lpg: ["gas"],
  refill: ["refil"],
  refil: ["refill"],
  new: ["full", "cylinder"],
  full: ["new", "cylinder"],
  cylinder: ["new", "full"],
  regulator: ["reg"],
  reg: ["regulator"],
  kg: ["kilo"],
  kilo: ["kg"],
  litre: ["l"],
  l: ["litre"],
};

/** Normalise punctuation and physical-unit spelling without changing numbers. */
export function normaliseSearch(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/(\d)(kgs?|kilos?)/g, "$1 kg")
    .replace(/(\d)(litres?|ltrs?|l)(?=\b)/g, "$1 litre")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function parseQuantityShortcut(query: string): { query: string; quantity: number } {
  const match = query.trim().match(/\s+x(\d+)$/i);
  if (!match) return { query, quantity: 1 };
  const quantity = Number(match[1]);
  return { query: query.slice(0, match.index).trim(), quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1 };
}

function editDistanceWithin(left: string, right: string, maximum: number): boolean {
  if (Math.abs(left.length - right.length) > maximum) return false;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    let smallest = previous[0];
    for (let column = 1; column <= right.length; column += 1) {
      const saved = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      diagonal = saved;
      smallest = Math.min(smallest, previous[column]);
    }
    if (smallest > maximum) return false;
  }
  return previous[right.length] <= maximum;
}

function productTokens(item: PosCatalogueItem): string[] {
  const derived = [
    item.lineType,
    item.categoryCode === "LPG" ? "lpg gas refill refil new full cylinder" : "",
    item.categoryCode === "ACC" ? "accessory accessories fitting" : "",
    item.categoryCode === "WATER" ? "water drinking" : "",
    item.sizeKg === null ? "" : `${item.sizeKg} kg kilo`,
  ].join(" ");
  return normaliseSearch(`${item.name} ${item.brandName} ${item.categoryName} ${derived}`);
}

function aliasesFor(token: string): string[] {
  return [token, ...(synonym[token] ?? [])];
}

function tokenMatch(queryToken: string, haystack: string[]): { kind: number; brand: boolean; size: boolean } | null {
  const alternatives = aliasesFor(queryToken);
  let best: { kind: number; brand: boolean; size: boolean } | null = null;
  for (const alternative of alternatives) {
    for (const token of haystack) {
      let kind = 0;
      if (token === alternative) kind = 4;
      else if (token.startsWith(alternative)) kind = 3;
      else if (token.includes(alternative)) kind = 2;
      else if (alternative.length >= 4 && editDistanceWithin(token, alternative, alternative.length >= 7 ? 2 : 1)) kind = 1;
      if (kind > (best?.kind ?? 0)) best = { kind, brand: false, size: /^\d+$/.test(alternative) };
    }
  }
  return best;
}

/**
 * Small, deterministic matcher for the 69-item catalogue. It is cheaper than
 * a dependency, completes in under a millisecond at this size, and gives us
 * exact control over numeric cylinder-size matching and trade synonyms.
 */
export function searchCatalogue(
  rawQuery: string,
  catalogue: PosCatalogueItem[],
  recentIds: string[] = [],
): CatalogueSearchResponse {
  const { query, quantity } = parseQuantityShortcut(rawQuery);
  const queryTokens = normaliseSearch(query);
  if (queryTokens.length === 0) return { results: [], requestedQuantity: quantity, suggestion: null };
  const recentRank = new Map(recentIds.map((id, index) => [id, index]));

  const results = catalogue.flatMap((item) => {
    const tokens = productTokens(item);
    const brandTokens = normaliseSearch(item.brandName);
    let score = 0;
    let brandScore = 0;
    let sizeScore = 0;
    for (const queryToken of queryTokens) {
      const match = tokenMatch(queryToken, tokens);
      if (!match) return [];
      score += match.kind;
      const brandMatch = tokenMatch(queryToken, brandTokens);
      if (brandMatch) brandScore += brandMatch.kind;
      if (/^\d+$/.test(queryToken) && String(item.sizeKg ?? "") === queryToken) sizeScore += 4;
    }
    // All words are mandatory. Exact/prefix combinations dominate fuzzy hits.
    score = score * 10 + brandScore * 3 + sizeScore;
    if (item.available === null || item.available > 3) score += 2;
    if (recentRank.has(item.id)) score += Math.max(0, 2 - (recentRank.get(item.id) ?? 2) / 8);
    return [{ item, score }];
  });

  results.sort((left, right) => {
    const leftStock = left.item.available === 0 ? 1 : 0;
    const rightStock = right.item.available === 0 ? 1 : 0;
    return right.score - left.score || leftStock - rightStock || left.item.name.localeCompare(right.item.name);
  });

  let suggestion: string | null = null;
  if (results.length === 0) {
    const queryWord = queryTokens[0] ?? "";
    const closest = catalogue
      .map((item) => ({ item, tokens: productTokens(item) }))
      .flatMap(({ item, tokens }) => tokens.map((token) => ({ item, token })))
      .find(({ token }) => queryWord.length >= 4 && editDistanceWithin(token, queryWord, 2));
    suggestion = closest?.item.name ?? catalogue[0]?.name ?? null;
  }

  return { results, requestedQuantity: quantity, suggestion };
}
