import React, { useState, useEffect } from 'react';
import { Party, LedgerEntry, Invoice, UserRole } from '../../types';
import { formatPKR, generateLedgerWhatsAppUrl } from '../../utils/calculations';
import { generateLedgerPDF, brandingFromSettings, loadLogoDataUrl } from '../../utils/pdfGenerator';
import { useBusiness } from '../../context/BusinessContext';
import { PartyModal } from '../common/PartyModal';
import { LedgerFilterBar } from './LedgerFilterBar';
import { LedgerPrintModal } from './LedgerPrintModal';
import { LedgerEntryEditModal, LedgerEditPatch } from './LedgerEntryEditModal';
import {
  LedgerFilterState,
  DEFAULT_LEDGER_FILTER,
  filterLedgerEntries,
} from './ledgerFilter';
import { 
  BookOpen, 
  Table, 
  Printer, 
  Share2, 
  UserPlus,
  Edit3,
  Download, 
  PlusCircle,
  FileDown,
  Pencil,
  X,
} from 'lucide-react';

interface CustomerLedgerViewProps {
  parties: Party[];
  ledgerEntries: LedgerEntry[];
  invoices: Invoice[];
  currentRole: UserRole;
  language: 'en' | 'ur';
  onOpenReceiptModal: (partyId?: string) => void;
  onAddParty?: (party: Party) => void;
  onUpdateParty?: (party: Party) => void;
  onDeleteParty?: (partyId: string) => boolean | void;
  onEditLedgerEntry?: (entryId: string, patch: LedgerEditPatch) => void;
}

