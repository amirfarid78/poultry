import { LedgerEntry } from '../../types';
import { todayPKT } from '../../utils/calculations';

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
  // PKT today, not UTC today: a UTC date flips at 05:00 PKT and would hide
  // (or wrongly include) entries around midnight.
  endDate: todayPKT(),
  preset: 'all',
  typeFilter: 'all',
  searchTerm: '',
  showVoided: false,
};

/** Shift a YYYY-MM-DD date by whole days (UTC-noon arithmetic, no DST). */
const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
};

/** Resolve a date preset into a concrete [start, end] range ('' = open). */
export function presetRange(preset: LedgerDatePreset): { startDate: string; endDate: string } {
  // All presets anchor on the PKT date, not the UTC date.
  const today = todayPKT();
  switch (preset) {
    case 'today':
      return { startDate: today, endDate: today };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { startDate: y, endDate: y };
    }
    case 'last7': {
      return { startDate: addDays(today, -6), endDate: today };
    }
    case 'month':
      return {
        startDate: `${today.slice(0, 8)}01`,
        endDate: today,
      };
    case 'all':
      // Open-ended: a cap at today hid future-dated entries.
      return { startDate: '', endDate: '' };
    default:
      return { startDate: '', endDate: today };
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
