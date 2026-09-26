import "./style.css";
import { loadCatalog, tcgLabel } from "./catalog";
import { cart } from "./cart";
import { downloadOrderXlsx, orderFilename } from "./excel";
import type { Catalog, CatalogItem } from "./types";

const ALL = "all";

interface UiState {
  catalog: Catalog | null;
  loadError: string | null;
  activeTcg: string;
  activeCategory: string;
  query: string;
  cartOpen: boolean;
  checkoutOpen: boolean;
}

const state: UiState = {
  catalog: null,
  loadError: null,
  activeTcg: ALL,
  activeCategory: ALL,
  query: "",
  cartOpen: false,
  checkoutOpen: false,
};

// key (tcg::category::expansion) -> the catalog item it refers to, rebuilt
// every time the grid renders so click/change handlers can resolve items.
let itemIndex = new Map<string, CatalogItem>();

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app root element not found");
const root: HTMLDivElement = app;

function euro(n: number): string {
  return n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function categoryLabel(catalog: Catalog, category: string): string {
  return catalog.categories[category]?.label ?? category;
}

function distinctTcgs(catalog: Catalog): string[] {
  const seen = new Set<string>();
  for (const item of catalog.items) seen.add(item.tcg);
  return [...seen];
}

function filteredItems(): CatalogItem[] {
  if (!state.catalog) return [];
  const q = state.query.trim().toLowerCase();
  return state.catalog.items.filter((it) => {
    if (state.activeTcg !== ALL && it.tcg !== state.activeTcg) return false;
    if (state.activeCategory !== ALL && it.category !== state.activeCategory) return false;
    if (q && !it.expansion.toLowerCase().includes(q)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Shell: built once. Sub-sections (grid / cart / checkout) are re-rendered
// independently so typing in the search box or a form field never gets its
// focus reset by an unrelated re-render.
// ---------------------------------------------------------------------------

function mountShell(): void {
  root.innerHTML = `
    <div class="page">
      <header class="site-header">
        <div class="brand">
          <span class="brand-mark">PP</span>
          <div>
            <p class="brand-name">Pik-A Pack</p>
            <p class="brand-tag">Bustine Pokémon · One Piece · Dragon Ball all'ingrosso</p>
          </div>
        </div>
        <button class="cart-toggle" type="button" data-action="toggle-cart">
          <span>Carrello</span>
          <span class="cart-toggle-badge" id="cart-badge">0</span>
        </button>
      </header>

      <main class="layout">
        <section class="catalog">
          <div class="toolbar">
            <div class="pills" id="tcg-pills"></div>
            <div class="pills" id="category-pills"></div>
            <input
              class="search"
              id="search-input"
              type="search"
              placeholder="Cerca un'espansione..."
              aria-label="Cerca un'espansione"
            />
          </div>
          <div class="grid" id="grid"><p class="muted">Caricamento catalogo...</p></div>
        </section>

        <aside class="cart-panel" id="cart-panel"></aside>
      </main>

      <button class="mobile-cart-bar" id="mobile-cart-bar" type="button" data-action="toggle-cart"></button>

      <div class="modal-overlay" id="checkout-overlay" data-action="close-checkout" hidden>
        <div class="modal" id="checkout-modal" role="dialog" aria-modal="true"></div>
      </div>

      <div class="toast" id="toast" hidden></div>

      <footer class="site-footer">
        <p>© ${new Date().getFullYear()} Pik-A Pack — Ordini all'ingrosso di bustine TCG.</p>
        <p class="muted">Nessun account richiesto. Il catalogo viene aggiornato periodicamente.</p>
      </footer>
    </div>
  `;
}

function renderFilters(): void {
  if (!state.catalog) return;
  const tcgPillsEl = document.querySelector<HTMLDivElement>("#tcg-pills");
  const categoryPillsEl = document.querySelector<HTMLDivElement>("#category-pills");
  if (!tcgPillsEl || !categoryPillsEl) return;

  const tcgs = distinctTcgs(state.catalog);
  tcgPillsEl.innerHTML = [
    pillHtml("tcg-pill", ALL, "Tutti", state.activeTcg === ALL),
    ...tcgs.map((t) => pillHtml("tcg-pill", t, tcgLabel(t), state.activeTcg === t)),
  ].join("");

  const categories = Object.keys(state.catalog.categories);
  if (categories.length > 1) {
    categoryPillsEl.hidden = false;
    categoryPillsEl.innerHTML = [
      pillHtml("category-pill", ALL, "Tutte le categorie", state.activeCategory === ALL),
      ...categories.map((c) =>
        pillHtml("category-pill", c, categoryLabel(state.catalog!, c), state.activeCategory === c)
      ),
    ].join("");
  } else {
    categoryPillsEl.hidden = true;
    categoryPillsEl.innerHTML = "";
  }
}

function pillHtml(action: string, value: string, label: string, active: boolean): string {
  return `<button type="button" class="pill${active ? " is-active" : ""}" data-action="${action}" data-value="${escapeHtml(
    value
  )}">${escapeHtml(label)}</button>`;
}

function renderGrid(): void {
  const gridEl = document.querySelector<HTMLDivElement>("#grid");
  if (!gridEl) return;

  if (state.loadError) {
    gridEl.innerHTML = `<p class="error">${escapeHtml(state.loadError)}</p>`;
    return;
  }
  if (!state.catalog) {
    gridEl.innerHTML = `<p class="muted">Caricamento catalogo...</p>`;
    return;
  }

  const items = filteredItems();
  itemIndex = new Map(items.map((it) => [cart.keyFor(it), it]));

  if (items.length === 0) {
    gridEl.innerHTML = `<p class="muted">Nessuna espansione trovata con questi filtri.</p>`;
    return;
  }

  gridEl.innerHTML = items
    .map((it) => {
      const key = cart.keyFor(it);
      const qty = cart.getQty(it);
      const lineTotal = qty * it.price_per_pack_eur;
      return `
        <article class="card">
          <div class="card-top">
            <span class="badge badge-${escapeHtml(it.tcg)}">${escapeHtml(tcgLabel(it.tcg))}</span>
            <span class="price">${euro(it.price_per_pack_eur)}<span class="price-unit">/bustina</span></span>
          </div>
          <h3 class="card-title">${escapeHtml(it.expansion)}</h3>
          <p class="card-sub">${escapeHtml(categoryLabel(state.catalog!, it.category))}</p>
          <div class="stepper">
            <button type="button" class="step-btn" data-action="dec" data-key="${escapeHtml(key)}" aria-label="Diminuisci quantità">−</button>
            <input
              class="step-input"
              type="number"
              min="0"
              max="999"
              inputmode="numeric"
              value="${qty}"
              data-action="set-qty"
              data-key="${escapeHtml(key)}"
              aria-label="Quantità"
            />
            <button type="button" class="step-btn" data-action="inc" data-key="${escapeHtml(key)}" aria-label="Aumenta quantità">+</button>
          </div>
          <p class="card-line-total${qty > 0 ? " is-visible" : ""}">${qty} × ${euro(it.price_per_pack_eur)} = <strong>${euro(
        lineTotal
      )}</strong></p>
        </article>
      `;
    })
    .join("");
}

function renderCart(): void {
  const panel = document.querySelector<HTMLDivElement>("#cart-panel");
  const mobileBar = document.querySelector<HTMLButtonElement>("#mobile-cart-bar");
  const badge = document.querySelector<HTMLSpanElement>("#cart-badge");
  if (!panel || !mobileBar || !badge) return;

  const lines = cart.getLines();
  const totalQty = cart.getTotalQty();
  const grandTotal = cart.getGrandTotal();

  badge.textContent = String(totalQty);

  panel.classList.toggle("is-open", state.cartOpen);
  mobileBar.classList.toggle("is-open", state.cartOpen);

  const linesHtml = lines.length
    ? lines
        .map(
          (l) => `
        <li class="cart-line">
          <div class="cart-line-main">
            <span class="cart-line-tcg">${escapeHtml(tcgLabel(l.tcg))}</span>
            <span class="cart-line-name">${escapeHtml(l.expansion)}</span>
            <button type="button" class="link-btn" data-action="remove-line" data-key="${escapeHtml(
              l.key
            )}">Rimuovi</button>
          </div>
          <div class="cart-line-meta">
            <span>${l.qty} × ${euro(l.unitPrice)}</span>
            <strong>${euro(l.qty * l.unitPrice)}</strong>
          </div>
        </li>
      `
        )
        .join("")
    : `<li class="cart-empty">Il carrello è vuoto. Aggiungi qualche bustina dal catalogo.</li>`;

  panel.innerHTML = `
    <div class="cart-panel-header">
      <h2>Il tuo ordine</h2>
      <button type="button" class="icon-btn" data-action="toggle-cart" aria-label="Chiudi carrello">×</button>
    </div>
    <ul class="cart-lines">${linesHtml}</ul>
    <div class="cart-footer">
      <div class="cart-total-row">
        <span>Totale</span>
        <strong>${euro(grandTotal)}</strong>
      </div>
      <div class="cart-actions">
        <button type="button" class="btn-secondary" data-action="clear-cart" ${lines.length ? "" : "disabled"}>Svuota carrello</button>
        <button type="button" class="btn-primary" data-action="open-checkout" ${lines.length ? "" : "disabled"}>Procedi al checkout</button>
      </div>
    </div>
  `;

  mobileBar.innerHTML = `
    <span>${totalQty} ${totalQty === 1 ? "articolo" : "articoli"}</span>
    <strong>${euro(grandTotal)}</strong>
    <span class="mobile-cart-cta">${state.cartOpen ? "Chiudi" : "Vedi carrello"}</span>
  `;
}

function renderCheckout(): void {
  const overlay = document.querySelector<HTMLDivElement>("#checkout-overlay");
  const modal = document.querySelector<HTMLDivElement>("#checkout-modal");
  if (!overlay || !modal) return;

  overlay.hidden = !state.checkoutOpen;
  if (!state.checkoutOpen) {
    modal.innerHTML = "";
    return;
  }

  const lines = cart.getLines();
  const grandTotal = cart.getGrandTotal();

  modal.innerHTML = `
    <div class="modal-header">
      <h2>Checkout</h2>
      <button type="button" class="icon-btn" data-action="close-checkout" aria-label="Chiudi">×</button>
    </div>
    <form id="checkout-form" novalidate>
      <label class="field">
        <span>Ragione sociale / Nome azienda</span>
        <input type="text" name="companyName" required autocomplete="organization" />
      </label>
      <label class="field">
        <span>E-mail di contatto</span>
        <input type="email" name="email" required autocomplete="email" />
      </label>
      <label class="field">
        <span>Data ordine</span>
        <input type="date" name="orderDate" required value="${todayIso()}" />
      </label>

      <div class="checkout-summary">
        <div class="checkout-summary-row">
          <span>${lines.length} ${lines.length === 1 ? "riga" : "righe"} d'ordine</span>
        </div>
        <div class="checkout-summary-row checkout-total-row">
          <span>Totale da pagare (100%, nessun acconto)</span>
          <strong>${euro(grandTotal)}</strong>
        </div>
      </div>

      <button type="submit" class="btn-primary btn-block" ${lines.length ? "" : "disabled"}>
        Scarica ordine (Excel)
      </button>
    </form>
  `;
}

function showToast(message: string): void {
  const toast = document.querySelector<HTMLDivElement>("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.add("is-visible");
  window.setTimeout(() => {
    toast.classList.remove("is-visible");
    window.setTimeout(() => {
      toast.hidden = true;
    }, 250);
  }, 3500);
}

function openCheckout(): void {
  if (cart.isEmpty()) return;
  state.checkoutOpen = true;
  renderCheckout();
}

function closeCheckout(): void {
  state.checkoutOpen = false;
  renderCheckout();
}

// ---------------------------------------------------------------------------
// Event wiring (delegated on the root so it survives sub-section re-renders)
// ---------------------------------------------------------------------------

function wireEvents(): void {
  root.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    const key = el.dataset.key;
    const value = el.dataset.value;

    switch (action) {
      case "toggle-cart":
        state.cartOpen = !state.cartOpen;
        renderCart();
        break;
      case "close-checkout":
        if (e.target === el) closeCheckout();
        break;
      case "clear-cart":
        if (!cart.isEmpty() && window.confirm("Svuotare il carrello?")) cart.clear();
        break;
      case "remove-line":
        if (key) cart.removeLine(key);
        break;
      case "open-checkout":
        openCheckout();
        break;
      case "inc":
      case "dec": {
        if (!key) break;
        const item = itemIndex.get(key);
        if (item) cart.increment(item, action === "inc" ? 1 : -1);
        break;
      }
      case "tcg-pill":
        state.activeTcg = value ?? ALL;
        renderFilters();
        renderGrid();
        break;
      case "category-pill":
        state.activeCategory = value ?? ALL;
        renderFilters();
        renderGrid();
        break;
      default:
        break;
    }
  });

  root.addEventListener("change", (e) => {
    const target = e.target as HTMLElement;
    if (target instanceof HTMLInputElement && target.dataset.action === "set-qty") {
      const key = target.dataset.key;
      const item = key ? itemIndex.get(key) : undefined;
      if (item) cart.setQty(item, Number(target.value));
    }
  });

  root.addEventListener("input", (e) => {
    const target = e.target as HTMLElement;
    if (target instanceof HTMLInputElement && target.id === "search-input") {
      state.query = target.value;
      renderGrid();
    }
  });

  root.addEventListener("submit", (e) => {
    const form = e.target as HTMLElement;
    if (!(form instanceof HTMLFormElement) || form.id !== "checkout-form") return;
    e.preventDefault();

    const data = new FormData(form);
    const companyName = String(data.get("companyName") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const orderDate = String(data.get("orderDate") ?? "").trim() || todayIso();

    if (!companyName || !email || cart.isEmpty()) return;

    const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Generazione in corso...";
    }

    const lines = cart.getLines();
    downloadOrderXlsx(lines, { companyName, email, orderDate })
      .then(() => {
        const filename = orderFilename(orderDate);
        cart.clear();
        closeCheckout();
        showToast(`Ordine scaricato: ${filename}`);
      })
      .catch(() => {
        showToast("Errore nella generazione del file Excel. Riprova.");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Scarica ordine (Excel)";
        }
      });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.checkoutOpen) closeCheckout();
  });

  cart.subscribe(() => {
    renderGrid();
    renderCart();
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot(): Promise<void> {
  mountShell();
  wireEvents();
  renderCart();
  renderCheckout();

  try {
    state.catalog = await loadCatalog();
  } catch (err) {
    state.loadError =
      err instanceof Error ? err.message : "Errore imprevisto nel caricamento del catalogo.";
  }

  renderFilters();
  renderGrid();
}

boot();
