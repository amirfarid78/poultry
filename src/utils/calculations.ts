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
  chargesTotal?: number; // Extra charges (labour, loading, custom) added to the bill
  discountAmount?: number; // Flat discount in Rs, subtracted from the bill
}

export interface InvoiceCalcResult {
  netWeightKg: number;
  birdTotal: number; // Sale value of the birds only
  chargesTotal: number;
  discountAmount: number; // Flat discount actually applied (clamped to the bill)
  totalAmount: number; // birdTotal + chargesTotal - discountAmount
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
  
  // Bird total = (Rate * Kilo) / 40 rounded to nearest Rupee
  const birdTotal = Math.round((input.saleRate * netWeightKg) / divisor);
  const chargesTotal = Math.max(0, Math.round(input.chargesTotal || 0));
  // Flat discount: never negative, never more than the bill itself.
  const discountAmount = Math.min(
    Math.max(0, Math.round(input.discountAmount || 0)),
    birdTotal + chargesTotal
  );
  const totalAmount = birdTotal + chargesTotal - discountAmount;
  
  const totalReceived = Math.round((input.receivedCash || 0) + (input.receivedAC || 0));
  
  // A(this row) = A(previous row) + D - C - B
  const newBalance = Math.round(input.previousBalance + totalAmount - totalReceived);
  
  const marginPer40kg = input.saleRate - input.mandiRate;
  const netMarginTotal = Math.round((marginPer40kg * netWeightKg) / divisor);
  
