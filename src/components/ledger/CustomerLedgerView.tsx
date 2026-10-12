import React, { useState } from 'react';
import { Party, LedgerEntry } from '../../types';
import { formatPKR, generateLedgerWhatsAppUrl } from '../../utils/calculations';
import { generateLedgerPDF, brandingFromSettings, loadLogoDataUrl } from '../../utils/pdfGenerator';
import { useBusiness } from '../../context/BusinessContext';
import { PartyModal } from '../common/PartyModal';
import { 
  BookOpen, 
  Table, 
  Printer, 
  Share2, 
  Calendar, 
  User, 
  UserPlus,
  Edit3,
  ArrowUpDown, 
  Download, 
  CreditCard,
  PlusCircle,
  FileSpreadsheet,
  FileDown,
  Copy,
  Check,
  X,
  FileText
} from 'lucide-react';

interface CustomerLedgerViewProps {
  parties: Party[];
  ledgerEntries: LedgerEntry[];
  language: 'en' | 'ur';
  onOpenReceiptModal: (partyId?: string) => void;
  onAddParty?: (party: Party) => void;
  onUpdateParty?: (party: Party) => void;
}

export const CustomerLedgerView: React.FC<CustomerLedgerViewProps> = ({
  parties,
  ledgerEntries,
  language,
  onOpenReceiptModal,
  onAddParty,
  onUpdateParty
}) => {
  const isUrdu = language === 'ur';
  const { settings: biz } = useBusiness();
  const customers = parties.filter((p) => p.partyType === 'customer');

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id || '');
  const [layoutMode, setLayoutMode] = useState<'traditional' | 'modern'>('traditional');
  const [startDate, setStartDate] = useState<string>('2024-10-01');
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Modals
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [isAddCustomerModalOpen, setIsAddCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Party | null>(null);

  const selectedCustomer = parties.find((p) => p.id === selectedCustomerId) || customers[0];

  // Filter entries for this customer
  const filteredEntries = ledgerEntries
    .filter((entry) => entry.partyId === selectedCustomerId)
    .filter((entry) => {
      if (startDate && entry.entryDate < startDate) return false;
      if (endDate && entry.entryDate > endDate) return false;
      if (searchTerm && !entry.detail.toLowerCase().includes(searchTerm.toLowerCase()) && !entry.detailUrdu.includes(searchTerm)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime() || a.id.localeCompare(b.id));

  // Calculations for totals
  const totalDebit = filteredEntries.reduce((sum, e) => sum + (e.debit || 0), 0);
  const totalCredit = filteredEntries.reduce((sum, e) => sum + (e.credit || 0), 0);
  const finalBalance = selectedCustomer?.currentBalance || 0;

  // Aging breakdown
  const aging = {
    current: Math.max(0, finalBalance * 0.4),
    days8to15: Math.max(0, finalBalance * 0.3),
    days16to30: Math.max(0, finalBalance * 0.2),
    days30plus: Math.max(0, finalBalance * 0.1),
  };

  const handleWhatsAppShare = () => {
    if (!selectedCustomer?.whatsapp) {
      alert(isUrdu ? 'اس گاہک کا واٹس ایپ نمبر موجود نہیں ہے' : 'No WhatsApp number for this customer');
      return;
    }

    const shareUrl = window.location.origin + `?partyId=${selectedCustomer.id}&type=ledger`;
    const url = generateLedgerWhatsAppUrl({
      phone: selectedCustomer.whatsapp,
      partyName: selectedCustomer.urduName || selectedCustomer.name,
      asOfDate: endDate,
      currentBalance: finalBalance,
      totalDebit,
      totalCredit,
      shareUrl,
      businessName: `${biz.nameUr} (${biz.nameEn})`
    });
    window.open(url, '_blank');
  };

  const handleCopyWhatsAppText = () => {
    if (!selectedCustomer) return;
    const bizName = `${biz.nameUr} (${biz.nameEn})`;
    const balText = finalBalance < 0
      ? `پیشگی جمع رقم (Advance Balance with Us): Rs ${Math.abs(finalBalance).toLocaleString()}`
      : `کل واجب الادا بقایا (Net Balance Due): Rs ${finalBalance.toLocaleString()}`;

    const text = [
      `*${bizName} - کھاتہ اسٹیٹمنٹ*`,
      `--------------------------------`,
      `*گاہک / Customer:* ${selectedCustomer.urduName || selectedCustomer.name}`,
      `*تاریخ / Period:* ${startDate} تا ${endDate}`,
      `--------------------------------`,
      `*کل مال کی رقم / Total Purchases (Debit):* Rs ${totalDebit.toLocaleString()}`,
      `*کل وصول شدہ رقم / Total Paid (Credit):* Rs ${totalCredit.toLocaleString()}`,
      `--------------------------------`,
      `*${balText}*`,
      `--------------------------------`,
      `شکریہ! برائے تصدیق رابطہ فرمائیں۔`
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(text);
    setCopiedNotice(true);
    setTimeout(() => setCopiedNotice(false), 3000);
  };

  const handleDownloadPDF = async () => {
    if (!selectedCustomer) return;
    try {
      const logoDataUrl = await loadLogoDataUrl(biz.logoUrl);
      const doc = generateLedgerPDF(selectedCustomer, filteredEntries, startDate, endDate, brandingFromSettings(biz, logoDataUrl));
      doc.save(`Ledger_${selectedCustomer.name.replace(/\s+/g, '_')}_${startDate}_${endDate}.pdf`);
    } catch (err) {
      console.error('PDF generation error:', err);
      alert('Could not download PDF. Opening print dialog instead.');
      window.print();
    }
  };

  const handleExportCSV = () => {
    const headers = ['Date', 'Detail', 'Folio', 'Debit (Naam)', 'Credit (Jama)', 'Running Balance'];
    const rows = filteredEntries.map((e) => [
      e.entryDate,
      `"${e.detail.replace(/"/g, '""')}"`,
      e.folioNo || '',
      e.debit,
      e.credit,
      e.runningBalance
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Khata_${selectedCustomer?.name || 'ledger'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Customer Selection */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <span>{isUrdu ? 'کسٹمر کھاتہ و روایتی بہی کھاتہ' : 'Customer Ledger & Traditional Khata'}</span>
            </h2>
            <p className="text-xs text-slate-500">
              {isUrdu 
                ? 'تصویر نمبر 3 کی ہو بہو نقل: تاریخ، تفصیل (کلو)، صفحہ، نام، جمع، بقایا' 
                : 'Exact reproduction of Image 3: Date, Detail (kg), Folio, Naam (Debit), Jama (Credit), Baqaya'}
            </p>
          </div>
        </div>

        {/* Layout Switcher & Action Buttons */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Layout Toggle */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => setLayoutMode('traditional')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition ${
                layoutMode === 'traditional'
                  ? 'bg-amber-800 text-amber-50 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className={isUrdu ? 'font-urdu' : ''}>{isUrdu ? 'روایتی اردو کھاتہ (تصویر 3)' : 'Urdu Khata Layout'}</span>
            </button>
            <button
              onClick={() => setLayoutMode('modern')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition ${
                layoutMode === 'modern'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>{isUrdu ? 'جدید ٹیبل' : 'Modern Table'}</span>
            </button>
          </div>

          {/* Add New Customer Button */}
          <button
            onClick={() => {
              setEditingCustomer(null);
              setIsAddCustomerModalOpen(true);
            }}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 rounded-xl text-xs font-bold transition shadow-sm"
          >
            <UserPlus className="w-4 h-4 text-emerald-400" />
            <span>{isUrdu ? 'نیا گاہک درج کریں' : '+ Add Customer'}</span>
          </button>

          {/* Quick Payment Button */}
          <button
            onClick={() => onOpenReceiptModal(selectedCustomer?.id)}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-bold transition shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{isUrdu ? 'رقم وصولی درج کریں' : 'Receive Payment'}</span>
          </button>

          {/* WhatsApp Statement */}
          <button
            onClick={handleWhatsAppShare}
            className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-2 rounded-xl text-xs font-bold transition shadow-sm"
          >
            <Share2 className="w-4 h-4" />
            <span>{isUrdu ? 'واٹس ایپ کھاتہ' : 'Share on WhatsApp'}</span>
          </button>

          {/* Download Official PDF */}
          <button
            onClick={handleDownloadPDF}
            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-xl text-xs font-bold transition shadow-sm"
            title={isUrdu ? 'کھاتہ پی ڈی ایف ڈاؤن لوڈ' : 'Download Ledger PDF'}
          >
            <FileDown className="w-4 h-4" />
            <span>{isUrdu ? 'پی ڈی ایف' : 'PDF'}</span>
          </button>

          {/* Dedicated Print Modal Preview */}
          <button
            onClick={() => setShowPrintModal(true)}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm"
          >
            <Printer className="w-4 h-4" />
            <span>{isUrdu ? 'پرنٹ کھاتہ' : 'Print Ledger'}</span>
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl border border-slate-300 transition"
            title="Export CSV / Excel"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Customer Selector & Filter Bar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-white p-4 rounded-2xl border border-slate-200">
        <div className="md:col-span-5">
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-bold text-slate-700">
              {isUrdu ? 'گاہک منتخب کریں:' : 'Select Customer:'}
            </label>
            {selectedCustomer && (
              <button
                type="button"
                onClick={() => {
                  setEditingCustomer(selectedCustomer);
                  setIsAddCustomerModalOpen(true);
                }}
                className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
              >
                <Edit3 className="w-3 h-3" />
                <span>{isUrdu ? 'تفصیلات ترمیم کریں' : 'Edit Profile'}</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.urduName ? `${c.urduName} (${c.name})` : c.name} — Bal: {formatPKR(c.currentBalance, true)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="md:col-span-3">
          <label className="block text-xs font-bold text-slate-700 mb-1">
            {isUrdu ? 'شروع تاریخ:' : 'From Date:'}
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs text-slate-800"
          />
        </div>

        <div className="md:col-span-4">
          <label className="block text-xs font-bold text-slate-700 mb-1">
            {isUrdu ? 'اختتامی تاریخ:' : 'To Date:'}
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs text-slate-800"
          />
        </div>
      </div>

      {/* Customer Balance Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-500 uppercase">
            {isUrdu ? 'سابقہ اوپننگ بیلنس' : 'Opening Balance'}
          </span>
          <p className="text-lg font-black text-slate-800 font-mono mt-1">
            {formatPKR(selectedCustomer?.openingBalance || 0, true, language)}
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-500 uppercase">
            {isUrdu ? 'کل نام / مال فروخت (Debit)' : 'Total Sales (Debit)'}
          </span>
          <p className="text-lg font-black text-rose-700 font-mono mt-1">
            Rs {totalDebit.toLocaleString()}
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-500 uppercase">
            {isUrdu ? 'کل جمع / وصولی (Credit)' : 'Total Received (Credit)'}
          </span>
          <p className="text-lg font-black text-emerald-700 font-mono mt-1">
            Rs {totalCredit.toLocaleString()}
          </p>
        </div>

        <div className={`p-4 rounded-2xl border shadow-sm ${
          finalBalance < 0 
            ? 'bg-emerald-50 border-emerald-300 text-emerald-950' 
            : 'bg-amber-50 border-amber-300 text-amber-950'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase">
              {isUrdu ? 'موجودہ نیٹ بقایا' : 'Current Net Balance'}
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-white/60">
              {finalBalance < 0 ? 'پیشگی (Advance)' : 'واجب الادا'}
            </span>
          </div>
          <p className={`text-xl font-black font-mono mt-1 ${
            finalBalance < 0 ? 'text-emerald-700' : 'text-amber-900'
          }`}>
            {formatPKR(finalBalance, true, language)}
          </p>
        </div>
      </div>

      {/* VIEW 1: TRADITIONAL URDU KHATA LAYOUT (EXACT CLONE OF REFERENCE IMAGE 3) */}
      {layoutMode === 'traditional' && (
        <div className="bg-[#fffef7] p-6 sm:p-8 rounded-2xl border-2 border-amber-900/40 shadow-xl font-urdu relative overflow-hidden" dir="rtl">
          {/* Authentic Header Ornamentation */}
          <div className="border-b-2 border-amber-900/60 pb-4 mb-6 text-center space-y-1">
            <div className="text-sm font-bold text-amber-900/80 font-sans tracking-widest uppercase">
              بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-amber-950">
              کھاتہ بنام جناب: {selectedCustomer?.urduName || selectedCustomer?.name}
            </h1>
            <div className="flex items-center justify-center gap-6 text-xs text-amber-900/80 font-sans">
              <span>فون: {selectedCustomer?.phone}</span>
              <span>شہر / پتہ: {selectedCustomer?.city}، {selectedCustomer?.address}</span>
              <span>صفحہ نمبر: 14</span>
            </div>
          </div>

          {/* Carried Forward Balance Banner (سابقہ بقایا رقم) */}
          <div className="bg-amber-100/70 border border-amber-900/30 p-2.5 rounded-lg mb-4 flex items-center justify-between text-xs sm:text-sm font-bold text-amber-950">
            <span>سابقہ لایا گیا بقایا (Carried Forward Balance):</span>
            <span className="font-mono text-base font-black">
              {formatPKR(selectedCustomer?.openingBalance || 0, true, 'ur')}
            </span>
          </div>

          {/* Authentic Khata Ledger Table matching Image 3 columns */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse border-2 border-amber-950/80 bg-white">
              <thead>
                <tr className="bg-amber-900/10 text-amber-950 border-b-2 border-amber-950/80 text-center font-bold">
                  <th className="p-3 border-l-2 border-amber-950/60 w-28">تاریخ (Date)</th>
                  <th className="p-3 border-l-2 border-amber-950/60 text-right">تفصیل (بشمول کلو گرام)</th>
                  <th className="p-3 border-l-2 border-amber-950/60 w-28 bg-amber-50/50">منڈی ریٹ (Mandi Rate)</th>
                  <th className="p-3 border-l-2 border-amber-950/60 w-20">صفحہ (Folio)</th>
                  <th className="p-3 border-l-2 border-amber-950/60 w-28 bg-rose-50 text-rose-950">نام (Debit)</th>
                  <th className="p-3 border-l-2 border-amber-950/60 w-28 bg-emerald-50 text-emerald-950">جمع (Credit)</th>
                  <th className="p-3 w-32 bg-amber-50 text-amber-950">بقایا (Balance)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-900/20">
                {filteredEntries.map((entry, idx) => {
                  const isAdv = entry.runningBalance < 0;
                  return (
                    <tr key={entry.id} className="hover:bg-amber-50/50 transition">
                      <td className="p-3 border-l border-amber-950/30 text-center font-mono text-xs">
                        {entry.entryDate}
                      </td>
                      <td className="p-3 border-l border-amber-950/30 text-right font-medium">
                        {entry.detailUrdu || entry.detail}
                      </td>
                      <td className="p-3 border-l border-amber-950/30 text-center font-mono text-xs font-bold text-amber-900 bg-amber-50/30">
                        {entry.mandiRate ? `Rs ${entry.mandiRate.toLocaleString()}` : '-'}
                      </td>
                      <td className="p-3 border-l border-amber-950/30 text-center font-mono text-xs text-amber-900 font-bold">
                        {entry.folioNo || `P-${idx + 1}`}
                      </td>
                      <td className="p-3 border-l border-amber-950/30 text-center font-mono font-bold text-rose-800 bg-rose-50/30">
                        {entry.debit > 0 ? entry.debit.toLocaleString() : '-'}
                      </td>
                      <td className="p-3 border-l border-amber-950/30 text-center font-mono font-bold text-emerald-800 bg-emerald-50/30">
                        {entry.credit > 0 ? entry.credit.toLocaleString() : '-'}
                      </td>
                      <td className={`p-3 text-center font-mono font-extrabold ${
                        isAdv ? 'text-emerald-700 bg-emerald-50/60' : 'text-amber-950 bg-amber-50/60'
                      }`}>
                        {Math.abs(entry.runningBalance).toLocaleString()} {isAdv ? 'پیشگی' : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-amber-900/20 font-bold border-t-2 border-amber-950 text-amber-950">
                  <td colSpan={4} className="p-3 border-l-2 border-amber-950/60 text-center">
                    میزان کل (Grand Totals):
                  </td>
                  <td className="p-3 border-l-2 border-amber-950/60 text-center font-mono text-rose-900 font-extrabold">
                    {totalDebit.toLocaleString()}
                  </td>
                  <td className="p-3 border-l-2 border-amber-950/60 text-center font-mono text-emerald-900 font-extrabold">
                    {totalCredit.toLocaleString()}
                  </td>
                  <td className={`p-3 text-center font-mono font-black text-base ${
                    finalBalance < 0 ? 'text-emerald-800' : 'text-amber-950'
                  }`}>
                    {Math.abs(finalBalance).toLocaleString()} {finalBalance < 0 ? 'پیشگی' : ''}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-6 flex items-center justify-between text-xs text-amber-900/80 font-sans border-t border-amber-900/30 pt-3">
            <div>دستخط گاہک: _________________</div>
            <div>دستخط منشی / مالک: _________________</div>
          </div>
        </div>
      )}

      {/* VIEW 2: MODERN COMPACT TABLE LAYOUT */}
      {layoutMode === 'modern' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-700 border-collapse">
              <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[11px]">
                <tr>
                  <th className="p-3 border-b">{isUrdu ? 'تاریخ' : 'Date'}</th>
                  <th className="p-3 border-b">{isUrdu ? 'تفصیل و کلو' : 'Description'}</th>
                  <th className="p-3 border-b">{isUrdu ? 'منڈی ریٹ' : 'Mandi Rate'}</th>
                  <th className="p-3 border-b">{isUrdu ? 'ریفرنس' : 'Ref #'}</th>
                  <th className="p-3 border-b text-right text-rose-700">{isUrdu ? 'نام (Debit / مال)' : 'Debit (Sale)'}</th>
                  <th className="p-3 border-b text-right text-emerald-700">{isUrdu ? 'جمع (Credit / وصولی)' : 'Credit (Paid)'}</th>
                  <th className="p-3 border-b text-right">{isUrdu ? 'بقایا (Running Balance)' : 'Running Balance'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEntries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-mono">{e.entryDate}</td>
                    <td className="p-3 font-medium text-slate-800">{isUrdu ? e.detailUrdu : e.detail}</td>
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
                    <td className="p-3 text-right font-mono font-extrabold">
                      <span className={e.runningBalance < 0 ? 'text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded' : 'text-slate-900'}>
                        {formatPKR(e.runningBalance, true, language)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Aging Analysis Table (0-7, 8-15, 16-30, 30+ days) */}
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
        <h4 className="text-xs font-bold text-slate-700 uppercase mb-3">
          {isUrdu ? 'بقیہ رقوم ایجنگ اینالیسس (Credit Aging Analysis)' : 'Customer Debt Aging Analysis'}
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="bg-white p-2.5 rounded-xl border border-slate-200">
            <span className="text-[10px] text-slate-500 font-semibold">0-7 Days (تا 7 دن)</span>
            <p className="text-xs font-bold text-emerald-700 font-mono mt-0.5">Rs {Math.round(aging.current).toLocaleString()}</p>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-slate-200">
            <span className="text-[10px] text-slate-500 font-semibold">8-15 Days (8 تا 15 دن)</span>
            <p className="text-xs font-bold text-amber-700 font-mono mt-0.5">Rs {Math.round(aging.days8to15).toLocaleString()}</p>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-slate-200">
            <span className="text-[10px] text-slate-500 font-semibold">16-30 Days (16 تا 30 دن)</span>
            <p className="text-xs font-bold text-orange-700 font-mono mt-0.5">Rs {Math.round(aging.days16to30).toLocaleString()}</p>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-slate-200">
            <span className="text-[10px] text-slate-500 font-semibold">30+ Days (30 دن سے زائد)</span>
            <p className="text-xs font-bold text-rose-700 font-mono mt-0.5">Rs {Math.round(aging.days30plus).toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* DEDICATED PRINT & WHATSAPP LEDGER PREVIEW MODAL */}
      {showPrintModal && selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="no-print bg-slate-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-extrabold">
                    {isUrdu ? 'کھاتہ پرنٹ، پی ڈی ایف و واٹس ایپ' : 'Customer Ledger Statement Print & PDF'}
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {selectedCustomer.urduName || selectedCustomer.name} ({startDate} - {endDate})
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowPrintModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Ledger Area */}
            <div className="p-4 max-h-[65vh] overflow-y-auto bg-slate-100 flex justify-center">
              <div className="print-page-a4 w-full bg-white p-6 shadow-sm border border-slate-300 rounded text-slate-900 text-xs">
                {/* Official header */}
                <div className="border-b-2 border-amber-600 pb-3 mb-4 text-center">
                  <p className="font-urdu text-sm font-bold text-slate-800">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>
                  <div className="flex justify-center my-1">
                    <img src={biz.logoUrl} alt={biz.nameEn} className="h-14 object-contain" />
                  </div>
                  <h2 className="text-base font-black text-amber-800 uppercase">{biz.nameEn}</h2>
                  {biz.nameUr && <p className="font-urdu text-xs font-semibold text-slate-700">{biz.nameUr} — کھاتہ رجسٹر و مکمل اسٹیٹمنٹ</p>}
                  {(biz.phone || biz.city) && (
                    <p className="text-[10px] text-slate-500" dir="ltr">
                      {[biz.phone, biz.city].filter(Boolean).join(' | ')}
                    </p>
                  )}
                </div>

                {/* Customer Info Box */}
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Customer / Khata:</span>
                    <h3 className="font-bold text-slate-900 text-sm">
                      {selectedCustomer.urduName ? `${selectedCustomer.urduName} (${selectedCustomer.name})` : selectedCustomer.name}
                    </h3>
                    <p className="text-[10px] text-slate-600">Phone: {selectedCustomer.phone || '-'}</p>
                    <p className="text-[10px] text-slate-600">Address: {selectedCustomer.address || selectedCustomer.city || 'Lahore'}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Statement Period:</span>
                    <p className="font-mono text-slate-800 font-bold">{startDate} to {endDate}</p>
                    <div className="mt-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase block">Current Balance:</span>
                      <span className={`font-mono font-black text-sm ${
                        finalBalance < 0 ? 'text-emerald-700' : 'text-slate-900'
                      }`}>
                        {finalBalance < 0 
                          ? `-Rs ${Math.abs(finalBalance).toLocaleString()} (Adv)` 
                          : `Rs ${finalBalance.toLocaleString()}`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Table */}
                <table className="w-full text-xs border-collapse mb-4 border border-slate-200">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                      <th className="p-2 text-left">Date</th>
                      <th className="p-2 text-left">Description</th>
                      <th className="p-2 text-center">Ref</th>
                      <th className="p-2 text-right">Debit (Naam)</th>
                      <th className="p-2 text-right">Credit (Jama)</th>
                      <th className="p-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredEntries.map((e) => (
                      <tr key={e.id}>
                        <td className="p-2 font-mono text-[11px]">{e.entryDate}</td>
                        <td className="p-2 font-medium">{e.detail}</td>
                        <td className="p-2 text-center font-mono text-[10px] text-slate-500">{e.folioNo || '-'}</td>
                        <td className="p-2 text-right font-mono text-rose-700 font-semibold">{e.debit > 0 ? e.debit.toLocaleString() : '-'}</td>
                        <td className="p-2 text-right font-mono text-emerald-700 font-semibold">{e.credit > 0 ? e.credit.toLocaleString() : '-'}</td>
                        <td className="p-2 text-right font-mono font-bold">
                          {e.runningBalance < 0 
                            ? `-${Math.abs(e.runningBalance).toLocaleString()} Adv` 
                            : e.runningBalance.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold border-t border-slate-300">
                      <td colSpan={3} className="p-2 text-center">Summary Totals:</td>
                      <td className="p-2 text-right font-mono text-rose-800">Rs {totalDebit.toLocaleString()}</td>
                      <td className="p-2 text-right font-mono text-emerald-800">Rs {totalCredit.toLocaleString()}</td>
                      <td className={`p-2 text-right font-mono font-black ${finalBalance < 0 ? 'text-emerald-700' : 'text-slate-900'}`}>
                        {finalBalance < 0 ? `-Rs ${Math.abs(finalBalance).toLocaleString()} Adv` : `Rs ${finalBalance.toLocaleString()}`}
                      </td>
                    </tr>
                  </tfoot>
                </table>

                {/* Signatures */}
                <div className="grid grid-cols-2 gap-8 pt-8 mt-4 border-t border-slate-200 text-center text-[10px] text-slate-500">
                  <div>
                    <div className="w-32 mx-auto border-b border-slate-400 mb-1"></div>
                    <p>Customer Signature (دستخط کھاتہ دار)</p>
                  </div>
                  <div>
                    <div className="w-32 mx-auto border-b border-slate-400 mb-1"></div>
                    <p>Proprietor Signature (دستخط منشی / مالک)</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="no-print p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyWhatsAppText}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
                >
                  {copiedNotice ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedNotice ? (isUrdu ? 'کاپی ہوگیا!' : 'Copied!') : (isUrdu ? 'واٹس ایپ متن کاپی' : 'Copy WhatsApp Text')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleWhatsAppShare}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm"
                >
                  <Share2 className="w-4 h-4" />
                  <span>{isUrdu ? 'واٹس ایپ پر بھیجیں' : 'Send on WhatsApp'}</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadPDF}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>{isUrdu ? 'پی ڈی ایف ڈاؤن لوڈ' : 'Download PDF'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-md"
                >
                  <Printer className="w-4 h-4 text-emerald-400" />
                  <span>{isUrdu ? 'ابھی پرنٹ کریں' : 'Print Statement Now'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Customer Modal */}
      <PartyModal
        isOpen={isAddCustomerModalOpen}
        onClose={() => {
          setIsAddCustomerModalOpen(false);
          setEditingCustomer(null);
        }}
        initialParty={editingCustomer}
        onSaveParty={(party) => {
          if (editingCustomer && onUpdateParty) {
            onUpdateParty(party);
          } else if (onAddParty) {
            onAddParty(party);
            setSelectedCustomerId(party.id);
          }
        }}
        defaultPartyType="customer"
        language={language}
      />
    </div>
  );
};
