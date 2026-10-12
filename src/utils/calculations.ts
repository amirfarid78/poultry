/**
 * Pakistani Poultry Mathematical Engine & Localized Helpers
 * Verified against reference sheets:
 * Total = (Rate * Kilo) / 40
 * Running Balance = Previous Balance + Total - Cash Received - AC Payment
 */

export interface InvoiceCalcInput {
  mandiRate: number;
  saleRate: number;
  weightKg: number;
  shrinkageKg?: number;
  divisor?: number;
  previousBalance: number;
  receivedCash: number;
  receivedAC: number;
}

export interface InvoiceCalcResult {
  netWeightKg: number;
  totalAmount: number;
  totalReceived: number;
  marginPer40kg: number;
  netMarginTotal: number;
  newBalance: number;
  isAdvance: boolean; // negative balance
}

/**
 * Calculates poultry sale total and running balance
 */
export function calculateInvoice(input: InvoiceCalcInput): InvoiceCalcResult {
  const divisor = input.divisor && input.divisor > 0 ? input.divisor : 40;
  const shrinkage = input.shrinkageKg || 0;
  const netWeightKg = Math.max(0, input.weightKg - shrinkage);
  
  // Total = (Rate * Kilo) / 40 rounded to nearest Rupee
  const totalAmount = Math.round((input.saleRate * netWeightKg) / divisor);
  
  const totalReceived = Math.round((input.receivedCash || 0) + (input.receivedAC || 0));
  
  // A(this row) = A(previous row) + D - C - B
  const newBalance = Math.round(input.previousBalance + totalAmount - totalReceived);
  
  const marginPer40kg = input.saleRate - input.mandiRate;
  const netMarginTotal = Math.round((marginPer40kg * netWeightKg) / divisor);
  
  return {
    netWeightKg,
    totalAmount,
    totalReceived,
    marginPer40kg,
    netMarginTotal,
    newBalance,
    isAdvance: newBalance < 0
  };
}

/**
 * Normalizes any Pakistani mobile number format:
 * "03001234567" -> "923001234567"
 * "+923001234567" -> "923001234567"
 * "00923001234567" -> "923001234567"
 * "300 1234567" -> "923001234567"
 */
export function normalizePakistanPhone(phone: string): string {
  if (!phone) return '';
  // Strip all non-digits
  let clean = phone.replace(/\D/g, '');
  
  if (clean.startsWith('0092')) {
    clean = clean.substring(2);
  } else if (clean.startsWith('03')) {
    clean = '92' + clean.substring(1);
  } else if (clean.startsWith('3') && clean.length === 10) {
    clean = '92' + clean;
  }
  
  return clean;
}

/**
 * Formats a number in Pakistani Rupee format with commas
 */
export function formatPKR(val: number, includeSymbol = true, lang: 'en' | 'ur' = 'en'): string {
  const isNeg = val < 0;
  const absVal = Math.abs(Math.round(val));
  const formatted = absVal.toLocaleString('en-US');
  
  if (lang === 'ur') {
    if (includeSymbol) {
      return isNeg ? `${formatted}- روپے (پیشگی)` : `${formatted} روپے`;
    }
    return isNeg ? `${formatted}-` : formatted;
  }
  
  if (includeSymbol) {
    return isNeg ? `-Rs ${formatted} (Adv)` : `Rs ${formatted}`;
  }
  return isNeg ? `-${formatted}` : formatted;
}

/**
 * Generates direct wa.me WhatsApp URL with bilingual formatted message
 */
export function generateInvoiceWhatsAppUrl(data: {
  phone: string;
  customerName: string;
  invoiceNumber: string;
  date: string;
  mandiRate: number;
  saleRate: number;
  kilo: number;
  total: number;
  receivedCash: number;
  receivedAC: number;
  previousBalance: number;
  newBalance: number;
  businessName?: string;
  shareUrl?: string;
  lang?: 'en' | 'ur';
}): string {
  const normPhone = normalizePakistanPhone(data.phone);
  const bizName = data.businessName || 'نواز پولٹری (Nawaz Poultry)';
  const totRec = data.receivedCash + data.receivedAC;
  
  const balanceNote = data.newBalance < 0 
    ? `بقایا / پیشگی (Advance with Us): Rs ${Math.abs(data.newBalance).toLocaleString()} (Credit)`
    : `بقایا واجب الادا (Net Balance Payable): Rs ${data.newBalance.toLocaleString()}`;

  const message = [
    `*${bizName}*`,
    `--------------------------------`,
    `*بل نمبر / Invoice #:* ${data.invoiceNumber}`,
    `*تاریخ / Date:* ${data.date}`,
    `*گاہک / Customer:* ${data.customerName}`,
    `--------------------------------`,
    `*وزن / Weight:* ${data.kilo} kg`,
    `*ریٹ فی 40 کلو / Rate:* Rs ${data.saleRate.toLocaleString()}/40kg`,
    `*کل رقم / Total Bill:* Rs ${data.total.toLocaleString()}`,
    `--------------------------------`,
    `*نقد وصولی / Cash Received:* Rs ${data.receivedCash.toLocaleString()}`,
    data.receivedAC > 0 ? `*آن لائن وصولی / AC Payment:* Rs ${data.receivedAC.toLocaleString()}` : null,
    `*کل وصولی / Total Paid:* Rs ${totRec.toLocaleString()}`,
    `--------------------------------`,
    `*سابقہ بقایا / Previous Balance:* Rs ${data.previousBalance.toLocaleString()}`,
    `*${balanceNote}*`,
    `--------------------------------`,
    data.shareUrl ? `📱 آن لائن بل دیکھنے کے لیے لنک:\n${data.shareUrl}` : null,
    `شکریہ! آپ کے کاروبار کا اعتماد ہمارا سرمایہ ہے۔`
  ].filter(Boolean).join('\n');

  return `https://wa.me/${normPhone}?text=${encodeURIComponent(message)}`;
}

/**
 * Generates WhatsApp URL for Party Ledger Statement
 */
export function generateLedgerWhatsAppUrl(data: {
  phone: string;
  partyName: string;
  asOfDate: string;
  currentBalance: number;
  totalDebit: number;
  totalCredit: number;
  businessName?: string;
  shareUrl?: string;
}): string {
  const normPhone = normalizePakistanPhone(data.phone);
  const bizName = data.businessName || 'نواز پولٹری (Nawaz Poultry)';
  
  const balText = data.currentBalance < 0
    ? `آپ کی پیشگی جمع رقم (Advance Balance): Rs ${Math.abs(data.currentBalance).toLocaleString()}`
    : `آپ کے ذمے کل بقایا (Total Balance Due): Rs ${data.currentBalance.toLocaleString()}`;

  const message = [
    `*${bizName} - کھاتہ اسٹیٹمنٹ*`,
    `--------------------------------`,
    `*گاہک / Party:* ${data.partyName}`,
    `*تاریخ / Date:* ${data.asOfDate}`,
    `--------------------------------`,
    `*کل مال کی رقم (Debit):* Rs ${data.totalDebit.toLocaleString()}`,
    `*کل وصول شدہ رقم (Credit):* Rs ${data.totalCredit.toLocaleString()}`,
    `--------------------------------`,
    `*${balText}*`,
    `--------------------------------`,
    data.shareUrl ? `📱 مکمل کھاتہ تفصیل لنک:\n${data.shareUrl}` : null,
    `کسی بھی تصدیق کے لیے رابطہ فرمائیں۔ شکریہ!`
  ].filter(Boolean).join('\n');

  return `https://wa.me/${normPhone}?text=${encodeURIComponent(message)}`;
}
