import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  AccountItem, 
  DayClosing, 
  UserRole, 
  Invoice, 
  ReceiptVoucher, 
  Purchase, 
  ExpenseItem, 
  Party, 
  GeneralJournalEntry,
  InventoryItem,
  Employee
} from '../../types';
import { formatPKR } from '../../utils/calculations';
import { nextDocNumber } from '../../utils/docNumbers';
import { 
  DollarSign, 
  Lock, 
  Unlock, 
  TrendingUp, 
  PieChart, 
  CheckCircle, 
  AlertCircle,
  FileText,
  Calendar,
  Layers,
  Printer,
  Download,
  Plus,
  Search,
  BookOpen,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldAlert,
  X,
  Building2,
  Trash2,
  Check
} from 'lucide-react';

interface AccountingViewProps {
  accounts: AccountItem[];
  dayClosing: DayClosing;
  currentRole: UserRole;
  language: 'en' | 'ur';
  invoices?: Invoice[];
  receipts?: ReceiptVoucher[];
  purchases?: Purchase[];
  expenses?: ExpenseItem[];
  parties?: Party[];
  generalEntries?: GeneralJournalEntry[];
  inventory?: InventoryItem[];
  employees?: Employee[];
  onUpdateDayClosing: (closing: DayClosing) => void;
  onUpdateAccounts: (accounts: AccountItem[]) => void;
  onAddGeneralEntry?: (entry: GeneralJournalEntry) => void;
  onDeleteGeneralEntry?: (entryId: string) => void;
}

