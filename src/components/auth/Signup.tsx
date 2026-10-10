import React, { useState } from 'react';
import { UserPlus, Mail, Lock, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AuthShell } from './Login';

interface SignupProps {
  onSwitchToLogin: () => void;
}

const inputClass =
  'w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none';

export const Signup: React.FC<SignupProps> = ({ onSwitchToLogin }) => {
  const { signUp } = useAuth();
  const [language, setLanguage] = useState<'en' | 'ur'>('ur');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmNotice, setConfirmNotice] = useState(false);
  const [busy, setBusy] = useState(false);

  const isUrdu = language === 'ur';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setConfirmNotice(false);
    setBusy(true);
    const { error: msg, emailConfirmationRequired } = await signUp(email.trim(), password, fullName.trim());
    setBusy(false);
    if (msg) {
      setError(msg);
    } else if (emailConfirmationRequired) {
      setConfirmNotice(true);
    }
    // Otherwise onAuthStateChange / profile load takes the user into the app.
  };

  return (
    <AuthShell
      language={language}
      setLanguage={setLanguage}
      title={isUrdu ? 'نیا اکاؤنٹ بنائیں' : 'Create Account'}
      subtitle={isUrdu ? 'پہلا اکاؤنٹ مالک (Owner) بنے گا' : 'The first account becomes the Owner'}
    >
      {confirmNotice ? (
        <div className="text-center py-4">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-emerald-100 flex items-center justify-center">
            <Mail className="w-6 h-6 text-emerald-700" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 mb-1">
            {isUrdu ? 'ای میل تصدیق کریں' : 'Check your email to confirm'}
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            {isUrdu
              ? `ہم نے ${email} پر ایک تصدیقی لنک بھیجا ہے۔ لنک پر کلک کریں، پھر لاگ اِن کریں۔`
              : `We sent a confirmation link to ${email}. Click the link, then sign in.`}
          </p>
          <button
            onClick={onSwitchToLogin}
            className="mt-4 w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-md transition"
          >
            {isUrdu ? 'لاگ اِن پر واپس' : 'Back to Sign In'}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {isUrdu ? 'پورا نام' : 'Full Name'}
            </label>
            <div className="relative">
              <User className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputClass}
                placeholder={isUrdu ? 'مثلاً احمد خان' : 'e.g. Ahmed Khan'}
                required
                autoFocus
              />
            </div>
          </div>

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
                placeholder={isUrdu ? 'کم از کم 6 حروف' : 'Minimum 6 characters'}
                dir="ltr"
                minLength={6}
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
            <UserPlus className="w-4 h-4" />
            {busy
              ? (isUrdu ? 'براہ کرم انتظار کریں...' : 'Please wait...')
              : (isUrdu ? 'اکاؤنٹ بنائیں' : 'Create Account')}
          </button>
        </form>
      )}

      <div className="mt-5 text-center text-xs text-slate-500">
        {isUrdu ? 'پہلے سے اکاؤنٹ ہے؟' : 'Already have an account?'}{' '}
        <button
          onClick={onSwitchToLogin}
          className="font-bold text-emerald-700 hover:text-emerald-800 hover:underline"
        >
          {isUrdu ? 'لاگ اِن کریں' : 'Sign in'}
        </button>
      </div>
    </AuthShell>
  );
};
