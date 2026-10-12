import { AppState } from '../services/store';

// Helper to safely trigger a browser download
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// 1. Export Invoices to CSV
export function exportInvoicesToCSV(appState: AppState): void {
  const headers = [
    'Invoice Number',
    'Date',
    'Customer Name',
    'Customer Urdu Name',
    'Net Weight (Kg)',
    'Bird Count',
    'Mandi Rate / 40kg',
    'Sale Rate / 40kg',
    'Total Amount (PKR)',
    'Received Cash',
    'Received AC/Online',
    'Previous Balance',
    'New Balance',
    'Created By'
  ];

  const rows = appState.invoices.map((inv) => [
    inv.invoiceNumber,
    inv.invoiceDate,
    `"${(inv.customerName || '').replace(/"/g, '""')}"`,
    `"${(inv.customerUrduName || '').replace(/"/g, '""')}"`,
    inv.netWeightKg,
    inv.birdCount,
    inv.mandiRatePer40kg,
    inv.saleRatePer40kg,
    inv.totalAmount,
    inv.receivedCash,
    inv.receivedAC,
    inv.previousBalance,
    inv.newBalance,
    `"${(inv.createdBy || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadFile(csvContent, `Murgh_Mandi_Invoices_${dateStr}.csv`, 'text/csv;charset=utf-8;');
}

// 2. Export Customers & Ledgers to CSV
export function exportCustomersToCSV(appState: AppState): void {
  const headers = [
    'Party Type',
    'Name',
    'Urdu Name',
    'Phone',
    'WhatsApp',
    'City',
    'Address',
    'Opening Balance',
    'Current Balance (PKR)',
    'Balance Status',
    'Credit Limit',
    'Default Lot Kilo'
  ];

  const rows = appState.parties.map((p) => [
    p.partyType,
    `"${(p.name || '').replace(/"/g, '""')}"`,
    `"${(p.urduName || '').replace(/"/g, '""')}"`,
    `"${p.phone || ''}"`,
    `"${p.whatsapp || ''}"`,
    `"${p.city || ''}"`,
    `"${(p.address || '').replace(/"/g, '""')}"`,
    p.openingBalance,
    p.currentBalance,
    p.currentBalance < 0 ? 'Advance with Us' : p.currentBalance > 0 ? 'Receivable (Udhaar)' : 'Settled (Nill)',
    p.creditLimit,
    p.defaultKilo
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadFile(csvContent, `Murgh_Mandi_Khata_Parties_${dateStr}.csv`, 'text/csv;charset=utf-8;');
}

// 3. Export Expenses to CSV
export function exportExpensesToCSV(appState: AppState): void {
  const headers = [
    'Expense #',
    'Date',
    'Category',
    'Category Urdu',
    'Amount (PKR)',
    'Payment Mode',
    'Paid To',
    'Description',
    'Description Urdu'
  ];

  const rows = appState.expenses.map((e) => [
    e.expenseNumber,
    e.date,
    `"${e.categoryName}"`,
    `"${e.categoryUrduName}"`,
    e.amount,
    e.paymentMode,
    `"${(e.paidTo || '').replace(/"/g, '""')}"`,
    `"${(e.description || '').replace(/"/g, '""')}"`,
    `"${(e.descriptionUrdu || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadFile(csvContent, `Murgh_Mandi_Expenses_${dateStr}.csv`, 'text/csv;charset=utf-8;');
}

// 4. Export Inventory to CSV
export function exportInventoryToCSV(appState: AppState): void {
  const headers = [
    'Item Code',
    'Name',
    'Urdu Name',
    'Category',
    'Current Count',
    'Current Weight (Kg)',
    'Mann (40kg)',
    'Unit'
  ];

  const rows = appState.inventory.map((i) => [
    i.code,
    `"${i.name.replace(/"/g, '""')}"`,
    `"${i.urduName.replace(/"/g, '""')}"`,
    i.category,
    i.currentCount,
    i.currentWeightKg,
    (i.currentWeightKg / 40).toFixed(2),
    i.unit
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadFile(csvContent, `Murgh_Mandi_Inventory_${dateStr}.csv`, 'text/csv;charset=utf-8;');
}

