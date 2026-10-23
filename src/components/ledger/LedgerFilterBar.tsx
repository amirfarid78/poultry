import React from 'react';
import { Search, CalendarDays, EyeOff } from 'lucide-react';
import {
  LedgerFilterState,
  LedgerTypeFilter,
  LedgerDatePreset,
  presetRange,
} from './ledgerFilter';

interface LedgerFilterBarProps {
  filter: LedgerFilterState;
  onChange: (f: LedgerFilterState) => void;
  language: 'en' | 'ur';
  compact?: boolean;
}

const PRESETS: { key: LedgerDatePreset; en: string; ur: string }[] = [
  { key: 'today', en: 'Today', ur: 'آج' },
  { key: 'yesterday', en: 'Yesterday', ur: 'کل' },
  { key: 'last7', en: 'Last 7 days', ur: '7 دن' },
  { key: 'month', en: 'This month', ur: 'اس ماہ' },
  { key: 'all', en: 'All time', ur: 'مکمل' },
];

const TYPES: { key: LedgerTypeFilter; en: string; ur: string }[] = [
  { key: 'all', en: 'All', ur: 'تمام' },
  { key: 'sales', en: 'Sales', ur: 'فروخت' },
  { key: 'charges', en: 'Charges', ur: 'چارجز' },
  { key: 'payments', en: 'Payments', ur: 'ادائیگیاں' },
  { key: 'purchases', en: 'Purchases', ur: 'خریداری' },
  { key: 'opening', en: 'Opening', ur: 'ابتدائی' },
  { key: 'adjustments', en: 'Adjustments', ur: 'ایڈجسٹمنٹ' },
  { key: 'voids', en: 'Voided', ur: 'وائڈ شدہ' },
];

/** Deep filter bar for khata views: date presets + custom range, entry-type
 *  filter, text search and a voided-rows toggle. */
export const LedgerFilterBar: React.FC<LedgerFilterBarProps> = ({
  filter,
  onChange,
  language,
}) => {
  const isUrdu = language === 'ur';
  const set = (patch: Partial<LedgerFilterState>) => onChange({ ...filter, ...patch });

  const applyPreset = (preset: LedgerDatePreset) => {
    const r = presetRange(preset);
    set({ preset, startDate: r.startDate, endDate: r.endDate });
  };

  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
      {/* Row 1: date presets + custom range */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500 uppercase">
          <CalendarDays className="w-3.5 h-3.5" />
          {isUrdu ? 'مدت:' : 'Period:'}
        </span>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => applyPreset(p.key)}
            title={p.key === 'today' ? (isUrdu ? 'آج کا کھاتہ (پرنٹ کے لیے تیار)' : 'Today\u2019s ledger (ready to print)') : undefined}
            className={`text-[11px] px-2.5 py-1 rounded-lg font-bold transition ${
              filter.preset === p.key
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            {isUrdu ? p.ur : p.en}
          </button>
        ))}
        <div className="flex items-center gap-1.5 ml-1">
          <input
            type="date"
            value={filter.startDate}
            onChange={(e) => set({ startDate: e.target.value, preset: 'custom' })}
            className="px-2 py-1 rounded-lg border border-slate-300 text-[11px] text-slate-800"
            title={isUrdu ? 'شروع تاریخ' : 'From date'}
          />
          <span className="text-slate-400 text-[11px]">—</span>
          <input
            type="date"
            value={filter.endDate}
            onChange={(e) => set({ endDate: e.target.value, preset: 'custom' })}
            className="px-2 py-1 rounded-lg border border-slate-300 text-[11px] text-slate-800"
            title={isUrdu ? 'اختتامی تاریخ' : 'To date'}
          />
        </div>
      </div>

      {/* Row 2: type filter + search + voided toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => set({ typeFilter: t.key })}
              className={`text-[11px] px-2.5 py-1 rounded-lg font-bold transition ${
                filter.typeFilter === t.key
                  ? t.key === 'voids'
                    ? 'bg-rose-700 text-white shadow-sm'
                    : 'bg-amber-700 text-white shadow-sm'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {isUrdu ? t.ur : t.en}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[160px] max-w-xs ml-auto">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
          <input
            type="text"
            value={filter.searchTerm}
            onChange={(e) => set({ searchTerm: e.target.value })}
            placeholder={isUrdu ? 'تفصیل / حوالہ تلاش کریں...' : 'Search narration / ref...'}
            className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-slate-300 text-[11px] text-slate-800"
          />
        </div>

        <button
          type="button"
          onClick={() => set({ showVoided: !filter.showVoided })}
          title={isUrdu ? 'وائڈ شدہ انٹریاں دکھائیں/چھپائیں' : 'Show/hide voided rows'}
          className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg font-bold transition ${
            filter.showVoided
              ? 'bg-rose-100 text-rose-800 border border-rose-300'
              : 'bg-slate-100 text-slate-500 border border-slate-200'
          }`}
        >
          <EyeOff className="w-3 h-3" />
          {isUrdu ? 'وائڈ' : 'Voided'}
        </button>
      </div>
    </div>
  );
};
