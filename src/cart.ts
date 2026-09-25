import type { CartLine, CatalogItem } from "./types";

const STORAGE_KEY = "crystal-order.cart.v1";

type Listener = () => void;

class CartStore {
  private lines = new Map<string, CartLine>();
  private listeners = new Set<Listener>();

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as CartLine[];
      if (!Array.isArray(parsed)) return;
      for (const line of parsed) {
        if (line && typeof line.key === "string" && typeof line.qty === "number" && line.qty > 0) {
          this.lines.set(line.key, line);
        }
      }
    } catch {
      // Corrupt or unavailable storage: start with an empty cart rather than throwing.
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.lines.values()]));
    } catch {
      // Storage unavailable (private mode / quota exceeded): cart still works
      // in-memory for this page view, it just won't survive a reload.
    }
  }

  private notify(): void {
    this.persist();
    for (const listener of this.listeners) listener();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  keyFor(item: Pick<CatalogItem, "tcg" | "category" | "expansion">): string {
    return `${item.tcg}::${item.category}::${item.expansion}`;
  }

  getQty(item: Pick<CatalogItem, "tcg" | "category" | "expansion">): number {
    return this.lines.get(this.keyFor(item))?.qty ?? 0;
  }

  setQty(item: CatalogItem, qty: number): void {
    const key = this.keyFor(item);
    const clamped = Math.max(0, Math.min(999, Math.floor(Number.isFinite(qty) ? qty : 0)));
    if (clamped <= 0) {
      this.lines.delete(key);
    } else {
      this.lines.set(key, {
        key,
        tcg: item.tcg,
        expansion: item.expansion,
        category: item.category,
        unitPrice: item.price_per_pack_eur,
        qty: clamped,
      });
    }
    this.notify();
  }

  increment(item: CatalogItem, delta: number): void {
    this.setQty(item, this.getQty(item) + delta);
  }

  removeLine(key: string): void {
    this.lines.delete(key);
    this.notify();
  }

  clear(): void {
    this.lines.clear();
    this.notify();
  }

  getLines(): CartLine[] {
    return [...this.lines.values()].sort((a, b) => a.expansion.localeCompare(b.expansion, "it"));
  }

  getTotalQty(): number {
    let total = 0;
    for (const l of this.lines.values()) total += l.qty;
    return total;
  }

  getGrandTotal(): number {
    let total = 0;
    for (const l of this.lines.values()) total += l.qty * l.unitPrice;
    return total;
  }

  isEmpty(): boolean {
    return this.lines.size === 0;
  }
}

export const cart = new CartStore();
