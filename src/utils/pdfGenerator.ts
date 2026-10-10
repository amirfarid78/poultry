import { jsPDF } from 'jspdf';
import { Invoice, Party, LedgerEntry } from '../types';
import { formatPKR } from './calculations';

/**
 * Generates an official printable PDF for a Poultry Sale Invoice
 */
export function generateInvoicePDF(invoice: Invoice, businessName = 'Murgh Mandi Poultry (مرغ منڈی)'): jsPDF {
  // A5 format is standard for wholesale invoices (148 x 210 mm)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a5'
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Header Banner
  doc.setFillColor(22, 101, 52); // Emerald 800
  doc.rect(0, 0, pageWidth, 24, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('MURGH MANDI POULTRY TRADERS', pageWidth / 2, 9, { align: 'center' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Wholesale Broiler Chicken & Khata System | Lahore, Pakistan', pageWidth / 2, 14, { align: 'center' });
  doc.text('Phone: 0300-1234567 | NTN: 8923412-1', pageWidth / 2, 18, { align: 'center' });

  // Sub Header: Invoice Details
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`INVOICE #: ${invoice.invoiceNumber}`, 10, 32);
  doc.text(`DATE: ${invoice.invoiceDate}`, pageWidth - 10, 32, { align: 'right' });

  // Customer Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(10, 36, pageWidth - 20, 18, 2, 2, 'FD');

  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('Customer / Shop:', 14, 42);
  doc.text('Previous Balance:', pageWidth - 14, 42, { align: 'right' });

  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(invoice.customerName || invoice.customerUrduName, 14, 48);

  const prevBalStr = invoice.previousBalance < 0 
    ? `-Rs ${Math.abs(invoice.previousBalance).toLocaleString()} (Adv)` 
    : `Rs ${invoice.previousBalance.toLocaleString()}`;
  doc.text(prevBalStr, pageWidth - 14, 48, { align: 'right' });

  // Line Items Table Header
  doc.setFillColor(241, 245, 249);
  doc.rect(10, 58, pageWidth - 20, 7, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.line(10, 65, pageWidth - 10, 65);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('ITEM DESCRIPTION', 14, 63);
  doc.text('WEIGHT (KG)', 65, 63, { align: 'right' });
  doc.text('RATE / 40KG', 95, 63, { align: 'right' });
  doc.text('TOTAL (PKR)', pageWidth - 14, 63, { align: 'right' });

  // Table Row
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`Broiler Live Chicken (${invoice.birdCount || 40} birds)`, 14, 72);
  doc.text(`${invoice.netWeightKg} kg`, 65, 72, { align: 'right' });
  doc.text(`Rs ${invoice.saleRatePer40kg.toLocaleString()}`, 95, 72, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.text(`Rs ${invoice.totalAmount.toLocaleString()}`, pageWidth - 14, 72, { align: 'right' });

  doc.line(10, 76, pageWidth - 10, 76);

  // Bill Summary Block
  let currentY = 82;
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
  businessName = 'Murgh Mandi Poultry (مرغ منڈی)'
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Header Banner
  doc.setFillColor(22, 101, 52); // Emerald 800
  doc.rect(0, 0, pageWidth, 26, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('MURGH MANDI POULTRY & KHATA SYSTEM', pageWidth / 2, 10, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Customer Khata Statement (کھاتہ اسٹیٹمنٹ)', pageWidth / 2, 16, { align: 'center' });
  doc.text(`Period: ${startDate} to ${endDate} | Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, 21, { align: 'center' });

  // Customer Summary Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, 32, pageWidth - 28, 20, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(party.name, 18, 40);
  if (party.urduName) {
    doc.text(party.urduName, 18, 46);
  }

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Phone: ${party.phone || '-'} | City: ${party.city || 'Lahore'}`, 18, 50);

  const curBalStr = party.currentBalance < 0 
    ? `-Rs ${Math.abs(party.currentBalance).toLocaleString()} (Advance)` 
    : `Rs ${party.currentBalance.toLocaleString()}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(party.currentBalance < 0 ? 5 : 190, party.currentBalance < 0 ? 150 : 24, party.currentBalance < 0 ? 105 : 93);
  doc.text(`Current Balance: ${curBalStr}`, pageWidth - 18, 44, { align: 'right' });

  // Ledger Table Header
  let y = 58;
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
