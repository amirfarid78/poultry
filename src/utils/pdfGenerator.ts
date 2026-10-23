import { jsPDF } from 'jspdf';
import { Invoice, Party, LedgerEntry, BusinessSettings } from '../types';
import { formatPKR } from './calculations';

/** Branding passed to PDF generators. logoDataUrl is a PNG/JPEG data URL (or undefined). */
export interface PdfBranding {
  nameEn: string;
  nameUr: string;
  tagline: string;
  phone: string;
  address: string;
  city: string;
  logoDataUrl?: string;
}

export function brandingFromSettings(s: BusinessSettings, logoDataUrl?: string): PdfBranding {
  return {
    nameEn: s.nameEn,
    nameUr: s.nameUr,
    tagline: s.tagline,
    phone: s.phone,
    address: s.address,
    city: s.city,
    logoDataUrl,
  };
}

const logoCache = new Map<string, string | undefined>();

/** Fetch a logo URL (relative path or data URL) and return a data URL for jsPDF. Cached. */
export async function loadLogoDataUrl(logoUrl: string): Promise<string | undefined> {
  if (!logoUrl) return undefined;
  if (logoUrl.startsWith('data:')) return logoUrl;
  if (logoCache.has(logoUrl)) return logoCache.get(logoUrl);
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) throw new Error('logo fetch failed');
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    logoCache.set(logoUrl, dataUrl);
    return dataUrl;
  } catch {
    logoCache.set(logoUrl, undefined);
    return undefined;
  }
}

const GOLD: [number, number, number] = [184, 134, 11];      // dark gold #B8860B
const GOLD_LIGHT: [number, number, number] = [253, 246, 227]; // pale gold wash
const INK: [number, number, number] = [30, 41, 59];

/** Shared letterhead: logo left, business name + contact right, gold rule below. Returns y below the rule. */
function drawLetterhead(
  doc: jsPDF,
  branding: PdfBranding | undefined,
  pageWidth: number,
  opts: { titleEn: string; titleUr?: string; subtitle?: string } = { titleEn: 'SALE INVOICE' }
): number {
  const b: PdfBranding = branding ?? {
    nameEn: 'Nawaz Poultry',
    nameUr: 'نواز پولٹری',
    tagline: 'Since 1995',
    phone: '',
    address: '',
    city: 'Lahore',
  };

  let y = 8;
  const logoW = 26;
  const logoH = 20;
  if (b.logoDataUrl) {
    try {
      doc.addImage(b.logoDataUrl, 'PNG', 10, y - 2, logoW, logoH);
    } catch {
      /* logo decode failed — continue without it */
    }
  }
  const textX = b.logoDataUrl ? 10 + logoW + 4 : 10;

  doc.setTextColor(...GOLD);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(b.nameEn.toUpperCase(), textX, y + 4);
  y += 4;

  if (b.tagline) {
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(b.tagline, textX, y + 4);
    y += 4;
  }

  const contact = [b.phone, [b.address, b.city].filter(Boolean).join(', ')].filter(Boolean).join('  |  ');
  if (contact) {
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(7.5);
    doc.text(contact, textX, y + 4);
    y += 4;
  }

  y = Math.max(y + 6, 30);

  // Gold rule
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.8);
  doc.line(10, y, pageWidth - 10, y);
  y += 6;

  // Document title band
  doc.setFillColor(...GOLD_LIGHT);
  doc.roundedRect(10, y - 4, pageWidth - 20, 9, 1.5, 1.5, 'F');
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(opts.titleEn, pageWidth / 2, y + 2, { align: 'center' });
  y += 9;

  return y;
}

/**
 * Generates an official printable PDF for a Poultry Sale Invoice
 */