// 5. Export Daily Sheet & Ugrahi to CSV
export function exportDailyUgrahiToCSV(appState: AppState): void {
  const headers = [
    'Receipt #',
    'Date',
    'Customer Name',
    'Party Type',
    'Amount (PKR)',
    'Payment Mode',
    'Collected By',
    'Previous Balance',
    'New Balance',
    'Notes'
  ];

  const rows = appState.receipts.map((r) => {
    const party = appState.parties.find(p => p.id === r.partyId);
    return [
      r.receiptNumber,
      r.receiptDate,
      `"${(party?.urduName || party?.name || '').replace(/"/g, '""')}"`,
      r.partyType,
      r.amount,
      r.paymentMode,
      `"${(r.collectedBy || '').replace(/"/g, '""')}"`,
      r.previousBalance,
      r.newBalance,
      `"${(r.notes || '').replace(/"/g, '""')}"`
    ];
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadFile(csvContent, `Murgh_Mandi_Daily_Ugrahi_${dateStr}.csv`, 'text/csv;charset=utf-8;');
}

// 6. Export Roznamcha Journal to CSV
export function exportRoznamchaToCSV(appState: AppState): void {
  const headers = [
    'Entry ID / Slip #',
    'Date',
    'Account / Detail',
    'Detail Urdu',
    'Ref Type',
    'Debit (Naam / PKR)',
    'Credit (Jama / PKR)',
    'Running Balance (PKR)'
  ];

  const rows = appState.ledgerEntries.map((l) => [
    l.folioNo || l.id,
    l.entryDate,
    `"${(l.detail || '').replace(/"/g, '""')}"`,
    `"${(l.detailUrdu || '').replace(/"/g, '""')}"`,
    l.refType,
    l.debit,
    l.credit,
    l.runningBalance
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadFile(csvContent, `Murgh_Mandi_Roznamcha_Daybook_${dateStr}.csv`, 'text/csv;charset=utf-8;');
}

// 7. Complete JSON Full ERP Export
export function exportFullBackupJSON(appState: AppState): void {
  const backupObject = {
    metadata: {
      software: 'Nawaz Poultry ERP & Wholesale Billing',
      version: '2.5.0',
      exportedAt: new Date().toISOString(),
      recordCount: {
        parties: appState.parties.length,
        invoices: appState.invoices.length,
        ledgerEntries: appState.ledgerEntries.length,
        purchases: appState.purchases.length,
        expenses: appState.expenses.length,
        inventory: appState.inventory.length
      }
    },
    data: appState
  };

  const jsonStr = JSON.stringify(backupObject, null, 2);
  const dateStr = new Date().toISOString().split('T')[0];
  downloadFile(jsonStr, `Murgh_Mandi_Full_Backup_${dateStr}.json`, 'application/json');
}

// 6. Validate & Parse Imported State
export function validateAndParseImportedState(rawText: string): { success: boolean; state?: AppState; error?: string } {
  try {
    const parsed = JSON.parse(rawText);
    const candidate: AppState = parsed.data ? parsed.data : parsed;

    if (!Array.isArray(candidate.parties) || !Array.isArray(candidate.invoices)) {
      return { success: false, error: 'Invalid backup file format: missing parties or invoices tables.' };
    }

    // Ensure all critical arrays exist
    const sanitizedState: AppState = {
      currentRole: candidate.currentRole || 'owner',
      language: candidate.language || 'ur',
      todayMandiRate: Number(candidate.todayMandiRate) || 12000,
      parties: Array.isArray(candidate.parties) ? candidate.parties : [],
      invoices: Array.isArray(candidate.invoices) ? candidate.invoices : [],
      receipts: Array.isArray(candidate.receipts) ? candidate.receipts : [],
      ledgerEntries: Array.isArray(candidate.ledgerEntries) ? candidate.ledgerEntries : [],
      purchases: Array.isArray(candidate.purchases) ? candidate.purchases : [],
      expenses: Array.isArray(candidate.expenses) ? candidate.expenses : [],
      generalEntries: Array.isArray(candidate.generalEntries) ? candidate.generalEntries : [],
      orders: Array.isArray(candidate.orders) ? candidate.orders : [],
      vehicles: Array.isArray(candidate.vehicles) ? candidate.vehicles : [],
      trips: Array.isArray(candidate.trips) ? candidate.trips : [],
      inventory: Array.isArray(candidate.inventory) ? candidate.inventory : [],
      accounts: Array.isArray(candidate.accounts) ? candidate.accounts : [],
      employees: Array.isArray(candidate.employees) ? candidate.employees : [],
      dayClosing: candidate.dayClosing || {
        id: 'close-today',
        date: new Date().toISOString().split('T')[0],
        physicalCash: 50000,
        systemCash: 50000,
        variance: 0,
        totalSalesKg: 0,
        totalSalesAmount: 0,
        totalCollections: 0,
        isLocked: false
      },
      isOffline: !navigator.onLine
    };

    return { success: true, state: sanitizedState };
  } catch (err: any) {
    return { success: false, error: err.message || 'JSON parsing failed' };
  }
}
