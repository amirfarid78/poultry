import React, { useState } from 'react';
import { AppState } from '../../services/store';
import { 
  exportFullBackupJSON, 
  exportInvoicesToCSV, 
  exportCustomersToCSV, 
  exportExpensesToCSV, 
  exportInventoryToCSV,
  exportDailyUgrahiToCSV,
  exportRoznamchaToCSV,
  validateAndParseImportedState 
} from '../../utils/exportImport';
import { 
  Settings, 
  Download, 
  Upload, 
  RotateCcw, 
  CheckCircle, 
  FileSpreadsheet, 
  Laptop, 
  Sparkles, 
  Store, 
  ArrowRight,
  ShieldCheck,
  Smartphone,
  HardDrive
} from 'lucide-react';

interface SettingsViewProps {
  appState: AppState;
  language: 'en' | 'ur';
  onResetSeedData: () => void;
  onImportState: (state: AppState) => void;
  onQuickSetup?: (config: {
    shopNameUrdu: string;
    shopNameEn: string;
    ownerName: string;
    city: string;
    openingCash: number;
    mandiRate: number;
    startingStockKg: number;
  }) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  appState,
  language,
  onResetSeedData,
  onImportState,
  onQuickSetup
}) => {
  const isUrdu = language === 'ur';
  const [notice, setNotice] = useState<string | null>(null);

  // Quick Setup Wizard State
  const [showQuickSetupModal, setShowQuickSetupModal] = useState(false);
  const [wizardShopNameUrdu, setWizardShopNameUrdu] = useState('مرغ منڈی پولٹری سیلز');
  const [wizardShopNameEn, setWizardShopNameEn] = useState('Murgh Mandi Poultry Sales');
  const [wizardOwnerName, setWizardOwnerName] = useState('حاجی محمد اکرم');
  const [wizardCity, setWizardCity] = useState('Lahore');
  const [wizardCash, setWizardCash] = useState<number>(100000);
  const [wizardRate, setWizardRate] = useState<number>(12000);
  const [wizardStock, setWizardStock] = useState<number>(4000);

  const handleApplyQuickSetup = (e: React.FormEvent) => {
    e.preventDefault();
    if (onQuickSetup) {
      onQuickSetup({
        shopNameUrdu: wizardShopNameUrdu,
        shopNameEn: wizardShopNameEn,
        ownerName: wizardOwnerName,
        city: wizardCity,
        openingCash: wizardCash,
        mandiRate: wizardRate,
        startingStockKg: wizardStock
      });
      setShowQuickSetupModal(false);
      setNotice(isUrdu ? 'نیا کاروبار ون کلک پر کامیابی سے سیٹ اپ ہو گیا!' : 'Fresh shop setup initialized successfully in 1 click!');
      setTimeout(() => setNotice(null), 5000);
    }
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const res = validateAndParseImportedState(event.target?.result as string);
      if (res.success && res.state) {
        onImportState(res.state);
        setNotice(isUrdu ? 'ڈیٹا کامیابی سے بحال ہو گیا! تمام کھاتے درست ہیں۔' : 'Data restored successfully from backup!');
        setTimeout(() => setNotice(null), 5000);
      } else {
        alert(isUrdu ? `بیک اپ فائل میں نقص ہے: ${res.error}` : `Invalid backup file: ${res.error}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Settings className="w-6 h-6 text-emerald-600" />
            <span>{isUrdu ? 'ون کلک سیٹ اپ و مکمل ایکسپورٹ سنٹر' : 'One-Click Setup, Export & Migration Center'}</span>
          </h2>
          <p className="text-xs text-slate-500">
            {isUrdu 
              ? 'مکمل سافٹ ویئر کسی بھی کمپیوٹر، لیپ ٹاپ یا موبائل پر فوری سیٹ اپ، بیک اپ اور ایکسل برآمد کرنے کے لیے تیار ہے' 
              : 'Export-ready standalone architecture: 1-click new shop setup, full JSON backup, CSV exports, and offline deployment.'}
          </p>
        </div>

        <button
          onClick={() => setShowQuickSetupModal(true)}
          className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white px-4 py-2.5 rounded-xl text-xs font-black shadow-lg transition"
        >
          <Sparkles className="w-4 h-4" />
          <span>{isUrdu ? 'نیا کاروبار ون کلک سیٹ اپ کریں' : '1-Click New Shop Setup'}</span>
        </button>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in shadow-md">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* SECTION 1: ONE-CLICK QUICK ACTIONS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Full JSON Backup */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 flex flex-col justify-between">
          <div>
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 w-fit mb-3">
              <Download className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">
              {isUrdu ? 'مکمل سافٹ ویئر بیک اپ (JSON)' : 'Full System Backup (JSON)'}
            </h4>
            <p className="text-[11px] text-slate-500 mt-1">
              {isUrdu 
                ? 'تمام گاہک، سپلائرز، بلز، بہی کھاتہ، اسٹاک اور کیش ایک محفوظ فائل میں ڈاؤنلوڈ کریں۔' 
                : 'Download all parties, invoices, receipts, expenses, stock & closings.'}
            </p>
          </div>
          <button
            onClick={() => {
              exportFullBackupJSON(appState);
              setNotice(isUrdu ? 'مکمل سسٹم بیک اپ کامیابی سے ڈاؤنلوڈ ہو گیا!' : 'Full ERP system backup downloaded!');
              setTimeout(() => setNotice(null), 4000);
            }}
            className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span>{isUrdu ? 'بیک اپ ڈاؤنلوڈ کریں' : 'Download Full Backup'}</span>
          </button>
        </div>

        {/* Restore Backup */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 flex flex-col justify-between">
          <div>
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700 w-fit mb-3">
              <Upload className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">
              {isUrdu ? 'بیک اپ سے فوری بحال کریں' : 'Restore from Backup'}
            </h4>
            <p className="text-[11px] text-slate-500 mt-1">
              {isUrdu 
                ? 'کسی دوسرے لیپ ٹاپ یا فون سے لیا گیا بیک اپ منتخب کر کے 1 سیکنڈ میں پورا ڈیٹا بحال کریں۔' 
                : 'Upload and instantly restore full database on any new computer or phone.'}
            </p>
          </div>
          <label className="w-full py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition shadow-sm">
            <Upload className="w-4 h-4" />
            <span>{isUrdu ? 'بیک اپ فائل منتخب کریں' : 'Choose Backup File'}</span>
            <input type="file" accept=".json" onChange={handleImportJSON} className="hidden" />
          </label>
        </div>

        {/* Reset Demo Seed */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 flex flex-col justify-between">
          <div>
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 w-fit mb-3">
              <RotateCcw className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">
              {isUrdu ? 'ریفرنس ڈیمو ڈیٹا ری سیٹ' : 'Reset to Demo Seed'}
            </h4>
            <p className="text-[11px] text-slate-500 mt-1">
              {isUrdu 
                ? 'سمی خان، حاجی اسلم، ملک برادرز اور منڈی کا اصل ریفرنس ڈیمو ڈیٹا دوبارہ لوڈ کریں۔' 
                : 'Reload verified demo records from reference images 1, 2 and 3.'}
            </p>
          </div>
          <button
            onClick={() => {
              if (confirm(isUrdu ? 'کیا آپ تمام ڈیٹا کو ابتدائی تصدیق شدہ ڈیمو پر ری سیٹ کرنا چاہتے ہیں؟' : 'Reset all data to initial demo seed?')) {
                onResetSeedData();
                setNotice(isUrdu ? 'ابتدائی ڈیمو ڈیٹا بحال ہو گیا!' : 'Initial demo seed data restored!');
                setTimeout(() => setNotice(null), 4000);
              }
            }}
            className="w-full py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm"
          >
            <RotateCcw className="w-4 h-4" />
            <span>{isUrdu ? 'ڈیمو ری سیٹ کریں' : 'Reset to Demo'}</span>
          </button>
        </div>
      </div>

      {/* SECTION 2: ONE-CLICK EXCEL / CSV EXPORTS */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b pb-3">
          <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">
              {isUrdu ? 'ایکسل و سی ایس وی برآمد کریں (Excel & CSV Exports)' : 'One-Click Excel / CSV Exports'}
            </h3>
            <p className="text-[11px] text-slate-500">
              {isUrdu 
                ? 'مائیکروسافٹ ایکسل یا گوگل شیٹس میں کھاتہ، بلز اور اخراجات ایک کلک پر کھولیں' 
                : 'Export formatted spreadsheets compatible with Microsoft Excel & Google Sheets'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <button
            onClick={() => exportInvoicesToCSV(appState)}
            className="p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition text-left flex flex-col justify-between h-24"
          >
            <span className="font-bold text-slate-800">{isUrdu ? 'فروخت بل انوائسز' : 'Sales Invoices'}</span>
            <span className="text-[10px] text-slate-500">{appState.invoices.length} {isUrdu ? 'انوائسز' : 'records'}</span>
            <span className="text-emerald-700 font-bold flex items-center gap-1 text-[11px]">
              <Download className="w-3 h-3" />
              <span>{isUrdu ? 'ڈاؤنلوڈ CSV' : 'Export CSV'}</span>
            </span>
          </button>

          <button
            onClick={() => exportCustomersToCSV(appState)}
            className="p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition text-left flex flex-col justify-between h-24"
          >
            <span className="font-bold text-slate-800">{isUrdu ? 'کسٹمر کھاتہ و بقایا' : 'Customer Khatas'}</span>
            <span className="text-[10px] text-slate-500">{appState.parties.length} {isUrdu ? 'کھاتے' : 'parties'}</span>
            <span className="text-emerald-700 font-bold flex items-center gap-1 text-[11px]">
              <Download className="w-3 h-3" />
              <span>{isUrdu ? 'ڈاؤنلوڈ CSV' : 'Export CSV'}</span>
            </span>
          </button>

          <button
            onClick={() => exportExpensesToCSV(appState)}
            className="p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition text-left flex flex-col justify-between h-24"
          >
            <span className="font-bold text-slate-800">{isUrdu ? 'اخراجات رجسٹر' : 'Expenses Sheet'}</span>
            <span className="text-[10px] text-slate-500">{appState.expenses.length} {isUrdu ? 'اخراجات' : 'records'}</span>
            <span className="text-emerald-700 font-bold flex items-center gap-1 text-[11px]">
              <Download className="w-3 h-3" />
              <span>{isUrdu ? 'ڈاؤنلوڈ CSV' : 'Export CSV'}</span>
            </span>
          </button>

          <button
            onClick={() => exportInventoryToCSV(appState)}
            className="p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition text-left flex flex-col justify-between h-24"
          >
            <span className="font-bold text-slate-800">{isUrdu ? 'مرغ اسٹاک انوینٹری' : 'Live Birds Stock'}</span>
            <span className="text-[10px] text-slate-500">{appState.inventory.length} {isUrdu ? 'آئٹمز' : 'items'}</span>
            <span className="text-emerald-700 font-bold flex items-center gap-1 text-[11px]">
              <Download className="w-3 h-3" />
              <span>{isUrdu ? 'ڈاؤنلوڈ CSV' : 'Export CSV'}</span>
            </span>
          </button>

          <button
            onClick={() => exportDailyUgrahiToCSV(appState)}
            className="p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition text-left flex flex-col justify-between h-24"
          >
            <span className="font-bold text-slate-800">{isUrdu ? 'ڈیلی شیٹ و اگرائی' : 'Daily Ugrahi Sheet'}</span>
            <span className="text-[10px] text-slate-500">{appState.receipts.length} {isUrdu ? 'وصولیاں' : 'receipts'}</span>
            <span className="text-emerald-700 font-bold flex items-center gap-1 text-[11px]">
              <Download className="w-3 h-3" />
              <span>{isUrdu ? 'ڈاؤنلوڈ CSV' : 'Export CSV'}</span>
            </span>
          </button>

          <button
            onClick={() => exportRoznamchaToCSV(appState)}
            className="p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition text-left flex flex-col justify-between h-24"
          >
            <span className="font-bold text-slate-800">{isUrdu ? 'روزنامچہ عمومی جنرل' : 'Roznamcha Daybook'}</span>
            <span className="text-[10px] text-slate-500">{appState.ledgerEntries.length} {isUrdu ? 'اندراجات' : 'entries'}</span>
            <span className="text-emerald-700 font-bold flex items-center gap-1 text-[11px]">
              <Download className="w-3 h-3" />
              <span>{isUrdu ? 'ڈاؤنلوڈ CSV' : 'Export CSV'}</span>
            </span>
          </button>
        </div>
      </div>

      {/* SECTION 3: ANYWHERE SETUP & OFFLINE DEPLOYMENT GUIDE */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b pb-3">
          <Laptop className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">
              {isUrdu ? 'کسی بھی لیپ ٹاپ یا موبائل پر سافٹ ویئر چلانے کا طریقہ' : 'Anywhere Standalone Setup & Offline Operation'}
            </h3>
            <p className="text-[11px] text-slate-500">
              {isUrdu 
                ? 'یہ سافٹ ویئر بغیر انٹرنیٹ، بغیر کسی سرور اور بغیر کسی فیس کے 100% لائف ٹائم چلتا ہے' 
                : 'Zero installation barrier: runs 100% offline directly in any browser.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">1</span>
              <Smartphone className="w-4 h-4 text-emerald-700" />
              <span>{isUrdu ? 'موبائل پر شارٹ کٹ بنائیں' : 'Install on Mobile Phone'}</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              {isUrdu 
                ? 'گوگل کروم یا سفاری میں کھولیں، مینو میں جا کر "Add to Home Screen" یا "Install App" دبائیں۔ یہ موبائل ایپ کی طرح بن جائے گی۔' 
                : 'Open in Chrome or Safari, tap browser menu and select "Add to Home Screen" or "Install App".'}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">2</span>
              <Laptop className="w-4 h-4 text-blue-700" />
              <span>{isUrdu ? 'دکان کے کمپیوٹر پر استعمال' : 'Setup on Shop PC / Laptop'}</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              {isUrdu 
                ? 'تھرمل پرنٹر (80mm) یا لیزر پرنٹر (A4) کے ساتھ جوڑیں، کنٹرول+پی سے رسید پرنٹ کریں۔ انٹرنیٹ بند ہونے پر بھی کام جاری رہے گا۔' 
                : 'Connects to any 80mm thermal receipt printer or standard A4 printer. All data stays offline.'}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">3</span>
              <HardDrive className="w-4 h-4 text-purple-700" />
              <span>{isUrdu ? 'دوسری ڈیوائس پر منتقلی' : 'Transfer to New Machine'}</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              {isUrdu 
                ? 'پرانے کمپیوٹر سے "بیک اپ ڈاؤنلوڈ کریں" دبائیں، اور نئے کمپیوٹر پر "بیک اپ فائل منتخب کریں" دبائیں۔ 5 سیکنڈ میں پورا کام ٹرانسفر!' 
                : 'Click "Download Full Backup" on old machine, and click "Choose Backup File" on the new device.'}
            </p>
          </div>
        </div>
      </div>

      {/* QUICK SETUP MODAL */}
      {showQuickSetupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 text-slate-800 shadow-2xl border border-slate-200 animate-in fade-in">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {isUrdu ? 'نیا پولٹری کاروبار ون کلک سیٹ اپ' : '1-Click Fresh Poultry Setup'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {isUrdu ? 'اپنی دکان یا شیڈ کی معلومات درج کریں اور فوری شروع کریں' : 'Configure your shop name, galla cash & starting stock'}
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleApplyQuickSetup} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isUrdu ? 'دکان / کاروبار کا اردو نام:' : 'Business Name (Urdu):'}
                  </label>
                  <input
                    type="text"
                    value={wizardShopNameUrdu}
                    onChange={(e) => setWizardShopNameUrdu(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-urdu font-bold text-sm text-slate-900"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isUrdu ? 'انگلش نام:' : 'Business Name (English):'}
                  </label>
                  <input
                    type="text"
                    value={wizardShopNameEn}
                    onChange={(e) => setWizardShopNameEn(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-medium text-slate-900"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isUrdu ? 'مالک / منشی کا نام:' : 'Owner / Manager Name:'}
                  </label>
                  <input
                    type="text"
                    value={wizardOwnerName}
                    onChange={(e) => setWizardOwnerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-900"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isUrdu ? 'منڈی شہر:' : 'Mandi Hub City:'}
                  </label>
                  <select
                    value={wizardCity}
                    onChange={(e) => setWizardCity(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-900 bg-white"
                  >
                    <option value="Lahore">Lahore Mandi (لاہور)</option>
                    <option value="Rawalpindi">Rawalpindi / Islamabad (راولپنڈی)</option>
                    <option value="Faisalabad">Faisalabad (فیصل آباد)</option>
                    <option value="Gujranwala">Gujranwala (گوجرانوالہ)</option>
                    <option value="Multan">Multan (ملتان)</option>
                    <option value="Karachi">Karachi (کراچی)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isUrdu ? 'گلہ کا کیش (Rs):' : 'Starting Cash (Rs):'}
                  </label>
                  <input
                    type="number"
                    value={wizardCash}
                    onChange={(e) => setWizardCash(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-slate-900"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isUrdu ? 'آج کا منڈی ریٹ:' : 'Today Mandi Rate:'}
                  </label>
                  <input
                    type="number"
                    value={wizardRate}
                    onChange={(e) => setWizardRate(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-slate-900"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isUrdu ? 'موجود اسٹاک (کلو):' : 'Starting Stock (Kg):'}
                  </label>
                  <input
                    type="number"
                    value={wizardStock}
                    onChange={(e) => setWizardStock(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-slate-900"
                    required
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  {isUrdu 
                    ? 'یہ نیا سیٹ اپ بنیادی کھاتے اور کیش درج کر دے گا اور آپ فوری طور پر کسٹمرز کو بل بنا کر دے سکیں گے۔' 
                    : 'This will initialize clean shop ledgers with your custom cash & stock balance.'}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowQuickSetupModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  {isUrdu ? 'منسوخ' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition flex items-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{isUrdu ? 'سیٹ اپ مکمل کریں' : 'Complete Setup'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
