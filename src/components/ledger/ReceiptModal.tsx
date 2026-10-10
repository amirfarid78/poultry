import React, { useState } from 'react';
import { Party, ReceiptVoucher, PaymentMode } from '../../types';
import { formatPKR } from '../../utils/calculations';
import { Receipt, X, CheckCircle, CreditCard, Banknote, Building } from 'lucide-react';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  parties: Party[];
  preselectedPartyId?: string;
  onSaveReceipt: (receipt: ReceiptVoucher) => void;
  language: 'en' | 'ur';
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  parties,
  preselectedPartyId,
  onSaveReceipt,
  language
}) => {
  if (!isOpen) return null;
  const isUrdu = language === 'ur';

  const [partyId, setPartyId] = useState<string>(preselectedPartyId || parties[0]?.id || '');
  const [receiptDate, setReceiptDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState<number>(20000); // 20000 like in reference sheet
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [bankName, setBankName] = useState<string>('Meezan Bank');
  const [refNo, setRefNo] = useState<string>('');
  const [collectedBy, setCollectedBy] = useState<string>('منشی راشد (Munshi)');
  const [notes, setNotes] = useState<string>('نقد وصولی برائے کھاتہ');

  const selectedParty = parties.find((p) => p.id === partyId) || parties[0];
  const curBal = selectedParty?.currentBalance || 0;
  
  // New balance calculation:
  // If customer: paying reduces their balance: curBal - amount
  // If supplier: paying reduces our payable: curBal - amount
  const newBalance = curBal - (amount || 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParty || amount <= 0) return;

    const receiptNo = `REC-${Math.floor(1000 + Math.random() * 9000)}`;
    const token = `tok-rec-${Date.now().toString(36)}`;

    const newReceipt: ReceiptVoucher = {
      id: `rec-${Date.now()}`,
      receiptNumber: receiptNo,
      receiptDate,
      partyId: selectedParty.id,
      partyType: selectedParty.partyType,
      amount,
      paymentMode,
      bankName: paymentMode !== 'cash' ? bankName : undefined,
      refNo,
      notes,
      collectedBy,
      previousBalance: curBal,
      newBalance,
      shareToken: token,
      createdAt: new Date().toISOString()
    };

    onSaveReceipt(newReceipt);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 text-slate-800 shadow-2xl animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                {isUrdu ? 'صرف رقم وصولی واؤچر (کوئی مال نہیں)' : 'Payment Only Receipt Voucher'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {isUrdu ? 'کھاتہ میں نقد یا آن لائن رقم کی براہ راست وصولی کا اندراج' : 'Record cash or online collection directly to khata'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Party Selection */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {isUrdu ? 'گاہک یا سپلائر منتخب کریں:' : 'Select Party:'}
            </label>
            <select
              value={partyId}
              onChange={(e) => setPartyId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-800"
            >
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.urduName ? `${p.urduName} (${p.name})` : p.name} — Bal: {formatPKR(p.currentBalance, true)}
                </option>
              ))}
            </select>
          </div>

          {/* Date & Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                {isUrdu ? 'تاریخ:' : 'Date:'}
              </label>
              <input
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-800"
                required
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                {isUrdu ? 'وصول شدہ رقم (روپے):' : 'Amount Received (PKR):'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 font-bold">Rs</span>
                <input
                  type="number"
                  value={amount || ''}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 font-mono text-sm font-bold text-slate-900"
                  placeholder="20000"
                  required
                />
              </div>
            </div>
          </div>

          {/* Payment Mode */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {isUrdu ? 'ادائیگی کا ذریعہ:' : 'Payment Mode:'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['cash', 'bank_transfer', 'jazzcash'] as PaymentMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPaymentMode(mode)}
                  className={`p-2 rounded-xl border text-center font-bold capitalize transition ${
                    paymentMode === mode 
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-800' 
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {mode === 'cash' ? (isUrdu ? 'نقد (Cash)' : 'Cash') : mode === 'bank_transfer' ? (isUrdu ? 'بینک' : 'Bank') : 'JazzCash / Easy'}
                </button>
              ))}
            </div>
          </div>

          {/* Bank / Reference Details if non-cash */}
          {paymentMode !== 'cash' && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  {isUrdu ? 'بینک / والٹ کا نام:' : 'Bank / Wallet:'}
                </label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  {isUrdu ? 'ٹرانزیکشن / سلپ نمبر:' : 'Trx Ref #:'}
                </label>
                <input
                  type="text"
                  value={refNo}
                  onChange={(e) => setRefNo(e.target.value)}
                  placeholder="TXN-12345"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
            </div>
          )}

          {/* Collected By (اگرائی کنندہ) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {isUrdu ? 'وصول کنندہ / اگرائی بوائے:' : 'Collected By (Recovery Staff):'}
              </label>
              <select
                value={collectedBy}
                onChange={(e) => setCollectedBy(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-300 font-bold bg-white text-xs"
              >
                <option value="منشی راشد (Munshi)">منشی راشد (Munshi)</option>
                <option value="محمد طارق (Driver)">محمد طارق (Driver)</option>
                <option value="نوید اختر (Driver)">نوید اختر (Driver)</option>
                <option value="وقاص احمد (اگرائی بوائے)">وقاص احمد (اگرائی بوائے)</option>
                <option value="آن لائن / بینک ٹرانسفر">آن لائن / بینک ٹرانسفر</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {isUrdu ? 'تفصیل / نوٹ:' : 'Narration / Notes:'}
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs"
              />
            </div>
          </div>

          {/* Preview of Balance Change */}
          <div className="p-3 rounded-xl bg-slate-900 text-white flex items-center justify-between font-mono">
            <div>
              <span className="text-[10px] text-slate-400 uppercase block">
                {isUrdu ? 'سابقہ بقایا' : 'Previous Balance'}
              </span>
              <span className="text-sm font-bold text-slate-200">
                {formatPKR(curBal, true)}
              </span>
            </div>
            <div className="text-center text-emerald-400 font-bold">
              → (-Rs {amount.toLocaleString()}) →
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 uppercase block">
                {isUrdu ? 'نیا بقایا' : 'New Balance'}
              </span>
              <span className={`text-base font-black ${newBalance < 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {formatPKR(newBalance, true)}
              </span>
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
              className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg transition"
            >
              {isUrdu ? 'وصولی محفوظ کریں' : 'Save Receipt Voucher'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