export function generateInvoicePDF(invoice: Invoice, branding?: PdfBranding): jsPDF {
  // A5 format is standard for wholesale invoices (148 x 210 mm)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a5'
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Letterhead with logo + business profile
  let y = drawLetterhead(doc, branding, pageWidth, { titleEn: 'SALE INVOICE (سیل انوائس)' });

  // Sub Header: Invoice Details
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`INVOICE #: ${invoice.invoiceNumber}`, 10, y);
  doc.text(`DATE: ${invoice.invoiceDate}`, pageWidth - 10, y, { align: 'right' });
  y += 4;

  // Customer Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(10, y, pageWidth - 20, 18, 2, 2, 'FD');

  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('Customer / Shop:', 14, y + 6);
  doc.text('Previous Balance:', pageWidth - 14, y + 6, { align: 'right' });

  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(invoice.customerName || invoice.customerUrduName, 14, y + 12);

  const prevBalStr = invoice.previousBalance < 0 
    ? `-Rs ${Math.abs(invoice.previousBalance).toLocaleString()} (Adv)` 
    : `Rs ${invoice.previousBalance.toLocaleString()}`;
  doc.text(prevBalStr, pageWidth - 14, y + 12, { align: 'right' });
  y += 18;

  // Line Items Table Header
  doc.setFillColor(241, 245, 249);
  doc.rect(10, y + 4, pageWidth - 20, 7, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.line(10, y + 11, pageWidth - 10, y + 11);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('ITEM DESCRIPTION', 14, y + 9);
  doc.text('WEIGHT (KG)', 65, y + 9, { align: 'right' });
  doc.text('RATE / 40KG', 95, y + 9, { align: 'right' });
  doc.text('TOTAL (PKR)', pageWidth - 14, y + 9, { align: 'right' });

  // Table Row
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  const invCharges = (invoice.charges ?? []).filter((c) => (c.amount || 0) > 0);
  const birdTotal = invoice.totalAmount - invCharges.reduce((s, c) => s + c.amount, 0);
  doc.text(`Broiler Live Chicken (${invoice.birdCount || 40} birds)`, 14, y + 18);
  doc.text(`${invoice.netWeightKg} kg`, 65, y + 18, { align: 'right' });
  doc.text(`Rs ${invoice.saleRatePer40kg.toLocaleString()}`, 95, y + 18, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.text(`Rs ${birdTotal.toLocaleString()}`, pageWidth - 14, y + 18, { align: 'right' });

  let chargeY = y + 18;
  for (const c of invCharges) {
    chargeY += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 53, 15);
    doc.text(`${c.name} (Extra charge)`, 14, chargeY);
    doc.setFont('helvetica', 'bold');
    doc.text(`Rs ${c.amount.toLocaleString()}`, pageWidth - 14, chargeY, { align: 'right' });
  }

  doc.line(10, chargeY + 4, pageWidth - 10, chargeY + 4);

  // Bill Summary Block
  let currentY = chargeY + 10;
  const totRec = (invoice.receivedCash || 0) + (invoice.receivedAC || 0);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Total Bill Amount (Rate x Kg / 40):', 60, currentY);
  doc.setFont('helvetica', 'bold');
  doc.text(`Rs ${invoice.totalAmount.toLocaleString()}`, pageWidth - 14, currentY, { align: 'right' });

  currentY += 6;
  doc.setFont('helvetica', 'normal');
  doc.text('Cash Received (Wasool):', 60, currentY);
  doc.text(`-Rs ${invoice.receivedCash.toLocaleString()}`, pageWidth - 14, currentY, { align: 'right' });

  if (invoice.receivedAC > 0) {
    currentY += 6;
    doc.text(`Account Payment (${invoice.acPaymentMode}):`, 60, currentY);
    doc.text(`-Rs ${invoice.receivedAC.toLocaleString()}`, pageWidth - 14, currentY, { align: 'right' });
  }

  currentY += 6;
  doc.text('Previous Balance:', 60, currentY);
  doc.text(prevBalStr, pageWidth - 14, currentY, { align: 'right' });

  // Highlight Box: New Balance
  currentY += 8;
  const isAdv = invoice.newBalance < 0;
  doc.setFillColor(isAdv ? 236 : 241, isAdv ? 253 : 245, isAdv ? 245 : 249);
  doc.setDrawColor(isAdv ? 16 : 71, isAdv ? 185 : 85, isAdv ? 129 : 105);
  doc.roundedRect(60, currentY - 4, pageWidth - 70, 11, 1.5, 1.5, 'FD');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(isAdv ? 4 : 15, isAdv ? 120 : 23, isAdv ? 87 : 42);
  doc.text(isAdv ? 'ADVANCE CREDIT (PESHGI):' : 'NET BALANCE PAYABLE:', 64, currentY + 3);
  const balFinal = isAdv 
    ? `-Rs ${Math.abs(invoice.newBalance).toLocaleString()}` 
    : `Rs ${invoice.newBalance.toLocaleString()}`;
  doc.text(balFinal, pageWidth - 14, currentY + 3, { align: 'right' });

  // Terms and Signatures
  currentY += 28;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('1. Please verify weight immediately upon delivery.', 10, currentY);
  doc.text('2. Payments reduce balance only upon official receipt.', 10, currentY + 4);

  doc.line(10, currentY + 20, 50, currentY + 20);
  doc.text('Customer Signature', 10, currentY + 24);

  doc.line(pageWidth - 50, currentY + 20, pageWidth - 10, currentY + 20);
  doc.text('Authorized Signatory', pageWidth - 50, currentY + 24);

  return doc;
}

