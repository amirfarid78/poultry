import React, { useState, useEffect } from 'react';
import { 
  loadSavedState, 
  saveStateToStorage, 
  AppState 
} from './services/store';
import { 
  Invoice, 
  ReceiptVoucher, 
  Purchase, 
  OrderItem, 
  Trip, 
  InventoryItem, 
  Employee, 
  DayClosing, 
  UserRole,
  LedgerEntry,
  ExpenseItem 
} from './types';

// Layout & View Components
import { Navbar } from './components/layout/Navbar';
import { DashboardView } from './components/dashboard/DashboardView';
import { POSView } from './components/pos/POSView';
import { ExpensesView } from './components/expenses/ExpensesView';
import { CustomerLedgerView } from './components/ledger/CustomerLedgerView';
import { ReceiptModal } from './components/ledger/ReceiptModal';
import { SupplierView } from './components/supplier/SupplierView';
import { OrdersView } from './components/orders/OrdersView';
import { FleetView } from './components/fleet/FleetView';
import { InventoryView } from './components/inventory/InventoryView';
import { AccountingView } from './components/accounting/AccountingView';
import { HRView } from './components/hr/HRView';
import { TestSuiteView } from './components/testing/TestSuiteView';
import { SettingsView } from './components/settings/SettingsView';
import { PublicInvoiceModal } from './components/public/PublicInvoiceModal';

