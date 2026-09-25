// Shape of public/data/catalog.json — the static product feed this site consumes.
// A separate backend (Django admin) publishes this file on a schedule; the shape
// here is the contract the backend must match, so it is kept deliberately explicit
// and extensible (categories is a map, not a hardcoded union of one value).

export type TcgKey = "pokemon" | "one_piece" | "dragonball";

export interface CategoryInfo {
  label: string;
  markup_eur: number;
}

export interface CatalogItem {
  tcg: TcgKey;
  expansion: string;
  category: string;
  price_per_pack_eur: number;
}

export interface Catalog {
  generated_at: string;
  categories: Record<string, CategoryInfo>;
  items: CatalogItem[];
}

// A single cart line. Keyed by tcg+category+expansion so the same expansion
// name appearing in two different categories in the future is kept distinct.
export interface CartLine {
  key: string;
  tcg: TcgKey | string;
  expansion: string;
  category: string;
  unitPrice: number;
  qty: number;
}
