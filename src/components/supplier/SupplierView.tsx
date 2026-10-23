import React, { useState, useEffect } from 'react';
import { Party, Purchase, LedgerEntry, UserRole } from '../../types';
import { formatPKR } from '../../utils/calculations';
import { PartyModal } from '../common/PartyModal';
import { LedgerFilterBar } from '../ledger/LedgerFilterBar';
import { LedgerPrintModal } from '../ledger/LedgerPrintModal';
import { LedgerEntryEditModal, LedgerEditPatch } from '../ledger/LedgerEntryEditModal';
import {
  LedgerFilterState,
  DEFAULT_LEDGER_FILTER,
  filterLedgerEntries,
} from '../ledger/ledgerFilter';
import { Building2, Plus, Printer, UserPlus, Edit3, X, Pencil } from 'lucide-react';

interface SupplierViewProps {
  parties: Party[];
  purchases: Purchase[];
  ledgerEntries: LedgerEntry[];
  currentRole: UserRole;
  language: 'en' | 'ur';
  todayMandiRate?: number;
  onAddPurchase: (purchase: Purchase) => void;
  onOpenReceiptModal: (partyId?: string) => void;
  onAddParty?: (party: Party) => void;
  onUpdateParty?: (party: Party) => void;
  onDeleteParty?: (partyId: string) => boolean | void;
  onEditLedgerEntry?: (entryId: string, patch: LedgerEditPatch) => void;
}