  return {
    netWeightKg,
    birdTotal,
    chargesTotal,
    discountAmount,
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
 * True only for a real Pakistani MOBILE number: after normalization it must
 * start with '923' and be exactly 12 digits. Landlines (e.g. '042...',
 * which normalizePakistanPhone returns unchanged) fail this check, so a
 * wa.me link is never built for a number WhatsApp cannot reach.
 * normalizePakistanPhone itself is unchanged — other callers depend on it.
 */
export function isValidMobilePK(phone: string): boolean {
  const norm = normalizePakistanPhone(phone);
  return norm.startsWith('923') && norm.length === 12 && /^\d+$/.test(norm);
}

/** WhatsApp-ready number, or '' when the phone is not a valid PK mobile. */
export function toWhatsAppNumber(phone: string): string {
  return isValidMobilePK(phone) ? normalizePakistanPhone(phone) : '';
}

/** Format a Date as YYYY-MM-DD in Asia/Karachi (en-CA gives ISO order). */
export function toPKTDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Today's date in Asia/Karachi as YYYY-MM-DD. */
export function todayPKT(): string {
  return toPKTDate(new Date());
}

export interface AgingEntry {
  entryDate: string; // YYYY-MM-DD
  debit: number;
  credit: number;
  isVoid?: boolean;
}

export interface AgingBuckets {
  current: number; // 0-7 days old
  days8to15: number;
  days16to30: number;
  days30plus: number;
}

const parseISODate = (s: string): number => {
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return NaN;
  return Date.UTC(y, m - 1, d);
};

/**
 * FIFO aging buckets for one party's ledger. Non-void debit entries are
 * lots (oldest first); credits, in chronological order, consume the oldest
 * lots first. Whatever is left in each lot is bucketed by its age in days
 * vs `today` (0-7 current, 8-15, 16-30, 30+). Pure function.
 */
export function computeAgingBuckets(
  entries: AgingEntry[],
  today: string
): AgingBuckets {
  const todayMs = parseISODate(today);
  const lots: { dateMs: number; amount: number }[] = [];
  for (const e of entries) {
    if (e.isVoid) continue;
    const debit = e.debit || 0;
    if (debit > 0) {
      const dateMs = parseISODate(e.entryDate);
      if (!Number.isNaN(dateMs)) lots.push({ dateMs, amount: debit });
    }
  }
  lots.sort((a, b) => a.dateMs - b.dateMs);

  // Credits consume the oldest lots first (FIFO), in chronological order.
  const credits = entries
    .filter((e) => !e.isVoid && (e.credit || 0) > 0)
    .map((e) => ({ dateMs: parseISODate(e.entryDate), amount: e.credit || 0 }))
    .filter((c) => !Number.isNaN(c.dateMs))
    .sort((a, b) => a.dateMs - b.dateMs);
  let lotIdx = 0;
  for (const c of credits) {
    let remaining = c.amount;
    while (remaining > 0 && lotIdx < lots.length) {
      const take = Math.min(lots[lotIdx].amount, remaining);
      lots[lotIdx].amount -= take;
      remaining -= take;
      if (lots[lotIdx].amount <= 0) lotIdx++;
    }
  }

  const buckets: AgingBuckets = { current: 0, days8to15: 0, days16to30: 0, days30plus: 0 };
  if (Number.isNaN(todayMs)) return buckets;
  for (const lot of lots) {
    if (lot.amount <= 0) continue;
    const ageDays = Math.floor((todayMs - lot.dateMs) / 86400000);
    if (ageDays <= 7) buckets.current += lot.amount;
    else if (ageDays <= 15) buckets.days8to15 += lot.amount;
    else if (ageDays <= 30) buckets.days16to30 += lot.amount;
    else buckets.days30plus += lot.amount;
  }
  return buckets;
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
  charges?: Array<{ name: string; amount: number }>;
  discountAmount?: number;
}): string {
  const normPhone = normalizePakistanPhone(data.phone);
  const bizName = data.businessName || 'نواز پولٹری (Nawaz Poultry)';
  const totRec = data.receivedCash + data.receivedAC;
  const charges = (data.charges ?? []).filter((c) => (c.amount || 0) > 0);
  const discountAmount = Math.max(0, Math.round(data.discountAmount || 0));
  // Gross bird value: total is already net of discount, so add it back.
  const birdTotal = data.total - charges.reduce((s, c) => s + c.amount, 0) + discountAmount;
  
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
    charges.length > 0 || discountAmount > 0 ? `*مرغی کی رقم / Birds Total:* Rs ${birdTotal.toLocaleString()}` : null,
    ...charges.map((c) => `*${c.name}:* Rs ${c.amount.toLocaleString()}`),
    discountAmount > 0 ? `*رعایت / Discount:* -Rs ${discountAmount.toLocaleString()}` : null,
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

import type { Invoice, Purchase, ReceiptVoucher } from '../types';

export interface TodayKpis {
  todaySalesAmount: number;
  todaySalesKg: number;
  todayCollections: number;
}

/**
 * "Today" dashboard KPIs, derived from the synced document collections.
 *
 * They must NOT come from dayClosing: dayClosing is a per-machine
 * accumulator — it only grows on the machine where the sale was entered,
 * and every refresh overwrites it with the stale server roznamcha. On any
 * other machine the dashboard showed Rs 0 for today's sales while the
 * reports table on the same page listed today's invoices. Invoices and
 * receipts sync, so deriving from them is correct on every machine.
 *
 * Collections mirror the dayClosing accumulation exactly: customer receipts
 * dated today, plus cash/account received at the point of sale on today's
 * invoices. Voided documents are excluded on both sides. `todayStr` uses
 * the same UTC date string the app stamps on invoices/receipts, so the
 * KPIs always agree with the trend charts and the reports table.
 * `liveInvoices` must already exclude voided invoices.
 */
export function computeTodayKpis(
  liveInvoices: Invoice[],
  receipts: ReceiptVoucher[],
  todayStr: string
): TodayKpis {
  const todayInvoices = liveInvoices.filter((inv) => inv.invoiceDate === todayStr);
  return {
    todaySalesAmount: todayInvoices.reduce((s, inv) => s + (inv.totalAmount || 0), 0),
    todaySalesKg: todayInvoices.reduce((s, inv) => s + (inv.netWeightKg || 0), 0),
    todayCollections:
      receipts
        .filter((r) => !r.isVoid && r.partyType === 'customer' && r.receiptDate === todayStr)
        .reduce((s, r) => s + (r.amount || 0), 0) +
      todayInvoices.reduce((s, inv) => s + (inv.receivedCash || 0) + (inv.receivedAC || 0), 0),
  };
}

export interface FifoInvoiceProfit {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  kg: number;
  revenue: number; // totalAmount (bird value + extra charges)
  birdRevenue: number; // totalAmount - chargesTotal
  charges: number; // extra charges (labour/loading) — service income, no purchase cost
  cogs: number; // FIFO purchase cost of the kg sold (rounded Rs)
  profit: number; // revenue - cogs
  purchaseSaving: number; // (mandi - purchase) x kg / 40 — buying below mandi
  saleMargin: number; // (sale - mandi) x kg / 40 — selling above mandi
  estimatedKg: number; // kg with no purchase history, costed at the mandi proxy
  isEstimate: boolean;
}

export interface FifoProfitTotals {
  revenue: number;
  cogs: number;
  profit: number;
  purchaseSaving: number;
  saleMargin: number;
  charges: number;
  soldKg: number;
  estimatedKg: number;
  isEstimate: boolean;
}

export interface FifoClosingStock {
  kg: number; // kg left in purchase lots (unsold)
  value: number; // at lot purchase costs (rounded Rs)
  avgCostPerKg: number; // 0 when no lots remain
}

export interface FifoProfitResult {
  perInvoice: FifoInvoiceProfit[];
  totals: FifoProfitTotals;
  closingStock: FifoClosingStock;
}

/**
 * TRUE profit on ACTUAL purchase cost, allocated FIFO (oldest purchase
 * lot first). The mandi rate is a reference only — never the cost basis.
 *
 * For each non-void invoice, in chronological order, the kg sold is drawn
 * from the oldest purchase lot bought on or before the invoice date
 * (same-day purchase-then-sale is allowed). Per slice:
 *   cost           += kg x lotCostPerKg
 *   purchaseSaving += (mandiRate - lotRate) x kg / 40   (buying below mandi)
 *   saleMargin     += (saleRate - mandiRate) x kg / 40  (selling above mandi)
 * so that profit = purchaseSaving + saleMargin + charges, exactly:
 * revenue - cogs = (sale - cost) x kg / 40 + charges.
 *
 * Example (the user's): buy 40 kg @ Rs 12,000, mandi Rs 15,000, sell
 * @ Rs 20,000 → cost 12,000, purchaseSaving 3,000, saleMargin 5,000,
 * profit 8,000.
 *
 * Sales with NO purchase history (sold before any eligible lot, or lots
 * run out) are costed at the invoice's own mandi rate as a proxy, with
 * purchaseSaving 0 for that kg, and flagged isEstimate — the UI must
 * label such profit as an estimate, never a silently invented rate.
 * Voided invoices are excluded. Mortality is NOT in COGS (it is not a
 * sale) — it is expensed separately via the Dr 5040 mortality JV.
 * `liveInvoices` should already exclude voided invoices; the helper
 * skips isVoid defensively.
 */
export function computeFifoProfit(
  liveInvoices: Invoice[],
  purchases: Purchase[]
): FifoProfitResult {
  interface Lot {
    date: string;
    createdAt: string;
    kg: number;
    costPerKg: number;
    ratePer40kg: number;
  }
  const lots: Lot[] = (purchases ?? [])
    .filter((p) => !p.isVoid && (p.netWeightKg || 0) > 0)
    .map((p) => ({
      date: p.purchaseDate || '',
      createdAt: p.createdAt || '',
      kg: p.netWeightKg || 0,
      costPerKg: (p.ratePer40kg || 0) / 40,
      ratePer40kg: p.ratePer40kg || 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  const sales = (liveInvoices ?? [])
    .filter((i) => !i.isVoid && (i.netWeightKg || 0) > 0)
    .sort(
      (a, b) =>
        a.invoiceDate.localeCompare(b.invoiceDate) ||
        (a.createdAt || '').localeCompare(b.createdAt || '')
    );

  // Lots are chronological; eligibleEnd only grows as invoices advance:
  // lots[0..eligibleEnd) were bought on or before the current invoice date.
  let lotIdx = 0;
  let eligibleEnd = 0;
  const perInvoice: FifoInvoiceProfit[] = [];

  for (const inv of sales) {
    const kg = inv.netWeightKg || 0;
    const mandi = inv.mandiRatePer40kg || 0;
    const sale = inv.saleRatePer40kg || 0;
    const charges = inv.chargesTotal || 0;
    const revenue = inv.totalAmount || 0;
    while (eligibleEnd < lots.length && lots[eligibleEnd].date <= inv.invoiceDate) eligibleEnd++;

    let remaining = kg;
    let rawCogs = 0;
    let rawSaving = 0;
    let estimatedKg = 0;
    while (remaining > 1e-9 && lotIdx < eligibleEnd) {
      const lot = lots[lotIdx];
      if (lot.kg <= 1e-9) {
        lotIdx++;
        continue;
      }
      const take = Math.min(lot.kg, remaining);
      rawCogs += take * lot.costPerKg;
      rawSaving += ((mandi - lot.ratePer40kg) * take) / 40;
      lot.kg -= take;
      remaining -= take;
      if (lot.kg <= 1e-9) lotIdx++;
    }
    if (remaining > 1e-9) {
      // No purchase history for this kg: mandi-rate proxy, no saving.
      rawCogs += (remaining * mandi) / 40;
      estimatedKg = remaining;
    }
    const cogs = Math.round(rawCogs);
    const profit = revenue - cogs;
    const purchaseSaving = Math.round(rawSaving);
    // saleMargin is the remainder so saving + margin + charges == profit
    // exactly (up to rounding) in every display.
    const saleMargin = profit - charges - purchaseSaving;
    perInvoice.push({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      kg,
      revenue,
      birdRevenue: revenue - charges,
      charges,
      cogs,
      profit,
      purchaseSaving,
      saleMargin,
      estimatedKg,
      isEstimate: estimatedKg > 0,
    });
  }

  const totals: FifoProfitTotals = {
    revenue: perInvoice.reduce((s, r) => s + r.revenue, 0),
    cogs: perInvoice.reduce((s, r) => s + r.cogs, 0),
    profit: perInvoice.reduce((s, r) => s + r.profit, 0),
    purchaseSaving: perInvoice.reduce((s, r) => s + r.purchaseSaving, 0),
    saleMargin: perInvoice.reduce((s, r) => s + r.saleMargin, 0),
    charges: perInvoice.reduce((s, r) => s + r.charges, 0),
    soldKg: perInvoice.reduce((s, r) => s + r.kg, 0),
    estimatedKg: perInvoice.reduce((s, r) => s + r.estimatedKg, 0),
    isEstimate: perInvoice.some((r) => r.isEstimate),
  };

  const closingKg = lots.reduce((s, l) => s + Math.max(0, l.kg), 0);
  const closingValue = Math.round(
    lots.reduce((s, l) => s + Math.max(0, l.kg) * l.costPerKg, 0)
  );
  const closingStock: FifoClosingStock = {
    kg: closingKg,
    value: closingValue,
    avgCostPerKg: closingKg > 0 ? closingValue / closingKg : 0,
  };

  return { perInvoice, totals, closingStock };
}
