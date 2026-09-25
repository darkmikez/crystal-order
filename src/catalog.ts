import type { Catalog } from "./types";

// Display labels for known TCG keys. Unknown future keys fall back to the raw
// key itself so the UI never breaks if the backend adds a new game before the
// frontend is updated to know its pretty label.
const TCG_LABELS: Record<string, string> = {
  pokemon: "Pokémon",
  one_piece: "One Piece",
  dragonball: "Dragon Ball",
};

export function tcgLabel(tcg: string): string {
  return TCG_LABELS[tcg] ?? tcg;
}

export async function loadCatalog(): Promise<Catalog> {
  // import.meta.env.BASE_URL respects Vite's configured `base`, so this
  // resolves correctly both in local dev (/) and on GitHub Pages (/crystal-order/).
  const url = `${import.meta.env.BASE_URL}data/catalog.json`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Impossibile caricare il catalogo (HTTP ${res.status})`);
  }
  const data = (await res.json()) as Catalog;
  if (!data || !Array.isArray(data.items) || typeof data.categories !== "object") {
    throw new Error("Il catalogo ricevuto non ha il formato atteso");
  }
  return data;
}
