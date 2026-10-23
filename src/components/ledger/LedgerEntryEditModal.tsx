import React, { useState } from 'react';
import { LedgerEntry } from '../../types';
import { Edit3, X, AlertTriangle, Lock } from 'lucide-react';

/** Ledger rows whose amounts are owned by a source document — the amounts are
 *  locked in the edit modal (edit/void the document instead). Date and
 *  narration stay editable. */
export const DOC_OWNED_TYPES: LedgerEntry['refType'][] = [
  'invoice',
  'invoice_payment',
  'invoice_charge',
  'purchase',
  'receipt',
];

export interface LedgerEditPatch {
  entryDate: string;
  detail: string;
  detailUrdu: string;
  debit: number;
  credit: number;
}

interface LedgerEntryEditModalProps {
  entry: LedgerEntry;
  partyName: string;
  language: 'en' | 'ur';
  onClose: () => void;
  onSave: (entryId: string, patch: LedgerEditPatch) => void;
}

const TYPE_LABEL: Record<string, { en: string; ur: string }> = {
  invoice: { en: 'Sale', ur: 'فروخت' },
  invoice_payment: { en: 'Payment on invoice', ur: 'بل پر وصولی' },
  invoice_charge: { en: 'Extra charge', ur: 'اضافی چارج' },
  receipt: { en: 'Receipt / Payment', ur: 'رسید / ادائیگی' },
  purchase: { en: 'Purchase', ur: 'خریداری' },
  opening: { en: 'Opening balance', ur: 'ابتدائی بیلنس' },
  adjustment: { en: 'Adjustment', ur: 'ایڈجسٹمنٹ' },
  journal: { en: 'Journal', ur: 'جرنل' },
};

export const LedgerEntryEditModal: React.FC<LedgerEntryEditModalProps> = ({
  entry,
  partyName,
  language,
  onClose,
  onSave,
}) => {
  const isUrdu = language === 'ur';
  const amountsLocked = DOC_OWNED_TYPES.includes(entry.refType);

  const [entryDate, setEntryDate] = useState(entry.entryDate);
  const [detail, setDetail] = useState(entry.detail);
  const [detailUrdu, setDetailUrdu] = useState(entry.detailUrdu);
  const [debit, setDebit] = useState<number>(entry.debit || 0);
  const [credit, setCredit] = useState<number>(entry.credit || 0);

  const typeLabel = TYPE_LABEL[entry.refType] ?? { en: entry.refType, ur: entry.refType };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryDate) {
      alert(isUrdu ? 'تاریخ درج کریں' : 'Please enter a date');
      return;
    }
    onSave(entry.id, {
      entryDate,
      detail: detail.trim() || entry.detail,
      detailUrdu: detailUrdu.trim(),
      debit: amountsLocked ? entry.debit || 0 : Math.max(0, Math.round(debit || 0)),
      credit: amountsLocked ? entry.credit || 0 : Math.max(0, Math.round(credit || 0)),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 text-slate-800 shadow-2xl">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-amber-600" />
            <span>{isUrdu ? 'کھاتہ انٹری میں ترمیم' : 'Edit Ledger Entry'}</span>
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-[11px] text-slate-500 mb-4">
          {partyName} — {isUrdu ? typeLabel.ur : typeLabel.en}
          {entry.folioNo ? <span className="font-mono"> ({entry.folioNo})</span> : null}
        </p>

        {amountsLocked && (
          <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-[11px] mb-4">
            <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              {isUrdu
                ? 'اس انٹری کی رقم اصل دستاویز (بل/رسید/خریداری) سے آتی ہے — رقم بدلنے کے لیے دستاویز میں ترمیم کریں۔ تاریخ و تفصیل یہاں بدلی جا سکتی ہے۔'
                : 'This row\u2019s amount comes from its source document (invoice / receipt / purchase) — edit the document to change the amount. Date and narration can be changed here.'}
            </span>
          </div>
        )}

        {entry.refType === 'opening' && (
          <div className="flex items-start gap-2 p-2.5 rounded-xl bg-blue-50 border border-blue-300 text-blue-900 text-[11px] mb-4">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              {isUrdu
                ? 'ابتدائی بیلنس بدلنے سے پورے کھاتے کے بقایا جات ازسرِنو حساب ہوں گے۔'
                : 'Changing the opening balance recomputes every running balance in this khata.'}
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {isUrdu ? 'تاریخ:' : 'Date:'}
            </label>
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold"
              required
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {isUrdu ? 'تفصیل (انگریزی):' : 'Narration (English):'}
            </label>
            <input
              type="text"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {isUrdu ? 'تفصیل (اردو):' : 'Narration (Urdu):'}
            </label>
            <input
              type="text"
              value={detailUrdu}
              onChange={(e) => setDetailUrdu(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 font-urdu"
              dir="rtl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                {isUrdu ? 'نام (Debit):' : 'Debit (Naam):'}
              </label>
              <input
                type="number"
                value={debit || ''}
                onChange={(e) => setDebit(parseFloat(e.target.value) || 0)}
                disabled={amountsLocked}
                className={`w-full px-3 py-2 rounded-xl border font-mono font-bold ${
                  amountsLocked
                    ? 'border-slate-200 bg-slate-100 text-slate-500'
                    : 'border-rose-300 text-rose-900'
                }`}
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                {isUrdu ? 'جمع (Credit):' : 'Credit (Jama):'}
              </label>
              <input
                type="number"
                value={credit || ''}
                onChange={(e) => setCredit(parseFloat(e.target.value) || 0)}
                disabled={amountsLocked}
                className={`w-full px-3 py-2 rounded-xl border font-mono font-bold ${
                  amountsLocked
                    ? 'border-slate-200 bg-slate-100 text-slate-500'
                    : 'border-emerald-300 text-emerald-900'
                }`}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              {isUrdu ? 'منسوخ' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-amber-700 hover:bg-amber-800 rounded-xl"
            >
              {isUrdu ? 'تبدیلی محفوظ کریں' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
