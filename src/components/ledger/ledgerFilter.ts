import { LedgerEntry } from '../../types';

export type LedgerTypeFilter =
  | 'all'
  | 'sales'
  | 'charges'
  | 'payments'
  | 'purchases'
  | 'opening'
  | 'adjustments'
  | 'voids';

export type LedgerDatePreset = 'today' | 'yesterday' | 'last7' | 'month' | 'all' | 'custom';

export interface LedgerFilterState {
  startDate: string;
  endDate: string;
  preset: LedgerDatePreset;
  typeFilter: LedgerTypeFilter;
  searchTerm: string;
  showVoided: boolean;
}

export const DEFAULT_LEDGER_FILTER: LedgerFilterState = {
  startDate: '',
  endDate: new Date().toISOString().split('T')[0],
  preset: 'all',
  typeFilter: 'all',
  searchTerm: '',
  showVoided: false,
};

const toISODate = (d: Date) => d.toISOString().split('T')[0];

/** Resolve a date preset into a concrete [start, end] range ('' = open). */
export function presetRange(preset: LedgerDatePreset): { startDate: string; endDate: string } {
  const today = new Date();
  switch (preset) {
    case 'today':
      return { startDate: toISODate(today), endDate: toISODate(today) };
    case 'yesterday': {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { startDate: toISODate(y), endDate: toISODate(y) };
    }
    case 'last7': {
      const s = new Date(today);
      s.setDate(s.getDate() - 6);
      return { startDate: toISODate(s), endDate: toISODate(today) };
    }
    case 'month':
      return {
        startDate: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`,
        endDate: toISODate(today),
      };
    case 'all':
      return { startDate: '', endDate: toISODate(today) };
    default:
      return { startDate: '', endDate: toISODate(today) };
  }
}

const TYPE_MATCH: Record<Exclude<LedgerTypeFilter, 'all' | 'voids'>, LedgerEntry['refType'][]> = {
  sales: ['invoice'],
  charges: ['invoice_charge'],
  payments: ['invoice_payment', 'receipt'],
  purchases: ['purchase'],
  opening: ['opening'],
  adjustments: ['adjustment', 'journal'],
};

/** Apply the deep filter: void visibility, type group, date range, search. */
export function filterLedgerEntries(
  entries: LedgerEntry[],
  partyId: string,
  f: LedgerFilterState
): LedgerEntry[] {
  const term = f.searchTerm.trim().toLowerCase();
  return entries
    .filter((e) => e.partyId === partyId)
    .filter((e) => {
      if (e.isVoid && f.typeFilter !== 'voids' && !f.showVoided) return false;
      if (f.typeFilter === 'voids') {
        if (!e.isVoid) return false;
      } else if (f.typeFilter !== 'all') {
        if (!TYPE_MATCH[f.typeFilter].includes(e.refType)) return false;
      }
      if (f.startDate && e.entryDate < f.startDate) return false;
      if (f.endDate && e.entryDate > f.endDate) return false;
      if (term) {
        const hay = `${e.detail} ${e.detailUrdu} ${e.folioNo || ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    })
    .sort(
      (a, b) =>
        a.entryDate.localeCompare(b.entryDate) ||
        (a.createdAt || '').localeCompare(b.createdAt || '') ||
        a.id.localeCompare(b.id)
    );
}
