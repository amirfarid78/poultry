import React, { useState } from 'react';
import { runAcceptanceTests } from '../../utils/calculations.test';
import { CheckCircle2, XCircle, Play, Sparkles, BookOpen, Calculator } from 'lucide-react';

export const TestSuiteView: React.FC<{ language: 'en' | 'ur' }> = ({ language }) => {
  const isUrdu = language === 'ur';
  const [testResults, setTestResults] = useState(runAcceptanceTests());
  const [lastRunTime, setLastRunTime] = useState<string>(new Date().toLocaleTimeString());

  const handleRunTests = () => {
    setTestResults(runAcceptanceTests());
    setLastRunTime(new Date().toLocaleTimeString());
  };

  const allPassed = testResults.every((t) => t.passed);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Calculator className="w-6 h-6 text-emerald-600" />
            <span>{isUrdu ? 'فارمولا تصدیق و خودکار قبولیت ٹیسٹ' : 'Automated Acceptance Tests & Mathematical Verification'}</span>
          </h2>
          <p className="text-xs text-slate-500">
            {isUrdu 
              ? 'تینوں ریفرنس تصاویر (گوگل شیٹ، ہاتھ کی تحریر، روایتی کھاتہ) کے فارمولوں کی 100% تصدیق' 
              : 'Verifies the core formulas extracted from the 3 reference images as required in Section 4.'}
          </p>
        </div>

        <button
          onClick={handleRunTests}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md transition"
        >
          <Play className="w-4 h-4" />
          <span>{isUrdu ? 'ٹیسٹ دوبارہ چلائیں' : 'Re-run Tests'}</span>
        </button>
      </div>

      {/* Status Card */}
      <div className={`p-5 rounded-2xl border flex items-center justify-between ${
        allPassed 
          ? 'bg-emerald-50 border-emerald-300 text-emerald-950' 
          : 'bg-rose-50 border-rose-300 text-rose-950'
      }`}>
        <div className="flex items-center gap-3">
          {allPassed ? (
            <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
          ) : (
            <XCircle className="w-8 h-8 text-rose-600 shrink-0" />
          )}
          <div>
            <h3 className="text-base font-extrabold">
              {allPassed 
                ? (isUrdu ? `تمام ${testResults.length} تصدیقی ٹیسٹ کامیابی سے پاس ہو گئے!` : `All ${testResults.length} Acceptance Tests Passed (100% Verified)!`)
                : (isUrdu ? 'کچھ ٹیسٹ فیل ہو گئے' : 'Some Tests Failed')}
            </h3>
            <p className="text-xs opacity-80">
              {isUrdu 
                ? 'تمام ریاضیاتی مساواتیں، پیشگی رقم کی منفی علامات، اور فون نمبر نارملائزیشن درست ہیں۔'
                : 'Formulas, Advance negative balances, and Pakistani phone normalization match specification.'}
            </p>
          </div>
        </div>
        <span className="text-xs font-mono font-bold bg-white/70 px-2.5 py-1 rounded-lg">
          Last Run: {lastRunTime}
        </span>
      </div>

      {/* Individual Test Cards */}
      <div className="space-y-3">
        {testResults.map((t, idx) => (
          <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center font-mono">
                  {idx + 1}
                </span>
                <h4 className="text-sm font-bold text-slate-800">
                  {t.testName}
                </h4>
              </div>
              <p className="text-xs font-mono text-slate-600 pl-7">
                {t.details}
              </p>
            </div>

            <div className="shrink-0">
              {t.passed ? (
                <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>PASSED</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-100 px-2.5 py-1 rounded-full">
                  <XCircle className="w-3.5 h-3.5" />
                  <span>FAILED</span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Formula Reference Explainer Box */}
      <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-xl border border-slate-800 space-y-3">
        <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
          <BookOpen className="w-4 h-4" />
          <span>{isUrdu ? 'ریفرنس تصاویر سے اخذ کردہ تصدیق شدہ فارمولے' : 'Verified Mathematical Engine Proofs'}</span>
        </h3>
        <div className="space-y-2 text-xs font-mono text-slate-300">
          <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700">
            <strong>Row 1:</strong> Total = 12,200 × 80 ÷ 40 = 24,400. Wasool = 20,000. Balance = 24,400 - 20,000 = <strong>4,400</strong>.
          </div>
          <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700">
            <strong>Row 2:</strong> Prev Bal = 4,400. Total = 12,000 × 80 ÷ 40 = 24,000. Wasool = 20,000. Balance = 4,400 + 24,000 - 20,000 = <strong>8,400</strong>.
          </div>
          <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700">
            <strong>Row 3 (Advance):</strong> Prev Bal = 8,400. Wasool = 20,000. New Balance = 8,400 - 20,000 = <strong>-11,600 (Advance)</strong>.
          </div>
          <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700">
            <strong>Handwritten Sheet:</strong> A(prev)=4,000. Rate=13,200, Kg=60 &rarr; Total=19,800. Wasool(C)=9,000, AC(B)=8,000. Bal = 4,000 + 19,800 - 9,000 - 8,000 = <strong>6,800</strong>.
          </div>
        </div>
      </div>
    </div>
  );
};