/**
 * Generates an official printable PDF for a Customer Ledger Statement
 */
export function generateLedgerPDF(
  party: Party, 
  entries: LedgerEntry[], 
  startDate: string, 
  endDate: string,
  branding?: PdfBranding
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Letterhead with logo + business profile
  let y = drawLetterhead(doc, branding, pageWidth, { titleEn: 'CUSTOMER KHATA STATEMENT' });

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Period: ${startDate} to ${endDate}  |  Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, y, { align: 'center' });
  y += 6;

  // Customer Summary Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, y, pageWidth - 28, 20, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(party.name, 18, y + 8);
  if (party.urduName) {
    doc.text(party.urduName, 18, y + 14);
  }

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Phone: ${party.phone || '-'} | City: ${party.city || 'Lahore'}`, 18, y + 18);

  const curBalStr = party.currentBalance < 0 
    ? `-Rs ${Math.abs(party.currentBalance).toLocaleString()} (Advance)` 
    : `Rs ${party.currentBalance.toLocaleString()}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(party.currentBalance < 0 ? 5 : 190, party.currentBalance < 0 ? 150 : 24, party.currentBalance < 0 ? 105 : 93);
  doc.text(`Current Balance: ${curBalStr}`, pageWidth - 18, y + 12, { align: 'right' });
  y += 26;

  // Ledger Table Header
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, pageWidth - 28, 8, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.line(14, y + 8, pageWidth - 14, y + 8);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Date', 18, y + 5);
  doc.text('Description', 42, y + 5);
  doc.text('Mandi Rate', 95, y + 5);
  doc.text('Ref #', 120, y + 5);
  doc.text('Debit (Naam)', 146, y + 5, { align: 'right' });
  doc.text('Credit (Jama)', 168, y + 5, { align: 'right' });
  doc.text('Balance (PKR)', pageWidth - 18, y + 5, { align: 'right' });

  y += 13;
  let totDebit = 0;
  let totCredit = 0;

  // Entries
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);

  entries.forEach((e) => {
    totDebit += e.debit || 0;
    totCredit += e.credit || 0;

    if (y > 270) {
      doc.addPage();
      y = 20;
    }

    doc.text(e.entryDate, 18, y);
    doc.text(e.detail.substring(0, 30), 42, y);
    doc.text(e.mandiRate ? `Rs ${e.mandiRate.toLocaleString()}` : '-', 95, y);
    doc.text(e.folioNo || '-', 120, y);
    doc.text(e.debit > 0 ? e.debit.toLocaleString() : '-', 146, y, { align: 'right' });
    doc.text(e.credit > 0 ? e.credit.toLocaleString() : '-', 168, y, { align: 'right' });
    
    const isAdv = e.runningBalance < 0;
    const bStr = isAdv ? `-${Math.abs(e.runningBalance).toLocaleString()} Adv` : e.runningBalance.toLocaleString();
    doc.text(bStr, pageWidth - 18, y, { align: 'right' });

    doc.setDrawColor(241, 245, 249);
    doc.line(14, y + 2, pageWidth - 14, y + 2);
    y += 6;
  });

  // Table Totals
  y += 2;
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, pageWidth - 28, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Total Summary:', 42, y + 5);
  doc.text(`Rs ${totDebit.toLocaleString()}`, 146, y + 5, { align: 'right' });
  doc.text(`Rs ${totCredit.toLocaleString()}`, 168, y + 5, { align: 'right' });
  doc.text(curBalStr, pageWidth - 18, y + 5, { align: 'right' });

  return doc;
}
