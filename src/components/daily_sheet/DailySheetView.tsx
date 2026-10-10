import React, { useState, useMemo } from 'react';
import { Party, ReceiptVoucher, Invoice, UserRole } from '../../types';
import { formatPKR, generateLedgerWhatsAppUrl } from '../../utils/calculations';
import { 
  FileSpreadsheet, 
  Printer, 
  Download, 
  Plus, 
  Calendar, 
  Search, 
  Phone, 
  MapPin, 
  CheckCircle2, 
  Clock, 
  UserCheck, 
  DollarSign, 
  Building2, 
  ArrowUpRight,
  Send,
  Filter
} from 'lucide-react';

interface DailySheetViewProps {
  parties: Party[];
  receipts: ReceiptVoucher[];
  invoices: Invoice[];
  currentRole: UserRole;
  language: 'en' | 'ur';
  onOpenReceiptModal: (partyId?: string) => void;
}

export const DailySheetView: React.FC<DailySheetViewProps> = ({
  parties,
  receipts,
  invoices,
  currentRole,
  language,
  onOpenReceiptModal
}) => {
  const isUrdu = language === 'ur';
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedRoute, setSelectedRoute] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeSubTab, setActiveSubTab] = useState<'collections' | 'pending' | 'print_preview'>('collections');

  // Customer map for fast lookup
  const customerMap = useMemo(() => {
    const map = new Map<string, Party>();
    parties.forEach((p) => map.set(p.id, p));
    return map;
  }, [parties]);

  // Consolidate all recoveries / ugrahi entries for selectedDate
  // 1. Receipts recorded via receipt vouchers
  // 2. Invoice on-the-spot collections (receivedCash + receivedAC)
  const dailyRecoveries = useMemo(() => {
    type RecoveryItem = {
      id: string;
      refNo: string;
      type: 'receipt' | 'invoice_payment';
      date: string;
      time: string;
      partyId: string;
      partyName: string;
      partyUrduName: string;
      route: string;
      phone: string;
      amount: number;
      paymentMode: string;
      bankName?: string;
      previousBalance: number;
      remainingBalance: number;
      collectedBy: string;
      notes: string;
    };

    const list: RecoveryItem[] = [];

    // Receipts for selected date
    receipts.filter(r => r.receiptDate === selectedDate && r.partyType === 'customer').forEach((r) => {
      const party = customerMap.get(r.partyId);
      list.push({
        id: r.id,
        refNo: r.receiptNumber,
        type: 'receipt',
        date: r.receiptDate,
        time: new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        partyId: r.partyId,
        partyName: party?.name || 'Customer',
        partyUrduName: party?.urduName || '',
        route: party?.city || 'Local',
        phone: party?.phone || '',
        amount: r.amount,
        paymentMode: r.paymentMode,
        bankName: r.bankName,
        previousBalance: r.previousBalance,
        remainingBalance: r.newBalance,
        collectedBy: r.collectedBy || 'منشی / کیشئر',
        notes: r.notes || (r.bankName ? `${r.bankName} (${r.refNo || ''})` : 'نقد وصولی')
      });
    });

    // Invoices with immediate cash/bank collections for selected date
    invoices.filter(inv => inv.invoiceDate === selectedDate).forEach((inv) => {
      const recAmt = (inv.receivedCash || 0) + (inv.receivedAC || 0);
      if (recAmt > 0) {
        const party = customerMap.get(inv.customerId);
        const mode = inv.receivedCash > 0 && inv.receivedAC > 0 
          ? 'cash + bank' 
          : inv.receivedCash > 0 ? 'cash' : 'bank_transfer';

        list.push({
          id: `inv-rec-${inv.id}`,
          refNo: inv.invoiceNumber,
          type: 'invoice_payment',
          date: inv.invoiceDate,
          time: new Date(inv.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          partyId: inv.customerId,
          partyName: inv.customerName || party?.name || 'Customer',
          partyUrduName: inv.customerUrduName || party?.urduName || '',
          route: party?.city || 'Shop Sale',
          phone: party?.phone || '',
          amount: recAmt,
          paymentMode: mode,
          previousBalance: inv.previousBalance + inv.totalAmount,
          remainingBalance: inv.newBalance,
          collectedBy: 'سیل کاؤنٹر منشی',
          notes: `سیل انوائس مال کے وقت وصولی (${inv.netWeightKg} کلو مرغ)`
        });
      }
    });

    return list;
  }, [receipts, invoices, selectedDate, customerMap]);

  // Filter recoveries by search query
  const filteredRecoveries = useMemo(() => {
    return dailyRecoveries.filter(item => {
      if (selectedRoute !== 'all' && item.route !== selectedRoute) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return item.partyName.toLowerCase().includes(q) ||
               item.partyUrduName.includes(q) ||
               item.refNo.toLowerCase().includes(q) ||
               item.collectedBy.toLowerCase().includes(q);
      }
      return true;
    });
  }, [dailyRecoveries, selectedRoute, searchQuery]);

  // Customers with pending balance (مارکیٹ ادھار وصولی لسٹ)
  const pendingCustomers = useMemo(() => {
    return parties
      .filter(p => p.partyType === 'customer' && p.currentBalance > 0)
      .sort((a, b) => b.currentBalance - a.currentBalance);
  }, [parties]);

  // Aggregate metrics
  const totalRecovered = dailyRecoveries.reduce((sum, r) => sum + r.amount, 0);
  const totalCashRecovered = dailyRecoveries
    .filter(r => r.paymentMode === 'cash')
    .reduce((sum, r) => sum + r.amount, 0);
  const totalBankRecovered = dailyRecoveries
    .filter(r => r.paymentMode !== 'cash')
    .reduce((sum, r) => sum + r.amount, 0);
  const totalMarketUdhar = pendingCustomers.reduce((sum, c) => sum + c.currentBalance, 0);

  // Quick export CSV
  const handleExportCSV = () => {
    const headers = [
      'Sr #',
      'Slip Ref #',
      'Date',
      'Time',
      'Customer Name',
      'Customer Urdu',
      'Route/Area',
      'Payment Mode',
      'Previous Balance',
      'Amount Recovered',
      'Remaining Balance',
      'Collected By',
      'Notes'
    ];

    const rows = filteredRecoveries.map((r, idx) => [
      idx + 1,
      r.refNo,
      r.date,
      r.time,
      `"${r.partyName.replace(/"/g, '""')}"`,
      `"${r.partyUrduName.replace(/"/g, '""')}"`,
      `"${r.route.replace(/"/g, '""')}"`,
      r.paymentMode,
      r.previousBalance,
      r.amount,
      r.remainingBalance,
      `"${r.collectedBy.replace(/"/g, '""')}"`,
      `"${r.notes.replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Murgh_Mandi_Daily_Ugrahi_${selectedDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <span>{isUrdu ? 'ڈیلی شیٹ و روزانہ اگرائی رجسٹر' : 'Daily Sheet & Ugrahi Recovery'}</span>
                <span className="text-xs bg-emerald-100 text-emerald-800 font-mono px-2 py-0.5 rounded-full font-bold">
                  {selectedDate}
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                {isUrdu 
                  ? 'روزانہ فیلڈ اگرائی، مارکیٹ دکانوں سے وصولیاں، نقد و بینک کلیکشن، اور تصدیقی پرنٹ شیٹ' 
                  : 'Daily field collections, cash/bank recoveries from chicken retail shops, and printable ledger sheet.'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Sub-tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => setActiveSubTab('collections')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                activeSubTab === 'collections' ? 'bg-emerald-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isUrdu ? 'آج کی اگرائی (وصولیاں)' : 'Recoveries Collected'}
            </button>
            <button
              onClick={() => setActiveSubTab('pending')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                activeSubTab === 'pending' ? 'bg-emerald-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isUrdu ? 'متوقع مارکیٹ ادھار' : 'Pending Route Ugrahi'}
            </button>
            <button
              onClick={() => setActiveSubTab('print_preview')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                activeSubTab === 'print_preview' ? 'bg-emerald-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isUrdu ? 'پرنٹ لے آؤٹ شیٹ' : 'Printable Sheet'}
            </button>
          </div>

          <button
            onClick={() => onOpenReceiptModal()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            <span>{isUrdu ? '+ نئی اگرائی درج کریں' : '+ Record Recovery'}</span>
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold shadow-sm transition"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{isUrdu ? 'پرنٹ شیٹ' : 'Print Sheet'}</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold transition"
            title="Download CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">CSV</span>
          </button>
        </div>
      </div>

      {/* Date & Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
        <div className="sm:col-span-4 flex items-center gap-2">
          <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
            {isUrdu ? 'تاریخ شیٹ:' : 'Sheet Date:'}
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-800"
          />
          <button
            onClick={() => setSelectedDate(todayStr)}
            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold whitespace-nowrap"
          >
            {isUrdu ? 'آج' : 'Today'}
          </button>
        </div>

        <div className="sm:col-span-5 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isUrdu ? 'گاہک، دوکان، یا رسید نمبر تلاش کریں...' : 'Search customer or receipt ref...'}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs"
          />
        </div>

        <div className="sm:col-span-3 text-right">
          <span className="text-xs text-slate-500 font-bold">
            {isUrdu ? `کل اندراجات: ${filteredRecoveries.length}` : `Entries: ${filteredRecoveries.length}`}
          </span>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              {isUrdu ? 'کل موصول شدہ اگرائی' : 'Total Recovered'}
            </span>
            <span className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-black text-emerald-700 font-mono">
            Rs {totalRecovered.toLocaleString()}
          </p>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>{dailyRecoveries.length} {isUrdu ? 'وصولیاں درج' : 'Receipts'}</span>
            <span className="text-emerald-600 font-bold">100% Verified</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              {isUrdu ? 'نقد روکڑ اگرائی (Cash)' : 'Cash Recovered'}
            </span>
            <span className="p-1.5 bg-blue-100 text-blue-800 rounded-lg">
              <UserCheck className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-black text-blue-800 font-mono">
            Rs {totalCashRecovered.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {isUrdu ? 'گلہ محفوظ کیش روکڑ' : 'Direct Cash in Hand'}
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              {isUrdu ? 'آن لائن و بینک وصولی' : 'Bank & Online'}
            </span>
            <span className="p-1.5 bg-purple-100 text-purple-800 rounded-lg">
              <Building2 className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-black text-purple-800 font-mono">
            Rs {totalBankRecovered.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {isUrdu ? 'میزان، حبیب یا ایزی پیسہ' : 'Direct Bank / Wallet'}
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-200 bg-amber-50/30 shadow-sm">
          <div className="flex items-center justify-between text-amber-900 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              {isUrdu ? 'مارکیٹ کل باقی ادھار' : 'Market Outstanding'}
            </span>
            <span className="p-1.5 bg-amber-100 text-amber-800 rounded-lg">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-black text-amber-900 font-mono">
            Rs {totalMarketUdhar.toLocaleString()}
          </p>
          <p className="text-[11px] text-amber-800 font-bold mt-1">
            {pendingCustomers.length} {isUrdu ? 'دوکانوں سے وصولی باقی' : 'Pending Shop Accounts'}
          </p>
        </div>
      </div>

      {/* SUB-TAB 1: TODAY'S RECOVERIES TABLE (اگرائی رجسٹر) */}
      {activeSubTab === 'collections' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>{isUrdu ? `تاریخ ${selectedDate} کی موصول شدہ اگرائی تفصیل` : `Collections Recorded on ${selectedDate}`}</span>
            </h3>
            <span className="text-xs text-slate-500">
              {filteredRecoveries.length} {isUrdu ? 'ٹرانزیکشنز' : 'Transactions'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-700 border-collapse">
              <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[11px] border-b">
                <tr>
                  <th className="p-3 w-12 text-center">{isUrdu ? 'شمار' : 'Sr #'}</th>
                  <th className="p-3">{isUrdu ? 'رسید / واؤچر #' : 'Slip #'}</th>
                  <th className="p-3">{isUrdu ? 'گاہک و دوکان کا نام' : 'Customer & Shop'}</th>
                  <th className="p-3">{isUrdu ? 'علاقہ / روٹ' : 'Route / Area'}</th>
                  <th className="p-3">{isUrdu ? 'ذریعہ ادائیگی' : 'Mode'}</th>
                  <th className="p-3 text-right">{isUrdu ? 'سابقہ بقایا' : 'Prev Balance'}</th>
                  <th className="p-3 text-right text-emerald-700 font-extrabold">{isUrdu ? 'وصول اگرائی' : 'Recovered'}</th>
                  <th className="p-3 text-right">{isUrdu ? 'باقی بقایا' : 'Remaining'}</th>
                  <th className="p-3">{isUrdu ? 'وصول کنندہ' : 'Collected By'}</th>
                  <th className="p-3">{isUrdu ? 'نوٹ / تفصیل' : 'Notes'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecoveries.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-400">
                      {isUrdu 
                        ? `اس تاریخ (${selectedDate}) پر کوئی اگرائی یا وصولی ریکارڈ نہیں ہوئی۔ "+ نئی اگرائی درج کریں" پر کلک کریں!` 
                        : `No recoveries recorded on ${selectedDate}. Click "+ Record Recovery" to add one!`}
                    </td>
                  </tr>
                ) : (
                  filteredRecoveries.map((r, idx) => (
                    <tr key={r.id} className="hover:bg-slate-50 transition">
                      <td className="p-3 text-center font-mono text-slate-400">{idx + 1}</td>
                      <td className="p-3 font-mono font-bold text-slate-900">
                        {r.refNo}
                        <span className="block text-[10px] text-slate-400 font-normal">{r.time}</span>
                      </td>
                      <td className="p-3 font-semibold text-slate-900">
                        <div className="flex flex-col">
                          <span>{r.partyUrduName || r.partyName}</span>
                          {r.partyUrduName && <span className="text-[10px] text-slate-500 font-normal">{r.partyName}</span>}
                        </div>
                      </td>
                      <td className="p-3 text-slate-600">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold">
                          {r.route}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                          r.paymentMode === 'cash' 
                            ? 'bg-blue-50 text-blue-700' 
                            : 'bg-purple-50 text-purple-700'
                        }`}>
                          {r.paymentMode}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono text-slate-600">
                        Rs {r.previousBalance.toLocaleString()}
                      </td>
                      <td className="p-3 text-right font-mono font-black text-emerald-700 bg-emerald-50/50">
                        Rs {r.amount.toLocaleString()}
                      </td>
                      <td className={`p-3 text-right font-mono font-bold ${
                        r.remainingBalance < 0 ? 'text-emerald-600' : 'text-amber-800'
                      }`}>
                        Rs {Math.abs(r.remainingBalance).toLocaleString()} {r.remainingBalance < 0 ? 'پیشگی' : ''}
                      </td>
                      <td className="p-3 font-medium text-slate-800 text-[11px]">
                        {r.collectedBy}
                      </td>
                      <td className="p-3 text-slate-500 text-[11px] max-w-xs truncate">
                        {r.notes}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                  <td colSpan={6} className="p-3 text-right">
                    {isUrdu ? 'میزان کل وصول شدہ اگرائی:' : 'Grand Total Collections:'}
                  </td>
                  <td className="p-3 text-right font-mono text-emerald-800 font-black text-sm bg-emerald-100/50">
                    Rs {totalRecovered.toLocaleString()}
                  </td>
                  <td colSpan={3} className="p-3 text-slate-500 text-[11px]">
                    (نقد: Rs {totalCashRecovered.toLocaleString()} | آن لائن: Rs {totalBankRecovered.toLocaleString()})
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: PENDING MARKET RECOVERIES (مارکیٹ سے متوقع وصولیاں) */}
      {activeSubTab === 'pending' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-600" />
                <span>{isUrdu ? 'مارکیٹ کے بقایا جات اور شیڈولڈ اگرائی لسٹ' : 'Scheduled Market Recoveries & Outstanding Balances'}</span>
              </h3>
              <p className="text-xs text-slate-500">
                {isUrdu ? 'وہ تمام گاہک جن سے ادھار رقم وصول کرنی ہے۔ "اگرائی وصول کریں" پر کلک کر کے فوری اندراج کریں!' : 'List of retail customers with pending balances to recover on daily route.'}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500 block">{isUrdu ? 'کل بقایا رقم' : 'Total Pending'}</span>
              <span className="text-lg font-black text-amber-900 font-mono">Rs {totalMarketUdhar.toLocaleString()}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingCustomers.map((c) => (
              <div key={c.id} className="p-4 rounded-2xl border border-slate-200 hover:border-emerald-300 hover:shadow-md transition bg-white flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-900">
                        {c.urduName || c.name}
                      </h4>
                      {c.urduName && <p className="text-[11px] text-slate-500">{c.name}</p>}
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 font-mono">
                      Rs {c.currentBalance.toLocaleString()}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1 text-xs text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate">{c.address || c.city || 'Lahore'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-mono">{c.phone || '-'}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <a
                    href={generateLedgerWhatsAppUrl({
                      phone: c.phone || '',
                      partyName: c.urduName || c.name,
                      asOfDate: selectedDate,
                      currentBalance: c.currentBalance,
                      totalDebit: c.currentBalance,
                      totalCredit: 0
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition flex items-center gap-1"
                    title="Send WhatsApp Reminder"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </a>

                  <button
                    onClick={() => onOpenReceiptModal(c.id)}
                    className="flex-1 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition flex items-center justify-center gap-1 shadow-sm"
                  >
                    <span>{isUrdu ? 'اگرائی وصول کریں' : 'Collect Ugrahi'}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: AUTHENTIC PRINTABLE A4 SHEET VIEW (پراپر پرنٹ لے آؤٹ) */}
      {activeSubTab === 'print_preview' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-emerald-50 p-3 rounded-xl border border-emerald-200 text-xs text-emerald-950 font-bold">
            <span>{isUrdu ? 'یہ روایتی پاکستانی پرنٹ شیٹ کا نمونہ ہے جسے A4 سائز میں پرنٹ کیا جا سکتا ہے۔' : 'This is the traditional Pakistani daily recovery format optimized for A4 print.'}</span>
            <button
              onClick={() => window.print()}
              className="px-4 py-1.5 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 font-bold flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isUrdu ? 'پرنٹ نکالیں' : 'Print Now'}</span>
            </button>
          </div>

          <div id="printable-daily-sheet" className="bg-white p-8 rounded-2xl border-2 border-slate-800 shadow-lg text-slate-900 font-serif max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="text-center border-b-2 border-slate-900 pb-4">
              <span className="text-xs font-urdu font-bold text-slate-600 block mb-1">
                بِسْمِ اللَّـهِ الرَّحْمَـٰنِ الرَّحِيمِ
              </span>
              <h1 className="text-2xl font-black text-slate-900 tracking-wide">
                مرغ منڈی ہول سیل و سپلائی (پاکستان)
              </h1>
              <h2 className="text-base font-bold text-slate-700 font-urdu mt-0.5">
                روزانہ فیلڈ اگرائی و وصولی شیٹ (Daily Ugrahi & Recovery Statement)
              </h2>
              <div className="flex items-center justify-between text-xs font-mono font-bold mt-3 px-4 text-slate-700">
                <span>تاریخ شیٹ: {selectedDate}</span>
                <span>روٹ: تمام مارکیٹ و دوکانیں</span>
                <span>پرنٹ وقت: {new Date().toLocaleTimeString()}</span>
              </div>
            </div>

            {/* Recoveries Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse border border-slate-800">
                <thead>
                  <tr className="bg-slate-100 text-slate-900 border-b border-slate-800 font-bold text-center">
                    <th className="p-2 border border-slate-800 w-10">شمار</th>
                    <th className="p-2 border border-slate-800 w-24">رسید نمبر</th>
                    <th className="p-2 border border-slate-800 text-right">نام گاہک / دوکان</th>
                    <th className="p-2 border border-slate-800 w-20">علاقہ</th>
                    <th className="p-2 border border-slate-800 w-20">ذریعہ</th>
                    <th className="p-2 border border-slate-800 text-right w-24">سابقہ کھاتہ</th>
                    <th className="p-2 border border-slate-800 text-right w-24 bg-slate-200">وصول اگرائی</th>
                    <th className="p-2 border border-slate-800 text-right w-24">باقی بقایا</th>
                    <th className="p-2 border border-slate-800 w-28">وصول کنندہ</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyRecoveries.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-slate-500 border border-slate-800">
                        آج کی تاریخ پر کوئی وصولی درج نہیں کی گئی۔
                      </td>
                    </tr>
                  ) : (
                    dailyRecoveries.map((r, i) => (
                      <tr key={r.id} className="border-b border-slate-800 text-slate-800">
                        <td className="p-2 border border-slate-800 text-center font-mono">{i + 1}</td>
                        <td className="p-2 border border-slate-800 font-mono font-bold text-center">{r.refNo}</td>
                        <td className="p-2 border border-slate-800 text-right font-bold">{r.partyUrduName || r.partyName}</td>
                        <td className="p-2 border border-slate-800 text-center">{r.route}</td>
                        <td className="p-2 border border-slate-800 text-center font-mono uppercase">{r.paymentMode}</td>
                        <td className="p-2 border border-slate-800 text-right font-mono">{r.previousBalance.toLocaleString()}</td>
                        <td className="p-2 border border-slate-800 text-right font-mono font-black bg-slate-100">{r.amount.toLocaleString()}</td>
                        <td className="p-2 border border-slate-800 text-right font-mono font-bold">{r.remainingBalance.toLocaleString()}</td>
                        <td className="p-2 border border-slate-800 text-center text-[11px]">{r.collectedBy}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-200 font-bold border-t-2 border-slate-900 text-slate-900">
                    <td colSpan={6} className="p-2.5 border border-slate-800 text-center text-sm">
                      میزان کل اگرائی (Total Recoveries):
                    </td>
                    <td className="p-2.5 border border-slate-800 text-right font-mono text-base font-black">
                      Rs {totalRecovered.toLocaleString()}
                    </td>
                    <td colSpan={2} className="p-2.5 border border-slate-800 text-center text-[11px]">
                      (نقد: {totalCashRecovered.toLocaleString()} | بینک: {totalBankRecovered.toLocaleString()})
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Reconciliation & Signature Box */}
            <div className="pt-6 border-t-2 border-slate-800 space-y-8">
              <div className="grid grid-cols-3 gap-6 text-xs text-center">
                <div className="p-3 bg-slate-50 border border-slate-300 rounded-lg">
                  <span className="font-bold block mb-1">کل وصول شدہ نقد روکڑ:</span>
                  <span className="font-mono font-bold text-sm">Rs {totalCashRecovered.toLocaleString()}</span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-300 rounded-lg">
                  <span className="font-bold block mb-1">کل آن لائن / بینک ٹرانسفر:</span>
                  <span className="font-mono font-bold text-sm">Rs {totalBankRecovered.toLocaleString()}</span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-300 rounded-lg">
                  <span className="font-bold block mb-1">کل موصولہ اگرائی:</span>
                  <span className="font-mono font-bold text-sm text-emerald-800">Rs {totalRecovered.toLocaleString()}</span>
                </div>
              </div>

              {/* Signature Lines */}
              <div className="grid grid-cols-3 gap-8 pt-8 text-xs text-slate-700">
                <div className="text-center">
                  <div className="border-t border-slate-800 pt-1.5 font-bold">
                    دستخط وصول کنندہ / اگرائی بوائے
                  </div>
                  <span className="text-[10px] text-slate-500">(Recovery Officer)</span>
                </div>
                <div className="text-center">
                  <div className="border-t border-slate-800 pt-1.5 font-bold">
                    دستخط منشی / اکاؤنٹنٹ
                  </div>
                  <span className="text-[10px] text-slate-500">(Munshi / Cashier)</span>
                </div>
                <div className="text-center">
                  <div className="border-t border-slate-800 pt-1.5 font-bold">
                    دستخط مالک / پروپرائیٹر
                  </div>
                  <span className="text-[10px] text-slate-500">(Proprietor Signature)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
