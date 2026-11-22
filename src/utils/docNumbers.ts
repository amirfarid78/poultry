// Sequential document numbers (INV / REC / JV / ORD / PUR / EXP).
//
// NEVER derive a number from the list length: the list shrinks after
// deletes (cascade) and truncates at the fetch limit, so length-based
// numbers reuse values that still exist on the server — and invoice_number,
// receipt_number and voucher_number are UNIQUE, so the replay fails with a
// duplicate-key error the user can never fix by tapping retry. Random
// numbers are worse (REC/JV used to collide by birthday paradox; a JV
// collision was even swallowed as "already synced").
//
// max+1 over the numeric suffix is stable under deletes and truncation
// (numbers grow with time and the fetch is newest-first, so the max is in
// the local list). Residual risk: two devices creating the same doc type
// simultaneously while offline can still collide — only server-side
// numbering would close that, which needs a migration.
export function nextDocNumber(
  prefix: string,
  numbers: Array<string | undefined | null>,
  base: number
): string {
  let max = base;
  for (const n of numbers) {
    if (!n) continue;
    const m = n.match(/(\d+)\s*$/);
    if (m) {
      const v = parseInt(m[1], 10);
      if (Number.isFinite(v)) max = Math.max(max, v);
    }
  }
  return `${prefix}-${max + 1}`;
}
