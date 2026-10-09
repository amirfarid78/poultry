import React, { useState } from 'react';
import { usePWAInstall } from './usePWAInstall';
import { Download, HelpCircle, X } from 'lucide-react';

export const PWAInstallButton: React.FC<{ isUrdu?: boolean }> = ({ isUrdu }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
        title="Install Murgh Mandi App"
      >
        <Download className="w-3.5 h-3.5" />
        <span>{isUrdu ? 'ایپ انسٹال کریں' : 'Install PWA'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-lg border border-emerald-600/30 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 transition"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{isUrdu ? 'آئی فون پر انسٹال' : 'Install on iOS'}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl text-slate-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-slate-900">
                  {isUrdu ? 'آئی فون پر ایپ محفوظ کریں' : 'Install on iPhone / iPad'}
                </h3>
                <button 
                  onClick={() => setShowIOSGuide(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                {isUrdu ? (
                  <span className="font-urdu block">
                    1. سفاری میں نیچے <strong>Share</strong> کا بٹن دبائیں۔<br />
                    2. فہرست میں <strong>Add to Home Screen</strong> پر کلک کریں۔
                  </span>
                ) : (
                  <span>
                    1. Tap the <strong>Share</strong> button at bottom in Safari.<br />
                    2. Scroll down and tap <strong>Add to Home Screen</strong>.
                  </span>
                )}
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-xl bg-slate-900 py-2.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                {isUrdu ? 'سمجھ گیا' : 'Got it'}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