export default function App() {
  const [appState, setAppState] = useState<AppState>(loadSavedState);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptPreselectedPartyId, setReceiptPreselectedPartyId] = useState<string | undefined>();
  const [publicViewingInvoice, setPublicViewingInvoice] = useState<Invoice | null>(null);

  // Sync to local storage on changes
  useEffect(() => {
    saveStateToStorage(appState);
  }, [appState]);

  // Online / Offline listener
  useEffect(() => {
    const handleOnline = () => setAppState((prev) => ({ ...prev, isOffline: false }));
    const handleOffline = () => setAppState((prev) => ({ ...prev, isOffline: true }));

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync HTML dir attribute with language
  useEffect(() => {
    document.documentElement.dir = appState.language === 'ur' ? 'rtl' : 'ltr';
    document.documentElement.lang = appState.language;
  }, [appState.language]);

  // Check URL token for Public Invoice Share
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
      const match = appState.invoices.find((inv) => inv.shareToken === token);
      if (match) {
        setPublicViewingInvoice(match);
      }
    }
  }, [appState.invoices]);

  // State Mutators
  const setLanguage = (lang: 'en' | 'ur') => {
    setAppState((prev) => ({ ...prev, language: lang }));
  };

  const setCurrentRole = (role: UserRole) => {
    setAppState((prev) => ({ ...prev, currentRole: role }));
  };

  const setTodayMandiRate = (rate: number) => {
    setAppState((prev) => ({ ...prev, todayMandiRate: rate }));
  };

  // 1. SAVE INVOICE & AUTO-UPDATE LEDGERS ATOMICALLY
  const handleSaveInvoice = (invoice: Invoice) => {
    setAppState((prev) => {
      // 1. Update customer balance
      const updatedParties = prev.parties.map((p) => {
        if (p.id === invoice.customerId) {
          return {
            ...p,
            currentBalance: invoice.newBalance
          };
        }
        return p;
      });

      // 2. Insert debit ledger entry for sale
      const totRec = (invoice.receivedCash || 0) + (invoice.receivedAC || 0);
      const intermediateBal = invoice.previousBalance + invoice.totalAmount;

      const saleLedgerEntry: LedgerEntry = {
        id: `led-${Date.now()}-1`,
        partyId: invoice.customerId,
        partyType: 'customer',
        entryDate: invoice.invoiceDate,
        detail: `Sale: ${invoice.netWeightKg} kg @ Rs ${invoice.saleRatePer40kg.toLocaleString()}/40kg`,
        detailUrdu: `مرغ فروخت: ${invoice.netWeightKg} کلو، ریٹ ${invoice.saleRatePer40kg.toLocaleString()}`,
        folioNo: invoice.invoiceNumber,
        debit: invoice.totalAmount,
        credit: 0,
        runningBalance: intermediateBal,
        refType: 'invoice',
        refId: invoice.id,
        createdAt: new Date().toISOString()
      };

      const newLedgerEntries = [...prev.ledgerEntries, saleLedgerEntry];

      // 3. Insert credit ledger entry if payment received
      if (totRec > 0) {
        const paymentLedgerEntry: LedgerEntry = {
          id: `led-${Date.now()}-2`,
          partyId: invoice.customerId,
          partyType: 'customer',
          entryDate: invoice.invoiceDate,
          detail: `Payment Recd (Cash: ${invoice.receivedCash}, AC: ${invoice.receivedAC})`,
          detailUrdu: `وصولی نقد: ${invoice.receivedCash}، آن لائن: ${invoice.receivedAC}`,
          folioNo: invoice.invoiceNumber,
          debit: 0,
          credit: totRec,
          runningBalance: invoice.newBalance,
          refType: 'invoice_payment',
          refId: invoice.id,
          createdAt: new Date().toISOString()
        };
        newLedgerEntries.push(paymentLedgerEntry);
      }

      // 4. Update Day Closing metrics
      const updatedDayClosing: DayClosing = {
        ...prev.dayClosing,
        systemCash: prev.dayClosing.systemCash + invoice.receivedCash,
        physicalCash: prev.dayClosing.physicalCash + invoice.receivedCash,
        totalSalesKg: prev.dayClosing.totalSalesKg + invoice.netWeightKg,
        totalSalesAmount: prev.dayClosing.totalSalesAmount + invoice.totalAmount,
        totalCollections: prev.dayClosing.totalCollections + totRec
      };

      return {
        ...prev,
        parties: updatedParties,
        invoices: [...prev.invoices, invoice],
        ledgerEntries: newLedgerEntries,
        dayClosing: updatedDayClosing
      };
    });
  };

  // 2. SAVE PAYMENT-ONLY RECEIPT VOUCHER
  const handleSaveReceipt = (receipt: ReceiptVoucher) => {
    setAppState((prev) => {
      const updatedParties = prev.parties.map((p) => {
        if (p.id === receipt.partyId) {
          return {
            ...p,
            currentBalance: receipt.newBalance
          };
        }
        return p;
      });

      const newLedgerEntry: LedgerEntry = {
        id: `led-rec-${Date.now()}`,
        partyId: receipt.partyId,
        partyType: receipt.partyType,
        entryDate: receipt.receiptDate,
        detail: `Payment Recd (${receipt.paymentMode}) - Ref: ${receipt.refNo || '-'}`,
        detailUrdu: `رقم وصولی (${receipt.paymentMode}) - حوالہ: ${receipt.refNo || '-'}`,
        folioNo: receipt.receiptNumber,
        debit: 0,
        credit: receipt.amount,
        runningBalance: receipt.newBalance,
        refType: 'receipt',
        refId: receipt.id,
        createdAt: new Date().toISOString()
      };

      const updatedDayClosing: DayClosing = {
        ...prev.dayClosing,
        systemCash: receipt.paymentMode === 'cash' ? prev.dayClosing.systemCash + receipt.amount : prev.dayClosing.systemCash,
        physicalCash: receipt.paymentMode === 'cash' ? prev.dayClosing.physicalCash + receipt.amount : prev.dayClosing.physicalCash,
        totalCollections: prev.dayClosing.totalCollections + receipt.amount
      };

      return {
        ...prev,
        parties: updatedParties,
        receipts: [...prev.receipts, receipt],
        ledgerEntries: [...prev.ledgerEntries, newLedgerEntry],
        dayClosing: updatedDayClosing
      };
    });
  };

  // 3. SAVE SUPPLIER PURCHASE
  const handleAddPurchase = (purchase: Purchase) => {
    setAppState((prev) => {
      const updatedParties = prev.parties.map((p) => {
        if (p.id === purchase.supplierId) {
          return {
            ...p,
            currentBalance: purchase.newBalance
          };
        }
        return p;
      });

      const purchaseLedgerEntry: LedgerEntry = {
        id: `led-pur-${Date.now()}`,
        partyId: purchase.supplierId,
        partyType: 'supplier',
        entryDate: purchase.purchaseDate,
        detail: `Purchase: ${purchase.netWeightKg} kg @ Rs ${purchase.ratePer40kg}/40kg`,
        detailUrdu: `مال خریداری: ${purchase.netWeightKg} کلو، ریٹ ${purchase.ratePer40kg}`,
        folioNo: purchase.purchaseNumber,
        debit: purchase.totalAmount,
        credit: purchase.paidCash + purchase.paidBank,
        runningBalance: purchase.newBalance,
        refType: 'purchase',
        refId: purchase.id,
        createdAt: new Date().toISOString()
      };

      return {
        ...prev,
        parties: updatedParties,
        purchases: [...prev.purchases, purchase],
        ledgerEntries: [...prev.ledgerEntries, purchaseLedgerEntry]
      };
    });
  };

  // 3.5. EXPENSES HANDLERS
  const handleAddExpense = (expense: ExpenseItem) => {
    setAppState((prev) => {
      // If paid via cash, deduct from Roznamcha daily cash
      const isCash = expense.paymentMode === 'cash';
      const updatedDayClosing: DayClosing = {
        ...prev.dayClosing,
        physicalCash: isCash ? Math.max(0, prev.dayClosing.physicalCash - expense.amount) : prev.dayClosing.physicalCash,
        systemCash: isCash ? Math.max(0, prev.dayClosing.systemCash - expense.amount) : prev.dayClosing.systemCash
      };

      return {
        ...prev,
        expenses: [expense, ...prev.expenses],
        dayClosing: updatedDayClosing
      };
    });
  };

  const handleDeleteExpense = (expenseId: string) => {
    setAppState((prev) => {
      const target = prev.expenses.find((e) => e.id === expenseId);
      if (!target) return prev;

      const isCash = target.paymentMode === 'cash';
      const updatedDayClosing: DayClosing = {
        ...prev.dayClosing,
        physicalCash: isCash ? prev.dayClosing.physicalCash + target.amount : prev.dayClosing.physicalCash,
        systemCash: isCash ? prev.dayClosing.systemCash + target.amount : prev.dayClosing.systemCash
      };

      return {
        ...prev,
        expenses: prev.expenses.filter((e) => e.id !== expenseId),
        dayClosing: updatedDayClosing
      };
    });
  };

  // 4. ORDER HANDLERS
  const handleAddOrder = (order: OrderItem) => {
    setAppState((prev) => ({
      ...prev,
      orders: [...prev.orders, order]
    }));
  };

  const handleUpdateOrderStatus = (orderId: string, status: any) => {
    setAppState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) => o.id === orderId ? { ...o, status } : o)
    }));
  };

  const handleConvertOrderToInvoice = (order: OrderItem) => {
    setActiveTab('pos');
    // POS will receive focus
  };

  // 5. FLEET & TRIP UPDATES
  const handleUpdateTrip = (updatedTrip: Trip) => {
    setAppState((prev) => ({
      ...prev,
      trips: prev.trips.map((t) => t.id === updatedTrip.id ? updatedTrip : t)
    }));
  };

  // 6. INVENTORY UPDATES
  const handleUpdateInventory = (items: InventoryItem[]) => {
    setAppState((prev) => ({ ...prev, inventory: items }));
  };

  // 7. HR EMPLOYEES UPDATE
  const handleUpdateEmployees = (emps: Employee[]) => {
    setAppState((prev) => ({ ...prev, employees: emps }));
  };

  // 8. DAY CLOSING UPDATE
  const handleUpdateDayClosing = (closing: DayClosing) => {
    setAppState((prev) => ({ ...prev, dayClosing: closing }));
  };

  // 9. SETTINGS: RESET SEED DATA
  const handleResetSeedData = () => {
    localStorage.removeItem('murgh_mandi_erp_data_v1');
    setAppState(loadSavedState());
  };

  return (
    <div className={`min-h-screen bg-slate-100/90 text-slate-900 ${appState.language === 'ur' ? 'font-urdu' : ''}`}>
      {/* Global Top Navbar with Role & Language switcher */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentRole={appState.currentRole}
        setCurrentRole={setCurrentRole}
        language={appState.language}
        setLanguage={setLanguage}
        todayMandiRate={appState.todayMandiRate}
        setTodayMandiRate={setTodayMandiRate}
        isOffline={appState.isOffline}
      />

      {/* Main App Content View Container */}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-6">
        {activeTab === 'dashboard' && (
          <DashboardView
            parties={appState.parties}
            invoices={appState.invoices}
            receipts={appState.receipts}
            orders={appState.orders}
            vehicles={appState.vehicles}
            trips={appState.trips}
            inventory={appState.inventory}
            accounts={appState.accounts}
            dayClosing={appState.dayClosing}
            todayMandiRate={appState.todayMandiRate}
            currentRole={appState.currentRole}
            language={appState.language}
            expenses={appState.expenses}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onOpenReceiptModal={(partyId) => {
              setReceiptPreselectedPartyId(partyId);
              setIsReceiptModalOpen(true);
            }}
          />
        )}

        {activeTab === 'pos' && (
          <POSView
            parties={appState.parties}
            invoices={appState.invoices}
            vehicles={appState.vehicles}
            todayMandiRate={appState.todayMandiRate}
            currentRole={appState.currentRole}
            language={appState.language}
            onSaveInvoice={handleSaveInvoice}
            onOpenReceiptModal={() => setIsReceiptModalOpen(true)}
            onViewPublicInvoice={(inv) => setPublicViewingInvoice(inv)}
          />
        )}

        {activeTab === 'expenses' && (
          <ExpensesView
            expenses={appState.expenses}
            vehicles={appState.vehicles}
            currentRole={appState.currentRole}
            language={appState.language}
            onAddExpense={handleAddExpense}
            onDeleteExpense={handleDeleteExpense}
          />
        )}

        {activeTab === 'customer_ledger' && (
          <CustomerLedgerView
            parties={appState.parties}
            ledgerEntries={appState.ledgerEntries}
            language={appState.language}
            onOpenReceiptModal={(partyId) => {
              setReceiptPreselectedPartyId(partyId);
              setIsReceiptModalOpen(true);
            }}
          />
        )}

        {activeTab === 'receipt' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm max-w-lg mx-auto">
            <h2 className="text-lg font-bold text-slate-900 mb-2">
              {appState.language === 'ur' ? 'صرف رقم وصولی واؤچر اندراج' : 'Record Receipt Voucher'}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              {appState.language === 'ur' ? 'گاہک کے کھاتے میں نقد یا آن لائن رقم کی وصولی بغیر مال کے درج کریں' : 'Record cash or online collection directly to party khata.'}
            </p>
            <button
              onClick={() => setIsReceiptModalOpen(true)}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md"
            >
              {appState.language === 'ur' ? 'نیا وصولی واؤچر فارم کھولیں' : 'Open Receipt Voucher Form'}
            </button>
          </div>
        )}

        {activeTab === 'supplier' && (
          <SupplierView
            parties={appState.parties}
            purchases={appState.purchases}
            ledgerEntries={appState.ledgerEntries}
            currentRole={appState.currentRole}
            language={appState.language}
            onAddPurchase={handleAddPurchase}
            onOpenReceiptModal={(partyId) => {
              setReceiptPreselectedPartyId(partyId);
              setIsReceiptModalOpen(true);
            }}
          />
        )}

        {activeTab === 'orders' && (
          <OrdersView
            orders={appState.orders}
            parties={appState.parties}
            vehicles={appState.vehicles}
            currentRole={appState.currentRole}
            language={appState.language}
            onAddOrder={handleAddOrder}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            onConvertOrderToInvoice={handleConvertOrderToInvoice}
          />
        )}

        {activeTab === 'fleet' && (
          <FleetView
            vehicles={appState.vehicles}
            trips={appState.trips}
            currentRole={appState.currentRole}
            language={appState.language}
            onUpdateTrip={handleUpdateTrip}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryView
            inventory={appState.inventory}
            currentRole={appState.currentRole}
            language={appState.language}
            onUpdateInventory={handleUpdateInventory}
          />
        )}

        {activeTab === 'accounting' && (
          <AccountingView
            accounts={appState.accounts}
            dayClosing={appState.dayClosing}
            currentRole={appState.currentRole}
            language={appState.language}
            onUpdateDayClosing={handleUpdateDayClosing}
          />
        )}

        {activeTab === 'hr' && (
          <HRView
            employees={appState.employees}
            currentRole={appState.currentRole}
            language={appState.language}
            onUpdateEmployees={handleUpdateEmployees}
          />
        )}

        {activeTab === 'tests' && (
          <TestSuiteView language={appState.language} />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            appState={appState}
            language={appState.language}
            onResetSeedData={handleResetSeedData}
            onImportState={(newState) => setAppState(newState)}
          />
        )}
      </main>

      {/* Global Modals */}
      <ReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => {
          setIsReceiptModalOpen(false);
          setReceiptPreselectedPartyId(undefined);
        }}
        parties={appState.parties}
        preselectedPartyId={receiptPreselectedPartyId}
        onSaveReceipt={handleSaveReceipt}
        language={appState.language}
      />

      <PublicInvoiceModal
        invoice={publicViewingInvoice}
        onClose={() => setPublicViewingInvoice(null)}
        language={appState.language}
      />
    </div>
  );
}
