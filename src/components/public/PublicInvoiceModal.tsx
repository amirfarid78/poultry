import React from 'react';
import { Invoice } from '../../types';
import { formatPKR, generateInvoiceWhatsAppUrl } from '../../utils/calculations';
import { useBusiness } from '../../context/BusinessContext';
import { Printer, Share2, X, CheckCircle, ShieldCheck } from 'lucide-react';

interface PublicInvoiceModalProps {
  invoice: Invoice | null;
  onClose: () => void;
  language: 'en' | 'ur';
}

export const PublicInvoiceModal: React.FC<PublicInvoiceModalProps> = ({
  invoice,
  onClose,
  language
}) => {
  if (!invoice) return null;
  const isUrdu = language === 'ur';
  const { settings: biz } = useBusiness();

  const handlePrintThermal = () => {
    window.print();
  };

  const handleNativeShare = async () => {
    const shareUrl = window.location.origin + `?token=${invoice.shareToken}&type=invoice`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${biz.nameEn} Bill - ${invoice.invoiceNumber}`,
          text: `Chicken Invoice ${invoice.invoiceNumber} for ${invoice.customerUrduName || invoice.customerName}`,
          url: shareUrl
        });
      } catch (e) {
        // user dismissed or not supported
      }
    } else {
      navigator.clipboard.writeText(shareUrl);
      alert(isUrdu ? 'بل کا محفوظ لنک کاپی کر لیا گیا!' : 'Secure invoice link copied to clipboard!');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 text-slate-800 shadow-2xl animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
        {/* Modal Controls */}
        <div className="flex items-center justify-between border-b pb-3 mb-4 no-print">
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-bold">
            <ShieldCheck className="w-4 h-4" />
            <span>{isUrdu ? 'محفوظ کسٹمر رسید (Public Receipt)' : 'Verified Customer Receipt'}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintThermal}
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
              title="Print 80mm Receipt"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={handleNativeShare}
              className="p-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800"
              title="Share Link"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 80mm Thermal Receipt Content */}
        <div className="print-receipt-80mm text-center font-sans space-y-3">
          {/* Header */}
          <div className="border-b-2 border-dashed border-slate-300 pb-3">
            <div className="flex justify-center mb-1.5">
              <img src={biz.logoUrl} alt={biz.nameEn} className="h-16 object-contain" />
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              {biz.nameUr}
            </h2>
            <p className="text-xs font-semibold text-amber-700">{biz.nameEn}{biz.tagline ? ` — ${biz.tagline}` : ''}</p>
            {(biz.phone || biz.city) && (
              <p className="text-[10px] text-slate-500" dir="ltr">
                {[biz.city ? `${biz.city}, Pakistan` : '', biz.phone].filter(Boolean).join(' | ')}
              </p>
            )}
          </div>

          {/* Invoice Info */}
          <div className="text-left text-xs space-y-1 py-1 font-mono">
            <div className="flex justify-between">
              <span className="text-slate-500">Invoice #:</span>
              <span className="font-bold text-slate-900">{invoice.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Date:</span>
              <span>{invoice.invoiceDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Customer:</span>
              <span className="font-bold">{invoice.customerUrduName || invoice.customerName}</span>
            </div>
          </div>

          {/* Line Items */}
          <div className="border-t border-b border-slate-900 py-2 text-xs">
            <div className="flex justify-between font-bold pb-1 text-slate-700 border-b border-dashed border-slate-200">
              <span>Item / Detail</span>
              <span>Total</span>
            </div>
            <div className="py-1 text-left">
              <div className="font-bold text-slate-900">Broiler Live Chicken (زندہ برائلر)</div>
              <div className="flex justify-between text-[11px] text-slate-600 font-mono">
                <span>{invoice.netWeightKg} kg @ Rs {invoice.saleRatePer40kg.toLocaleString()}/40kg</span>
                <span className="font-bold text-slate-900">Rs {invoice.totalAmount.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Bill Totals */}
          <div className="text-xs space-y-1 font-mono pt-1 text-left">
            <div className="flex justify-between font-bold text-slate-900">
              <span>Total Bill (کل رقم):</span>
              <span>Rs {invoice.totalAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Cash Recd (نقد وصولی):</span>
              <span>Rs {invoice.receivedCash.toLocaleString()}</span>
            </div>
            {invoice.receivedAC > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>AC Payment (بینک وصولی):</span>
                <span>Rs {invoice.receivedAC.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600 pt-1 border-t border-dashed">
              <span>Prev Balance (سابقہ):</span>
              <span>{formatPKR(invoice.previousBalance, true)}</span>
            </div>

            {/* New Balance Highlight */}
            <div className={`flex justify-between p-2 rounded-lg font-black text-sm mt-1 ${
              invoice.newBalance < 0 ? 'bg-emerald-100 text-emerald-950' : 'bg-slate-100 text-slate-950'
            }`}>
              <span>{invoice.newBalance < 0 ? 'ADVANCE (پیشگی):' : 'NET BALANCE (بقایا):'}</span>
              <span>{formatPKR(invoice.newBalance, true)}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t-2 border-dashed border-slate-300 pt-3 text-[10px] text-slate-500 space-y-1">
            <p>مال وصول کرنے کے بعد وزن کی تصدیق لازمی ہے۔</p>
            <p className="font-mono text-[9px] text-slate-400">Token: {invoice.shareToken}</p>
            <p className="font-bold text-slate-700">Thank you for your business!</p>
          </div>
        </div>
      </div>
    </div>
  );
};
