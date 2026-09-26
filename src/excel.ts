import type { CartLine } from "./types";
import { tcgLabel } from "./catalog";

export interface CheckoutInfo {
  companyName: string;
  email: string;
  orderDate: string; // yyyy-mm-dd, from <input type="date">
}

const EUR_FORMAT = '#,##0.00 "€"';

// xlsx (~340KB) is only needed at the moment of download, and most visitors
// only browse the catalog — so it is dynamically imported here instead of
// bundled into the initial page load, to keep the storefront light on mobile.
type XlsxModule = typeof import("xlsx");

/**
 * Builds the single-sheet order workbook: a small header block (company /
 * email / order date) followed by a line-item table and a TOTAL row. This is
 * intentionally the simple end of the client's order-form family — the
 * catalogue here has one fixed price per expansion already, so there is no
 * format/pack-size tier to resolve and no 50/50 deposit split: the customer
 * pays the full amount, so there is exactly one total row.
 */
function buildOrderWorkbook(XLSX: XlsxModule, lines: CartLine[], info: CheckoutInfo): ReturnType<XlsxModule["utils"]["book_new"]> {
  const headerRows: (string | number)[][] = [
    ["Pik-A Pack - Ordine"],
    [],
    ["Azienda", info.companyName],
    ["E-mail", info.email],
    ["Data ordine", info.orderDate],
    [],
    ["TCG", "Espansione", "Quantità", "Prezzo unitario (EUR)", "Totale riga (EUR)"],
  ];

  const dataRows = lines.map((l) => [
    tcgLabel(l.tcg),
    l.expansion,
    l.qty,
    Number(l.unitPrice.toFixed(2)),
    Number((l.qty * l.unitPrice).toFixed(2)),
  ]);

  const grandTotal = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
  const totalRow: (string | number)[] = ["", "", "", "TOTALE (100%)", Number(grandTotal.toFixed(2))];

  const sheetData = [...headerRows, ...dataRows, totalRow];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  const dataStartRow = headerRows.length; // 0-indexed row of the first item line
  const totalRowIndex = dataStartRow + dataRows.length; // 0-indexed row of the TOTAL line
  const priceCol = 3; // column D
  const totalCol = 4; // column E

  for (let r = dataStartRow; r <= totalRowIndex; r++) {
    for (const c of [priceCol, totalCol]) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (cell && typeof cell.v === "number") {
        cell.z = EUR_FORMAT;
      }
    }
  }

  ws["!cols"] = [{ wch: 14 }, { wch: 42 }, { wch: 12 }, { wch: 20 }, { wch: 18 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ordine");
  return wb;
}

export function orderFilename(orderDate: string): string {
  const date = orderDate || new Date().toISOString().slice(0, 10);
  return `ordine_pikapack_${date}.xlsx`;
}

/** Generates the workbook and triggers a real client-side file download. */
export async function downloadOrderXlsx(lines: CartLine[], info: CheckoutInfo): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = buildOrderWorkbook(XLSX, lines, info);
  XLSX.writeFile(wb, orderFilename(info.orderDate));
}
