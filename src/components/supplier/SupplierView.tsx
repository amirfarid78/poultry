import React, { useState } from 'react';
import { Party, Purchase, LedgerEntry, UserRole } from '../../types';
import { formatPKR } from '../../utils/calculations';
import { Building2, Plus, ArrowRight, Printer, Share2 } from 'lucide-react';

interface SupplierViewProps {
  parties: Party[];
  purchases: Purchase[];
  ledgerEntries: LedgerEntry[];
  currentRole: UserRole;
  language: 'en' | 'ur';
  onAddPurchase: (purchase: Purchase) => void;
  onOpenReceiptModal: (partyId?: string) => void;
}

export const SupplierView: React.FC<SupplierViewProps> = ({
  parties,
  purchases,
  ledgerEntries,
  currentRole,
  language,
  onAddPurchase,
  onOpenReceiptModal
}) => {
  const isUrdu = language === 'ur';
  const suppliers = parties.filter((p) => p.partyType === 'supplier');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(suppliers[0]?.id || '');

  const [showAddPurchaseModal, setShowAddPurchaseModal] = useState(false);
  const [purchaseRate, setPurchaseRate] = useState<number>(11800);
  const [purchaseWeight, setPurchaseWeight] = useState<number>(2000);
  const [birdCount, setBirdCount] = useState<number>(1000);
  const [paidCash, setPaidCash] = useState<number>(100000);
  const [paidBank, setPaidBank] = useState<number>(200000);

  const selectedSupplier = parties.find((p) => p.id === selectedSupplierId) || suppliers[0];

  const supplierEntries = ledgerEntries
    .filter((e) => e.partyId === selectedSupplierId)
    .sort((a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime());

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
            onClick={() => onOpenReceiptModal(selectedSupplier?.id)}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-bold transition shadow-sm"
          >
            <span>{isUrdu ? 'سپلائر کو ادائیگی درج کریں' : 'Make Payment to Supplier'}</span>
          </button>

          <button
            onClick={() => setShowAddPurchaseModal(true)}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            <span>{isUrdu ? 'نئی خریداری درج کریں' : 'New Purchase'}</span>
          </button>
        </div>
      </div>

      {/* Supplier Picker */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="w-full sm:w-80">
          <label className="block text-xs font-bold text-slate-700 mb-1">
            {isUrdu ? 'سپلائر منتخب کریں:' : 'Select Supplier:'}
          </label>
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
        </div>
      </div>

      {/* Supplier Ledger Table */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-slate-800">
          {isUrdu ? 'سپلائر کا لین دین رجسٹر (خریداری و ادائیگیاں)' : 'Supplier Transactions & Ledgers'}
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left text-slate-700 border-collapse">
            <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[11px]">
              <tr>
                <th className="p-3 border-b">{isUrdu ? 'تاریخ' : 'Date'}</th>
                <th className="p-3 border-b">{isUrdu ? 'تفصیل' : 'Detail'}</th>
                <th className="p-3 border-b">{isUrdu ? 'رسید / بل #' : 'Ref #'}</th>
                <th className="p-3 border-b text-right text-rose-700">{isUrdu ? 'خریداری مال (Debit)' : 'Purchase (Debit)'}</th>
                <th className="p-3 border-b text-right text-emerald-700">{isUrdu ? 'ادائیگی رقم (Credit)' : 'Paid (Credit)'}</th>
                <th className="p-3 border-b text-right">{isUrdu ? 'بقایا واجب الادا' : 'Running Balance'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {supplierEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-400">
                    {isUrdu ? 'اس سپلائر کی کوئی پرانی انٹری موجود نہیں ہے' : 'No recorded transactions yet for this supplier.'}
                  </td>
                </tr>
              ) : (
                supplierEntries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono">{e.entryDate}</td>
                    <td className="p-3 font-medium">{isUrdu ? e.detailUrdu : e.detail}</td>
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
    </div>
  );
};
