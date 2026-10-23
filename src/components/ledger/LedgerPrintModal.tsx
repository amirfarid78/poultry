import React, { useState } from 'react';
import { Party, LedgerEntry } from '../../types';
import { generateLedgerWhatsAppUrl } from '../../utils/calculations';
import { generateLedgerPDF, brandingFromSettings, loadLogoDataUrl } from '../../utils/pdfGenerator';
import { useBusiness } from '../../context/BusinessContext';
import { Printer, Share2, Download, Copy, Check, X } from 'lucide-react';

interface LedgerPrintModalProps {
  party: Party;
  entries: LedgerEntry[];
  startDate: string;
  endDate: string;
  language: 'en' | 'ur';
  onClose: () => void;
}

/** Shared printable ledger statement (A4) with PDF download, WhatsApp share
 *  and copy-text — used by both the customer and supplier khata views. */
export const LedgerPrintModal: React.FC<LedgerPrintModalProps> = ({
  party,
  entries,
  startDate,
  endDate,
  language,
  onClose,
}) => {
  const isUrdu = language === 'ur';
  const { settings: biz } = useBusiness();
  const [copiedNotice, setCopiedNotice] = useState(false);

  const isSupplier = party.partyType === 'supplier';
  const kindEn = isSupplier ? 'Supplier' : 'Customer';
  const partyLabel = party.urduName || party.name;

  const totalDebit = entries.reduce((s, e) => s + (e.debit || 0), 0);
  const totalCredit = entries.reduce((s, e) => s + (e.credit || 0), 0);
  const finalBalance = party.currentBalance || 0;

  const handleWhatsAppShare = () => {
    if (!party?.whatsapp) {
      alert(isUrdu ? 'اس کھاتے کا واٹس ایپ نمبر موجود نہیں ہے' : 'No WhatsApp number for this account');
      return;
    }
    const shareUrl = window.location.origin + `?partyId=${party.id}&type=ledger`;
    const url = generateLedgerWhatsAppUrl({
      phone: party.whatsapp,
      partyName: party.urduName || party.name,
      asOfDate: endDate,
      currentBalance: finalBalance,
      totalDebit,
      totalCredit,
      shareUrl,
      businessName: `${biz.nameUr} (${biz.nameEn})`,
    });
    window.open(url, '_blank');
  };

  const handleCopyWhatsAppText = () => {
    const bizName = `${biz.nameUr} (${biz.nameEn})`;
    const balText =
      finalBalance < 0
        ? `پیشگی جمع رقم (Advance Balance with Us): Rs ${Math.abs(finalBalance).toLocaleString()}`
        : `کل واجب الادا بقایا (Net Balance Due): Rs ${finalBalance.toLocaleString()}`;

    const text = [
      `*${bizName} - کھاتہ اسٹیٹمنٹ*`,
      `--------------------------------`,
      `*${kindEn} / کھاتہ دار:* ${partyLabel}`,
      `*تاریخ / Period:* ${startDate} تا ${endDate}`,
      `--------------------------------`,
      `*کل نام (Debit):* Rs ${totalDebit.toLocaleString()}`,
      `*کل جمع (Credit):* Rs ${totalCredit.toLocaleString()}`,
      `--------------------------------`,
      `*${balText}*`,
      `--------------------------------`,
      `شکریہ! برائے تصدیق رابطہ فرمائیں۔`,
    ].join('\n');

    navigator.clipboard.writeText(text);
    setCopiedNotice(true);
    setTimeout(() => setCopiedNotice(false), 3000);
  };

  const handleDownloadPDF = async () => {
    try {
      const logoDataUrl = await loadLogoDataUrl(biz.logoUrl);
      const doc = generateLedgerPDF(
        party,
        entries,
        startDate,
        endDate,
        brandingFromSettings(biz, logoDataUrl)
      );
      doc.save(
        `Ledger_${party.name.replace(/\s+/g, '_')}_${startDate}_${endDate}.pdf`
      );
    } catch (err) {
      console.error('PDF generation error:', err);
      alert('Could not download PDF. Opening print dialog instead.');
      window.print();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="no-print bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-sm font-extrabold">
                {isUrdu ? `${kindEn} کھاتہ پرنٹ، پی ڈی ایف و واٹس ایپ` : `${kindEn} Ledger Statement Print & PDF`}
              </h3>
              <span className="text-[11px] text-slate-400">
                {partyLabel} ({startDate} - {endDate})
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Ledger Area */}
        <div className="p-4 max-h-[65vh] overflow-y-auto bg-slate-100 flex justify-center">
          <div className="print-page-a4 w-full bg-white p-6 shadow-sm border border-slate-300 rounded text-slate-900 text-xs">
            {/* Official header */}
            <div className="border-b-2 border-amber-600 pb-3 mb-4 text-center">
              <p className="font-urdu text-sm font-bold text-slate-800">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>
              <div className="flex justify-center my-1">
                <img src={biz.logoUrl} alt={biz.nameEn} className="h-14 object-contain" />
              </div>
              <h2 className="text-base font-black text-amber-800 uppercase">{biz.nameEn}</h2>
              {biz.nameUr && (
                <p className="font-urdu text-xs font-semibold text-slate-700">
                  {biz.nameUr} — کھاتہ رجسٹر و مکمل اسٹیٹمنٹ
                </p>
              )}
              {(biz.phone || biz.city) && (
                <p className="text-[10px] text-slate-500" dir="ltr">
                  {[biz.phone, biz.city].filter(Boolean).join(' | ')}
                </p>
              )}
            </div>

            {/* Party Info Box */}
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase">
                  {kindEn} / Khata:
                </span>
                <h3 className="font-bold text-slate-900 text-sm">
                  {party.urduName ? `${party.urduName} (${party.name})` : party.name}
                </h3>
                <p className="text-[10px] text-slate-600">Phone: {party.phone || '-'}</p>
                <p className="text-[10px] text-slate-600">
                  Address: {party.address || party.city || 'Lahore'}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-500 uppercase">
                  Statement Period:
                </span>
                <p className="font-mono text-slate-800 font-bold">
                  {startDate} to {endDate}
                </p>
                <div className="mt-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">
                    Current Balance:
                  </span>
                  <span
                    className={`font-mono font-black text-sm ${
                      finalBalance < 0 ? 'text-emerald-700' : 'text-slate-900'
                    }`}
                  >
                    {finalBalance < 0
                      ? `-Rs ${Math.abs(finalBalance).toLocaleString()} (Adv)`
                      : `Rs ${finalBalance.toLocaleString()}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Table */}
            <table className="w-full text-xs border-collapse mb-4 border border-slate-200">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Description</th>
                  <th className="p-2 text-center">Ref</th>
                  <th className="p-2 text-right">Debit (Naam)</th>
                  <th className="p-2 text-right">Credit (Jama)</th>
                  <th className="p-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="p-2 font-mono text-[11px]">{e.entryDate}</td>
                    <td className="p-2 font-medium">{e.detail}</td>
                    <td className="p-2 text-center font-mono text-[10px] text-slate-500">
                      {e.folioNo || '-'}
                    </td>
                    <td className="p-2 text-right font-mono text-rose-700 font-semibold">
                      {e.debit > 0 ? e.debit.toLocaleString() : '-'}
                    </td>
                    <td className="p-2 text-right font-mono text-emerald-700 font-semibold">
                      {e.credit > 0 ? e.credit.toLocaleString() : '-'}
                    </td>
                    <td className="p-2 text-right font-mono font-bold">
                      {e.runningBalance < 0
                        ? `-${Math.abs(e.runningBalance).toLocaleString()} Adv`
                        : e.runningBalance.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold border-t border-slate-300">
                  <td colSpan={3} className="p-2 text-center">
                    Summary Totals:
                  </td>
                  <td className="p-2 text-right font-mono text-rose-800">
                    Rs {totalDebit.toLocaleString()}
                  </td>
                  <td className="p-2 text-right font-mono text-emerald-800">
                    Rs {totalCredit.toLocaleString()}
                  </td>
                  <td
                    className={`p-2 text-right font-mono font-black ${
                      finalBalance < 0 ? 'text-emerald-700' : 'text-slate-900'
                    }`}
                  >
                    {finalBalance < 0
                      ? `-Rs ${Math.abs(finalBalance).toLocaleString()} Adv`
                      : `Rs ${finalBalance.toLocaleString()}`}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Signatures */}
            <div className="grid grid-cols-2 gap-8 pt-8 mt-4 border-t border-slate-200 text-center text-[10px] text-slate-500">
              <div>
                <div className="w-32 mx-auto border-b border-slate-400 mb-1"></div>
                <p>{isUrdu ? 'دستخط کھاتہ دار' : 'Account Holder Signature'}</p>
              </div>
              <div>
                <div className="w-32 mx-auto border-b border-slate-400 mb-1"></div>
                <p>{isUrdu ? 'دستخط منشی / مالک' : 'Authorized Signature'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="no-print p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyWhatsAppText}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
            >
              {copiedNotice ? (
                <Check className="w-4 h-4 text-emerald-600" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              <span>
                {copiedNotice
                  ? isUrdu
                    ? 'کاپی ہوگیا!'
                    : 'Copied!'
                  : isUrdu
                  ? 'واٹس ایپ متن کاپی'
                  : 'Copy WhatsApp Text'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleWhatsAppShare}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm"
            >
              <Share2 className="w-4 h-4" />
              <span>{isUrdu ? 'واٹس ایپ پر بھیجیں' : 'Send on WhatsApp'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPDF}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>{isUrdu ? 'پی ڈی ایف ڈاؤن لوڈ' : 'Download PDF'}</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-md"
            >
              <Printer className="w-4 h-4 text-emerald-400" />
              <span>{isUrdu ? 'ابھی پرنٹ کریں' : 'Print Statement Now'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
