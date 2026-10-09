import React, { useState } from 'react';
import { AccountItem, DayClosing, UserRole } from '../../types';
import { formatPKR } from '../../utils/calculations';
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
  Download
} from 'lucide-react';

interface AccountingViewProps {
  accounts: AccountItem[];
  dayClosing: DayClosing;
  currentRole: UserRole;
  language: 'en' | 'ur';
  onUpdateDayClosing: (closing: DayClosing) => void;
}

export const AccountingView: React.FC<AccountingViewProps> = ({
  accounts,
  dayClosing,
  currentRole,
  language,
  onUpdateDayClosing
}) => {
  const isUrdu = language === 'ur';
  const [activeTab, setActiveTab] = useState<'roznamcha' | 'chart' | 'pnl' | 'balance_sheet'>('roznamcha');
  const [physicalCash, setPhysicalCash] = useState<number>(dayClosing.physicalCash);
  const [closingNotice, setClosingNotice] = useState<string | null>(null);

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

  // P&L Metrics
  const totalRevenue = accounts.filter(a => a.category === 'revenue').reduce((s, a) => s + a.balance, 0);
  const totalCOGS = accounts.filter(a => a.code === '5010').reduce((s, a) => s + a.balance, 0);
  const totalExpenses = accounts.filter(a => a.category === 'expense').reduce((s, a) => s + a.balance, 0);
  const grossProfit = totalRevenue - totalCOGS;
  const netProfit = totalRevenue - totalExpenses;
  const totalSalesKg = dayClosing.totalSalesKg || 2840;
  const profitPerKg = totalSalesKg > 0 ? (netProfit / totalSalesKg) : 0;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-emerald-600" />
            <span>{isUrdu ? 'اکاؤنٹنگ، روزنامچہ و مالیاتی گوشوارے' : 'Double-Entry Accounting & Roznamcha'}</span>
          </h2>
          <p className="text-xs text-slate-500">
            {isUrdu 
              ? 'روزانہ کیش گلہ کاؤنٹ، کھاتہ جات، نفع و نقصان بلحاظ فی کلو، اور بیلنس شیٹ' 
              : 'Pakistan-standard chart of accounts, Roznamcha daily cash lock, P&L with profit per kg.'}
          </p>
        </div>

        {/* Accounting Sub Tabs & Print Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            {[
              { id: 'roznamcha', labelEn: 'Roznamcha (Daily Closing)', labelUr: 'روزنامچہ (ڈیلی کلوزنگ)' },
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
            onClick={() => window.print()}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-xs font-bold text-slate-800 transition"
            title="Print Statement"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isUrdu ? 'پرنٹ' : 'Print'}</span>
          </button>
        </div>
      </div>

      {closingNotice && (
        <div className="p-3 bg-emerald-600 text-white rounded-xl text-xs font-medium flex items-center gap-2 animate-in fade-in">
          <CheckCircle className="w-4 h-4" />
          <span>{closingNotice}</span>
        </div>
      )}

      {/* TAB 1: ROZNAMCHA / DAILY CASH CLOSING */}
      {activeTab === 'roznamcha' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {isUrdu ? 'روزنامچہ گلہ و کیش کاؤنٹ (Roznamcha)' : 'Daily Cash Closing & Verification'}
                </h3>
                <span className="text-xs text-slate-500">{dayClosing.date}</span>
              </div>
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                dayClosing.isLocked ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {dayClosing.isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                <span>{dayClosing.isLocked ? (isUrdu ? 'دن لاک ہے' : 'Locked') : (isUrdu ? 'کھلا ہے' : 'Open')}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {isUrdu ? 'سسٹم کا نقد بیلنس (System Cash Balance):' : 'System Computed Cash Balance:'}
                </label>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 font-mono text-lg font-bold text-slate-800">
                  Rs {dayClosing.systemCash.toLocaleString()}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {isUrdu ? 'گلہ میں موجود اصل نقد کیش (Physical Cash Count):' : 'Physical Cash Count in Safe / Galla:'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 font-bold">Rs</span>
                  <input
                    type="number"
                    value={physicalCash}
                    onChange={(e) => setPhysicalCash(parseFloat(e.target.value) || 0)}
                    disabled={dayClosing.isLocked && !isOwner}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 font-mono text-lg font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Cash Variance Box */}
              <div className={`p-4 rounded-xl border flex items-center justify-between font-mono ${
                variance === 0 
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950' 
                  : variance > 0 
                  ? 'bg-blue-50 border-blue-300 text-blue-950'
                  : 'bg-rose-50 border-rose-300 text-rose-950'
              }`}>
                <div>
                  <span className="text-xs font-bold block">
                    {isUrdu ? 'کیش فرق (Cash Variance):' : 'Cash Variance:'}
                  </span>
                  <span className="text-[10px]">
                    {variance === 0 ? 'بیلنس برابر ہے' : variance > 0 ? 'کیش زیادہ ہے (Surplus)' : 'کیش کم ہے (Shortage)'}
                  </span>
                </div>
                <div className="text-xl font-black">
                  {variance >= 0 ? `+Rs ${variance.toLocaleString()}` : `-Rs ${Math.abs(variance).toLocaleString()}`}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => handleSaveRoznamcha(false)}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs"
                >
                  {isUrdu ? 'کیش کاؤنٹ اپ ڈیٹ کریں' : 'Update Cash Count'}
                </button>

                <button
                  onClick={() => handleSaveRoznamcha(!dayClosing.isLocked)}
                  className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                    dayClosing.isLocked 
                      ? 'bg-amber-600 hover:bg-amber-700 text-white' 
                      : 'bg-rose-600 hover:bg-rose-700 text-white'
                  }`}
                >
                  {dayClosing.isLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  <span>{dayClosing.isLocked ? (isUrdu ? 'لاک کھولیں' : 'Unlock Day') : (isUrdu ? 'دن بند و لاک کریں' : 'Lock Day Closing')}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 space-y-4">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase">
                {isUrdu ? 'آج کے کاروباری اعداد و شمار' : 'Day Summary Metrics'}
              </h4>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">{isUrdu ? 'فروخت شدہ وزن' : 'Total Sold Kg'}</span>
                  <span className="font-mono text-base font-bold text-slate-800">{dayClosing.totalSalesKg} kg</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">{isUrdu ? 'کل فروخت بلنگ' : 'Sales Billing'}</span>
                  <span className="font-mono text-base font-bold text-emerald-800">Rs {dayClosing.totalSalesAmount.toLocaleString()}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">{isUrdu ? 'کل وصولیاں' : 'Total Collections'}</span>
                  <span className="font-mono text-base font-bold text-slate-800">Rs {dayClosing.totalCollections.toLocaleString()}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">{isUrdu ? 'فی کلو اوسط نفع' : 'Avg Profit/Kg'}</span>
                  <span className="font-mono text-base font-bold text-emerald-700">Rs {profitPerKg.toFixed(1)}/kg</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CHART OF ACCOUNTS */}
      {activeTab === 'chart' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900">
            {isUrdu ? 'پاکستان چارٹ آف اکاؤنٹس (Chart of Accounts)' : 'Chart of Accounts'}
          </h3>
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
                    <td className="p-3 text-right font-mono font-bold text-slate-900">
                      Rs {acc.balance.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: PROFIT & LOSS STATEMENT */}
      {activeTab === 'pnl' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 max-w-3xl mx-auto">
          <div className="border-b pb-3 text-center">
            <h3 className="text-lg font-black text-slate-900">
              {isUrdu ? 'گوشوارہ نفع و نقصان (Profit & Loss Statement)' : 'Profit & Loss Statement'}
            </h3>
            <span className="text-xs text-slate-500 font-mono">July 2024 - June 2025</span>
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
              <span className="font-mono">- Rs 65,000</span>
            </div>

            <div className="flex justify-between py-2 text-slate-600">
              <span>{isUrdu ? 'اسٹاف تنخواہیں و متفرق (Salaries & Expense):' : 'Salaries & Admin Expense:'}</span>
              <span className="font-mono">- Rs 95,000</span>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Assets */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <h4 className="text-sm font-bold text-slate-900 border-b pb-2 text-emerald-800">
              {isUrdu ? 'اثاثہ جات (Assets)' : 'Assets'}
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span>Cash in Hand (نقد گلہ)</span>
                <span className="font-mono font-bold">Rs 840,000</span>
              </div>
              <div className="flex justify-between">
                <span>Bank Accounts (بینک بیلنس)</span>
                <span className="font-mono font-bold">Rs 1,450,000</span>
              </div>
              <div className="flex justify-between">
                <span>Wallets (جاز کیش / ایزی پیسہ)</span>
                <span className="font-mono font-bold">Rs 205,000</span>
              </div>
              <div className="flex justify-between">
                <span>Customer Udhaar (ادھار بقایا)</span>
                <span className="font-mono font-bold">Rs 650,000</span>
              </div>
              <div className="flex justify-between">
                <span>Farm Bird Stock (مرغ اسٹاک)</span>
                <span className="font-mono font-bold">Rs 920,000</span>
              </div>
              <div className="flex justify-between pt-2 border-t font-bold text-emerald-900 text-sm">
                <span>Total Assets:</span>
                <span className="font-mono">Rs 4,065,000</span>
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
                <span className="font-mono font-bold">Rs 490,000</span>
              </div>
              <div className="flex justify-between">
                <span>Advances from Customers (پیشگی وصولیاں)</span>
                <span className="font-mono font-bold">Rs 11,600</span>
              </div>
              <div className="flex justify-between">
                <span>Owner Capital (مالک کا سرمایہ)</span>
                <span className="font-mono font-bold">Rs 2,500,000</span>
              </div>
              <div className="flex justify-between">
                <span>Retained Earnings (محفوظ منافع)</span>
                <span className="font-mono font-bold">Rs 1,063,400</span>
              </div>
              <div className="flex justify-between pt-2 border-t font-bold text-slate-900 text-sm">
                <span>Total Liabilities & Equity:</span>
                <span className="font-mono">Rs 4,065,000</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
