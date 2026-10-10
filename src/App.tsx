import React, { useState, useEffect } from 'react';
import { 
  loadSavedState, 
  saveStateToStorage, 
  AppState 
} from './services/store';
import { 
  Party,
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
  ExpenseItem,
  GeneralJournalEntry 
} from './types';

// Layout & View Components
import { Navbar } from './components/layout/Navbar';
import { DashboardView } from './components/dashboard/DashboardView';
import { POSView } from './components/pos/POSView';
import { ExpensesView } from './components/expenses/ExpensesView';
import { CustomerLedgerView } from './components/ledger/CustomerLedgerView';
import { DailySheetView } from './components/daily_sheet/DailySheetView';
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
  const [orderToInvoice, setOrderToInvoice] = useState<OrderItem | null>(null);

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

  // 0. PARTY CRUD OPERATIONS (Customers & Suppliers)
  const handleAddParty = (party: Party) => {
    setAppState((prev) => {
      let updatedEntries = prev.ledgerEntries;
      if (party.openingBalance !== 0) {
        const openingLedgerEntry: LedgerEntry = {
          id: `led-open-${Date.now()}`,
          partyId: party.id,
          partyType: party.partyType,
          entryDate: party.createdAt ? party.createdAt.split('T')[0] : new Date().toISOString().split('T')[0],
          detail: `Opening Balance (${party.openingBalance > 0 ? 'Receivable' : 'Advance with Us'})`,
          detailUrdu: `ابتدائی سابقہ بیلنس (${party.openingBalance > 0 ? 'واجب الوصول بقایا' : 'پیشگی جمع رقم'})`,
          folioNo: 'OP-01',
          debit: party.openingBalance > 0 ? party.openingBalance : 0,
          credit: party.openingBalance < 0 ? Math.abs(party.openingBalance) : 0,
          runningBalance: party.openingBalance,
          refType: 'opening',
          createdAt: new Date().toISOString()
        };
        updatedEntries = [...updatedEntries, openingLedgerEntry];
      }

      return {
        ...prev,
        parties: [...prev.parties, party],
        ledgerEntries: updatedEntries
      };
    });
  };

  const handleUpdateParty = (updatedParty: Party) => {
    setAppState((prev) => ({
      ...prev,
      parties: prev.parties.map((p) => (p.id === updatedParty.id ? updatedParty : p))
    }));
  };

  const handleDeleteParty = (partyId: string) => {
    setAppState((prev) => ({
      ...prev,
      parties: prev.parties.filter((p) => p.id !== partyId),
      ledgerEntries: prev.ledgerEntries.filter((l) => l.partyId !== partyId)
    }));
  };

  // 1. SAVE INVOICE & AUTO-UPDATE LEDGERS, INVENTORY & ORDERS ATOMICALLY
  const handleSaveInvoice = (invoice: Invoice, linkedOrderId?: string) => {
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
        mandiRate: invoice.mandiRatePer40kg,
        rate: invoice.saleRatePer40kg,
        weightKg: invoice.netWeightKg,
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

      // 5. Deduct from Live Broiler Inventory (inv-item-1)
      const updatedInventory = prev.inventory.map((inv) => {
        if (inv.category === 'broiler' && (inv.id === 'inv-item-1' || inv.code === 'BR-LIVE')) {
          return {
            ...inv,
            currentWeightKg: Math.max(0, inv.currentWeightKg - invoice.netWeightKg),
            currentCount: Math.max(0, (inv.currentCount || 0) - (invoice.birdCount || Math.round(invoice.netWeightKg / 2)))
          };
        }
        return inv;
      });

      // 6. Update orders if linked
      const updatedOrders = prev.orders.map((ord) => {
        if (linkedOrderId && ord.id === linkedOrderId) {
          return { ...ord, status: 'invoiced' as any };
        }
        return ord;
      });

      return {
        ...prev,
        parties: updatedParties,
        invoices: [...prev.invoices, invoice],
        ledgerEntries: newLedgerEntries,
        dayClosing: updatedDayClosing,
        inventory: updatedInventory,
        orders: updatedOrders
      };
    });
    setOrderToInvoice(null);
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

      // If customer payment in cash, add to safe. If supplier paid in cash, deduct from safe.
      const isCash = receipt.paymentMode === 'cash';
      const cashDelta = receipt.partyType === 'supplier' ? -receipt.amount : receipt.amount;

      const updatedDayClosing: DayClosing = {
        ...prev.dayClosing,
        systemCash: isCash ? Math.max(0, prev.dayClosing.systemCash + cashDelta) : prev.dayClosing.systemCash,
        physicalCash: isCash ? Math.max(0, prev.dayClosing.physicalCash + cashDelta) : prev.dayClosing.physicalCash,
        totalCollections: receipt.partyType === 'customer' ? prev.dayClosing.totalCollections + receipt.amount : prev.dayClosing.totalCollections
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

  // 3. SAVE SUPPLIER PURCHASE & UPDATE INVENTORY & CASH
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
        mandiRate: purchase.ratePer40kg || prev.todayMandiRate,
        rate: purchase.ratePer40kg,
        weightKg: purchase.netWeightKg,
        createdAt: new Date().toISOString()
      };

      // Increase Live Broiler stock
      const updatedInventory = prev.inventory.map((inv) => {
        if (inv.category === 'broiler' && (inv.id === 'inv-item-1' || inv.code === 'BR-LIVE')) {
          return {
            ...inv,
            currentWeightKg: inv.currentWeightKg + purchase.netWeightKg,
            currentCount: (inv.currentCount || 0) + (purchase.birdCount || Math.round(purchase.netWeightKg / 2))
          };
        }
        return inv;
      });

      // Deduct paid cash from safe
      const updatedDayClosing: DayClosing = {
        ...prev.dayClosing,
        physicalCash: purchase.paidCash > 0 ? Math.max(0, prev.dayClosing.physicalCash - purchase.paidCash) : prev.dayClosing.physicalCash,
        systemCash: purchase.paidCash > 0 ? Math.max(0, prev.dayClosing.systemCash - purchase.paidCash) : prev.dayClosing.systemCash
      };

      return {
        ...prev,
        parties: updatedParties,
        purchases: [...prev.purchases, purchase],
        ledgerEntries: [...prev.ledgerEntries, purchaseLedgerEntry],
        inventory: updatedInventory,
        dayClosing: updatedDayClosing
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
    setOrderToInvoice(order);
    setActiveTab('pos');
  };

  // 4.5. HR ADVANCE & EXPENSE INTEGRATION
  const handleIssueEmployeeAdvance = (empId: string, amount: number, notes?: string) => {
    setAppState((prev) => {
      const targetEmp = prev.employees.find((e) => e.id === empId);
      const updatedEmployees = prev.employees.map((e) => {
        if (e.id === empId) {
          return { ...e, advanceBalance: e.advanceBalance + amount };
        }
        return e;
      });

      const newExpense: ExpenseItem = {
        id: `exp-${Date.now()}`,
        expenseNumber: `EXP-${100 + prev.expenses.length + 1}`,
        date: new Date().toISOString().split('T')[0],
        category: 'labor',
        categoryName: 'Staff Advance & Payroll',
        categoryUrduName: 'اسٹاف پیشگی لون و تنخواہ',
        amount,
        paymentMode: 'cash',
        description: `Advance given to ${targetEmp?.name || 'Staff'}: ${notes || '-'}`,
        descriptionUrdu: `${targetEmp?.urduName || targetEmp?.name || 'اسٹاف'} کو پیشگی ادائی: ${notes || '-'}`,
        paidTo: targetEmp?.name || 'Staff',
        createdBy: 'Cashier / منشی',
        createdAt: new Date().toISOString()
      };

      const updatedDayClosing: DayClosing = {
        ...prev.dayClosing,
        physicalCash: Math.max(0, prev.dayClosing.physicalCash - amount),
        systemCash: Math.max(0, prev.dayClosing.systemCash - amount)
      };

      return {
        ...prev,
        employees: updatedEmployees,
        expenses: [newExpense, ...prev.expenses],
        dayClosing: updatedDayClosing
      };
    });
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

  // 8.5. GENERAL JOURNAL ENTRY (ROZNAMCHA) HANDLERS
  const handleAddGeneralEntry = (entry: GeneralJournalEntry) => {
    setAppState((prev) => {
      const updatedGeneral = [entry, ...(prev.generalEntries || [])];

      let updatedParties = prev.parties;
      let updatedLedger = prev.ledgerEntries;

      if (entry.partyId) {
        const party = prev.parties.find(p => p.id === entry.partyId);
        if (party) {
          const isCustomerCredit = entry.creditAccountCode === '1020';
          const isCustomerDebit = entry.debitAccountCode === '1020';
          const balDelta = isCustomerCredit ? -entry.amount : isCustomerDebit ? entry.amount : 0;
          const newBal = party.currentBalance + balDelta;

          updatedParties = prev.parties.map(p => p.id === entry.partyId ? { ...p, currentBalance: newBal } : p);

          const journalLedgerEntry: LedgerEntry = {
            id: `led-jv-${Date.now()}`,
            partyId: party.id,
            partyType: party.partyType,
            entryDate: entry.entryDate,
            detail: entry.description,
            detailUrdu: entry.descriptionUrdu,
            folioNo: entry.entryNumber,
            debit: isCustomerDebit ? entry.amount : 0,
            credit: isCustomerCredit ? entry.amount : 0,
            runningBalance: newBal,
            refType: 'journal',
            refId: entry.id,
            createdAt: new Date().toISOString()
          };
          updatedLedger = [...prev.ledgerEntries, journalLedgerEntry];
        }
      }

      const updatedAccounts = prev.accounts.map(acc => {
        if (acc.code === entry.debitAccountCode) {
          return { ...acc, balance: acc.balance + entry.amount };
        }
        if (acc.code === entry.creditAccountCode) {
          return { ...acc, balance: Math.max(0, acc.balance - entry.amount) };
        }
        return acc;
      });

      let updatedDayClosing = prev.dayClosing;
      if (entry.debitAccountCode === '1010') {
        updatedDayClosing = {
          ...prev.dayClosing,
          physicalCash: prev.dayClosing.physicalCash + entry.amount,
          systemCash: prev.dayClosing.systemCash + entry.amount
        };
      } else if (entry.creditAccountCode === '1010') {
        updatedDayClosing = {
          ...prev.dayClosing,
          physicalCash: Math.max(0, prev.dayClosing.physicalCash - entry.amount),
          systemCash: Math.max(0, prev.dayClosing.systemCash - entry.amount)
        };
      }

      return {
        ...prev,
        generalEntries: updatedGeneral,
        parties: updatedParties,
        ledgerEntries: updatedLedger,
        accounts: updatedAccounts,
        dayClosing: updatedDayClosing
      };
    });
  };

  const handleDeleteGeneralEntry = (entryId: string) => {
    setAppState((prev) => ({
      ...prev,
      generalEntries: (prev.generalEntries || []).filter(g => g.id !== entryId)
    }));
  };

  // 9. SETTINGS: 1-CLICK QUICK BUSINESS SETUP
  const handleQuickBusinessSetup = (config: {
    shopNameUrdu: string;
    shopNameEn: string;
    ownerName: string;
    city: string;
    openingCash: number;
    mandiRate: number;
    startingStockKg: number;
  }) => {
    setAppState((prev) => {
      const freshClosing: DayClosing = {
        id: `close-${new Date().toISOString().split('T')[0]}`,
        date: new Date().toISOString().split('T')[0],
        physicalCash: config.openingCash,
        systemCash: config.openingCash,
        variance: 0,
        totalSalesKg: 0,
        totalSalesAmount: 0,
        totalCollections: 0,
        isLocked: false,
        lockedBy: 'System / سسٹم'
      };

      const freshInventory = prev.inventory.map((inv) => {
        if (inv.category === 'broiler' && inv.id === 'inv-item-1') {
          return {
            ...inv,
            currentWeightKg: config.startingStockKg,
            currentCount: Math.round(config.startingStockKg / 2)
          };
        }
        return inv;
      });

      return {
        ...prev,
        todayMandiRate: config.mandiRate,
        dayClosing: freshClosing,
        inventory: freshInventory
      };
    });
  };

  // 10. SETTINGS: RESET SEED DATA
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
            prefillOrder={orderToInvoice}
            onClearPrefillOrder={() => setOrderToInvoice(null)}
            onAddParty={handleAddParty}
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
            onAddParty={handleAddParty}
            onUpdateParty={handleUpdateParty}
          />
        )}

        {activeTab === 'daily_sheet' && (
          <DailySheetView
            parties={appState.parties}
            receipts={appState.receipts}
            invoices={appState.invoices}
            currentRole={appState.currentRole}
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
            todayMandiRate={appState.todayMandiRate}
            onAddPurchase={handleAddPurchase}
            onOpenReceiptModal={(partyId) => {
              setReceiptPreselectedPartyId(partyId);
              setIsReceiptModalOpen(true);
            }}
            onAddParty={handleAddParty}
            onUpdateParty={handleUpdateParty}
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
            invoices={appState.invoices}
            receipts={appState.receipts}
            purchases={appState.purchases}
            expenses={appState.expenses}
            parties={appState.parties}
            generalEntries={appState.generalEntries}
            onUpdateDayClosing={handleUpdateDayClosing}
            onAddGeneralEntry={handleAddGeneralEntry}
            onDeleteGeneralEntry={handleDeleteGeneralEntry}
          />
        )}

        {activeTab === 'hr' && (
          <HRView
            employees={appState.employees}
            currentRole={appState.currentRole}
            language={appState.language}
            onUpdateEmployees={handleUpdateEmployees}
            onIssueAdvance={handleIssueEmployeeAdvance}
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
            onQuickSetup={handleQuickBusinessSetup}
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
