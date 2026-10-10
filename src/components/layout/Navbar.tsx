import React, { useState } from 'react';
import { UserRole } from '../../types';
import { VIEW_PERMISSIONS } from '../../lib/permissions';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import SyncBadge from '../common/SyncBadge';
import { 
  LayoutDashboard,
  ShoppingCart, 
  BookOpen, 
  Receipt, 
  Truck, 
  ClipboardList, 
  Layers, 
  DollarSign, 
  Users, 
  Settings, 
  CheckCircle2, 
  Wifi, 
  WifiOff, 
  UserCheck,
  LogOut,
  TrendingUp,
  Building2,
  Edit3,
  Fuel,
  FileSpreadsheet
} from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentRole: UserRole;
  onSignOut: () => void;
  userName?: string | null;
  language: 'en' | 'ur';
  setLanguage: (lang: 'en' | 'ur') => void;
  todayMandiRate: number;
  setTodayMandiRate: (rate: number) => void;
  isOffline: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  currentRole,
  onSignOut,
  userName,
  language,
  setLanguage,
  todayMandiRate,
  setTodayMandiRate,
  isOffline
}) => {
  const [showMandiModal, setShowMandiModal] = useState(false);
  const [tempRate, setTempRate] = useState(todayMandiRate.toString());
  const isUrdu = language === 'ur';

  const roleLabels: Record<UserRole, { labelEn: string; labelUr: string }> = {
    owner: { labelEn: 'Owner / Admin (مالک)', labelUr: 'مالک / ایڈمن' },
    manager: { labelEn: 'Manager (منیجر)', labelUr: 'منیجر' },
    accountant: { labelEn: 'Accountant (اکاؤنٹنٹ)', labelUr: 'اکاؤنٹنٹ' },
    cashier: { labelEn: 'Cashier / POS (کیشئر / منشی)', labelUr: 'منشی / کیشئر' },
    order_booker: { labelEn: 'Order Booker (آرڈر بکر)', labelUr: 'آرڈر بکر' },
    driver: { labelEn: 'Driver (ڈرائیور)', labelUr: 'ڈرائیور' },
    stock_keeper: { labelEn: 'Stock Keeper (اسٹاک انچارج)', labelUr: 'اسٹاک انچارج' },
    auditor: { labelEn: 'Auditor (آڈیٹر)', labelUr: 'آڈیٹر' }
  };

  const navItems = [
    { id: 'dashboard', labelEn: 'Dashboard & Reports', labelUr: 'ڈیش بورڈ و رپورٹس', icon: LayoutDashboard },
    { id: 'pos', labelEn: 'POS / Sale Entry', labelUr: 'سیل انوائس (POS)', icon: ShoppingCart },
    { id: 'expenses', labelEn: 'Expenses & Kharch', labelUr: 'روزمرہ اخراجات', icon: Fuel },
    { id: 'customer_ledger', labelEn: 'Customer Khata', labelUr: 'کسٹمر کھاتہ رجسٹر', icon: BookOpen },
    { id: 'daily_sheet', labelEn: 'Daily Sheet & Ugrahi', labelUr: 'ڈیلی اگرائی شیٹ', icon: FileSpreadsheet },
    { id: 'receipt', labelEn: 'Receipt Voucher', labelUr: 'وصولی واؤچر', icon: Receipt },
    { id: 'supplier', labelEn: 'Suppliers', labelUr: 'سپلائرز کھاتہ', icon: Building2 },
    { id: 'orders', labelEn: 'Order Sheets', labelUr: 'آرڈر بکنگ و شیٹ', icon: ClipboardList },
    { id: 'fleet', labelEn: 'Fleet & Live Map', labelUr: 'گاڑیاں و لائیو نقشہ', icon: Truck },
    { id: 'inventory', labelEn: 'Farm Stock', labelUr: 'فارم و مرغ اسٹاک', icon: Layers },
    { id: 'accounting', labelEn: 'Roznamcha & Accounts', labelUr: 'روزنامچہ و حسابات', icon: DollarSign },
    { id: 'hr', labelEn: 'Staff & Payroll', labelUr: 'ملازمین و تنخواہ', icon: Users },
    { id: 'tests', labelEn: 'Acceptance Tests', labelUr: 'فارمولا ٹیسٹ تصدیق', icon: CheckCircle2 },
    { id: 'settings', labelEn: 'Settings', labelUr: 'ترتیبات و بیک اپ', icon: Settings }
  ];

  // Only show the tabs this role is allowed to open
  const visibleNavItems = navItems.filter((item) =>
    (VIEW_PERMISSIONS[item.id as keyof typeof VIEW_PERMISSIONS] || []).includes(currentRole)
  );

  const handleUpdateMandi = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(tempRate);
    if (!isNaN(val) && val > 0) {
      setTodayMandiRate(val);
      setShowMandiModal(false);
    }
  };

  return (
    <header className="bg-emerald-950 text-white shadow-xl sticky top-0 z-40 border-b border-emerald-800">
      {/* Top Banner & Fast Controls */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center p-1 shadow-inner">
            <img src="/icon.svg" alt="Poultry Logo" className="w-8 h-8 object-contain drop-shadow" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base sm:text-lg tracking-tight text-white flex items-center gap-1.5">
                Murgh Mandi
                <span className="font-urdu text-emerald-400 text-sm font-semibold">مرغ منڈی</span>
              </span>
              <span className="text-[10px] bg-emerald-700/80 uppercase tracking-widest text-emerald-100 px-1.5 py-0.5 rounded font-mono">
                Pakistan ERP
              </span>
            </div>
            <p className="text-[11px] text-emerald-200/80 hidden sm:block">
              {isUrdu ? 'سیل انوائس، اردو کھاتہ، آرڈر شیٹ و لائیو ٹریکنگ' : 'Poultry Sales, Urdu Khata, Orders & Real-time Fleet'}
            </p>
          </div>
        </div>

        {/* Top Right Quick Controls */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          {/* Mandi Rate Ticker / Button */}
          <button
            onClick={() => {
              setTempRate(todayMandiRate.toString());
              setShowMandiModal(true);
            }}
            className="flex items-center gap-1.5 bg-emerald-900/90 hover:bg-emerald-800 border border-emerald-700/60 rounded-lg px-2.5 py-1.5 transition text-emerald-100 shadow-sm"
            title="Click to change today's Mandi rate"
          >
            <TrendingUp className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span className="text-emerald-300 font-medium">
              {isUrdu ? 'منڈی ریٹ:' : 'Mandi:'}
            </span>
            <span className="font-bold text-white font-mono">
              Rs {todayMandiRate.toLocaleString()}
            </span>
            <span className="text-[10px] text-emerald-300">/40kg</span>
            <Edit3 className="w-3 h-3 text-emerald-400 ml-0.5" />
          </button>

          {/* Read-only Role Badge (role comes from the authenticated profile) */}
          <div
            className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-700/70 rounded-lg px-2.5 py-1.5"
            title={userName || undefined}
          >
            <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-slate-200 text-xs font-semibold whitespace-nowrap">
              {isUrdu ? roleLabels[currentRole].labelUr : roleLabels[currentRole].labelEn}
            </span>
          </div>

          {/* Sign Out */}
          <button
            onClick={onSignOut}
            className="bg-slate-900/80 hover:bg-slate-800 border border-slate-700/70 text-slate-300 hover:text-white
                       rounded-lg px-2.5 py-1.5 transition flex items-center gap-1.5 text-xs font-medium"
            title={isUrdu ? 'سائن آؤٹ' : 'Sign out'}
          >
            <LogOut className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">{isUrdu ? 'سائن آؤٹ' : 'Sign out'}</span>
          </button>

          {/* Language Switcher */}
          <button
            onClick={() => setLanguage(language === 'ur' ? 'en' : 'ur')}
            className="bg-emerald-800 hover:bg-emerald-700 text-emerald-100 font-semibold px-2.5 py-1 rounded-lg border border-emerald-600/50 transition flex items-center gap-1 text-xs"
          >
            <span>{language === 'ur' ? 'English' : 'اردو'}</span>
          </button>

          {/* Offline/Online status */}
          <div 
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border ${
              isOffline 
                ? 'bg-amber-900/40 text-amber-300 border-amber-700/50' 
                : 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50'
            }`}
          >
            {isOffline ? <WifiOff className="w-3 h-3 text-amber-400" /> : <Wifi className="w-3 h-3 text-emerald-400" />}
            <span>{isOffline ? (isUrdu ? 'آف لائن' : 'Offline') : (isUrdu ? 'آن لائن' : 'Online')}</span>
          </div>

          {/* Pending sync queue status */}
          <SyncBadge language={language} />

          {/* PWA Install */}
          <PWAInstallButton isUrdu={isUrdu} />
        </div>
      </div>

      {/* Navigation Bar Tabs */}
      <nav className="bg-emerald-900/90 border-t border-emerald-800/80 overflow-x-auto no-scrollbar">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 flex items-center gap-1 py-1 min-w-max">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-md font-semibold ring-1 ring-emerald-400/50'
                    : 'text-emerald-100/90 hover:bg-emerald-800/60 hover:text-white'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-emerald-300'}`} />
                <span className={isUrdu ? 'font-urdu text-[13px]' : ''}>
                  {isUrdu ? item.labelUr : item.labelEn}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Mandi Rate Edit Modal */}
      {showMandiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 text-slate-800 shadow-2xl animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              <span>{isUrdu ? 'روزانہ منڈی ریٹ درج کریں' : 'Enter Today\'s Mandi Benchmark Rate'}</span>
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {isUrdu 
                ? 'لاہور پولٹری منڈی کا آج کا آفیشل ریٹ فی 40 کلو (1 من) درج کریں۔' 
                : 'Benchmark rate per 40 kg (1 mann). This serves as daily reference for margin calculation.'}
            </p>

            <form onSubmit={handleUpdateMandi}>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {isUrdu ? 'منڈی ریٹ (فی 40 کلو روپے):' : 'Mandi Rate (PKR per 40 kg):'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 text-sm font-bold">Rs</span>
                  <input
                    type="number"
                    value={tempRate}
                    onChange={(e) => setTempRate(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 font-mono text-lg font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="12000"
                    autoFocus
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowMandiModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  {isUrdu ? 'منسوخ' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-md transition"
                >
                  {isUrdu ? 'ریٹ محفوظ کریں' : 'Save Mandi Rate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};