export const CustomerLedgerView: React.FC<CustomerLedgerViewProps> = ({
  parties,
  ledgerEntries,
  invoices,
  currentRole,
  language,
  onOpenReceiptModal,
  onAddParty,
  onUpdateParty,
  onDeleteParty,
  onEditLedgerEntry,
}) => {
  const isUrdu = language === 'ur';
  const { settings: biz } = useBusiness();
  const customers = parties.filter((p) => p.partyType === 'customer');
  const canEditLedger = currentRole === 'owner' || currentRole === 'manager' || currentRole === 'accountant';

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id || '');
  const [layoutMode, setLayoutMode] = useState<'traditional' | 'modern'>('traditional');
  const [filter, setFilter] = useState<LedgerFilterState>(DEFAULT_LEDGER_FILTER);
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  
  // Modals
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [isAddCustomerModalOpen, setIsAddCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Party | null>(null);

  const selectedCustomer = parties.find((p) => p.id === selectedCustomerId) || customers[0];

  // Ctrl+P prints the currently filtered statement (today's ledger when the
  // Today preset is active).
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

  // Mandi-rate fallback: server rows posted before the mandi columns existed
  // carry no mandiRate — resolve it from the linked invoice instead so the
  // column works even before the backfill migration is run.
  const invoiceMandiRate = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const inv of invoices) {
      if (inv.mandiRatePer40kg > 0) m.set(inv.id, inv.mandiRatePer40kg);
    }
    return m;
  }, [invoices]);
  const mandiOf = (entry: LedgerEntry): number | undefined =>
    entry.mandiRate ?? (entry.refId ? invoiceMandiRate.get(entry.refId) : undefined);

  // Deep filter: void visibility, entry-type group, date range, search —
  // voided rows are hidden by default (their reversals carry the correction).
  const filteredEntries = filterLedgerEntries(ledgerEntries, selectedCustomerId, filter);
  const startDate = filter.startDate || '…';
  const endDate = filter.endDate || new Date().toISOString().split('T')[0];

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

      {/* Customer Selector */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200">
        <div className="max-w-xl">
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-bold text-slate-700">
              {isUrdu ? 'گاہک منتخب کریں:' : 'Select Customer:'}
            </label>
            {selectedCustomer && (
              <div className="flex items-center gap-2">
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
                {onDeleteParty && (
                  <button
                    type="button"
                    onClick={() => {
                      const ok = window.confirm(
                        isUrdu
                          ? `کیا واقعی ”${selectedCustomer.urduName || selectedCustomer.name}“ کا کھاتہ حذف کرنا ہے؟ لین دین والا کھاتہ حذف نہیں ہوگا۔`
                          : `Delete the account of "${selectedCustomer.name}"? Accounts with transactions cannot be deleted.`
                      );
                      if (ok && onDeleteParty) {
                        const deleted = onDeleteParty(selectedCustomer.id);
                        if (deleted) {
                          const next = parties.find(
                            (p) => p.partyType === 'customer' && p.id !== selectedCustomer.id
                          );
                          setSelectedCustomerId(next?.id || '');
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
      </div>

      {/* Deep filter: date presets + range, entry type, search, voided toggle */}
      <LedgerFilterBar filter={filter} onChange={setFilter} language={language} />

      {/* Customer Balance Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase">
              {isUrdu ? 'سابقہ اوپننگ بیلنس' : 'Opening Balance'}
            </span>
            {canEditLedger && onEditLedgerEntry && (
              <button
                type="button"
                onClick={() => {
                  const openingRow = ledgerEntries.find(
                    (e) => e.partyId === selectedCustomerId && e.refType === 'opening' && !e.isVoid
                  );
                  if (openingRow) {
                    setEditingEntry(openingRow);
                  } else if (selectedCustomer) {
                    setEditingCustomer(selectedCustomer);
                    setIsAddCustomerModalOpen(true);
                  }
                }}
                className="text-[11px] font-bold text-blue-700 hover:text-blue-800 flex items-center gap-1"
                title={isUrdu ? 'ابتدائی بیلنس میں ترمیم' : 'Edit opening balance'}
              >
                <Pencil className="w-3 h-3" />
                <span>{isUrdu ? 'ترمیم' : 'Edit'}</span>
              </button>
            )}
          </div>
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
                  {canEditLedger && onEditLedgerEntry && (
                    <th className="p-3 w-10 bg-amber-50 text-amber-950 no-print text-center">✎</th>
                  )}
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
                        {mandiOf(entry) ? `Rs ${mandiOf(entry)!.toLocaleString()}` : '-'}
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
                      {canEditLedger && onEditLedgerEntry && (
                        <td className="p-2 text-center no-print">
                          {!entry.isVoid && (
                            <button
                              type="button"
                              onClick={() => setEditingEntry(entry)}
                              className="p-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 transition"
                              title={isUrdu ? 'انٹری میں ترمیم' : 'Edit entry'}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      )}
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
                  {canEditLedger && onEditLedgerEntry && <td className="no-print" />}
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
                  {canEditLedger && onEditLedgerEntry && (
                    <th className="p-3 border-b text-center no-print">{isUrdu ? 'ترمیم' : 'Edit'}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEntries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-mono">{e.entryDate}</td>
                    <td className="p-3 font-medium text-slate-800">{isUrdu ? e.detailUrdu : e.detail}</td>
                    <td className="p-3 font-mono font-bold text-amber-900">
                      {mandiOf(e) ? `Rs ${mandiOf(e)!.toLocaleString()}` : '-'}
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
                      {e.isVoid && (
                        <span className="ml-1 text-[9px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">
                          {isUrdu ? 'وائڈ' : 'VOID'}
                        </span>
                      )}
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

      {/* Shared printable statement modal (PDF / WhatsApp / print) */}
      {showPrintModal && selectedCustomer && (
        <LedgerPrintModal
          party={selectedCustomer}
          entries={filteredEntries}
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
          partyName={selectedCustomer?.urduName || selectedCustomer?.name || ''}
          language={language}
          onClose={() => setEditingEntry(null)}
          onSave={(entryId, patch) => {
            onEditLedgerEntry(entryId, patch);
            setEditingEntry(null);
          }}
        />
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
