import React, { useState } from 'react';
import { AppState, saveStateToStorage } from '../../services/store';
import { Settings, Download, Upload, RotateCcw, CheckCircle, Database } from 'lucide-react';

interface SettingsViewProps {
  appState: AppState;
  language: 'en' | 'ur';
  onResetSeedData: () => void;
  onImportState: (state: AppState) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  appState,
  language,
  onResetSeedData,
  onImportState
}) => {
  const isUrdu = language === 'ur';
  const [notice, setNotice] = useState<string | null>(null);

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(appState, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `murgh_mandi_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setNotice(isUrdu ? 'تمام ڈیٹا کا بیک اپ ڈاؤنلوڈ ہو گیا!' : 'Full ERP system backup downloaded!');
    setTimeout(() => setNotice(null), 4000);
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        onImportState(parsed);
        setNotice(isUrdu ? 'ڈیٹا کامیابی سے بحال ہو گیا!' : 'Data restored successfully from backup!');
        setTimeout(() => setNotice(null), 4000);
      } catch (err) {
        alert(isUrdu ? 'بیک اپ فائل خراب ہے!' : 'Invalid backup JSON file!');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Settings className="w-6 h-6 text-emerald-600" />
            <span>{isUrdu ? 'سسٹم ترتیبات و مکمل ڈیٹا بیک اپ' : 'Settings, Data Backup & Restore'}</span>
          </h2>
          <p className="text-xs text-slate-500">
            {isUrdu 
              ? 'پورا سافٹ ویئر بغیر انٹرنیٹ کے محفوظ طریقے سے کام کرتا ہے، یہاں سے بیک اپ لیں یا سیڈ ڈیٹا ری سیٹ کریں' 
              : 'Full offline local storage persistence, JSON backup export, and sample demo restore.'}
          </p>
        </div>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-600 text-white rounded-xl text-xs font-medium flex items-center gap-2 animate-in fade-in">
          <CheckCircle className="w-4 h-4" />
          <span>{notice}</span>
        </div>
      )}

      {/* Business Profile & Configuration */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 text-xs">
        <h3 className="text-sm font-bold text-slate-800 border-b pb-2">
          {isUrdu ? 'کاروبار کی بنیادی ترتیبات' : 'Poultry Mandi Business Settings'}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {isUrdu ? 'کاروبار کا نام (اردو):' : 'Business Name (Urdu):'}
            </label>
            <input
              type="text"
              readOnly
              value="مرغ منڈی پولٹری اینڈ برائلر سیلز"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 font-urdu bg-slate-50 font-bold"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {isUrdu ? 'من تقسیم کنندہ (Mann Divisor):' : 'Mann Weight Divisor:'}
            </label>
            <input
              type="text"
              readOnly
              value="40 kg per Mann"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono bg-slate-50 font-bold"
            />
          </div>
        </div>
      </div>

      {/* Backup and Restore Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Export JSON */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 w-fit">
            <Download className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">{isUrdu ? 'ڈیٹا بیک اپ ڈاؤنلوڈ' : 'Export Full Backup'}</h4>
            <p className="text-[11px] text-slate-500 mt-1">
              {isUrdu ? 'تمام کھاتے، انوائسز اور کسٹمرز JSON فائل میں محفوظ کریں' : 'Download all parties, invoices, and ledgers.'}
            </p>
          </div>
          <button
            onClick={handleExportJSON}
            className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
          >
            {isUrdu ? 'بیک اپ فائل ڈاؤنلوڈ کریں' : 'Download Backup JSON'}
          </button>
        </div>

        {/* Import JSON */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700 w-fit">
            <Upload className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">{isUrdu ? 'بیک اپ بحال کریں' : 'Restore from Backup'}</h4>
            <p className="text-[11px] text-slate-500 mt-1">
              {isUrdu ? 'پہلے سے محفوظ شدہ بیک اپ فائل منتخب کریں' : 'Select a previously exported JSON backup file.'}
            </p>
          </div>
          <label className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs block text-center cursor-pointer">
            <span>{isUrdu ? 'فائل منتخب کریں' : 'Choose Backup File'}</span>
            <input type="file" accept=".json" onChange={handleImportJSON} className="hidden" />
          </label>
        </div>

        {/* Reset Demo Data */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 w-fit">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">{isUrdu ? 'ریفرنس ڈیٹا ری سیٹ' : 'Reset Demo Seed'}</h4>
            <p className="text-[11px] text-slate-500 mt-1">
              {isUrdu ? 'سمی خان، حاجی اسلم اور تینوں تصاویر کا ابتدائی ڈیٹا دوبارہ لوڈ کریں' : 'Reload the verified demo records from reference images.'}
            </p>
          </div>
          <button
            onClick={() => {
              if (confirm(isUrdu ? 'کیا آپ تمام ڈیٹا کو ابتدائی سیڈ پر ری سیٹ کرنا چاہتے ہیں؟' : 'Reset all data to initial demo state?')) {
                onResetSeedData();
                setNotice(isUrdu ? 'ابتدائی سیڈ ڈیٹا بحال ہو گیا!' : 'Initial demo seed data restored!');
                setTimeout(() => setNotice(null), 4000);
              }
            }}
            className="w-full py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
          >
            {isUrdu ? 'ری سیٹ کریں' : 'Reset to Seed Data'}
          </button>
        </div>
      </div>
    </div>
  );
};
