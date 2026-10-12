import React, { useState } from 'react';
import { LogIn, Mail, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';

interface LoginProps {
  onSwitchToSignup: () => void;
}

/** Shared auth screen shell used by Login & Signup. */
export const AuthShell: React.FC<{
  language: 'en' | 'ur';
  setLanguage: (l: 'en' | 'ur') => void;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}> = ({ language, setLanguage, title, subtitle, children }) => {
  const isUrdu = language === 'ur';
  const { settings: biz } = useBusiness();
  return (
    <div className="min-h-screen bg-slate-100/90 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white border border-amber-200 shadow-lg p-1.5 mb-3 overflow-hidden">
            <img src={biz.logoUrl} alt={biz.nameEn} className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {biz.nameEn} <span className="font-urdu text-amber-700">{biz.nameUr}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isUrdu ? 'پاکستان پولٹری سیلز ای آر پی' : 'Pakistan Poultry Sales ERP'}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-6 sm:p-8">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{title}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            </div>
            <button
              onClick={() => setLanguage(language === 'ur' ? 'en' : 'ur')}
              className="text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-lg border border-emerald-200 transition"
            >
              {language === 'ur' ? 'English' : 'اردو'}
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
};

const inputClass =
  'w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none';

export const Login: React.FC<LoginProps> = ({ onSwitchToSignup }) => {
  const { signIn } = useAuth();
  const [language, setLanguage] = useState<'en' | 'ur'>('ur');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isUrdu = language === 'ur';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const msg = await signIn(email.trim(), password);
    setBusy(false);
    if (msg) {
      setError(msg);
    }
  };

  return (
    <AuthShell
      language={language}
      setLanguage={setLanguage}
      title={isUrdu ? 'لاگ اِن کریں' : 'Sign In'}
      subtitle={isUrdu ? 'اپنے اکاؤنٹ میں داخل ہوں' : 'Access your business account'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            {isUrdu ? 'ای میل' : 'Email'}
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder={isUrdu ? 'آپ کی ای میل' : 'you@example.com'}
              dir="ltr"
              required
              autoFocus
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            {isUrdu ? 'پاس ورڈ' : 'Password'}
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder={isUrdu ? 'آپ کا پاس ورڈ' : 'Your password'}
              dir="ltr"
              required
            />
          </div>
        </div>

        {error && (
          <div className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed
                     text-white font-bold rounded-xl text-sm shadow-md transition flex items-center justify-center gap-2"
        >
          <LogIn className="w-4 h-4" />
          {busy
            ? (isUrdu ? 'براہ کرم انتظار کریں...' : 'Please wait...')
            : (isUrdu ? 'لاگ اِن' : 'Sign In')}
        </button>
      </form>

      <div className="mt-5 text-center text-xs text-slate-500">
        {isUrdu ? 'اکاؤنٹ نہیں ہے؟' : "Don't have an account?"}{' '}
        <button
          onClick={onSwitchToSignup}
          className="font-bold text-emerald-700 hover:text-emerald-800 hover:underline"
        >
          {isUrdu ? 'نیا اکاؤنٹ بنائیں' : 'Create one'}
        </button>
      </div>
    </AuthShell>
  );
};
