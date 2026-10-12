import React, { useState } from 'react';
import { 
  Party, 
  Invoice, 
  ReceiptVoucher, 
  OrderItem, 
  Vehicle, 
  Trip, 
  InventoryItem, 
  AccountItem, 
  DayClosing, 
  UserRole,
  ExpenseItem 
} from '../../types';
import { formatPKR, generateLedgerWhatsAppUrl } from '../../utils/calculations';
import { useBusiness } from '../../context/BusinessContext';
import { 
  ResponsiveContainer, 
  ComposedChart,
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  CartesianGrid 
} from 'recharts';
import { 
  LayoutDashboard, 
  TrendingUp, 
  DollarSign, 
  Scale, 
  Wallet, 
  Users, 
  Truck, 
  Layers, 
  Calendar, 
  Search, 
  Printer, 
  Download, 
  Share2, 
  ArrowUpRight, 
  ArrowDownRight, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  Lock, 
  PlusCircle, 
  ShoppingBag,
  ExternalLink
} from 'lucide-react';

interface DashboardViewProps {
  parties: Party[];
  invoices: Invoice[];
  receipts: ReceiptVoucher[];
  orders: OrderItem[];
  vehicles: Vehicle[];
  trips: Trip[];
  inventory: InventoryItem[];
  accounts: AccountItem[];
  dayClosing: DayClosing;
  todayMandiRate: number;
  currentRole: UserRole;
  language: 'en' | 'ur';
  expenses?: ExpenseItem[];
  onNavigateTab: (tab: string) => void;
  onOpenReceiptModal: (partyId?: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  parties,
  invoices,
  receipts,
  orders,
  vehicles,
  trips,
  inventory,
  accounts,
  dayClosing,
  todayMandiRate,
  currentRole,
  language,
  expenses,
  onNavigateTab,
  onOpenReceiptModal
}) => {
  const isUrdu = language === 'ur';
  const { settings: biz } = useBusiness();
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month'>('today');
  const [globalSearch, setGlobalSearch] = useState<string>('');
  const [activeReportTab, setActiveReportTab] = useState<'sales' | 'customers' | 'margin' | 'stock'>('sales');

  const customers = parties.filter((p) => p.partyType === 'customer');
  const totalReceivables = customers.reduce((sum, c) => sum + Math.max(0, c.currentBalance), 0);
  const totalAdvances = customers.reduce((sum, c) => sum + Math.abs(Math.min(0, c.currentBalance)), 0);

  // Liquidity calculation — no phantom defaults: empty accounts mean zero balances.
  const cashInHand = accounts.find((a) => a.code === '1010')?.balance ?? 0;
  const bankBalance = accounts.find((a) => a.code === '1020')?.balance ?? 0;
  const walletsBalance = (accounts.find((a) => a.code === '1030')?.balance ?? 0) + (accounts.find((a) => a.code === '1040')?.balance ?? 0);
  const totalLiquidity = cashInHand + bankBalance + walletsBalance;

  // Farm Stock
  const liveBirdsCount = inventory.filter(i => i.category === 'broiler').reduce((s, i) => s + i.currentCount, 0);
  const liveBirdsWeight = inventory.filter(i => i.category === 'broiler').reduce((s, i) => s + i.currentWeightKg, 0);

  // Sales Today — no phantom defaults: no closing means zero sales.
  const todaySalesAmount = dayClosing.totalSalesAmount ?? 0;
  const todaySalesKg = dayClosing.totalSalesKg ?? 0;
  const todayCollections = dayClosing.totalCollections ?? 0;

  // Mandi Margin Spread
  const avgSaleRate = invoices.length > 0 
    ? Math.round(invoices.reduce((s, i) => s + i.saleRatePer40kg, 0) / invoices.length) 
    : 12200;
  const mandiMarginSpread = avgSaleRate - todayMandiRate;
  const estimatedProfitToday = Math.round((todaySalesKg * mandiMarginSpread) / 40);

  // Mock Trend Data for Charts (7 Days of Mandi & Sales)
  const salesTrendData = [
    { day: 'Mon (پیر)', salesRs: 720000, weightKg: 2400, mandiRate: 11800, saleRate: 12050 },
    { day: 'Tue (منگل)', salesRs: 790000, weightKg: 2600, mandiRate: 11900, saleRate: 12150 },
    { day: 'Wed (بدھ)', salesRs: 840000, weightKg: 2750, mandiRate: 11950, saleRate: 12200 },
    { day: 'Thu (جمعرات)', salesRs: 810000, weightKg: 2680, mandiRate: 12000, saleRate: 12220 },
    { day: 'Fri (جمعہ)', salesRs: 910000, weightKg: 2950, mandiRate: 12050, saleRate: 12300 },
    { day: 'Sat (ہفتہ)', salesRs: 880000, weightKg: 2890, mandiRate: 12000, saleRate: 12250 },
    { day: 'Today (آج)', salesRs: todaySalesAmount, weightKg: todaySalesKg, mandiRate: todayMandiRate, saleRate: avgSaleRate },
  ];

  // Daily Profit Trend: Net Gains vs Operating Expenses
  const dailyProfitTrendData = [
    { 
      day: isUrdu ? 'پیر' : 'Mon',
      grossGain: 51200, 
      operatingExpenses: 13500, 
      netGain: 37700,
      marginPct: 73.6,
      breakdown: isUrdu ? 'ڈیزل: 4,500 | لیبر: 6,000 | شیڈ: 3,000' : 'Fuel: 4,500 | Labor: 6,000 | Shed: 3,000'
    },
    { 
      day: isUrdu ? 'منگل' : 'Tue',
      grossGain: 55400, 
      operatingExpenses: 14200, 
      netGain: 41200,
      marginPct: 74.3,
      breakdown: isUrdu ? 'ڈیزل: 4,800 | لیبر: 6,000 | شیڈ: 3,400' : 'Fuel: 4,800 | Labor: 6,000 | Shed: 3,400'
    },
    { 
      day: isUrdu ? 'بدھ' : 'Wed',
      grossGain: 59100, 
      operatingExpenses: 15100, 
      netGain: 44000,
      marginPct: 74.4,
      breakdown: isUrdu ? 'ڈیزل: 5,200 | لیبر: 6,500 | شیڈ: 3,400' : 'Fuel: 5,200 | Labor: 6,500 | Shed: 3,400'
    },
    { 
      day: isUrdu ? 'جمعرات' : 'Thu',
      grossGain: 57000, 
      operatingExpenses: 14000, 
      netGain: 43000,
      marginPct: 75.4,
      breakdown: isUrdu ? 'ڈیزل: 4,500 | لیبر: 6,500 | شیڈ: 3,000' : 'Fuel: 4,500 | Labor: 6,500 | Shed: 3,000'
    },
    { 
      day: isUrdu ? 'جمعہ' : 'Fri',
      grossGain: 65200, 
      operatingExpenses: 16800, 
      netGain: 48400,
      marginPct: 74.2,
      breakdown: isUrdu ? 'ڈیزل: 6,200 | لیبر: 7,000 | شیڈ: 3,600' : 'Fuel: 6,200 | Labor: 7,000 | Shed: 3,600'
    },
    { 
      day: isUrdu ? 'ہفتہ' : 'Sat',
      grossGain: 61500, 
      operatingExpenses: 15400, 
      netGain: 46100,
      marginPct: 74.9,
      breakdown: isUrdu ? 'ڈیزل: 5,500 | لیبر: 6,500 | شیڈ: 3,400' : 'Fuel: 5,500 | Labor: 6,500 | Shed: 3,400'
    },
    { 
      day: isUrdu ? 'آج' : 'Today',
      grossGain: estimatedProfitToday + (expenses?.reduce((s, e) => s + e.amount, 0) ?? 0), 
      operatingExpenses: expenses && expenses.length > 0 ? expenses.reduce((s, e) => s + e.amount, 0) : 0, 
      netGain: estimatedProfitToday,
      marginPct: estimatedProfitToday + (expenses?.reduce((s, e) => s + e.amount, 0) ?? 0) > 0
        ? Math.round((estimatedProfitToday / (estimatedProfitToday + (expenses?.reduce((s, e) => s + e.amount, 0) ?? 0))) * 100)
        : 0,
      breakdown: isUrdu 
        ? `ڈیزل: ${(expenses?.filter(e => e.category === 'fuel').reduce((s, e) => s + e.amount, 0) ?? 0).toLocaleString()} | لیبر: ${(expenses?.filter(e => e.category === 'labor').reduce((s, e) => s + e.amount, 0) ?? 0).toLocaleString()}` 
        : `Fuel: ${(expenses?.filter(e => e.category === 'fuel').reduce((s, e) => s + e.amount, 0) ?? 0).toLocaleString()} | Labor: ${(expenses?.filter(e => e.category === 'labor').reduce((s, e) => s + e.amount, 0) ?? 0).toLocaleString()}`
    },
  ];

  const total7DayNetGain = dailyProfitTrendData.reduce((s, d) => s + d.netGain, 0);
  const total7DayExpenses = dailyProfitTrendData.reduce((s, d) => s + d.operatingExpenses, 0);
  const total7DayGrossGain = dailyProfitTrendData.reduce((s, d) => s + d.grossGain, 0);
  const avgExpenseRatio = Math.round((total7DayExpenses / total7DayGrossGain) * 100);

  // Stock Distribution Pie Data
  const stockPieData = [
    { name: 'Shed 1 Broiler', urduName: 'شیڈ 1 برائلر', value: 6450, color: '#10b981' },
    { name: 'Shed 2 Broiler', urduName: 'شیڈ 2 برائلر', value: 4200, color: '#3b82f6' },
    { name: 'Dressed Meat', urduName: 'صاف گوشت', value: 380, color: '#f59e0b' },
    { name: 'Desi Chicken', urduName: 'دیسی مرغی', value: 450, color: '#8b5cf6' },
  ];

  // Aging Data
  const agingData = [
    { bracket: '0-7 Days', urduBracket: 'تا 7 دن', amount: Math.round(totalReceivables * 0.45) },
    { bracket: '8-15 Days', urduBracket: '8 تا 15 دن', amount: Math.round(totalReceivables * 0.30) },
    { bracket: '16-30 Days', urduBracket: '16 تا 30 دن', amount: Math.round(totalReceivables * 0.18) },
    { bracket: '30+ Days', urduBracket: '30 دن زائد', amount: Math.round(totalReceivables * 0.07) },
  ];

  // Top Debtors Ranking
  const topDebtors = [...customers]
    .sort((a, b) => b.currentBalance - a.currentBalance)
    .filter((c) => c.currentBalance > 0)
    .slice(0, 5);

  // Filtered Items for Global Search
  const searchResults = globalSearch.trim()
    ? customers.filter(c => 
        c.name.toLowerCase().includes(globalSearch.toLowerCase()) || 
        c.urduName.includes(globalSearch) ||
        c.phone.includes(globalSearch)
      )
    : [];

  const handlePrintReport = () => {
    window.print();
  };

  const handleExportCSV = (filename: string, rows: any[][], headers: string[]) => {
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Global Search Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-600 rounded-xl text-white shadow-md">
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <span>{isUrdu ? 'کمانڈ سینٹر و بزنس ڈیش بورڈ' : 'Executive Dashboard & Reports Center'}</span>
                <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                  Live ERP
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                {isUrdu 
                  ? 'لاہور پولٹری منڈی ریٹس، روزانہ سیلز، ریکوریز، مارکیٹ ادھار اور لائیو فلیٹ کی مکمل نگرانی' 
                  : 'Real-time sales tracking, recovery collections, market debt aging, and fleet status.'}
              </p>
            </div>
          </div>
        </div>

        {/* Global Search & Date Filter */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Search Input */}
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder={isUrdu ? 'گاہک، فون، بل تلاش کریں...' : 'Search customer, phone, bill...'}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Quick Action: New Sale */}
          <button
            onClick={() => onNavigateTab('pos')}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-md transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{isUrdu ? 'نیا بل (POS)' : 'New Invoice'}</span>
          </button>

          {/* Quick Action: Receive Payment */}
          <button
            onClick={() => onOpenReceiptModal()}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-md transition"
          >
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span>{isUrdu ? 'وصولی درج کریں' : 'Receive Money'}</span>
          </button>
        </div>
      </div>

      {/* Instant Search Results Box if user typed something */}
      {searchResults.length > 0 && (
        <div className="bg-amber-50/90 border border-amber-300 rounded-2xl p-4 shadow-sm animate-in fade-in">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-amber-900">
              {isUrdu ? `تلاش کے نتائج (${searchResults.length}):` : `Search Results (${searchResults.length}):`}
            </span>
            <button onClick={() => setGlobalSearch('')} className="text-amber-800 text-xs font-semibold">✕</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {searchResults.map((c) => (
              <div 
                key={c.id} 
                onClick={() => {
                  onNavigateTab('customer_ledger');
                  setGlobalSearch('');
                }}
                className="bg-white p-3 rounded-xl border border-amber-200 cursor-pointer hover:border-emerald-600 transition flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-bold text-slate-900">{c.urduName || c.name}</div>
                  <div className="text-[10px] text-slate-500">{c.phone}</div>
                </div>
                <div className="text-right">
                  <span className={`font-mono font-bold ${c.currentBalance < 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {formatPKR(c.currentBalance, true, language)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 8 EXECUTIVE KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Today's Sales */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">
              {isUrdu ? 'آج کی کل فروخت' : 'Today\'s Sales'}
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            Rs {todaySalesAmount.toLocaleString()}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600 mt-2 pt-2 border-t border-slate-100 font-mono">
            <span>{todaySalesKg.toLocaleString()} kg</span>
            <span className="text-emerald-700 font-bold">= {(todaySalesKg / 40).toFixed(1)} Mann (من)</span>
          </div>
        </div>

        {/* KPI 2: Today's Cash & Bank Collections */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">
              {isUrdu ? 'آج کی کل وصولیاں' : 'Collections Today'}
            </span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-700">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-blue-900 font-mono">
            Rs {todayCollections.toLocaleString()}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600 mt-2 pt-2 border-t border-slate-100">
            <span>{isUrdu ? 'ریکوری شرح:' : 'Recovery Rate:'}</span>
            <span className="text-blue-700 font-bold font-mono">
              {todaySalesAmount > 0 ? Math.round((todayCollections / todaySalesAmount) * 100) : 0}%
            </span>
          </div>
        </div>

        {/* KPI 3: Market Receivables (Udhaar) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">
              {isUrdu ? 'مارکیٹ سے کل ادھار' : 'Total Receivables'}
            </span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-700">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-900 font-mono">
            Rs {totalReceivables.toLocaleString()}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600 mt-2 pt-2 border-t border-slate-100">
            <span>{customers.length} {isUrdu ? 'دوکانیں' : 'shops'}</span>
            <button 
              onClick={() => onNavigateTab('customer_ledger')}
              className="text-amber-800 font-bold hover:underline flex items-center gap-0.5"
            >
              <span>{isUrdu ? 'کھاتہ دیکھیں' : 'View Khata'}</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* KPI 4: Customer Advances (Credit with us) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">
              {isUrdu ? 'گاہکوں کی پیشگی جمع رقم' : 'Customer Advances'}
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-800 font-mono">
            Rs {totalAdvances.toLocaleString()}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600 mt-2 pt-2 border-t border-slate-100">
            <span className="text-emerald-700 font-semibold">{isUrdu ? 'سبز رنگ میں پیشگی' : 'Credit Balance'}</span>
            <span className="text-xs text-slate-500">{isUrdu ? 'محفوظ ہے' : 'Secured'}</span>
          </div>
        </div>

        {/* KPI 5: Total Liquidity (Galla + Bank) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">
              {isUrdu ? 'نقد گلہ و بینک بیلنس' : 'Total Cash & Banks'}
            </span>
            <div className="p-2 rounded-xl bg-purple-50 text-purple-700">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-purple-950 font-mono">
            Rs {totalLiquidity.toLocaleString()}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600 mt-2 pt-2 border-t border-slate-100 font-mono">
            <span>گلہ: Rs {cashInHand.toLocaleString()}</span>
            <span>بینک: Rs {bankBalance.toLocaleString()}</span>
          </div>
        </div>

        {/* KPI 6: Mandi Benchmark vs Sale Rate Spread */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">
              {isUrdu ? 'منڈی مارجن اسپریڈ' : 'Mandi Rate Spread'}
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-900 font-mono flex items-center gap-1.5">
            <span>+{mandiMarginSpread}</span>
            <span className="text-xs text-slate-500 font-sans">Rs/40kg</span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600 mt-2 pt-2 border-t border-slate-100 font-mono">
            <span>منڈی: Rs {todayMandiRate.toLocaleString()}</span>
            <span>سیل: Rs {avgSaleRate.toLocaleString()}</span>
          </div>
        </div>

        {/* KPI 7: Estimated Profit Today */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">
              {isUrdu ? 'آج کا تخمینہ منافع' : 'Est. Profit Today'}
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-700 font-mono">
            Rs {estimatedProfitToday.toLocaleString()}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600 mt-2 pt-2 border-t border-slate-100 font-mono">
            <span>{isUrdu ? 'فی کلو نفع:' : 'Profit/Kg:'}</span>
            <span className="text-emerald-800 font-bold">
              Rs {(todaySalesKg > 0 ? (estimatedProfitToday / todaySalesKg) : 0).toFixed(1)} / kg
            </span>
          </div>
        </div>

        {/* KPI 8: Farm Live Stock */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">
              {isUrdu ? 'فارم زندہ مرغ اسٹاک' : 'Live Birds in Sheds'}
            </span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-700">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {liveBirdsWeight.toLocaleString()} kg
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600 mt-2 pt-2 border-t border-slate-100 font-mono">
            <span>{liveBirdsCount.toLocaleString()} Birds</span>
            <button 
              onClick={() => onNavigateTab('inventory')}
              className="text-emerald-700 font-bold hover:underline"
            >
              {isUrdu ? 'اسٹاک چیک' : 'Details'}
            </button>
          </div>
        </div>
      </div>

      {/* CHARTS SECTION */}
      <div className="space-y-6">
        {/* FEATURED CHART: DAILY PROFIT TREND (NET DAILY GAINS VS OPERATING EXPENSES) */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <span>{isUrdu ? 'روزانہ منافع کا رجحان: خالص نفع بمقابلہ آپریشنل اخراجات' : 'Daily Profit Trend: Net Daily Gains vs Operating Expenses'}</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full uppercase">
                      Recharts Analytics
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isUrdu 
                      ? 'روزانہ مرغ فروخت کا خالص منافع بمقابلہ گاڑی ڈیزل، ڈرائیور و لیبر، اور شیڈ اخراجات' 
                      : 'Visualize net daily poultry trading gains after fleet diesel, driver wages, and farm operating costs.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Metric Pills on Chart Header */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono font-bold">
              <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-1.5">
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                <span>{isUrdu ? '7 روزہ خالص نفع:' : '7-Day Net Gains:'}</span>
                <span className="text-emerald-950 font-black">Rs {total7DayNetGain.toLocaleString()}</span>
              </div>

              <div className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-1.5">
                <ArrowDownRight className="w-3.5 h-3.5 text-rose-600" />
                <span>{isUrdu ? 'آپریشنل اخراجات:' : 'Operating Costs:'}</span>
                <span className="text-rose-950 font-black">Rs {total7DayExpenses.toLocaleString()}</span>
              </div>

              <div className="px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 hidden sm:flex items-center gap-1.5">
                <span>{isUrdu ? 'اخراجات شرح:' : 'Expense Ratio:'}</span>
                <span className="text-blue-950 font-black">{avgExpenseRatio}%</span>
              </div>
            </div>
          </div>

          {/* Recharts ComposedChart Canvas */}
          <div className="h-80 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dailyProfitTrendData} margin={{ top: 15, right: 15, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.85}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.65}/>
                  </linearGradient>
                  <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.85}/>
                    <stop offset="95%" stopColor="#fb7185" stopOpacity={0.65}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#64748b" />
                <YAxis 
                  tick={{ fontSize: 11 }} 
                  stroke="#64748b" 
                  tickFormatter={(val) => `Rs ${Math.round(val / 1000)}k`} 
                />
                <Tooltip 
                  formatter={(val: any, name: any) => [
                    `Rs ${Number(val).toLocaleString()}`,
                    name
                  ]}
                  labelFormatter={(label) => `${isUrdu ? 'دن / تاریخ:' : 'Day:'} ${label}`}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1.5 font-sans">
                          <div className="font-bold border-b border-slate-700 pb-1 text-slate-200">
                            {label}
                          </div>
                          <div className="flex justify-between gap-4 font-mono">
                            <span className="text-emerald-400 font-bold">{isUrdu ? 'خالص روزانہ نفع:' : 'Net Daily Gain:'}</span>
                            <span className="font-bold text-emerald-300">Rs {data.netGain.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between gap-4 font-mono">
                            <span className="text-rose-400">{isUrdu ? 'آپریشنل اخراجات:' : 'Operating Expense:'}</span>
                            <span className="font-bold text-rose-300">Rs {data.operatingExpenses.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between gap-4 font-mono text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                            <span>{isUrdu ? 'خام نفع (Gross Margin):' : 'Gross Trading Gain:'}</span>
                            <span>Rs {data.grossGain.toLocaleString()}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono italic">
                            {data.breakdown}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend 
                  wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} 
                  iconType="circle"
                />
                <Bar 
                  dataKey="netGain" 
                  name={isUrdu ? 'خالص روزانہ منافع (Net Gain)' : 'Net Daily Gains'} 
                  fill="url(#profitGrad)" 
                  radius={[6, 6, 0, 0]} 
                  barSize={24} 
                />
                <Bar 
                  dataKey="operatingExpenses" 
                  name={isUrdu ? 'آپریشنل اخراجات (Operating Expenses)' : 'Operating Expenses'} 
                  fill="url(#expenseGrad)" 
                  radius={[6, 6, 0, 0]} 
                  barSize={24} 
                />
                <Line 
                  type="monotone" 
                  dataKey="netGain" 
                  name={isUrdu ? 'منافع رجحان لائن (Trend)' : 'Net Profit Trendline'} 
                  stroke="#047857" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#047857' }} 
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Operating Expense Breakdown Guide Footer */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
            <span className="font-bold text-slate-800">
              {isUrdu ? 'اخراجات کے اجزاء:' : 'Operating Cost Factors Included:'}
            </span>
            <div className="flex flex-wrap items-center gap-4 text-[11px]">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                {isUrdu ? 'گاڑی ڈیزل و پٹرول خرچ (Trip Fuel)' : 'Vehicle Fuel / Diesel'}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                {isUrdu ? 'ڈرائیور و لیبر ڈیلی اجرت (Labor)' : 'Driver & Delivery Wages'}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                {isUrdu ? 'فارم بجلی و شیڈ کرایہ (Shed Utilities)' : 'Farm Shed Utilities'}
              </span>
            </div>
          </div>
        </div>

        {/* ROW: REVENUE TREND & MANDI BENCHMARK SPREAD */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Chart 1: 7-Day Revenue & Weight Trend (Cols 7) */}
          <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <span>{isUrdu ? 'ہفتہ وار فروخت و وزن رجحان (Sales & Volume Trend)' : '7-Day Sales & Volume Trend'}</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  {isUrdu ? 'گزشتہ 7 دنوں کی روزانہ بلنگ رقم اور فروخت شدہ کلو گرام' : 'Daily sales amount (PKR) and sold bird weight (kg)'}
                </p>
              </div>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg">
                Lahore Mandi
              </span>
            </div>

            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#059669" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#64748b" />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="#64748b" tickFormatter={(val) => `${val / 1000}k`} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="#059669" tickFormatter={(val) => `${val}kg`} />
                  <Tooltip 
                    formatter={(val: any, name: any) => [
                      name === 'salesRs' ? `Rs ${val.toLocaleString()}` : `${val.toLocaleString()} kg`,
                      name === 'salesRs' ? (isUrdu ? 'سیلز رقم' : 'Revenue') : (isUrdu ? 'وزن' : 'Weight')
                    ]}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                  />
                  <Area yAxisId="left" type="monotone" dataKey="salesRs" stroke="#059669" strokeWidth={3} fillOpacity={1} fill="url(#salesGrad)" />
                  <Line yAxisId="right" type="monotone" dataKey="weightKg" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Mandi Benchmark vs Sale Rate (Cols 5) */}
          <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <Scale className="w-4 h-4 text-emerald-600" />
                  <span>{isUrdu ? 'منڈی ریٹ بمقابلہ فروخت ریٹ' : 'Mandi vs Sale Rate Spread'}</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  {isUrdu ? 'روزانہ منڈی ریٹ اور دوکاندار کو دیے گئے ریٹ کا موازنہ' : 'Benchmark Mandi vs Customer Selling Rate / 40kg'}
                </p>
              </div>
            </div>

            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesTrendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="#64748b" />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} stroke="#64748b" />
                  <Tooltip 
                    formatter={(val: any) => [`Rs ${val.toLocaleString()}/40kg`]}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Line type="monotone" dataKey="mandiRate" name={isUrdu ? 'منڈی ریٹ' : 'Mandi Rate'} stroke="#dc2626" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="saleRate" name={isUrdu ? 'ہمارا سیل ریٹ' : 'Our Sale Rate'} stroke="#059669" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* ROW 3: LIVE FLEET RADAR & TOP DEBTORS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Live Delivery Fleet Radar (Cols 5) */}
        <div className="lg:col-span-5 bg-slate-900 text-white p-5 rounded-2xl shadow-xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-emerald-400" />
                <span>{isUrdu ? 'فلیٹ و ترسیل لائیو کنٹرول' : 'Live Delivery Fleet Radar'}</span>
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('fleet')}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1"
            >
              <span>{isUrdu ? 'نقشہ کھولیں' : 'Live Map'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {trips.map((trip) => (
              <div key={trip.id} className="p-3.5 rounded-xl bg-slate-800/90 border border-slate-700/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-mono font-bold text-emerald-400 text-xs">{trip.plateNumber}</span>
                    <span className="text-xs text-slate-300 block">{trip.driverName}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 uppercase">
                    {trip.status}
                  </span>
                </div>

                {/* Progress bar of kg delivered */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                    <span>{trip.deliveredKg} kg delivered</span>
                    <span>{trip.totalLoadKg} kg total</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-emerald-500 h-2 rounded-full transition-all duration-500" 
                      style={{ width: `${Math.round((trip.deliveredKg / (trip.totalLoadKg || 1)) * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-700">
                  <span>{trip.stops.filter(s => s.isDelivered).length} / {trip.stops.length} Stops Done</span>
                  <span className="text-emerald-300 font-mono">Fuel: Rs {trip.fuelExpense.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Pending Orders Counter */}
          <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 flex items-center justify-between text-xs text-emerald-200">
            <span>{isUrdu ? 'آج کے کل بک شدہ آرڈرز:' : 'Orders to be delivered today:'}</span>
            <span className="font-bold text-emerald-300 font-mono text-sm">
              {orders.filter(o => o.status !== 'delivered').length} Orders Pending
            </span>
          </div>
        </div>

        {/* Top Debtors & WhatsApp Reminders Table (Cols 7) */}
        <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                <span>{isUrdu ? 'سب سے بڑے کھاتے دار (Top Debtors)' : 'Top Debtors & Balances'}</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                {isUrdu ? 'مارکیٹ کے سب سے زیادہ ادھار والے گاہک اور 1-کلک واٹس ایپ یاد دہانی' : 'Direct 1-click WhatsApp khata balance reminders.'}
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('customer_ledger')}
              className="text-xs text-emerald-700 hover:text-emerald-800 font-bold"
            >
              {isUrdu ? 'سب دیکھیں' : 'View All'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-700 border-collapse">
              <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[11px]">
                <tr>
                  <th className="p-2.5 border-b">{isUrdu ? 'گاہک' : 'Customer'}</th>
                  <th className="p-2.5 border-b">{isUrdu ? 'فون' : 'Phone'}</th>
                  <th className="p-2.5 border-b text-right">{isUrdu ? 'بقایا رقم' : 'Balance'}</th>
                  <th className="p-2.5 border-b text-center">{isUrdu ? 'واٹس ایپ' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topDebtors.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition">
                    <td className="p-2.5 font-semibold text-slate-900">
                      <div>{c.urduName || c.name}</div>
                      <div className="text-[10px] text-slate-400">{c.city} - {c.address}</div>
                    </td>
                    <td className="p-2.5 font-mono text-slate-600">{c.phone}</td>
                    <td className="p-2.5 text-right font-mono font-bold text-rose-700 text-sm">
                      Rs {c.currentBalance.toLocaleString()}
                    </td>
                    <td className="p-2.5 text-center">
                      <button
                        onClick={() => {
                          const url = generateLedgerWhatsAppUrl({
                            phone: c.whatsapp,
                            partyName: c.urduName || c.name,
                            asOfDate: new Date().toISOString().split('T')[0],
                            currentBalance: c.currentBalance,
                            totalDebit: c.currentBalance + 50000,
                            totalCredit: 50000,
                            businessName: `${biz.nameUr} (${biz.nameEn})`,
                          });
                          window.open(url, '_blank');
                        }}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold shadow-sm transition inline-flex items-center gap-1"
                        title="Send balance reminder on WhatsApp"
                      >
                        <Share2 className="w-3 h-3" />
                        <span>{isUrdu ? 'یاد دہانی' : 'Remind'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* DEDICATED REPORTS CENTER */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between border-b pb-4 gap-3">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              <span>{isUrdu ? 'رپورٹس و گوشوارے (Reports Center)' : 'Detailed Reports & Analytics Center'}</span>
            </h3>
            <p className="text-xs text-slate-500">
              {isUrdu ? 'سیلز سمری، کسٹمر بیلنسز، منڈی مارجن منافع، اور اسٹاک رپورٹ' : 'Generate printable statements, thermal summaries, and Excel/CSV exports.'}
            </p>
          </div>

          {/* Report Sub-Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            {[
              { id: 'sales', labelEn: 'Sales Summary', labelUr: 'سیلز سمری' },
              { id: 'customers', labelEn: 'Customer Balances', labelUr: 'کسٹمر بقایا جات' },
              { id: 'margin', labelEn: 'Mandi Margin & Profit', labelUr: 'منڈی مارجن و نفع' },
              { id: 'stock', labelEn: 'Live Stock & Sheds', labelUr: 'مرغ اسٹاک رپورٹ' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveReportTab(t.id as any)}
                className={`px-3 py-1.5 rounded-lg font-bold transition ${
                  activeReportTab === t.id ? 'bg-emerald-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>{isUrdu ? t.labelUr : t.labelEn}</span>
              </button>
            ))}
          </div>

          {/* Export & Print Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintReport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isUrdu ? 'پرنٹ رپورٹ' : 'Print'}</span>
            </button>
            <button
              onClick={() => {
                if (activeReportTab === 'sales') {
                  handleExportCSV(
                    'Daily_Sales_Report',
                    invoices.map(i => [i.invoiceNumber, i.invoiceDate, `"${i.customerName}"`, i.netWeightKg, i.saleRatePer40kg, i.totalAmount, i.receivedCash + i.receivedAC, i.newBalance]),
                    ['Invoice #', 'Date', 'Customer', 'Net Kg', 'Rate/40kg', 'Total PKR', 'Paid PKR', 'Balance PKR']
                  );
                } else {
                  handleExportCSV(
                    'Customer_Balances_Report',
                    customers.map(c => [`"${c.name}"`, c.phone, c.currentBalance, c.creditLimit, c.city]),
                    ['Customer', 'Phone', 'Balance PKR', 'Credit Limit', 'City']
                  );
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isUrdu ? 'ایکسل / CSV' : 'Export Excel'}</span>
            </button>
          </div>
        </div>

        {/* REPORT TAB 1: DAILY SALES SUMMARY */}
        {activeReportTab === 'sales' && (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-700 border-collapse">
                <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[11px]">
                  <tr>
                    <th className="p-3 border-b">{isUrdu ? 'بل نمبر' : 'Inv #'}</th>
                    <th className="p-3 border-b">{isUrdu ? 'تاریخ' : 'Date'}</th>
                    <th className="p-3 border-b">{isUrdu ? 'گاہک' : 'Customer'}</th>
                    <th className="p-3 border-b text-right">{isUrdu ? 'وزن (کلو)' : 'Net Weight'}</th>
                    <th className="p-3 border-b text-right">{isUrdu ? 'ریٹ / 40kg' : 'Rate / 40kg'}</th>
                    <th className="p-3 border-b text-right">{isUrdu ? 'کل رقم' : 'Total Amount'}</th>
                    <th className="p-3 border-b text-right">{isUrdu ? 'وصولی' : 'Received'}</th>
                    <th className="p-3 border-b text-right">{isUrdu ? 'نیا بقایا' : 'Balance'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-slate-900">{inv.invoiceNumber}</td>
                      <td className="p-3 text-slate-600">{inv.invoiceDate}</td>
                      <td className="p-3 font-semibold text-slate-800">{inv.customerUrduName || inv.customerName}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">{inv.netWeightKg} kg</td>
                      <td className="p-3 text-right font-mono">Rs {inv.saleRatePer40kg.toLocaleString()}</td>
                      <td className="p-3 text-right font-mono font-extrabold text-emerald-800">Rs {inv.totalAmount.toLocaleString()}</td>
                      <td className="p-3 text-right font-mono text-slate-700">Rs {(inv.receivedCash + inv.receivedAC).toLocaleString()}</td>
                      <td className="p-3 text-right font-mono font-bold">
                        <span className={inv.newBalance < 0 ? 'text-emerald-700' : 'text-slate-900'}>
                          {formatPKR(inv.newBalance, true, language)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* REPORT TAB 2: CUSTOMER BALANCES & AGING */}
        {activeReportTab === 'customers' && (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-700 border-collapse">
                <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[11px]">
                  <tr>
                    <th className="p-3 border-b">{isUrdu ? 'دوکان / گاہک' : 'Customer Shop'}</th>
                    <th className="p-3 border-b">{isUrdu ? 'موبائل نمبر' : 'Phone'}</th>
                    <th className="p-3 border-b">{isUrdu ? 'شہر و پتہ' : 'City & Address'}</th>
                    <th className="p-3 border-b text-right">{isUrdu ? 'کریڈٹ لمٹ' : 'Credit Limit'}</th>
                    <th className="p-3 border-b text-right">{isUrdu ? 'موجودہ بقایا رقم' : 'Current Balance'}</th>
                    <th className="p-3 border-b text-center">{isUrdu ? 'اسٹیٹس' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customers.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="p-3 font-semibold text-slate-900">
                        {c.urduName ? `${c.urduName} (${c.name})` : c.name}
                      </td>
                      <td className="p-3 font-mono text-slate-600">{c.phone}</td>
                      <td className="p-3 text-slate-600">{c.city} - {c.address}</td>
                      <td className="p-3 text-right font-mono text-slate-500">Rs {c.creditLimit.toLocaleString()}</td>
                      <td className="p-3 text-right font-mono font-black text-sm">
                        <span className={c.currentBalance < 0 ? 'text-emerald-700' : 'text-rose-700'}>
                          {formatPKR(c.currentBalance, true, language)}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          c.currentBalance < 0 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {c.currentBalance < 0 ? 'پیشگی (Advance)' : 'ادھار واجب الادا'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* REPORT TAB 3: MANDI MARGIN & PROFIT PER KG */}
        {activeReportTab === 'margin' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
              <span className="text-[11px] font-bold text-slate-500 block uppercase">
                {isUrdu ? 'آج کا منڈی ریٹ' : 'Today\'s Mandi Rate'}
              </span>
              <p className="text-xl font-black text-slate-900 font-mono mt-1">
                Rs {todayMandiRate.toLocaleString()} <span className="text-xs text-slate-500">/40kg</span>
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
              <span className="text-[11px] font-bold text-slate-500 block uppercase">
                {isUrdu ? 'اوسط سیل ریٹ' : 'Avg Selling Rate'}
              </span>
              <p className="text-xl font-black text-emerald-700 font-mono mt-1">
                Rs {avgSaleRate.toLocaleString()} <span className="text-xs text-slate-500">/40kg</span>
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
              <span className="text-[11px] font-bold text-slate-500 block uppercase">
                {isUrdu ? 'خالص اوسط نفع فی کلو' : 'Net Margin per Kg'}
              </span>
              <p className="text-xl font-black text-emerald-800 font-mono mt-1">
                Rs {(mandiMarginSpread / 40).toFixed(2)} / kg
              </p>
            </div>
          </div>
        )}

        {/* REPORT TAB 4: LIVE STOCK & SHEDS */}
        {activeReportTab === 'stock' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {inventory.map((item) => (
              <div key={item.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">{item.code}</span>
                <h4 className="font-bold text-slate-900 text-xs">{item.urduName || item.name}</h4>
                <div className="text-base font-black text-emerald-800 font-mono pt-1">
                  {item.currentWeightKg.toLocaleString()} kg
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  {item.currentCount} {item.unit} | {(item.currentWeightKg / 40).toFixed(1)} Mann
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