export const SupplierView: React.FC<SupplierViewProps> = ({
  parties,
  purchases,
  ledgerEntries,
  currentRole,
  language,
  todayMandiRate = 12000,
  onAddPurchase,
  onOpenReceiptModal,
  onAddParty,
  onUpdateParty,
  onDeleteParty,
  onEditLedgerEntry
}) => {
  const isUrdu = language === 'ur';
  const suppliers = parties.filter((p) => p.partyType === 'supplier');
  const canEditLedger = currentRole === 'owner' || currentRole === 'manager' || currentRole === 'accountant';
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(suppliers[0]?.id || '');
  const [filter, setFilter] = useState<LedgerFilterState>(DEFAULT_LEDGER_FILTER);
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  const [showAddPurchaseModal, setShowAddPurchaseModal] = useState(false);
  const [purchaseRate, setPurchaseRate] = useState<number>(todayMandiRate || 11800);
  const [purchaseWeight, setPurchaseWeight] = useState<number>(2000);
  const [birdCount, setBirdCount] = useState<number>(1000);
  const [paidCash, setPaidCash] = useState<number>(100000);
  const [paidBank, setPaidBank] = useState<number>(200000);

  const [isAddSupplierModalOpen, setIsAddSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Party | null>(null);

  const selectedSupplier = parties.find((p) => p.id === selectedSupplierId) || suppliers[0];

  // Ctrl+P prints the currently filtered statement.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        e.preventDefault();
        setShowPrintModal(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Deep filter: void visibility, entry-type group, date range, search.
  const supplierEntries = filterLedgerEntries(ledgerEntries, selectedSupplierId, filter);
  const totalDebit = supplierEntries.reduce((s, e) => s + (e.debit || 0), 0);
  const totalCredit = supplierEntries.reduce((s, e) => s + (e.credit || 0), 0);

  const handleSavePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) return;

    const totalAmount = Math.round((purchaseRate * purchaseWeight) / 40);
    const totalPaid = (paidCash || 0) + (paidBank || 0);
    const prevBal = selectedSupplier.currentBalance;
    const newBal = prevBal + totalAmount - totalPaid;

    const newPurchase: Purchase = {
      id: `pur-${Date.now()}`,
      purchaseNumber: `PUR-${100 + purchases.length + 1}`,
      purchaseDate: new Date().toISOString().split('T')[0],
      supplierId: selectedSupplier.id,
      supplierName: selectedSupplier.name,
      ratePer40kg: purchaseRate,
      grossWeightKg: purchaseWeight,
      mortalityKg: 0,
      netWeightKg: purchaseWeight,
      birdCount,
      totalAmount,
      paidCash,
      paidBank,
      previousBalance: prevBal,
      newBalance: newBal,
      createdAt: new Date().toISOString()
    };

    onAddPurchase(newPurchase);
    setShowAddPurchaseModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-emerald-600" />
            <span>{isUrdu ? 'سپلائر کھاتہ و مرغ و فیڈ خریداری' : 'Supplier Ledger & Procurement'}</span>
          </h2>
          <p className="text-xs text-slate-500">
            {isUrdu 
              ? 'ہیچری اور فیڈ ملز سے خریداری، ادائیگیاں اور بقایا جات کھاتہ' 
              : 'Bird growers, hatcheries, feed mills purchases, supplier running ledger & payments.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditingSupplier(null);
              setIsAddSupplierModalOpen(true);
            }}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 rounded-xl text-xs font-bold transition shadow-sm"
          >
            <UserPlus className="w-4 h-4 text-emerald-400" />
            <span>{isUrdu ? 'نیا سپلائر درج کریں' : '+ Add Supplier'}</span>
          </button>

          <button
            onClick={() => onOpenReceiptModal(selectedSupplier?.id)}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-bold transition shadow-sm"
          >
            <span>{isUrdu ? 'سپلائر کو ادائیگی درج کریں' : 'Make Payment to Supplier'}</span>
          </button>

          <button
            onClick={() => setShowAddPurchaseModal(true)}
            className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            <span>{isUrdu ? 'نئی خریداری درج کریں' : 'New Purchase'}</span>
          </button>

          <button
            onClick={() => setShowPrintModal(true)}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm"
            title={isUrdu ? 'کھاتہ پرنٹ (Ctrl+P)' : 'Print statement (Ctrl+P)'}
          >
            <Printer className="w-4 h-4" />
            <span>{isUrdu ? 'پرنٹ کھاتہ' : 'Print Ledger'}</span>
          </button>
        </div>
      </div>

      {/* Supplier Picker */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="w-full sm:w-80">
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-bold text-slate-700">
              {isUrdu ? 'سپلائر منتخب کریں:' : 'Select Supplier:'}
            </label>
            {selectedSupplier && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingSupplier(selectedSupplier);
                    setIsAddSupplierModalOpen(true);
                  }}
                  className="text-[11px] font-bold text-blue-700 hover:text-blue-800 flex items-center gap-1"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>{isUrdu ? 'ترمیم پروفائل' : 'Edit Profile'}</span>
                </button>
                {onDeleteParty && (
                  <button
                    type="button"
                    onClick={() => {
                      const ok = window.confirm(
                        isUrdu
                          ? `کیا واقعی ”${selectedSupplier.urduName || selectedSupplier.name}“ کا کھاتہ حذف کرنا ہے؟ لین دین والا کھاتہ حذف نہیں ہوگا۔`
                          : `Delete the account of "${selectedSupplier.name}"? Accounts with transactions cannot be deleted.`
                      );
                      if (ok && onDeleteParty) {
                        const deleted = onDeleteParty(selectedSupplier.id);
                        if (deleted) {
                          const next = parties.find(
                            (p) => p.partyType === 'supplier' && p.id !== selectedSupplier.id
                          );
                          setSelectedSupplierId(next?.id || '');
                        }
                      }
                    }}
                    className="text-[11px] font-bold text-rose-700 hover:text-rose-800 flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    <span>{isUrdu ? 'کھاتہ حذف کریں' : 'Delete Account'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
          <select
            value={selectedSupplierId}
            onChange={(e) => setSelectedSupplierId(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white"
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.urduName ? `${s.urduName} (${s.name})` : s.name} — Owed: Rs {s.currentBalance.toLocaleString()}
              </option>
            ))}
          </select>
        </div>

        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-right">
          <span className="text-[11px] font-bold text-amber-800 block">
            {isUrdu ? 'سپلائر کو واجب الادا رقم (Payable):' : 'Total Payable to Supplier:'}
          </span>
          <span className="text-xl font-black text-amber-950 font-mono">
            Rs {selectedSupplier?.currentBalance.toLocaleString()}
          </span>
          <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px]">
            <span className="text-slate-500 font-semibold">
              {isUrdu ? 'ابتدائی بیلنس:' : 'Opening:'} Rs {(selectedSupplier?.openingBalance || 0).toLocaleString()}
            </span>
            {canEditLedger && onEditLedgerEntry && (
              <button
                type="button"
                onClick={() => {
                  const openingRow = ledgerEntries.find(
                    (e) => e.partyId === selectedSupplierId && e.refType === 'opening' && !e.isVoid
                  );
                  if (openingRow) {
                    setEditingEntry(openingRow);
                  } else if (selectedSupplier) {
                    setEditingSupplier(selectedSupplier);
                    setIsAddSupplierModalOpen(true);
                  }
                }}
                className="font-bold text-blue-700 hover:text-blue-800 flex items-center gap-0.5"
                title={isUrdu ? 'ابتدائی بیلنس میں ترمیم' : 'Edit opening balance'}
              >
                <Pencil className="w-3 h-3" />
                <span>{isUrdu ? 'ترمیم' : 'Edit'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Deep filter: date presets + range, entry type, search, voided toggle */}
      <LedgerFilterBar filter={filter} onChange={setFilter} language={language} />

      {/* Supplier Ledger Table */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-800">
            {isUrdu ? 'سپلائر کا لین دین رجسٹر (خریداری و ادائیگیاں)' : 'Supplier Transactions & Ledgers'}
          </h3>
          <div className="flex items-center gap-3 text-[11px] font-mono font-bold">
            <span className="text-rose-700">Debit: Rs {totalDebit.toLocaleString()}</span>
            <span className="text-emerald-700">Credit: Rs {totalCredit.toLocaleString()}</span>
            <span className="text-slate-500">{supplierEntries.length} {isUrdu ? 'انٹریاں' : 'entries'}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left text-slate-700 border-collapse">
            <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[11px]">
              <tr>
                <th className="p-3 border-b">{isUrdu ? 'تاریخ' : 'Date'}</th>
                <th className="p-3 border-b">{isUrdu ? 'تفصیل' : 'Detail'}</th>
                <th className="p-3 border-b">{isUrdu ? 'منڈی ریٹ' : 'Mandi Rate'}</th>
                <th className="p-3 border-b">{isUrdu ? 'رسید / بل #' : 'Ref #'}</th>
                <th className="p-3 border-b text-right text-rose-700">{isUrdu ? 'خریداری مال (Debit)' : 'Purchase (Debit)'}</th>
                <th className="p-3 border-b text-right text-emerald-700">{isUrdu ? 'ادائیگی رقم (Credit)' : 'Paid (Credit)'}</th>
                <th className="p-3 border-b text-right">{isUrdu ? 'بقایا واجب الادا' : 'Running Balance'}</th>
                {canEditLedger && onEditLedgerEntry && (
                  <th className="p-3 border-b text-center no-print">{isUrdu ? 'ترمیم' : 'Edit'}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {supplierEntries.length === 0 ? (
                <tr>
                  <td colSpan={canEditLedger && onEditLedgerEntry ? 8 : 7} className="p-6 text-center text-slate-400">
                    {isUrdu ? 'اس سپلائر کی کوئی پرانی انٹری موجود نہیں ہے' : 'No recorded transactions yet for this supplier.'}
                  </td>
                </tr>
              ) : (
                supplierEntries.map((e) => (
                  <tr key={e.id} className={`hover:bg-slate-50 ${e.isVoid ? 'opacity-60' : ''}`}>
                    <td className="p-3 font-mono">{e.entryDate}</td>
                    <td className="p-3 font-medium">
                      {isUrdu ? e.detailUrdu : e.detail}
                      {e.isVoid && (
                        <span className="ml-1 text-[9px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">
                          {isUrdu ? 'وائڈ' : 'VOID'}
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-mono font-bold text-amber-900">
                      {e.mandiRate ? `Rs ${e.mandiRate.toLocaleString()}` : '-'}
                    </td>
                    <td className="p-3 font-mono text-slate-500">{e.folioNo || '-'}</td>
                    <td className="p-3 text-right font-mono font-bold text-rose-700">
                      {e.debit > 0 ? `Rs ${e.debit.toLocaleString()}` : '-'}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-700">
                      {e.credit > 0 ? `Rs ${e.credit.toLocaleString()}` : '-'}
                    </td>
                    <td className="p-3 text-right font-mono font-extrabold text-slate-900">
                      Rs {e.runningBalance.toLocaleString()}
                    </td>
                    {canEditLedger && onEditLedgerEntry && (
                      <td className="p-3 text-center no-print">
                        {!e.isVoid && (
                          <button
                            type="button"
                            onClick={() => setEditingEntry(e)}
                            className="p-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 transition"
                            title={isUrdu ? 'انٹری میں ترمیم' : 'Edit entry'}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Purchase Modal */}
      {showAddPurchaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 text-slate-800 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 mb-3">
              {isUrdu ? 'نئی خریداری درج کریں (برائلر مال یا فیڈ)' : 'Record Farm Purchase'}
            </h3>

            <form onSubmit={handleSavePurchase} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isUrdu ? 'خریداری ریٹ / 40 کلو:' : 'Purchase Rate / 40kg:'}
                  </label>
                  <input
                    type="number"
                    value={purchaseRate}
                    onChange={(e) => setPurchaseRate(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isUrdu ? 'خالص وزن (کلو):' : 'Net Weight (Kg):'}
                  </label>
                  <input
                    type="number"
                    value={purchaseWeight}
                    onChange={(e) => setPurchaseWeight(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isUrdu ? 'مرغ تعداد (Birds):' : 'Bird Count:'}
                </label>
                <input
                  type="number"
                  value={birdCount}
                  onChange={(e) => setBirdCount(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between font-bold">
                <span>{isUrdu ? 'کل بل خریداری:' : 'Total Amount:'}</span>
                <span className="font-mono text-emerald-800">
                  Rs {Math.round((purchaseRate * purchaseWeight) / 40).toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isUrdu ? 'موقع پر ادا کیش:' : 'Cash Paid Now:'}
                  </label>
                  <input
                    type="number"
                    value={paidCash}
                    onChange={(e) => setPaidCash(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isUrdu ? 'بینک سے ادا رقم:' : 'Bank Paid Now:'}
                  </label>
                  <input
                    type="number"
                    value={paidBank}
                    onChange={(e) => setPaidBank(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddPurchaseModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  {isUrdu ? 'منسوخ' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl"
                >
                  {isUrdu ? 'خریداری محفوظ کریں' : 'Save Purchase'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Supplier Modal */}
      <PartyModal
        isOpen={isAddSupplierModalOpen}
        onClose={() => {
          setIsAddSupplierModalOpen(false);
          setEditingSupplier(null);
        }}
        initialParty={editingSupplier}
        onSaveParty={(party) => {
          if (editingSupplier && onUpdateParty) {
            onUpdateParty(party);
          } else if (onAddParty) {
            onAddParty(party);
            setSelectedSupplierId(party.id);
          }
        }}
        defaultPartyType="supplier"
        language={language}
      />

      {/* Shared printable statement modal (PDF / WhatsApp / print) */}
      {showPrintModal && selectedSupplier && (
        <LedgerPrintModal
          party={selectedSupplier}
          entries={supplierEntries}
          startDate={filter.startDate || '…'}
          endDate={filter.endDate || new Date().toISOString().split('T')[0]}
          language={language}
          onClose={() => setShowPrintModal(false)}
        />
      )}

      {/* Ledger row edit modal */}
      {editingEntry && onEditLedgerEntry && (
        <LedgerEntryEditModal
          entry={editingEntry}
          partyName={selectedSupplier?.urduName || selectedSupplier?.name || ''}
          language={language}
          onClose={() => setEditingEntry(null)}
          onSave={(entryId, patch) => {
            onEditLedgerEntry(entryId, patch);
            setEditingEntry(null);
          }}
        />
      )}
    </div>
  );
};
