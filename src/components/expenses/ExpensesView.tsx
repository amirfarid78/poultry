import React, { useState } from 'react';
import { ExpenseItem, ExpenseCategory, Vehicle, PaymentMode, UserRole } from '../../types';
import { formatPKR } from '../../utils/calculations';
import { 
  Receipt, 
  Plus, 
  Fuel, 
  Truck, 
  Users, 
  Zap, 
  Coffee, 
  Wrench, 
  Filter, 
  Download, 
  Printer, 
  Calendar,
  CheckCircle2,
  DollarSign,
  Trash2
} from 'lucide-react';

interface ExpensesViewProps {
  expenses: ExpenseItem[];
  vehicles: Vehicle[];
  currentRole: UserRole;
  language: 'en' | 'ur';
  onAddExpense: (expense: ExpenseItem) => void;
  onDeleteExpense?: (id: string) => void;
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  expenses,
  vehicles,
  currentRole,
  language,
  onAddExpense,
  onDeleteExpense
}) => {
  const isUrdu = language === 'ur';
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');

  // Form states
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('fuel');
  const [amount, setAmount] = useState<number>(3500);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [vehicleId, setVehicleId] = useState<string>(vehicles[0]?.id || '');
  const [description, setDescription] = useState<string>('Diesel for morning supply trip');
  const [descriptionUrdu, setDescriptionUrdu] = useState<string>('مارننگ سپلائی ٹرپ ڈیزل خرچ');
  const [paidTo, setPaidTo] = useState<string>('PSO Pump');

  const categories: { id: ExpenseCategory; nameEn: string; nameUr: string; icon: any }[] = [
    { id: 'fuel', nameEn: 'Vehicle Diesel / Fuel', nameUr: 'گاڑی پیٹرول و ڈیزل خرچ', icon: Fuel },
    { id: 'labor', nameEn: 'Driver & Labor Wages', nameUr: 'ڈرائیور و لیبر مزدوری', icon: Users },
    { id: 'food_chai', nameEn: 'Staff Chai & Food', nameUr: 'اسٹاف چائے و کھانا', icon: Coffee },
    { id: 'repairs', nameEn: 'Vehicle & Cage Repairs', nameUr: 'گاڑی و پنجرے مرمت', icon: Wrench },
    { id: 'electricity', nameEn: 'Shed Electricity & Rent', nameUr: 'شیڈ بجلی بل و کرایہ', icon: Zap },
    { id: 'feed_misc', nameEn: 'Feed & Medicine Misc', nameUr: 'فیڈ و ادویات متفرق', icon: Receipt },
    { id: 'other', nameEn: 'General Expenses', nameUr: 'دیگر متفرق اخراجات', icon: DollarSign },
  ];

  const filteredExpenses = expenses
    .filter((e) => selectedCategory === 'all' || e.category === selectedCategory)
    .filter((e) => !dateFilter || e.date === dateFilter)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalExpenseAmount = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const fuelExpensesTotal = expenses.filter(e => e.category === 'fuel').reduce((s, e) => s + e.amount, 0);
  const laborExpensesTotal = expenses.filter(e => e.category === 'labor').reduce((s, e) => s + e.amount, 0);

  const handleCreateExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) return;

    const catObj = categories.find(c => c.id === expCategory);
    const newExpense: ExpenseItem = {
      id: `exp-${Date.now()}`,
      expenseNumber: `EXP-${100 + expenses.length + 1}`,
      date: new Date().toISOString().split('T')[0],
      category: expCategory,
      categoryName: catObj?.nameEn || 'General',
      categoryUrduName: catObj?.nameUr || 'متفرق خرچ',
      amount,
      paymentMode,
      vehicleId: expCategory === 'fuel' ? vehicleId : undefined,
      description,
      descriptionUrdu,
      paidTo,
      createdBy: currentRole === 'owner' ? 'Owner / مالک' : 'Cashier / منشی',
      createdAt: new Date().toISOString()
    };

    onAddExpense(newExpense);
    setShowAddModal(false);
  };

  const handleExportCSV = () => {
    const headers = ['Expense #', 'Date', 'Category', 'Description', 'Paid To', 'Mode', 'Amount (PKR)'];
    const rows = filteredExpenses.map((e) => [
      e.expenseNumber,
      e.date,
      `"${e.categoryName}"`,
      `"${e.description.replace(/"/g, '""')}"`,
      `"${e.paidTo || '-'}"`,
      e.paymentMode,
      e.amount
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Expenses_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-rose-600 rounded-xl text-white shadow-md">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <span>{isUrdu ? 'روزانہ اخراجات، گاڑی ڈیزل و کاسٹ کنٹرول' : 'Daily Expenses & Fleet Cost Center'}</span>
                <span className="text-xs font-bold text-rose-800 bg-rose-100 px-2.5 py-0.5 rounded-full">
                  Auto Journal
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                {isUrdu 
                  ? 'گاڑی ڈیزل، ڈرائیور و لیبر اجرت، فارم شیڈ بجلی و متفرق اخراجات (گلہ سے کٹوتی خودکار)' 
                  : 'Track fuel, labor wages, chai/food, utilities and repairs. Auto-posted to accounts and cash book.'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
          >
            <Printer className="w-4 h-4" />
            <span>{isUrdu ? 'پرنٹ واؤچرز' : 'Print Expenses'}</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 border border-slate-300 text-xs font-bold text-slate-800 hover:bg-slate-200 transition"
          >
            <Download className="w-4 h-4" />
            <span>{isUrdu ? 'ایکسل CSV' : 'Export CSV'}</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            <span>{isUrdu ? 'نیا خرچ درج کریں' : 'Record Expense'}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards for Expenses */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">
            {isUrdu ? 'کل فلٹر شدہ اخراجات' : 'Total Filtered Expenses'}
          </span>
          <p className="text-2xl font-black text-rose-700 font-mono mt-1">
            Rs {totalExpenseAmount.toLocaleString()}
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">
            {isUrdu ? 'گاڑیوں کا ڈیزل و فیول خرچ' : 'Vehicle Fuel / Diesel'}
          </span>
          <p className="text-2xl font-black text-amber-700 font-mono mt-1">
            Rs {fuelExpensesTotal.toLocaleString()}
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">
            {isUrdu ? 'لیبر و ڈیلی ہینڈلنگ اجرت' : 'Labor & Porter Wages'}
          </span>
          <p className="text-2xl font-black text-purple-700 font-mono mt-1">
            Rs {laborExpensesTotal.toLocaleString()}
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">
            {isUrdu ? 'کل درج شدہ واؤچرز' : 'Total Expense Vouchers'}
          </span>
          <p className="text-2xl font-black text-slate-900 font-mono mt-1">
            {filteredExpenses.length} Vouchers
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-slate-700 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>{isUrdu ? 'کیٹیگری فلٹر:' : 'Category Filter:'}</span>
          </span>
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-xl font-bold transition ${
              selectedCategory === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {isUrdu ? 'تمام' : 'All'}
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              className={`px-3 py-1.5 rounded-xl font-bold transition ${
                selectedCategory === c.id ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {isUrdu ? c.nameUr : c.nameEn}
            </button>
          ))}
        </div>

        <div>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs text-slate-800"
          />
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left text-slate-700 border-collapse">
            <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[11px]">
              <tr>
                <th className="p-3 border-b">{isUrdu ? 'واؤچر #' : 'Voucher #'}</th>
                <th className="p-3 border-b">{isUrdu ? 'تاریخ' : 'Date'}</th>
                <th className="p-3 border-b">{isUrdu ? 'کیٹیگری' : 'Category'}</th>
                <th className="p-3 border-b">{isUrdu ? 'تفصیل' : 'Description'}</th>
                <th className="p-3 border-b">{isUrdu ? 'کس کو ادا کی' : 'Paid To'}</th>
                <th className="p-3 border-b text-center">{isUrdu ? 'ذریعہ' : 'Mode'}</th>
                <th className="p-3 border-b text-right text-rose-700">{isUrdu ? 'رقم (روپے)' : 'Amount (PKR)'}</th>
                <th className="p-3 border-b text-center">{isUrdu ? 'حذف' : 'Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-slate-50 transition">
                  <td className="p-3 font-mono font-bold text-slate-900">{exp.expenseNumber}</td>
                  <td className="p-3 text-slate-600">{exp.date}</td>
                  <td className="p-3 font-semibold text-slate-800">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-800">
                      {isUrdu ? exp.categoryUrduName : exp.categoryName}
                    </span>
                  </td>
                  <td className="p-3 font-medium text-slate-900">
                    <div>{isUrdu && exp.descriptionUrdu ? exp.descriptionUrdu : exp.description}</div>
                    {exp.vehicleId && (
                      <div className="text-[10px] text-slate-500 font-mono">Vehicle ID: {exp.vehicleId}</div>
                    )}
                  </td>
                  <td className="p-3 font-medium text-slate-700">{exp.paidTo || '-'}</td>
                  <td className="p-3 text-center capitalize">
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {exp.paymentMode}
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono font-black text-rose-700 text-sm">
                    Rs {exp.amount.toLocaleString()}
                  </td>
                  <td className="p-3 text-center">
                    {onDeleteExpense && ['owner', 'manager', 'accountant'].includes(currentRole) && (
                      <button
                        onClick={() => {
                          if (confirm(isUrdu ? 'کیا آپ یہ خرچ واؤچر حذف کرنا چاہتے ہیں؟' : 'Delete this expense voucher?')) {
                            onDeleteExpense(exp.id);
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 transition"
                        title={isUrdu ? 'حذف کریں' : 'Delete'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Expense Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 text-slate-800 shadow-2xl animate-in fade-in zoom-in-95">
            <h3 className="text-base font-extrabold text-slate-900 mb-1 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-rose-600" />
              <span>{isUrdu ? 'روزانہ خرچ واؤچر درج کریں' : 'Record Business Expense'}</span>
            </h3>
            <p className="text-[11px] text-slate-500 mb-4">
              {isUrdu ? 'یہ رقم نقد گلہ یا بینک اکاؤنٹ سے خودکار طور پر کم ہو جائے گی' : 'Amount will auto-deduct from cash safe or bank.'}
            </p>

            <form onSubmit={handleCreateExpense} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isUrdu ? 'خرچ کی قسم (Category):' : 'Expense Category:'}
                </label>
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value as ExpenseCategory)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-800 bg-white"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {isUrdu ? c.nameUr : c.nameEn}
                    </option>
                  ))}
                </select>
              </div>

              {/* If fuel, pick vehicle */}
              {expCategory === 'fuel' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Truck className="w-3.5 h-3.5 text-slate-400" />
                    <span>{isUrdu ? 'گاڑی منتخب کریں:' : 'Select Delivery Vehicle:'}</span>
                  </label>
                  <select
                    value={vehicleId}
                    onChange={(e) => setVehicleId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-800 bg-white"
                  >
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plateNumber} ({v.model}) - {v.driverName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isUrdu ? 'رقم (روپے):' : 'Amount (PKR):'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 font-bold">Rs</span>
                    <input
                      type="number"
                      value={amount || ''}
                      onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 font-mono text-base font-black text-rose-700"
                      placeholder="3500"
                      required
                    />
                  </div>
                  {/* Quick Preset Buttons */}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {[500, 1000, 2000, 3500, 5000, 10000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setAmount(preset)}
                        className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold transition ${
                          amount === preset
                            ? 'bg-rose-600 text-white'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {preset >= 1000 ? `${preset / 1000}k` : preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isUrdu ? 'ادائیگی کا ذریعہ:' : 'Payment Mode:'}
                  </label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-800 bg-white"
                  >
                    <option value="cash">Cash (نقد کیش گلہ)</option>
                    <option value="bank_transfer">Bank (میزان بینک)</option>
                    <option value="jazzcash">JazzCash / Easy</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isUrdu ? 'کس کو ادا کی (Paid To):' : 'Paid To (Vendor / Person):'}
                </label>
                <input
                  type="text"
                  value={paidTo}
                  onChange={(e) => setPaidTo(e.target.value)}
                  placeholder="e.g. PSO Shadman, Babu Lal Labor"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-800 font-medium"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isUrdu ? 'تفصیل / نوٹ:' : 'Expense Narration:'}
                </label>
                <input
                  type="text"
                  value={isUrdu ? descriptionUrdu : description}
                  onChange={(e) => isUrdu ? setDescriptionUrdu(e.target.value) : setDescription(e.target.value)}
                  placeholder="e.g. Morning route diesel, 30 liters"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  {isUrdu ? 'منسوخ' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-lg transition"
                >
                  {isUrdu ? 'خرچ محفوظ کریں' : 'Save Expense Voucher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
