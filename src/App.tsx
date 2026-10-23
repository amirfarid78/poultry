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
  Vehicle,
  InventoryItem, 
  Employee, 
  DayClosing, 
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

// Auth
import { AuthProvider, useAuth } from './context/AuthContext';
import { BusinessProvider } from './context/BusinessContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Login } from './components/auth/Login';
import { Signup } from './components/auth/Signup';
import { DEFAULT_TAB, canView } from './lib/permissions';
import { fetchPublicInvoice } from './lib/publicInvoice';

// Supabase data + offline sync
import { supabase } from './lib/supabase';
import { fetchAll, fetchStaffProfiles } from './lib/db';
import type { StaffProfile } from './types';
import { peekOutbox } from './lib/offline';
import { startSyncEngine } from './lib/sync';
import {
  persist,
  persistIfUuid,
  withUuid,
  isUuid,
  reconcileState,
  snapshotState,
} from './lib/remote';
import type { EmployeeAdvance } from './lib/db';

function AppShell() {
  const { session, profile, role, loading: authLoading, signOut } = useAuth();
  const [appState, setAppState] = useState<AppState>(loadSavedState);
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);

  // Load staff profiles for owner/manager (vehicle driver assignment, user mgmt)
  useEffect(() => {
    if (role === 'owner' || role === 'manager') {
      fetchStaffProfiles(supabase).then(setStaffProfiles).catch(() => {});
    } else {
      setStaffProfiles([]);
    }
  }, [role]);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptPreselectedPartyId, setReceiptPreselectedPartyId] = useState<string | undefined>();
  const [publicViewingInvoice, setPublicViewingInvoice] = useState<Invoice | null>(null);
  const [orderToInvoice, setOrderToInvoice] = useState<OrderItem | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  // Public share-token route (?token=...) — rendered without login
  const [publicToken, setPublicToken] = useState<string | null>(null);
  const [publicInvoiceLoading, setPublicInvoiceLoading] = useState(false);
  const [publicInvoiceMissing, setPublicInvoiceMissing] = useState(false);

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

  // Public invoice share-token route: fetch the invoice from Supabase by its
  // share_token (anon key; public SELECT policy) and render it WITHOUT login.
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (!token) return;
    setPublicToken(token);
    setPublicInvoiceLoading(true);
    fetchPublicInvoice(token)
      .then((inv) => {
        setPublicViewingInvoice(inv);
        setPublicInvoiceMissing(!inv);
      })
      .catch(() => setPublicInvoiceMissing(true))
      .finally(() => setPublicInvoiceLoading(false));
  }, []);

  // Keep the active tab inside the role's permission set.
  useEffect(() => {
    if (role) {
      setActiveTab((prev) => (canView(role, prev) ? prev : DEFAULT_TAB[role]));
    }
  }, [role]);

  // ---- Supabase as source of truth -------------------------------------
  // A ref mirror of appState so async refreshes always merge against latest.
  const stateRef = React.useRef(appState);
  useEffect(() => {
    stateRef.current = appState;
  }, [appState]);

  /** Pull every collection from Supabase and reconcile (server wins). */
  const refreshFromServer = React.useCallback(async () => {
    if (!session) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    try {
      const remote = await fetchAll(supabase);
      const pending = await peekOutbox().catch(() => []);
      const next = reconcileState(stateRef.current, remote, pending);
      stateRef.current = next;
      setAppState(next);
      void snapshotState(next).catch(() => {});
    } catch {
      /* keep local state; will retry on next sync tick */
    }
  }, [session]);

  // Initial cloud load once signed in.
  useEffect(() => {
    if (session && profile) void refreshFromServer();
  }, [session, profile, refreshFromServer]);

  // Start the offline outbox engine; refresh after each successful drain.
  const lastSyncAtRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (!session) return;
    const engine = startSyncEngine(supabase);
    const unsub = engine.subscribe((s) => {
      if (
        !s.isSyncing &&
        s.lastSyncAt &&
        s.lastSyncAt !== lastSyncAtRef.current &&
        s.pendingCount === 0
      ) {
        lastSyncAtRef.current = s.lastSyncAt;
        void refreshFromServer();
      }
    });
    return unsub;
  }, [session, refreshFromServer]);

  /** Tab navigation that never lands on a view the role cannot open. */
  const goToTab = (tab: string) => {
    if (!role) return;
    setActiveTab(canView(role, tab) ? tab : DEFAULT_TAB[role]);
  };

  // State Mutators
  const setLanguage = (lang: 'en' | 'ur') => {
    setAppState((prev) => ({ ...prev, language: lang }));
  };

  const setTodayMandiRate = (rate: number) => {
    setAppState((prev) => ({ ...prev, todayMandiRate: rate }));
    void persist('insert', 'mandi_rates', {
      id: crypto.randomUUID(),
      marketDate: new Date().toISOString().split('T')[0],
      city: 'Lahore',
      broilerRatePer40kg: rate,
    });
  };

  // 0. PARTY CRUD OPERATIONS (Customers & Suppliers)
  const handleAddParty = (party: Party) => {
    party = withUuid(party); // server PKs are UUIDs
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
    void persist('insert', 'parties', party);
  };

  const handleUpdateParty = (updatedParty: Party) => {
    setAppState((prev) => {
      const old = prev.parties.find((p) => p.id === updatedParty.id);
      // Opening-balance edits must flow into the khata: shift the running
      // balances of every entry for this party by the delta so the chain
      // stays truthful, and refresh the opening entry itself.
      const delta = old ? updatedParty.openingBalance - old.openingBalance : 0;
      const mergedParty: Party = old
        ? { ...updatedParty, currentBalance: old.currentBalance + delta }
        : updatedParty;

      let ledgerEntries = prev.ledgerEntries;
      if (delta !== 0) {
        const openingIdx = ledgerEntries.findIndex(
          (l) => l.partyId === mergedParty.id && l.refType === 'opening'
        );
        const shifted = ledgerEntries.map((l) =>
          l.partyId === mergedParty.id
            ? { ...l, runningBalance: l.runningBalance + delta }
            : l
        );
        if (openingIdx >= 0) {
          const o = shifted[openingIdx];
          const ob = mergedParty.openingBalance;
          shifted[openingIdx] = {
            ...o,
            debit: ob > 0 ? ob : 0,
            credit: ob < 0 ? Math.abs(ob) : 0,
            detail: `Opening Balance (${ob > 0 ? 'Receivable' : ob < 0 ? 'Advance with Us' : 'Nil'})`,
            detailUrdu: `ابتدائی سابقہ بیلنس (${ob > 0 ? 'واجب الوصول بقایا' : ob < 0 ? 'پیشگی جمع رقم' : 'صفر'})`,
          };
          ledgerEntries = shifted;
        } else if (mergedParty.openingBalance !== 0) {
          const ob = mergedParty.openingBalance;
          ledgerEntries = [
            ...shifted,
            {
              id: `led-open-${Date.now()}`,
              partyId: mergedParty.id,
              partyType: mergedParty.partyType,
              entryDate: (mergedParty.createdAt || new Date().toISOString()).split('T')[0],
              detail: `Opening Balance (${ob > 0 ? 'Receivable' : 'Advance with Us'})`,
              detailUrdu: `ابتدائی سابقہ بیلنس (${ob > 0 ? 'واجب الوصول بقایا' : 'پیشگی جمع رقم'})`,
              folioNo: 'OP-01',
              debit: ob > 0 ? ob : 0,
              credit: ob < 0 ? Math.abs(ob) : 0,
              runningBalance: ob,
              refType: 'opening',
              createdAt: new Date().toISOString(),
            },
          ];
        } else {
          ledgerEntries = shifted;
        }
      }

      return {
        ...prev,
        parties: prev.parties.map((p) => (p.id === mergedParty.id ? mergedParty : p)),
        ledgerEntries,
      };
    });
    persistIfUuid('update', 'parties', updatedParty);
  };

  const handleDeleteParty = (partyId: string) => {
    const s = stateRef.current;
    const party = s.parties.find((p) => p.id === partyId);
    if (!party) return false;
    // Accounting safety: never delete a party that has documents. The user
    // must void those first — the DB foreign keys would reject it anyway.
    const hasDocs =
      s.invoices.some((i) => i.customerId === partyId && !i.isVoid) ||
      s.receipts.some((r) => r.partyId === partyId && !r.isVoid) ||
      s.purchases.some((p) => p.supplierId === partyId) ||
      s.orders.some((o) => o.customerId === partyId && o.status !== 'cancelled');
    if (hasDocs) {
      alert(
        s.language === 'ur'
          ? `”${party.urduName || party.name}“ کے کھاتے میں لین دین موجود ہے۔ پہلے ان کی انوائسز/رسیدیں وائڈ کریں، پھر کھاتہ حذف کریں۔`
          : `"${party.name}" has transactions on record. Void its invoices/receipts first, then delete the account.`
      );
      return false;
    }
    setAppState((prev) => ({
      ...prev,
      parties: prev.parties.filter((p) => p.id !== partyId),
      ledgerEntries: prev.ledgerEntries.filter((l) => l.partyId !== partyId),
    }));
    if (isUuid(partyId)) void persist('delete', 'parties', { id: partyId });
    return true;
  };

  // ---- Invoice state helpers (pure) ---------------------------------------
  // recomputePartyChain: rebuild a party's running balances in chronological
  // order, skipping voided rows (their reversal rows carry the correction).
  // Mirrors the server edit_ledger_entry() recompute.
  const recomputePartyChain = (
    entries: LedgerEntry[],
    partyId: string
  ): { entries: LedgerEntry[]; finalBalance: number } => {
    const ordered = entries
      .filter((e) => e.partyId === partyId && !e.isVoid)
      .sort(
        (a, b) =>
          a.entryDate.localeCompare(b.entryDate) ||
          a.createdAt.localeCompare(b.createdAt) ||
          a.id.localeCompare(b.id)
      );
    let bal = 0;
    const bals = new Map<string, number>();
    for (const e of ordered) {
      bal = Math.round(bal + (e.debit || 0) - (e.credit || 0));
      bals.set(e.id, bal);
    }
    return {
      entries: entries.map((e) =>
        e.partyId === partyId && !e.isVoid && bals.has(e.id)
          ? { ...e, runningBalance: bals.get(e.id)! }
          : e
      ),
      finalBalance: bal,
    };
  };

  // applyInvoiceToState: post a new invoice's effects (party balance, ledger,
  // cash, stock, linked order). reverseInvoiceForVoid: undo them for a void —
  // marks the invoice void, posts local reversal rows, restores balance/stock.
  const applyInvoiceToState = (prev: AppState, invoice: Invoice, linkedOrderId?: string): AppState => {
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

    // 2. Insert debit ledger entry for the bird sale. Extra charges
    // (labour, loading, custom) post as their own 'invoice_charge' rows
    // right after, so the mandi-rate column stays meaningful on the sale row.
    const totRec = (invoice.receivedCash || 0) + (invoice.receivedAC || 0);
    const chargesTotal = invoice.chargesTotal || 0;
    const birdTotal = Math.max(0, invoice.totalAmount - chargesTotal);

    const saleLedgerEntry: LedgerEntry = {
      id: `led-${Date.now()}-1`,
      partyId: invoice.customerId,
      partyType: 'customer',
      entryDate: invoice.invoiceDate,
      detail: `Sale: ${invoice.netWeightKg} kg @ Rs ${invoice.saleRatePer40kg.toLocaleString()}/40kg`,
      detailUrdu: `مرغ فروخت: ${invoice.netWeightKg} کلو، ریٹ ${invoice.saleRatePer40kg.toLocaleString()}`,
      folioNo: invoice.invoiceNumber,
      debit: birdTotal,
      credit: 0,
      runningBalance: invoice.previousBalance + birdTotal,
      refType: 'invoice',
      refId: invoice.id,
      mandiRate: invoice.mandiRatePer40kg,
      rate: invoice.saleRatePer40kg,
      weightKg: invoice.netWeightKg,
      createdAt: new Date().toISOString()
    };

    const newLedgerEntries = [...prev.ledgerEntries, saleLedgerEntry];

    // 2b. One debit row per extra charge, chained onto the running balance.
    let chargeRunBal = invoice.previousBalance + birdTotal;
    (invoice.charges ?? []).forEach((c, i) => {
      if (!(c.amount > 0)) return;
      chargeRunBal = Math.round(chargeRunBal + c.amount);
      newLedgerEntries.push({
        id: `led-${Date.now()}-1c${i}`,
        partyId: invoice.customerId,
        partyType: 'customer',
        entryDate: invoice.invoiceDate,
        detail: `Charge: ${c.name} (Rs ${c.amount.toLocaleString()})`,
        detailUrdu: `اخراجات: ${c.name} (${c.amount.toLocaleString()} روپے)`,
        folioNo: invoice.invoiceNumber,
        debit: c.amount,
        credit: 0,
        runningBalance: chargeRunBal,
        refType: 'invoice_charge',
        refId: invoice.id,
        createdAt: new Date().toISOString()
      });
    });

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
  };

  const reverseInvoiceForVoid = (prev: AppState, invoice: Invoice, reason: string): AppState => {
    if (invoice.isVoid) return prev;
    const now = new Date().toISOString();
    const todayStr = now.split('T')[0];

    const party = prev.parties.find((p) => p.id === invoice.customerId);
    const curBal = party?.currentBalance ?? invoice.newBalance;

    // Reverse EVERY posted (non-void) ledger row of this invoice, newest
    // first — sale, charge and payment rows alike — mirroring the server
    // void_invoice(). The originals are marked void; the reversal rows
    // carry the correction so the audit trail stays intact.
    const posted = prev.ledgerEntries
      .filter((e) => e.refId === invoice.id && !e.isVoid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));

    let bal = curBal;
    const reversals: LedgerEntry[] = posted.map((row, i) => {
      bal = Math.round(bal - (row.debit || 0) + (row.credit || 0));
      return {
        id: `led-void-${Date.now()}-${i}`,
        partyId: row.partyId,
        partyType: row.partyType,
        entryDate: todayStr,
        detail: `VOID reversal (${reason}): ${row.detail}`,
        detailUrdu: `وائڈ واپسی (${reason}): ${row.detailUrdu || row.detail}`,
        folioNo: row.folioNo,
        debit: row.credit || 0,
        credit: row.debit || 0,
        runningBalance: bal,
        refType: row.refType,
        refId: invoice.id,
        createdAt: now,
      };
    });
    const newBal = bal;

    const voidedIds = new Set(posted.map((r) => r.id));
    const ledgerEntries = [
      ...prev.ledgerEntries.map((e) => (voidedIds.has(e.id) ? { ...e, isVoid: true } : e)),
      ...reversals,
    ];

    const totRec = (invoice.receivedCash || 0) + (invoice.receivedAC || 0);
    const updatedParties = prev.parties.map((p) =>
      p.id === invoice.customerId ? { ...p, currentBalance: newBal } : p
    );

    const updatedDayClosing: DayClosing = {
      ...prev.dayClosing,
      systemCash: Math.max(0, prev.dayClosing.systemCash - invoice.receivedCash),
      physicalCash: Math.max(0, prev.dayClosing.physicalCash - invoice.receivedCash),
      totalSalesKg: Math.max(0, prev.dayClosing.totalSalesKg - invoice.netWeightKg),
      totalSalesAmount: Math.max(0, prev.dayClosing.totalSalesAmount - invoice.totalAmount),
      totalCollections: Math.max(0, prev.dayClosing.totalCollections - totRec),
    };

    const updatedInventory = prev.inventory.map((inv) => {
      if (inv.category === 'broiler' && (inv.id === 'inv-item-1' || inv.code === 'BR-LIVE')) {
        return {
          ...inv,
          currentWeightKg: inv.currentWeightKg + invoice.netWeightKg,
          currentCount: (inv.currentCount || 0) + (invoice.birdCount || Math.round(invoice.netWeightKg / 2)),
        };
      }
      return inv;
    });

    return {
      ...prev,
      parties: updatedParties,
      invoices: prev.invoices.map((i) =>
        i.id === invoice.id ? { ...i, isVoid: true, voidReason: reason } : i
      ),
      ledgerEntries,
      dayClosing: updatedDayClosing,
      inventory: updatedInventory,
    };
  };

  const persistInvoiceStock = (invoice: Invoice, sign: 1 | -1) => {
    const broiler = stateRef.current.inventory.find(
      (i) => i.category === 'broiler' && (i.id === 'inv-item-1' || i.code === 'BR-LIVE')
    );
    if (broiler) {
      void persist('upsert', 'products', {
        ...broiler,
        currentWeightKg: Math.max(
          0,
          broiler.currentWeightKg + sign * invoice.netWeightKg
        ),
        currentCount: Math.max(
          0,
          (broiler.currentCount || 0) +
            sign * (invoice.birdCount || Math.round(invoice.netWeightKg / 2))
        ),
      });
    }
  };

  // 1. SAVE INVOICE & AUTO-UPDATE LEDGERS, INVENTORY & ORDERS ATOMICALLY
  // Local apply is optimistic; the outbox replays to Supabase where DB
  // triggers post the authoritative ledger rows and balances (reconciled
  // back on the next refresh — see reconcileState).
  const handleSaveInvoice = (invoice: Invoice, linkedOrderId?: string) => {
    invoice = withUuid(invoice);
    setAppState((prev) => applyInvoiceToState(prev, invoice, linkedOrderId));
    void persist('insert', 'invoices', invoice);
    if (linkedOrderId && isUuid(linkedOrderId)) {
      void persist('update', 'orders', { id: linkedOrderId, status: 'invoiced' });
    }
    // Broiler stock movement -> products (upsert by code)
    persistInvoiceStock(invoice, -1);
    setOrderToInvoice(null);
  };

  // 1b. DELETE (VOID) A SALE INVOICE — posts reversal rows, restores the
  // party balance and stock, and marks the invoice void (never hard-deleted,
  // so the audit trail stays intact).
  const handleDeleteInvoice = (invoiceId: string, reason?: string) => {
    const s = stateRef.current;
    const invoice = s.invoices.find((i) => i.id === invoiceId);
    if (!invoice || invoice.isVoid) return;
    const voidReason = reason || (s.language === 'ur' ? 'صارف نے حذف کیا' : 'Deleted by user');
    setAppState((prev) => reverseInvoiceForVoid(prev, invoice, voidReason));
    // Void FIRST so the outbox replays it before anything that follows.
    void persist('insert', 'invoice_voids', { id: invoiceId, invoiceId, reason: voidReason });
    persistInvoiceStock(invoice, 1);
  };

  // 1c. EDIT A SALE = void the old invoice + issue the corrected one.
  const handleUpdateInvoice = (oldInvoice: Invoice, updatedInvoice: Invoice) => {
    const s = stateRef.current;
    const current = s.invoices.find((i) => i.id === oldInvoice.id);
    if (!current || current.isVoid) return;
    const voidReason =
      s.language === 'ur'
        ? `ترمیم — نیا بل ${updatedInvoice.invoiceNumber}`
        : `Edited — reissued as ${updatedInvoice.invoiceNumber}`;
    const fresh = withUuid(updatedInvoice);
    setAppState((prev) => applyInvoiceToState(reverseInvoiceForVoid(prev, current, voidReason), fresh));
    void persist('insert', 'invoice_voids', { id: current.id, invoiceId: current.id, reason: voidReason });
    void persist('insert', 'invoices', fresh);
    // Single stock upsert: restore the old sale's stock, deduct the new one.
    const broiler = s.inventory.find(
      (i) => i.category === 'broiler' && (i.id === 'inv-item-1' || i.code === 'BR-LIVE')
    );
    if (broiler) {
      const wDelta = current.netWeightKg - fresh.netWeightKg;
      const cDelta =
        (current.birdCount || Math.round(current.netWeightKg / 2)) -
        (fresh.birdCount || Math.round(fresh.netWeightKg / 2));
      void persist('upsert', 'products', {
        ...broiler,
        currentWeightKg: Math.max(0, broiler.currentWeightKg + wDelta),
        currentCount: Math.max(0, (broiler.currentCount || 0) + cDelta),
      });
    }
  };

  // 2. SAVE PAYMENT-ONLY RECEIPT VOUCHER
  const handleSaveReceipt = (receipt: ReceiptVoucher) => {
    receipt = withUuid(receipt);
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
    void persist('insert', 'receipts', receipt);
  };

  // 2b. DELETE (VOID) A PAYMENT VOUCHER — mirrors void_receipt(): marks the
  // voucher void, posts a reversal row and adds the amount back to the party
  // balance. Never hard-deleted; the audit trail stays intact.
  const handleDeleteReceipt = (receiptId: string, reason?: string) => {
    const s = stateRef.current;
    const receipt = s.receipts.find((r) => r.id === receiptId);
    if (!receipt || receipt.isVoid) return;
    const voidReason = reason || (s.language === 'ur' ? 'صارف نے حذف کیا' : 'Deleted by user');
    const now = new Date().toISOString();
    setAppState((prev) => {
      const party = prev.parties.find((p) => p.id === receipt.partyId);
      const curBal = party?.currentBalance ?? receipt.newBalance;
      const newBal = curBal + receipt.amount;

      const reversal: LedgerEntry = {
        id: `led-void-rec-${Date.now()}`,
        partyId: receipt.partyId,
        partyType: receipt.partyType,
        entryDate: now.split('T')[0],
        detail: `VOID reversal (${voidReason}): payment ${receipt.receiptNumber}`,
        detailUrdu: `وائڈ واپسی (${voidReason}): ادائیگی ${receipt.receiptNumber}`,
        folioNo: receipt.receiptNumber,
        debit: receipt.partyType === 'customer' ? receipt.amount : 0,
        credit: receipt.partyType === 'supplier' ? receipt.amount : 0,
        runningBalance: newBal,
        refType: 'receipt',
        refId: receipt.id,
        createdAt: now,
      };

      const updatedParties = prev.parties.map((p) =>
        p.id === receipt.partyId ? { ...p, currentBalance: newBal } : p
      );

      const isCash = receipt.paymentMode === 'cash';
      const cashDelta = receipt.partyType === 'supplier' ? -receipt.amount : receipt.amount;
      const updatedDayClosing: DayClosing = {
        ...prev.dayClosing,
        systemCash: isCash ? Math.max(0, prev.dayClosing.systemCash - cashDelta) : prev.dayClosing.systemCash,
        physicalCash: isCash ? Math.max(0, prev.dayClosing.physicalCash - cashDelta) : prev.dayClosing.physicalCash,
        totalCollections:
          receipt.partyType === 'customer'
            ? Math.max(0, prev.dayClosing.totalCollections - receipt.amount)
            : prev.dayClosing.totalCollections,
      };

      return {
        ...prev,
        parties: updatedParties,
        receipts: prev.receipts.map((r) =>
          r.id === receipt.id ? { ...r, isVoid: true, voidReason } : r
        ),
        ledgerEntries: [...prev.ledgerEntries, reversal],
        dayClosing: updatedDayClosing,
      };
    });
    void persist('insert', 'receipt_voids', { id: receiptId, receiptId, reason: voidReason });
  };

  // 2c. EDIT A LEDGER ROW (customer + supplier khata) — date/narration are
  // always editable; amounts only on manual rows (opening / adjustment /
  // journal). Document-posted rows keep their amounts because the source
  // document owns them (the edit_ledger_entry RPC enforces the same rule
  // server-side and recomputes the running-balance chain there).
  const handleEditLedgerEntry = (
    entryId: string,
    patch: { entryDate: string; detail: string; detailUrdu: string; debit: number; credit: number }
  ) => {
    const s = stateRef.current;
    const entry = s.ledgerEntries.find((e) => e.id === entryId);
    if (!entry || entry.isVoid) return;
    const DOC_TYPES = ['invoice', 'invoice_payment', 'invoice_charge', 'purchase', 'receipt'];
    if (
      DOC_TYPES.includes(entry.refType) &&
      (Math.round(patch.debit) !== Math.round(entry.debit || 0) ||
        Math.round(patch.credit) !== Math.round(entry.credit || 0))
    ) {
      return; // UI guards this; the server RPC enforces it too.
    }
    setAppState((prev) => {
      const mapped = prev.ledgerEntries.map((e) =>
        e.id === entryId ? { ...e, ...patch } : e
      );
      const { entries, finalBalance } = recomputePartyChain(mapped, entry.partyId);
      let parties = prev.parties.map((p) =>
        p.id === entry.partyId ? { ...p, currentBalance: finalBalance } : p
      );
      if (entry.refType === 'opening') {
        const ob = Math.round((patch.debit || 0) - (patch.credit || 0));
        parties = parties.map((p) =>
          p.id === entry.partyId ? { ...p, openingBalance: ob } : p
        );
      }
      return { ...prev, parties, ledgerEntries: entries };
    });
    void persist('insert', 'ledger_edits', {
      id: entryId,
      entryId,
      ...patch,
      refId: entry.refId,
      refType: entry.refType,
      partyId: entry.partyId,
    });
  };

  // 3. SAVE SUPPLIER PURCHASE & UPDATE INVENTORY & CASH
  const handleAddPurchase = (purchase: Purchase) => {
    purchase = withUuid(purchase);
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
    void persist('insert', 'purchases', purchase);
    const broilerAfterPurchase = stateRef.current.inventory.find(
      (i) => i.category === 'broiler' && (i.id === 'inv-item-1' || i.code === 'BR-LIVE')
    );
    if (broilerAfterPurchase) {
      void persist('upsert', 'products', {
        ...broilerAfterPurchase,
        currentWeightKg: broilerAfterPurchase.currentWeightKg + purchase.netWeightKg,
        currentCount:
          (broilerAfterPurchase.currentCount || 0) +
          (purchase.birdCount || Math.round(purchase.netWeightKg / 2)),
      });
    }
  };

  // 3.5. EXPENSES HANDLERS
  const handleAddExpense = (expense: ExpenseItem) => {
    expense = withUuid(expense);
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
    void persist('insert', 'expenses', expense);
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
    if (isUuid(expenseId)) void persist('delete', 'expenses', { id: expenseId });
  };

  // 4. ORDER HANDLERS
  const handleAddOrder = (order: OrderItem) => {
    order = withUuid(order);
    setAppState((prev) => ({
      ...prev,
      orders: [...prev.orders, order]
    }));
    void persist('insert', 'orders', order);
  };

  const handleUpdateOrderStatus = (orderId: string, status: any) => {
    setAppState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) => o.id === orderId ? { ...o, status } : o)
    }));
    if (isUuid(orderId)) void persist('update', 'orders', { id: orderId, status });
  };

  const handleUpdateOrder = (order: OrderItem) => {
    setAppState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) => o.id === order.id ? order : o)
    }));
    persistIfUuid('update', 'orders', order);
  };

  const handleDeleteOrder = (orderId: string) => {
    setAppState((prev) => ({
      ...prev,
      orders: prev.orders.filter((o) => o.id !== orderId)
    }));
    if (isUuid(orderId)) void persist('delete', 'orders', { id: orderId });
  };

  const handleConvertOrderToInvoice = (order: OrderItem) => {
    setOrderToInvoice(order);
    goToTab('pos');
  };

  // 4.5. HR ADVANCE & EXPENSE INTEGRATION
  const handleIssueEmployeeAdvance = (empId: string, amount: number, notes?: string) => {
    const s = stateRef.current;
    const targetEmp = s.employees.find((e) => e.id === empId);
    const todayStr = new Date().toISOString().split('T')[0];
    const newExpense: ExpenseItem = withUuid({
      id: '',
      expenseNumber: `EXP-${100 + s.expenses.length + 1}`,
      date: todayStr,
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
    });
    const advance: EmployeeAdvance = {
      id: crypto.randomUUID(),
      employeeId: empId,
      advanceDate: todayStr,
      amount,
      recoveryPlan: notes,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    const newAdvanceBalance = (targetEmp?.advanceBalance || 0) + amount;

    setAppState((prev) => {
      const updatedEmployees = prev.employees.map((e) => {
        if (e.id === empId) {
          return { ...e, advanceBalance: e.advanceBalance + amount };
        }
        return e;
      });

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

    void persist('insert', 'expenses', newExpense);
    if (isUuid(empId)) {
      void persist('insert', 'employee_advances', advance);
      void persist('update', 'employees', { id: empId, advanceBalance: newAdvanceBalance });
    }
  };

  // 5. FLEET & TRIP UPDATES
  const handleUpdateTrip = (updatedTrip: Trip) => {
    setAppState((prev) => ({
      ...prev,
      trips: prev.trips.map((t) => t.id === updatedTrip.id ? updatedTrip : t)
    }));
    persistIfUuid('update', 'trips', updatedTrip);
  };

  const handleAddVehicle = (vehicle: Vehicle) => {
    vehicle = withUuid(vehicle);
    setAppState((prev) => ({
      ...prev,
      vehicles: [...prev.vehicles, vehicle]
    }));
    void persist('insert', 'vehicles', vehicle);
  };

  const handleUpdateVehicle = (vehicle: Vehicle) => {
    setAppState((prev) => ({
      ...prev,
      vehicles: prev.vehicles.map((v) => v.id === vehicle.id ? vehicle : v)
    }));
    persistIfUuid('update', 'vehicles', vehicle);
  };

  const handleAddTrip = (trip: Trip) => {
    trip = withUuid(trip);
    setAppState((prev) => ({
      ...prev,
      trips: [...prev.trips, trip]
    }));
    void persist('insert', 'trips', trip);
  };

  // 6. INVENTORY UPDATES
  const handleUpdateInventory = (items: InventoryItem[]) => {
    setAppState((prev) => ({ ...prev, inventory: items }));
    for (const item of items) {
      if (isUuid(item.id) || item.code) void persist('upsert', 'products', item);
    }
  };

  // 7. HR EMPLOYEES UPDATE
  const handleUpdateEmployees = (emps: Employee[]) => {
    setAppState((prev) => ({ ...prev, employees: emps }));
    for (const e of emps) persistIfUuid('upsert', 'employees', e);
  };

  const handleDeleteEmployee = (empId: string) => {
    const s = stateRef.current;
    const emp = s.employees.find((e) => e.id === empId);
    if (!emp) return;
    if ((emp.advanceBalance || 0) !== 0) {
      alert(
        s.language === 'ur'
          ? `”${emp.urduName || emp.name}“ کے ذمے پیشگی رقم بقایا ہے (Rs ${(emp.advanceBalance || 0).toLocaleString()})۔ پہلے اسے کلیئر کریں۔`
          : `"${emp.name}" still has an outstanding advance of Rs ${(emp.advanceBalance || 0).toLocaleString()}. Clear it first.`
      );
      return;
    }
    setAppState((prev) => ({
      ...prev,
      employees: prev.employees.filter((e) => e.id !== empId),
    }));
    if (isUuid(empId)) void persist('delete', 'employees', { id: empId });
  };

  // 8. DAY CLOSING UPDATE
  const handleUpdateDayClosing = (closing: DayClosing) => {
    setAppState((prev) => ({ ...prev, dayClosing: closing }));
    void persist('upsert', 'day_closings', closing);
  };

  // 8.5. GENERAL JOURNAL ENTRY (ROZNAMCHA) HANDLERS
  const handleAddGeneralEntry = (entry: GeneralJournalEntry) => {
    entry = withUuid(entry);
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
    // The journal entry itself syncs (engine resolves account codes -> ids).
    // Derived account/party/ledger adjustments stay local-only in v1.
    void persist('insert', 'journal_entries', { entry });
  };

  const handleDeleteGeneralEntry = (entryId: string) => {
    setAppState((prev) => ({
      ...prev,
      generalEntries: (prev.generalEntries || []).filter(g => g.id !== entryId)
    }));
    if (isUuid(entryId)) void persist('delete', 'journal_entries', { id: entryId });
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
    void persist('upsert', 'day_closings', {
      ...stateRef.current.dayClosing,
      date: new Date().toISOString().split('T')[0],
      physicalCash: config.openingCash,
      systemCash: config.openingCash,
      variance: 0,
      totalSalesKg: 0,
      totalSalesAmount: 0,
      totalCollections: 0,
      isLocked: false,
    } as DayClosing);
    for (const item of stateRef.current.inventory) {
      void persist('upsert', 'products', item);
    }
    void persist('insert', 'mandi_rates', {
      id: crypto.randomUUID(),
      marketDate: new Date().toISOString().split('T')[0],
      city: config.city || 'Lahore',
      broilerRatePer40kg: config.mandiRate,
    });
  };

  // 10. SETTINGS: RESET SEED DATA
  const handleResetSeedData = () => {
    localStorage.removeItem('murgh_mandi_erp_data_v1');
    setAppState(loadSavedState());
  };

  // ============ AUTH GATE ============
  // (a) Public share-token route: invoice view WITHOUT login
  if (publicToken) {
    const isUrduPublic = appState.language === 'ur';
    return (
      <div className={`min-h-screen bg-slate-100/90 text-slate-900 flex items-center justify-center p-4 ${isUrduPublic ? 'font-urdu' : ''}`}>
        {publicInvoiceLoading ? (
          <div className="flex flex-col items-center gap-3 text-slate-600">
            <div className="w-10 h-10 rounded-full border-4 border-emerald-200 border-t-emerald-600 animate-spin" />
            <p className="text-sm font-medium">{isUrduPublic ? 'بل لوڈ ہو رہا ہے...' : 'Loading invoice...'}</p>
          </div>
        ) : publicViewingInvoice ? (
          <PublicInvoiceModal
            invoice={publicViewingInvoice}
            onClose={() => {
              setPublicViewingInvoice(null);
              window.history.replaceState({}, '', window.location.pathname);
            }}
            language={appState.language}
          />
        ) : publicInvoiceMissing ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-8 max-w-sm text-center">
            <h2 className="text-base font-bold text-slate-900 mb-1">
              {isUrduPublic ? 'بل نہیں ملا' : 'Invoice not found'}
            </h2>
            <p className="text-xs text-slate-500">
              {isUrduPublic
                ? 'یہ لنک غلط یا منسوخ شدہ ہے۔'
                : 'This link is invalid or the invoice was voided.'}
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  // (b) No session -> Login / Signup
  if (!session) {
    return authMode === 'login'
      ? <Login onSwitchToSignup={() => setAuthMode('signup')} />
      : <Signup onSwitchToLogin={() => setAuthMode('login')} />;
  }

  // (c) Session exists but profile still loading -> spinner
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-100/90 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-600">
          <div className="w-10 h-10 rounded-full border-4 border-emerald-200 border-t-emerald-600 animate-spin" />
          <p className="text-sm font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  // Session exists but no profile row (trigger hiccup) -> error with sign out
  if (!profile || !role) {
    const isUrdu = appState.language === 'ur';
    return (
      <div className="min-h-screen bg-slate-100/90 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-8 max-w-sm text-center">
          <h2 className="text-base font-bold text-slate-900 mb-1">
            {isUrdu ? 'پروفائل نہیں ملی' : 'Profile not found'}
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            {isUrdu
              ? 'آپ کا اکاؤنٹ پروفائل لوڈ نہیں ہو سکا۔ دوبارہ لاگ اِن کریں۔'
              : 'Your account profile could not be loaded. Please sign in again.'}
          </p>
          <button
            onClick={signOut}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-md"
          >
            {isUrdu ? 'سائن آؤٹ' : 'Sign Out'}
          </button>
        </div>
      </div>
    );
  }

  // (d) Authenticated shell — role comes from the profile, not the demo switcher.
  // =============================

  return (
    <div className={`min-h-screen bg-slate-100/90 text-slate-900 ${appState.language === 'ur' ? 'font-urdu' : ''}`}>
      {/* Global Top Navbar with Role & Language switcher */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={goToTab}
        currentRole={role}
        onSignOut={signOut}
        userName={profile.fullName}
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
            currentRole={role}
            language={appState.language}
            expenses={appState.expenses}
            onNavigateTab={goToTab}
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
            currentRole={role}
            language={appState.language}
            prefillOrder={orderToInvoice}
            onClearPrefillOrder={() => setOrderToInvoice(null)}
            onAddParty={handleAddParty}
            onSaveInvoice={handleSaveInvoice}
            onUpdateInvoice={handleUpdateInvoice}
            onDeleteInvoice={handleDeleteInvoice}
            onOpenReceiptModal={() => setIsReceiptModalOpen(true)}
            onViewPublicInvoice={(inv) => setPublicViewingInvoice(inv)}
          />
        )}

        {activeTab === 'expenses' && (
          <ExpensesView
            expenses={appState.expenses}
            vehicles={appState.vehicles}
            currentRole={role}
            language={appState.language}
            onAddExpense={handleAddExpense}
            onDeleteExpense={handleDeleteExpense}
          />
        )}

        {activeTab === 'customer_ledger' && (
          <CustomerLedgerView
            parties={appState.parties}
            ledgerEntries={appState.ledgerEntries}
            invoices={appState.invoices}
            currentRole={role}
            language={appState.language}
            onOpenReceiptModal={(partyId) => {
              setReceiptPreselectedPartyId(partyId);
              setIsReceiptModalOpen(true);
            }}
            onAddParty={handleAddParty}
            onUpdateParty={handleUpdateParty}
            onDeleteParty={handleDeleteParty}
            onEditLedgerEntry={handleEditLedgerEntry}
          />
        )}

        {activeTab === 'daily_sheet' && (
          <DailySheetView
            parties={appState.parties}
            receipts={appState.receipts}
            invoices={appState.invoices}
            currentRole={role}
            language={appState.language}
            onOpenReceiptModal={(partyId) => {
              setReceiptPreselectedPartyId(partyId);
              setIsReceiptModalOpen(true);
            }}
            onDeleteReceipt={handleDeleteReceipt}
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
            currentRole={role}
            language={appState.language}
            todayMandiRate={appState.todayMandiRate}
            onAddPurchase={handleAddPurchase}
            onOpenReceiptModal={(partyId) => {
              setReceiptPreselectedPartyId(partyId);
              setIsReceiptModalOpen(true);
            }}
            onAddParty={handleAddParty}
            onUpdateParty={handleUpdateParty}
            onDeleteParty={handleDeleteParty}
            onEditLedgerEntry={handleEditLedgerEntry}
          />
        )}

        {activeTab === 'orders' && (
          <OrdersView
            orders={appState.orders}
            parties={appState.parties}
            vehicles={appState.vehicles}
            staffProfiles={staffProfiles}
            currentUserId={profile?.id ?? null}
            currentUserName={profile?.fullName ?? null}
            currentRole={role}
            language={appState.language}
            onAddOrder={handleAddOrder}
            onUpdateOrder={handleUpdateOrder}
            onDeleteOrder={handleDeleteOrder}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            onConvertOrderToInvoice={handleConvertOrderToInvoice}
          />
        )}

        {activeTab === 'fleet' && (
          <FleetView
            vehicles={appState.vehicles}
            trips={appState.trips}
            orders={appState.orders}
            staffProfiles={staffProfiles}
            currentUserId={profile?.id ?? null}
            currentRole={role}
            language={appState.language}
            onAddVehicle={handleAddVehicle}
            onUpdateVehicle={handleUpdateVehicle}
            onAddTrip={handleAddTrip}
            onUpdateTrip={handleUpdateTrip}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryView
            inventory={appState.inventory}
            currentRole={role}
            language={appState.language}
            onUpdateInventory={handleUpdateInventory}
          />
        )}

        {activeTab === 'accounting' && (
          <AccountingView
            accounts={appState.accounts}
            dayClosing={appState.dayClosing}
            currentRole={role}
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
            currentRole={role}
            language={appState.language}
            onUpdateEmployees={handleUpdateEmployees}
            onDeleteEmployee={handleDeleteEmployee}
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

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BusinessProvider>
          <AppShell />
        </BusinessProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