export const AccountingView: React.FC<AccountingViewProps> = ({
  accounts,
  dayClosing,
  currentRole,
  language,
  invoices = [],
  receipts = [],
  purchases = [],
  expenses = [],
  parties = [],
  generalEntries = [],
  inventory = [],
  employees,
  onUpdateDayClosing,
  onUpdateAccounts,
  onAddGeneralEntry,
  onDeleteGeneralEntry
}) => {
  const isUrdu = language === 'ur';
  // "Today" in PKT — the business day the owner counts cash against.
  const todayPKT = (): string =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const todayStr = todayPKT();

  const [activeTab, setActiveTab] = useState<'roznamcha' | 'chart' | 'pnl' | 'balance_sheet'>('roznamcha');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [typeFilter, setTypeFilter] = useState<'all' | 'cash' | 'sales' | 'purchases' | 'expenses' | 'journal'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  // W13: the cash-count field must NOT pre-fill from a stale closing. The
  // seed closing (2024-10-07) carried 840,000/840,000, so pre-filling made
  // "variance Rs 0" tautological. Only a closing dated for the selected day
  // counts; anything else starts the count at 0.
  const closingCashForDate = dayClosing.date === selectedDate ? dayClosing.physicalCash : 0;
  const [physicalCash, setPhysicalCash] = useState<number>(closingCashForDate);
  const prevClosingCashRef = useRef(closingCashForDate);
  const prevSelectedDateRef = useRef(selectedDate);
  // Re-sync the count when the viewed date changes, or when the stored
  // closing for the viewed date arrives/changes — never while the user is
  // typing a count for the same date.
  useEffect(() => {
    if (selectedDate !== prevSelectedDateRef.current || closingCashForDate !== prevClosingCashRef.current) {
      prevSelectedDateRef.current = selectedDate;
      prevClosingCashRef.current = closingCashForDate;
      setPhysicalCash(closingCashForDate);
    }
  }, [selectedDate, closingCashForDate]);
  const [closingNotice, setClosingNotice] = useState<string | null>(null);

  // Modal State for New General Journal Entry
  const [isJournalModalOpen, setIsJournalModalOpen] = useState(false);
  const [jEntryDate, setJEntryDate] = useState<string>(todayStr);
  const [jDescUrdu, setJDescUrdu] = useState<string>('');
  const [jDescEn, setJDescEn] = useState<string>('');
  const [jDebitCode, setJDebitCode] = useState<string>('5030');
  const [jCreditCode, setJCreditCode] = useState<string>('1020');
  const [jAmount, setJAmount] = useState<number>(0);
  const [jPartyId, setJPartyId] = useState<string>('');
  const [jRefNo, setJRefNo] = useState<string>('');

  // Chart of Accounts opening-balance editor (P0-4e): edits stay local until
  // Save, which hands the full updated array to the parent for persistence
  // (this component never persists accounts itself).
  const [editedBalances, setEditedBalances] = useState<Record<string, number>>({});
  const hasBalanceEdits = Object.keys(editedBalances).length > 0;
  const handleSaveBalances = () => {
    if (!hasBalanceEdits) return;
    onUpdateAccounts(accounts.map((a) =>
      editedBalances[a.code] !== undefined ? { ...a, balance: editedBalances[a.code] } : a
    ));
    setEditedBalances({});
  };

  const variance = physicalCash - dayClosing.systemCash;
  const isOwner = currentRole === 'owner';

  const handleSaveRoznamcha = (lock: boolean) => {
    const updated: DayClosing = {
      ...dayClosing,
      physicalCash,
      variance,
      isLocked: lock,
      lockedBy: currentRole === 'owner' ? 'Owner / مالک' : 'Cashier / منشی'
    };
    onUpdateDayClosing(updated);
    setClosingNotice(
      isUrdu 
        ? `روزنامچہ روزانہ اختتام محفوظ ہوگیا! فرق کیش: Rs ${variance.toLocaleString()}` 
        : `Daily Roznamcha closing updated! Cash Variance: Rs ${variance.toLocaleString()}`
    );
    setTimeout(() => setClosingNotice(null), 4000);
  };

  // Submit General Journal Entry
  const handleSaveJournalEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (jAmount <= 0) return;

    const debitAcc = accounts.find(a => a.code === jDebitCode) || { name: 'Debit Account', urduName: 'ڈیبٹ کھاتہ' };
    const creditAcc = accounts.find(a => a.code === jCreditCode) || { name: 'Credit Account', urduName: 'کریڈٹ کھاتہ' };
    const party = parties.find(p => p.id === jPartyId);

    // Sequential max+1, never random: voucher_number is UNIQUE, and the old
    // random 200–999 scheme collided often — worse, a collision was treated
    // as "already synced" and the entry was silently dropped.
    const newEntry: GeneralJournalEntry = {
      id: `gen-${Date.now()}`,
      entryNumber: nextDocNumber('JV', generalEntries.map((g) => g.entryNumber), 200),
      entryDate: jEntryDate,
      description: jDescEn || jDescUrdu || 'Journal Adjustment Entry',
      descriptionUrdu: jDescUrdu || jDescEn || 'روزنامچہ جنرل اینٹری / کھاتہ ایڈجسٹمنٹ',
      debitAccountCode: jDebitCode,
      debitAccountName: `${debitAcc.name} (${debitAcc.urduName})`,
      creditAccountCode: jCreditCode,
      creditAccountName: `${creditAcc.name} (${creditAcc.urduName})`,
      amount: jAmount,
      partyId: party?.id,
      partyName: party?.name,
      refNo: jRefNo || `J-${Date.now().toString(36).slice(-4).toUpperCase()}`,
      createdBy: currentRole === 'owner' ? 'مالک / ایڈمن' : 'منشی / اکاؤنٹنٹ',
      createdAt: new Date().toISOString()
    };

    if (onAddGeneralEntry) {
      onAddGeneralEntry(newEntry);
    }

    setIsJournalModalOpen(false);
    setJDescUrdu('');
    setJDescEn('');
    setJAmount(0);
    setJRefNo('');
    setClosingNotice(isUrdu ? 'نئی روزنامچہ اینٹری کامیابی سے درج ہو گئی!' : 'Journal entry added successfully!');
    setTimeout(() => setClosingNotice(null), 3000);
  };

  // A cash/bank/wallet account by COA code. The seed COA has no 111x/112x
  // rows, but the check covers bank sub-accounts if one is added later.
  const isCashAccount = (code: string) =>
    code === '1010' || code === '1020' || code === '1030' || code === '1040' ||
    code.startsWith('111') || code.startsWith('112');

  // Pakistani Roznamcha Consolidated Chronological Daily Activities Feed
  type RoznamchaItem = {
    id: string;
    entryDate: string;
    time: string;
    voucherNo: string;
    category: 'cash_in' | 'cash_out' | 'sale' | 'purchase' | 'expense' | 'journal';
    categoryLabelUrdu: string;
    accountTitle: string;
    narration: string;
    narrationUrdu: string;
    debitAmount: number; // بنام (Naam / Payment / Outflow / Receivable)
    creditAmount: number; // جمع (Jama / Receipt / Inflow / Payable)
    isCash: boolean;
  };

  const allRoznamchaEntries = useMemo(() => {
    const list: RoznamchaItem[] = [];

    // 1. Receipts — customer collections are cash IN (Jama); a receipt to a
    // SUPPLIER is a payment out (Naam). The old code filed every receipt as
    // cash_in, so paying a supplier showed as receiving money from them and
    // the daybook's net cash was wrong by 2x the amount for that row.
    receipts.forEach((r) => {
      const party = parties.find(p => p.id === r.partyId);
      const isSupplierPayment = r.partyType === 'supplier';
      const isCash = r.paymentMode === 'cash';
      list.push({
        id: `rec-${r.id}`,
        entryDate: r.receiptDate,
        time: new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        voucherNo: r.receiptNumber,
        category: isSupplierPayment ? 'cash_out' : 'cash_in',
        categoryLabelUrdu: isSupplierPayment
          ? 'سپلائر کو ادائیگی'
          : isCash ? 'نقد وصولی (اگرائی)' : 'بینک وصولی (اگرائی)',
        accountTitle: party?.urduName || party?.name || 'کسٹمر کھاتہ',
        narration: isSupplierPayment
          ? `Payment made to supplier ${party?.name || 'Supplier'} via ${r.paymentMode}`
          : `Payment collected from ${party?.name || 'Customer'} via ${r.paymentMode}`,
        narrationUrdu: isSupplierPayment
          ? `${party?.urduName || party?.name || 'سپلائر'} کو ادائیگی بذریعہ ${r.paymentMode}`
          : `${party?.urduName || party?.name || 'گاہک'} سے وصولی بذریعہ ${r.paymentMode} ${r.collectedBy ? `(وصول کنندہ: ${r.collectedBy})` : ''}`,
        debitAmount: isSupplierPayment ? r.amount : 0, // بنام (Naam / cash out)
        creditAmount: isSupplierPayment ? 0 : r.amount, // جمع (Jama / cash in)
        isCash
      });
    });

    // 2. Invoices Cash & Online on-spot receipts -> Jama (جمع)
    invoices.forEach((inv) => {
      const totRec = (inv.receivedCash || 0) + (inv.receivedAC || 0);
      if (totRec > 0) {
        list.push({
          id: `inv-cash-${inv.id}`,
          entryDate: inv.invoiceDate,
          time: new Date(inv.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          voucherNo: inv.invoiceNumber,
          category: 'cash_in',
          categoryLabelUrdu: 'سیل انوائس وصولی',
          accountTitle: inv.customerUrduName || inv.customerName || 'سیل کھاتہ',
          narration: `Invoice collection for ${inv.netWeightKg}kg chicken`,
          narrationUrdu: `انوائس بل موقع وصولی (${inv.netWeightKg} کلو مرغ فروخت)`,
          debitAmount: 0,
          creditAmount: totRec, // جمع (Jama)
          isCash: inv.receivedCash > 0
        });
      }

      // Also list the sales dispatch (ادھار یا کل فروخت)
      list.push({
        id: `inv-sale-${inv.id}`,
        entryDate: inv.invoiceDate,
        time: new Date(inv.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        voucherNo: inv.invoiceNumber,
        category: 'sale',
        categoryLabelUrdu: 'مرغ فروخت بل',
        accountTitle: inv.customerUrduName || inv.customerName || 'سیل انوائس',
        narration: `Sale of ${inv.netWeightKg}kg @ ${inv.saleRatePer40kg}/40kg`,
        narrationUrdu: `مرغ فروخت: ${inv.netWeightKg} کلو، ریٹ Rs ${inv.saleRatePer40kg.toLocaleString()}`,
        debitAmount: inv.totalAmount, // بنام (Naam / Customer owes us)
        creditAmount: 0,
        isCash: false
      });
    });

    // 3. Expenses (روزمرہ اخراجات) -> Naam (بنام / Cash Out)
    expenses.forEach((e) => {
      const isCash = e.paymentMode === 'cash';
      list.push({
        id: `exp-${e.id}`,
        entryDate: e.date,
        time: new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        voucherNo: e.expenseNumber,
        category: 'expense',
        categoryLabelUrdu: e.categoryUrduName || 'خرچہ',
        accountTitle: e.paidTo ? `${e.categoryUrduName} (${e.paidTo})` : e.categoryUrduName,
        narration: e.description,
        narrationUrdu: e.descriptionUrdu || e.description,
        debitAmount: e.amount, // بنام (Naam / Expense)
        creditAmount: 0,
        isCash
      });
    });

    // 4. Purchases (فارم خریداری) -> Supplier payments & Purchases
    purchases.forEach((pur) => {
      const paid = (pur.paidCash || 0) + (pur.paidBank || 0);
      if (paid > 0) {
        list.push({
          id: `pur-pay-${pur.id}`,
          entryDate: pur.purchaseDate,
          time: new Date(pur.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          voucherNo: pur.purchaseNumber,
          category: 'cash_out',
          categoryLabelUrdu: 'سپلائر نقد ادائیگی',
          accountTitle: pur.supplierName,
          narration: `Payment made to supplier ${pur.supplierName}`,
          narrationUrdu: `سپلائر ${pur.supplierName} کو ادائیگی برائے خریداری`,
          debitAmount: paid, // بنام (Naam / Cash Out)
          creditAmount: 0,
          isCash: pur.paidCash > 0
        });
      }

      list.push({
        id: `pur-${pur.id}`,
        entryDate: pur.purchaseDate,
        time: new Date(pur.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        voucherNo: pur.purchaseNumber,
        category: 'purchase',
        categoryLabelUrdu: 'مال خریداری انٹری',
        accountTitle: `سپلائر: ${pur.supplierName}`,
        narration: `Farm Purchase: ${pur.netWeightKg}kg @ ${pur.ratePer40kg}`,
        narrationUrdu: `فارم مرغ خریداری: ${pur.netWeightKg} کلو، ریٹ ${pur.ratePer40kg}`,
        debitAmount: pur.totalAmount,
        creditAmount: 0,
        isCash: false
      });
    });

    // 5. General Journal Entries (جنرل اینٹریز)
    generalEntries.forEach((g) => {
      // Only the CASH leg counts in the daybook totals: a JV that debits a
      // cash account is cash in, one that credits a cash account is cash out,
      // and a JV with no cash leg moves no cash (both 0). The full Dr/Cr
      // stays in the narration — the row still shows both accounts.
      const debitIsCash = isCashAccount(g.debitAccountCode);
      const creditIsCash = isCashAccount(g.creditAccountCode);
      list.push({
        id: `gen-${g.id}`,
        entryDate: g.entryDate,
        time: new Date(g.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        voucherNo: g.entryNumber,
        category: 'journal',
        categoryLabelUrdu: 'جنرل اینٹری (JV)',
        accountTitle: `${g.debitAccountName} / ${g.creditAccountName}`,
        narration: g.description,
        narrationUrdu: `${g.descriptionUrdu} [بنام: ${g.debitAccountName} | بہ جمع: ${g.creditAccountName}]`,
        debitAmount: creditIsCash ? g.amount : 0, // cash out only
        creditAmount: debitIsCash ? g.amount : 0, // cash in only
        isCash: debitIsCash || creditIsCash
      });
    });

    return list.sort((a, b) => b.entryDate.localeCompare(a.entryDate));
  }, [receipts, invoices, expenses, purchases, generalEntries, parties]);

  // Filtered by selectedDate and filter options
  const filteredRoznamcha = useMemo(() => {
    return allRoznamchaEntries.filter((item) => {
      if (selectedDate && item.entryDate !== selectedDate) return false;
      if (typeFilter === 'cash' && !item.isCash) return false;
      if (typeFilter === 'sales' && item.category !== 'sale') return false;
      if (typeFilter === 'purchases' && item.category !== 'purchase') return false;
      if (typeFilter === 'expenses' && item.category !== 'expense') return false;
      if (typeFilter === 'journal' && item.category !== 'journal') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return item.accountTitle.toLowerCase().includes(q) ||
               item.narrationUrdu.includes(q) ||
               item.voucherNo.toLowerCase().includes(q);
      }
      return true;
    });
  }, [allRoznamchaEntries, selectedDate, typeFilter, searchQuery]);

  // Aggregate daily totals
  const totalJama = filteredRoznamcha.reduce((s, i) => s + i.creditAmount, 0);
  const totalNaam = filteredRoznamcha.reduce((s, i) => s + i.debitAmount, 0);

  // Cash In Hand calculation for selected day. JV rows already carry only
  // their cash effect in credit/debitAmount, so the category filter is
  // enough — the old accountTitle.includes('1010') check could never match
  // (titles carry names, not codes) and is gone.
  const cashInToday = filteredRoznamcha
    .filter(i => i.isCash && (i.category === 'cash_in' || i.category === 'journal'))
    .reduce((s, i) => s + i.creditAmount, 0);
  const cashOutToday = filteredRoznamcha
    .filter(i => i.isCash && (i.category === 'cash_out' || i.category === 'expense' || i.category === 'journal'))
    .reduce((s, i) => s + i.debitAmount, 0);

  // P&L Metrics — derived from LIVE documents, not COA balances. The COA
  // balances are never maintained by daily flows (they showed Rs 0 revenue
  // despite real sales), so revenue/COGS/expenses come from invoices,
  // purchases and expense vouchers directly. Net MUST equal the lines shown.
  const liveInvoices = invoices.filter((i) => !i.isVoid);
  const totalRevenue = liveInvoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
  const totalCOGS = purchases.reduce((s, p) => s + (p.totalAmount || 0), 0);
  const totalFuel = expenses.filter((e) => e.category === 'fuel').reduce((s, e) => s + (e.amount || 0), 0);
  const totalSalaries = expenses.filter((e) => e.category === 'labor').reduce((s, e) => s + (e.amount || 0), 0);
  const totalOtherExpenses = expenses
    .filter((e) => e.category !== 'fuel' && e.category !== 'labor')
    .reduce((s, e) => s + (e.amount || 0), 0);
  const grossProfit = totalRevenue - totalCOGS;
  const netProfit = totalRevenue - totalCOGS - totalFuel - totalSalaries - totalOtherExpenses;
  const totalSalesKg = liveInvoices.reduce((s, i) => s + (i.netWeightKg || 0), 0);
  const profitPerKg = totalSalesKg > 0 ? (netProfit / totalSalesKg) : 0;

  // Balance Sheet — every figure from live data; nothing hardcoded. When a
  // source is empty the figure is Rs 0 with a note, never a made-up number.
  const balanceOf = (code: string) => accounts.find((a) => a.code === code)?.balance ?? 0;
  const bsCash = balanceOf('1010');
  const bsBank = accounts
    .filter((a) => a.code === '1020' || a.code.startsWith('112'))
    .reduce((s, a) => s + (a.balance || 0), 0);
  const bsWallets = balanceOf('1030') + balanceOf('1040');
  const bsUdhaar = parties
    .filter((p) => p.partyType === 'customer')
    .reduce((s, p) => s + Math.max(0, p.currentBalance || 0), 0);
  const bsPayables = parties
    .filter((p) => p.partyType === 'supplier')
    .reduce((s, p) => s + Math.max(0, p.currentBalance || 0), 0);
  const bsAdvances = employees
    ? employees.reduce((s, e) => s + (e.advanceBalance || 0), 0)
    : 0;
  // Farm bird stock: BR-LIVE weight valued at the latest invoice's mandi
  // rate. No invoice rate on record => value 0 with an honest note, never a
  // fabricated rate.
  const liveStockRow = inventory.find((i) => i.code === 'BR-LIVE');
  const liveStockKg = liveStockRow?.currentWeightKg ?? 0;
  const latestMandiRate = [...invoices]
    .filter((i) => !i.isVoid && (i.mandiRatePer40kg || 0) > 0)
    .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate))[0]?.mandiRatePer40kg;
  const bsStockValue = latestMandiRate ? Math.round((liveStockKg * latestMandiRate) / 40) : 0;
  const bsTotalAssets = bsCash + bsBank + bsWallets + bsUdhaar + bsStockValue;
  const bsTotalLiabilities = bsPayables + bsAdvances;
  const bsOwnerCapital = balanceOf('3010');
  // Retained earnings is the balancing plug — labelled as such in the UI,
  // not presented as a measured figure.
  const bsRetainedEarnings = bsTotalAssets - bsTotalLiabilities - bsOwnerCapital;
  const bsTotalLiabEquity = bsTotalLiabilities + bsOwnerCapital + bsRetainedEarnings;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-emerald-600" />
            <span>{isUrdu ? 'روزنامچہ عمومی، روکڑ بہی و فنانشل اکاؤنٹس' : 'General Roznamcha Daybook & Double-Entry Accounts'}</span>
          </h2>
          <p className="text-xs text-slate-500">
            {isUrdu 
              ? 'پاکستانی روایتی اکاؤنٹنگ روزنامچہ: تمام یومیہ مالی سرگرمیاں، جنرل اینٹریز، جمع و بنام تقابلی میزان، اور روکڑ گلہ کاؤنٹ' 
              : 'Pakistan-standard Roznamcha Daybook: Complete daily activities feed, general journal entries, Jama/Naam reconciliation, and cash safe lock.'}
          </p>
        </div>

        {/* Sub Tabs & Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            {[
              { id: 'roznamcha', labelEn: 'Roznamcha Daybook', labelUr: 'روزنامچہ بہی (Daybook)' },
              { id: 'chart', labelEn: 'Chart of Accounts', labelUr: 'کھاتہ جات لسٹ' },
              { id: 'pnl', labelEn: 'Profit & Loss', labelUr: 'نفع و نقصان' },
              { id: 'balance_sheet', labelEn: 'Balance Sheet', labelUr: 'بیلنس شیٹ' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={`px-3 py-1.5 rounded-lg font-bold transition ${
                  activeTab === t.id ? 'bg-emerald-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>{isUrdu ? t.labelUr : t.labelEn}</span>
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsJournalModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isUrdu ? '+ نئی جنرل اینٹری درج کریں' : '+ Add Journal Entry'}</span>
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm transition"
            title="Print Roznamcha Statement"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isUrdu ? 'پرنٹ روزنامچہ' : 'Print'}</span>
          </button>
        </div>
      </div>

      {closingNotice && (
        <div className="p-3 bg-emerald-600 text-white rounded-xl text-xs font-medium flex items-center gap-2 animate-in fade-in shadow-md">
          <CheckCircle className="w-4 h-4" />
          <span>{closingNotice}</span>
        </div>
      )}

      {/* TAB 1: UPGRADED ROZNAMCHA DAYBOOK (پاکستانی روایتی روزنامچہ) */}
      {activeTab === 'roznamcha' && (
        <div className="space-y-6">
          {/* Daily Cash & Galla Summary Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-bold text-slate-500 uppercase block">
                {isUrdu ? 'سسٹم کا نقد بیلنس (System Cash)' : 'System Computed Cash'}
              </span>
              <p className="text-xl font-black text-slate-900 font-mono mt-1">
                Rs {dayClosing.systemCash.toLocaleString()}
              </p>
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                {isUrdu ? 'سیلز، وصولیوں اور اخراجات کا نیٹ' : 'Net sales, receipts & expenses'}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-bold text-slate-500 uppercase block">
                {isUrdu ? 'گلہ میں اصل کیش کاؤنٹ' : 'Physical Cash Count'}
              </span>
              <div className="flex items-center gap-1.5 mt-1">
                <input
                  type="number"
                  value={physicalCash}
                  onChange={(e) => setPhysicalCash(parseFloat(e.target.value) || 0)}
                  disabled={dayClosing.isLocked && !isOwner}
                  className="w-full px-2.5 py-1 rounded-lg border border-slate-300 font-mono font-bold text-base text-slate-900"
                />
                <button
                  onClick={() => handleSaveRoznamcha(false)}
                  className="px-2 py-1 bg-slate-900 text-white rounded-lg text-xs font-bold whitespace-nowrap"
                  title="Update"
                >
                  {isUrdu ? 'محفوظ' : 'Save'}
                </button>
              </div>
              {dayClosing.date !== selectedDate && (
                <span className="text-[10px] text-amber-700 font-bold mt-1 block">
                  {isUrdu
                    ? `اس تاریخ کا کوئی اختتام محفوظ نہیں — گنتی 0 سے شروع`
                    : `No closing saved for ${selectedDate} — count starts at 0`}
                </span>
              )}
            </div>

            <div className={`p-4 rounded-2xl border shadow-sm ${
              variance === 0 
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950' 
                : variance > 0 
                ? 'bg-blue-50 border-blue-300 text-blue-950'
                : 'bg-rose-50 border-rose-300 text-rose-950'
            }`}>
              <span className="text-[11px] font-bold uppercase block">
                {isUrdu ? 'روکڑ فرق (Variance)' : 'Cash Variance'}
              </span>
              <p className="text-xl font-black font-mono mt-1">
                {variance >= 0 ? `+Rs ${variance.toLocaleString()}` : `-Rs ${Math.abs(variance).toLocaleString()}`}
              </p>
              <span className="text-[10px] font-bold block mt-0.5">
                {variance === 0 ? 'بیلنس برابر ہے' : variance > 0 ? 'کیش زیادہ ہے (Surplus)' : 'کیش کم ہے (Shortage)'}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase">
                  {isUrdu ? 'دن لاک اسٹیٹس' : 'Day Lock Status'}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  dayClosing.isLocked ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {dayClosing.isLocked ? (isUrdu ? 'لاک ہے' : 'Locked') : (isUrdu ? 'کھلا ہے' : 'Open')}
                </span>
              </div>
              <button
                onClick={() => handleSaveRoznamcha(!dayClosing.isLocked)}
                className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition mt-2 ${
                  dayClosing.isLocked 
                    ? 'bg-amber-600 hover:bg-amber-700 text-white' 
                    : 'bg-rose-600 hover:bg-rose-700 text-white'
                }`}
              >
                {dayClosing.isLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                <span>{dayClosing.isLocked ? (isUrdu ? 'دن کا لاک کھولیں' : 'Unlock Day') : (isUrdu ? 'دن مکمل و لاک کریں' : 'Lock Daily Roznamcha')}</span>
              </button>
            </div>
          </div>

          {/* Filter Toolbar for Roznamcha Activities */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
                {isUrdu ? 'تاریخ روزنامچہ:' : 'Roznamcha Date:'}
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-800"
              />
              <button
                onClick={() => setSelectedDate(todayStr)}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold"
              >
                {isUrdu ? 'آج' : 'Today'}
              </button>
            </div>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
              {[
                { id: 'all', label: isUrdu ? 'تمام ایکٹیویٹیز' : 'All' },
                { id: 'cash', label: isUrdu ? 'صرف روکڑ کیش' : 'Cash Only' },
                { id: 'sales', label: isUrdu ? 'سیلز بلز' : 'Sales' },
                { id: 'purchases', label: isUrdu ? 'خریداریاں' : 'Purchases' },
                { id: 'expenses', label: isUrdu ? 'اخراجات' : 'Expenses' },
                { id: 'journal', label: isUrdu ? 'جنرل اینٹریز' : 'Journal Entries' },
              ].map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setTypeFilter(pill.id as any)}
                  className={`px-2.5 py-1 rounded-lg font-bold transition text-[11px] ${
                    typeFilter === pill.id ? 'bg-emerald-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative min-w-48">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isUrdu ? 'کھاتہ یا واؤچر تلاش کریں...' : 'Search entry or ref...'}
                className="w-full pl-8 pr-3 py-1 rounded-xl border border-slate-300 text-xs"
              />
            </div>
          </div>

          {/* MAIN ROZNAMCHA TABLE (روایتی روزنامچہ جدول) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-emerald-600" />
                  <span>{isUrdu ? `روزنامچہ عمومی و روزمرہ بہی کھاتہ (تاریخ: ${selectedDate})` : `General Roznamcha Daybook for ${selectedDate}`}</span>
                </h3>
                <p className="text-xs text-slate-500">
                  {isUrdu ? 'آمدن، وصولیاں، ادائیگیاں، اخراجات اور جنرل اینٹریز کا مکمل اندارج' : 'Chronological dual-sided record of all daily transactions.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold bg-slate-100 px-2.5 py-1 rounded-lg">
                  {filteredRoznamcha.length} {isUrdu ? 'اندراجات' : 'Records'}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse border border-slate-200">
                <thead className="bg-slate-100 text-slate-900 uppercase font-bold text-[11px]">
                  <tr className="border-b border-slate-300">
                    <th className="p-3 w-10 text-center border-r">{isUrdu ? 'شمار' : 'Sr'}</th>
                    <th className="p-3 w-24 border-r">{isUrdu ? 'وقت / واؤچر #' : 'Voucher #'}</th>
                    <th className="p-3 w-32 border-r">{isUrdu ? 'نوعیت اینٹری' : 'Category'}</th>
                    <th className="p-3 border-r">{isUrdu ? 'کھاتہ کا نام و تفصیل' : 'Account Title & Narration'}</th>
                    <th className="p-3 w-32 text-right border-r bg-rose-50 text-rose-950 font-extrabold">{isUrdu ? 'بنام / خرچ (Naam / Debit)' : 'Debit (Naam)'}</th>
                    <th className="p-3 w-32 text-right bg-emerald-50 text-emerald-950 font-extrabold">{isUrdu ? 'بہ جمع / آمدن (Jama / Credit)' : 'Credit (Jama)'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRoznamcha.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        {isUrdu 
                          ? `اس تاریخ (${selectedDate}) پر کوئی سرگرمی ریکارڈ نہیں ہے۔ آپ اوپر "+ نئی جنرل اینٹری درج کریں" پر کلک کر کے اینٹری ڈال سکتے ہیں۔` 
                          : `No activities recorded for ${selectedDate}.`}
                      </td>
                    </tr>
                  ) : (
                    filteredRoznamcha.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50 transition">
                        <td className="p-3 text-center font-mono text-slate-400 border-r">{idx + 1}</td>
                        <td className="p-3 font-mono font-bold text-slate-900 border-r">
                          {item.voucherNo}
                          <span className="block text-[10px] text-slate-400 font-normal">{item.time}</span>
                        </td>
                        <td className="p-3 border-r">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.category === 'cash_in' 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : item.category === 'cash_out' || item.category === 'expense'
                              ? 'bg-rose-100 text-rose-800'
                              : item.category === 'sale'
                              ? 'bg-blue-100 text-blue-800'
                              : item.category === 'purchase'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}>
                            {item.categoryLabelUrdu}
                          </span>
                        </td>
                        <td className="p-3 border-r">
                          <div className="font-bold text-slate-900">
                            {item.accountTitle}
                          </div>
                          <div className="text-[11px] text-slate-600 mt-0.5">
                            {item.narrationUrdu}
                          </div>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-rose-700 bg-rose-50/30 border-r">
                          {item.debitAmount > 0 ? `Rs ${item.debitAmount.toLocaleString()}` : '-'}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30">
                          {item.creditAmount > 0 ? `Rs ${item.creditAmount.toLocaleString()}` : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-200 font-bold border-t-2 border-slate-400 text-slate-900">
                    <td colSpan={4} className="p-3 text-right border-r">
                      {isUrdu ? 'میزان کل (Grand Totals):' : 'Grand Totals:'}
                    </td>
                    <td className="p-3 text-right font-mono text-rose-900 font-black text-sm bg-rose-100/60 border-r">
                      Rs {totalNaam.toLocaleString()}
                    </td>
                    <td className="p-3 text-right font-mono text-emerald-900 font-black text-sm bg-emerald-100/60">
                      Rs {totalJama.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Roznamcha Print & Audit Footnote */}
            <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-500">
              <div>
                <span>{isUrdu ? 'دستخط منشی / اکاؤنٹنٹ: _________________' : 'Accountant Signature: _________________'}</span>
              </div>
              <div>
                <span>{isUrdu ? 'دستخط مالک / کیشئر: _________________' : 'Owner / Cashier Signature: _________________'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CHART OF ACCOUNTS */}
      {activeTab === 'chart' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {isUrdu ? 'پاکستان چارٹ آف اکاؤنٹس (Chart of Accounts)' : 'Chart of Accounts'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {isUrdu
                  ? 'افتتاحی بیلنس ایک بار درج کریں — نقد، بینک، ادھار، واجبات جیسا گنا گیا۔ تبدیلی کے بعد محفوظ کریں۔'
                  : 'Set opening balances once — cash, bank, receivables, payables as counted. Press Save after editing.'}
              </p>
            </div>
            <button
              onClick={handleSaveBalances}
              disabled={!hasBalanceEdits}
              className={`px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition ${
                hasBalanceEdits
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              {isUrdu ? 'بیلنس محفوظ کریں' : 'Save Balances'}
              {hasBalanceEdits && (
                <span className="ml-1.5 text-[10px] bg-white/25 px-1.5 py-0.5 rounded-full">
                  {isUrdu ? 'غیر محفوظ تبدیلیاں' : 'unsaved changes'}
                </span>
              )}
            </button>
          </div>
          {accounts.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
              {isUrdu
                ? 'ابھی کوئی کھاتہ نہیں — اگلی ریفریش پر کھاتے خود بخود بن جائیں گے۔'
                : 'No accounts yet — they are created automatically on the next refresh.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-700 border-collapse">
                <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[11px]">
                  <tr>
                    <th className="p-3 border-b">{isUrdu ? 'کوڈ' : 'Code'}</th>
                    <th className="p-3 border-b">{isUrdu ? 'اکاؤنٹ کا نام' : 'Account Name'}</th>
                    <th className="p-3 border-b">{isUrdu ? 'کیٹیگری' : 'Category'}</th>
                    <th className="p-3 border-b text-right">{isUrdu ? 'بیلنس (روپے)' : 'Balance (PKR)'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {accounts.map((acc) => (
                    <tr key={acc.code} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-slate-900">{acc.code}</td>
                      <td className="p-3 font-medium">
                        <span>{acc.name}</span>
                        <span className="font-urdu text-emerald-800 mr-2 text-[13px]"> ({acc.urduName})</span>
                      </td>
                      <td className="p-3 capitalize">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                          {acc.category}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <input
                          type="number"
                          value={editedBalances[acc.code] ?? acc.balance}
                          onChange={(e) => setEditedBalances((prev) => ({
                            ...prev,
                            [acc.code]: parseFloat(e.target.value) || 0,
                          }))}
                          className={`w-32 px-2 py-1 rounded-lg border text-right font-mono font-bold text-slate-900 ${
                            editedBalances[acc.code] !== undefined
                              ? 'border-amber-400 bg-amber-50'
                              : 'border-slate-300'
                          }`}
                          aria-label={`Balance for ${acc.name}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PROFIT & LOSS STATEMENT */}
      {activeTab === 'pnl' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 max-w-3xl mx-auto">
          <div className="border-b pb-3 text-center">
            <h3 className="text-lg font-black text-slate-900">
              {isUrdu ? 'گوشوارہ نفع و نقصان (Profit & Loss Statement)' : 'Profit & Loss Statement'}
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              {isUrdu
                ? 'لائیو انوائسز، خریداریوں اور اخراجات سے — تمام ریکارڈ شدہ مدت'
                : 'From live invoices, purchases & expenses — all recorded'}
            </span>
          </div>

          <div className="space-y-3 text-xs divide-y divide-slate-100">
            <div className="flex justify-between py-2 text-sm font-bold text-slate-900">
              <span>{isUrdu ? 'آمدنی / مرغ فروخت (Revenue)' : 'Total Revenue (Chicken Sales):'}</span>
              <span className="font-mono text-emerald-700">Rs {totalRevenue.toLocaleString()}</span>
            </div>

            <div className="flex justify-between py-2 text-slate-600">
              <span>{isUrdu ? 'منفی: خریداری لاگت (Cost of Goods Sold):' : 'Less: Cost of Birds (COGS):'}</span>
              <span className="font-mono text-rose-700">- Rs {totalCOGS.toLocaleString()}</span>
            </div>

            <div className="flex justify-between py-2 font-bold bg-slate-50 px-2 rounded-lg">
              <span>{isUrdu ? 'خام نفع (Gross Profit):' : 'Gross Profit:'}</span>
              <span className="font-mono text-emerald-800">Rs {grossProfit.toLocaleString()}</span>
            </div>

            <div className="flex justify-between py-2 text-slate-600">
              <span>{isUrdu ? 'گاڑی پیٹرول و مرمت (Diesel & Vehicle):' : 'Vehicle Fuel & Maintenance:'}</span>
              <span className="font-mono">- Rs {totalFuel.toLocaleString()}</span>
            </div>

            <div className="flex justify-between py-2 text-slate-600">
              <span>{isUrdu ? 'اسٹاف تنخواہیں (Salaries & Labor):' : 'Salaries & Labor:'}</span>
              <span className="font-mono">- Rs {totalSalaries.toLocaleString()}</span>
            </div>

            <div className="flex justify-between py-2 text-slate-600">
              <span>{isUrdu ? 'دیگر اخراجات (Other Expenses):' : 'Other Expenses:'}</span>
              <span className="font-mono">- Rs {totalOtherExpenses.toLocaleString()}</span>
            </div>

            <div className="flex justify-between py-3 text-base font-black bg-emerald-50 px-3 rounded-xl border border-emerald-200 text-emerald-950">
              <span>{isUrdu ? 'خالص منافع (Net Profit):' : 'Net Profit:'}</span>
              <span className="font-mono text-emerald-700">Rs {netProfit.toLocaleString()}</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900 text-white flex items-center justify-between text-xs">
            <span>{isUrdu ? 'فی کلو اوسط منافع مارجن:' : 'Profit Per Kg Metric:'}</span>
            <span className="font-mono font-bold text-emerald-400 text-sm">
              Rs {profitPerKg.toFixed(2)} / kg
            </span>
          </div>
        </div>
      )}

      {/* TAB 4: BALANCE SHEET */}
      {activeTab === 'balance_sheet' && (
        <div className="space-y-3 max-w-4xl mx-auto">
          {accounts.length === 0 && (
            <div className="p-4 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-sm">
              {isUrdu
                ? 'ابھی کوئی کھاتہ نہیں — اعداد تب ظاہر ہوں گے جب چارٹ آف اکاؤنٹس بن جائے۔'
                : 'No accounts on record yet — figures will appear once the chart of accounts is set up.'}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Assets */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <h4 className="text-sm font-bold text-slate-900 border-b pb-2 text-emerald-800">
              {isUrdu ? 'اثاثہ جات (Assets)' : 'Assets'}
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span>Cash in Hand (نقد گلہ) · 1010</span>
                <span className="font-mono font-bold">Rs {bsCash.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Bank Accounts (بینک بیلنس) · 1020</span>
                <span className="font-mono font-bold">Rs {bsBank.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Wallets (جاز کیش / ایزی پیسہ) · 1030+1040</span>
                <span className="font-mono font-bold">Rs {bsWallets.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Customer Udhaar (ادھار بقایا)</span>
                <span className="font-mono font-bold">Rs {bsUdhaar.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>
                  Farm Bird Stock (مرغ اسٹاک)
                  <span className="block text-[10px] text-slate-400 font-normal">
                    {liveStockKg.toLocaleString()} kg BR-LIVE
                    {latestMandiRate
                      ? ` @ Rs ${latestMandiRate.toLocaleString()}/40kg (latest invoice mandi rate)`
                      : ' — no mandi rate on record, valued at 0'}
                  </span>
                </span>
                <span className="font-mono font-bold">Rs {bsStockValue.toLocaleString()}</span>
              </div>
              <div className="flex justify-between pt-2 border-t font-bold text-emerald-900 text-sm">
                <span>Total Assets:</span>
                <span className="font-mono">Rs {bsTotalAssets.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Liabilities & Equity */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <h4 className="text-sm font-bold text-slate-900 border-b pb-2 text-rose-800">
              {isUrdu ? 'واجبات و سرمایہ (Liabilities & Equity)' : 'Liabilities & Equity'}
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span>Supplier Payables (سپلائرز کے واجبات)</span>
                <span className="font-mono font-bold">Rs {bsPayables.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>
                  Advances to Staff (ملازمین پیشگی)
                  {!employees && (
                    <span className="block text-[10px] text-slate-400 font-normal">employee data not loaded</span>
                  )}
                </span>
                <span className="font-mono font-bold">Rs {bsAdvances.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Owner Capital (مالک کا سرمایہ) · 3010</span>
                <span className="font-mono font-bold">Rs {bsOwnerCapital.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>
                  Retained Earnings (محفوظ منافع)
                  <span className="block text-[10px] text-slate-400 font-normal">balancing figure — not a measured amount</span>
                </span>
                <span className="font-mono font-bold">Rs {bsRetainedEarnings.toLocaleString()}</span>
              </div>
              <div className="flex justify-between pt-2 border-t font-bold text-slate-900 text-sm">
                <span>Total Liabilities & Equity:</span>
                <span className="font-mono">Rs {bsTotalLiabEquity.toLocaleString()}</span>
              </div>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD GENERAL JOURNAL ENTRY (نیا روزنامچہ اندراج فارم) */}
      {isJournalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 text-slate-800 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {isUrdu ? 'نیا روزنامچہ و جنرل اینٹری اندراج' : 'Record General Journal Entry'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {isUrdu ? 'رعایت، بینک جمع، مرغ مورٹیلٹی نقصان، یا کھاتہ ایڈجسٹمنٹ' : 'Double-entry adjustment for discounts, bank deposits, or farm losses'}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsJournalModalOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveJournalEntry} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isUrdu ? 'تاریخ:' : 'Date:'}
                  </label>
                  <input
                    type="date"
                    value={jEntryDate}
                    onChange={(e) => setJEntryDate(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isUrdu ? 'رقم (PKR):' : 'Amount (PKR):'}
                  </label>
                  <input
                    type="number"
                    value={jAmount}
                    onChange={(e) => setJAmount(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 font-mono font-bold text-emerald-800"
                    required
                  />
                </div>
              </div>

              {/* Debit & Credit Accounts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-rose-700 mb-1">
                    {isUrdu ? 'بنام کھاتہ (Debit Account):' : 'Debit Account:'}
                  </label>
                  <select
                    value={jDebitCode}
                    onChange={(e) => setJDebitCode(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-rose-300 bg-rose-50/30 text-xs font-bold"
                  >
                    {accounts.map(a => (
                      <option key={a.code} value={a.code}>
                        {a.code} - {a.urduName || a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-emerald-700 mb-1">
                    {isUrdu ? 'بہ جمع کھاتہ (Credit Account):' : 'Credit Account:'}
                  </label>
                  <select
                    value={jCreditCode}
                    onChange={(e) => setJCreditCode(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-emerald-300 bg-emerald-50/30 text-xs font-bold"
                  >
                    {accounts.map(a => (
                      <option key={a.code} value={a.code}>
                        {a.code} - {a.urduName || a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Optional Party Link */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isUrdu ? 'منسلک گاہک یا سپلائر (اختیاری):' : 'Associated Party (Optional):'}
                </label>
                <select
                  value={jPartyId}
                  onChange={(e) => setJPartyId(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white"
                >
                  <option value="">{isUrdu ? '-- کوئی مخصوص کھاتہ نہیں --' : '-- None --'}</option>
                  {parties.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.urduName || p.name} ({p.partyType === 'customer' ? 'گاہک' : 'سپلائر'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isUrdu ? 'تفصیل برائے روزنامچہ (اردو):' : 'Narration / Description (Urdu):'}
                </label>
                <input
                  type="text"
                  value={jDescUrdu}
                  onChange={(e) => setJDescUrdu(e.target.value)}
                  placeholder="مثال: گاہک کو نقد بل پر 500 روپے رعایت / چھوٹ دی"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">
                    {isUrdu ? 'ریفرنس / سلپ نمبر:' : 'Ref / Slip #:'}
                  </label>
                  <input
                    type="text"
                    value={jRefNo}
                    onChange={(e) => setJRefNo(e.target.value)}
                    placeholder="JV-01"
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">
                    {isUrdu ? 'اندراج کنندہ:' : 'Recorded By:'}
                  </label>
                  <input
                    type="text"
                    value={currentRole === 'owner' ? 'مالک / ایڈمن' : 'منشی / اکاؤنٹنٹ'}
                    readOnly
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 font-bold"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsJournalModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  {isUrdu ? 'منسوخ' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md"
                >
                  {isUrdu ? 'روزنامچہ میں درج کریں' : 'Post Journal Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
