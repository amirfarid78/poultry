import React, { useState, useEffect } from 'react';
import { 
  loadSavedState, 
  loadSeedState,
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
  GeneralJournalEntry,
  AccountItem,
  ExpenseCategory,
  PaymentMode,
} from './types';
import { todayPKT, formatPKR } from './utils/calculations';

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
import { nextDocNumber } from './utils/docNumbers';
import { fetchPublicInvoice } from './lib/publicInvoice';

// Supabase data + offline sync
import { supabase } from './lib/supabase';
import { fetchAll, fetchStaffProfiles, fetchProducts } from './lib/db';
import type { StaffProfile } from './types';
import { peekOutbox } from './lib/offline';
import { startSyncEngine, noteSyncProblem } from './lib/sync';
import {
  persist,
  persistIfUuid,
  withUuid,
  isUuid,
  reconcileState,
  snapshotState,
} from './lib/remote';
import type { EmployeeAdvance } from './lib/db';

// ---------------------------------------------------------------------------
// P0-4: account effects engine (SQA fix 2026-11-22).
// Cash & bank were local-only: no handler ever touched `accounts`, so a fresh
// device showed Rs 0. Every money movement now posts category-aware effects
// (asset/expense: debit +, credit −; liability/equity/revenue: debit −,
// credit +) and the touched accounts are persisted via the outbox, so the
// server chart_of_accounts carries the true balances.
// ---------------------------------------------------------------------------

/** Cash/bank/wallet account for a payment mode. 'adjustment' moves no cash. */
const CASH_ACCOUNT_FOR_MODE: Record<PaymentMode, string | null> = {
  cash: '1010',
  bank_transfer: '1020',
  cheque: '1020',
  jazzcash: '1030',
  easypaisa: '1040',
  adjustment: null,
};

/** Expense category -> COA expense account (5040/5050/5060 are in the seeded structure below). */
const EXPENSE_ACCOUNT: Record<ExpenseCategory, string> = {
  fuel: '5020',
  labor: '5030',
  shed_rent: '5050',
  electricity: '5050',
  feed_misc: '5060',
  food_chai: '5060',
  repairs: '5060',
  other: '5060',
};

interface AccountEffect {
  code: string;
  debit: number;
  credit: number;
}

/** Apply effects to an accounts array; returns the new array + touched rows (for persisting). Unknown codes are skipped (COA seeding covers the known codes). */
function applyAccountEffectsTo(
  accounts: AccountItem[],
  effects: AccountEffect[]
): { accounts: AccountItem[]; touched: AccountItem[] } {
  let next = accounts;
  const touchedCodes = new Set<string>();
  for (const e of effects) {
    const acct = next.find((a) => a.code === e.code);
    if (!acct) continue;
    const dir =
      acct.category === 'liability' || acct.category === 'equity' || acct.category === 'revenue'
        ? -1
        : 1;
    const delta = dir * (e.debit - e.credit);
    if (delta === 0) continue;
    touchedCodes.add(e.code);
    next = next.map((a) => (a.code === e.code ? { ...a, balance: a.balance + delta } : a));
  }
  return { accounts: next, touched: next.filter((a) => touchedCodes.has(a.code)) };
}

/** Swap debit/credit on every effect (void / reversal of the original). */
const reverseAccountEffects = (effects: AccountEffect[]): AccountEffect[] =>
  effects.map((e) => ({ code: e.code, debit: e.credit, credit: e.debit }));

/** Sale: Dr 1050 Receivables / Cr 4010 Revenue; cash received at sale: Dr cash/bank, Cr 1050. */
const invoiceAccountEffects = (inv: Invoice): AccountEffect[] => {
  const effects: AccountEffect[] = [
    { code: '1050', debit: inv.totalAmount, credit: 0 },
    { code: '4010', debit: 0, credit: inv.totalAmount },
  ];
  if (inv.receivedCash > 0) {
    effects.push(
      { code: '1010', debit: inv.receivedCash, credit: 0 },
      { code: '1050', debit: 0, credit: inv.receivedCash }
    );
  }
  if (inv.receivedAC > 0) {
    effects.push(
      { code: '1020', debit: inv.receivedAC, credit: 0 },
      { code: '1050', debit: 0, credit: inv.receivedAC }
    );
  }
  return effects;
};

/** Receipt: customer pays -> Dr cash/bank, Cr 1050. Supplier paid -> Dr 2010 (payable down), Cr cash/bank. */
const receiptAccountEffects = (receipt: ReceiptVoucher): AccountEffect[] => {
  const cashCode = CASH_ACCOUNT_FOR_MODE[receipt.paymentMode];
  const effects: AccountEffect[] = [];
  if (receipt.partyType === 'customer') {
    if (cashCode) effects.push({ code: cashCode, debit: receipt.amount, credit: 0 });
    effects.push({ code: '1050', debit: 0, credit: receipt.amount });
  } else {
    effects.push({ code: '2010', debit: receipt.amount, credit: 0 });
    if (cashCode) effects.push({ code: cashCode, debit: 0, credit: receipt.amount });
  }
  return effects;
};

/** Purchase: Dr 5010 COGS / Cr 2010 Payables; amount paid at purchase: Dr 2010, Cr cash/bank. */
const purchaseAccountEffects = (purchase: Purchase): AccountEffect[] => {
  const effects: AccountEffect[] = [
    { code: '5010', debit: purchase.totalAmount, credit: 0 },
    { code: '2010', debit: 0, credit: purchase.totalAmount },
  ];
  const paid = (purchase.paidCash || 0) + (purchase.paidBank || 0);
  if (paid > 0) {
    effects.push({ code: '2010', debit: paid, credit: 0 });
    if (purchase.paidCash > 0) effects.push({ code: '1010', debit: 0, credit: purchase.paidCash });
    if (purchase.paidBank > 0) effects.push({ code: '1020', debit: 0, credit: purchase.paidBank });
  }
  return effects;
};

/** Expense: Dr expense account by category / Cr cash/bank (no cash leg for 'adjustment'). */
const expenseAccountEffects = (expense: ExpenseItem): AccountEffect[] => {
  const cashCode = CASH_ACCOUNT_FOR_MODE[expense.paymentMode];
  const effects: AccountEffect[] = [
    { code: EXPENSE_ACCOUNT[expense.category], debit: expense.amount, credit: 0 },
  ];
  if (cashCode) effects.push({ code: cashCode, debit: 0, credit: expense.amount });
  return effects;
};

/** Chart of accounts structure seeded (0 balances) when the server COA is empty (P0-4). */
function coaStructure(): AccountItem[] {
  const a = (
    code: string,
    name: string,
    urduName: string,
    category: AccountItem['category']
  ): AccountItem => ({ code, name, urduName, category, balance: 0 });
  return [
    a('1010', 'Cash in Hand (Galla)', 'نقد کیش گلہ', 'asset'),
    a('1020', 'Meezan Bank Current A/C', 'میزان بینک اکاؤنٹ', 'asset'),
    a('1030', 'JazzCash Merchant Wallet', 'جاز کیش مرچنٹ', 'asset'),
    a('1040', 'Easypaisa Business Wallet', 'ایزی پیسہ بزنس', 'asset'),
    a('1050', 'Customer Receivables (Udhaar)', 'گاہکوں سے بقایا جات', 'asset'),
    a('1060', 'Live Birds Farm Inventory', 'زندہ مرغ اسٹاک', 'asset'),
    a('2010', 'Supplier Payables', 'سپلائرز کے واجبات', 'liability'),
    a('3010', 'Owner Capital', 'مالک کا سرمایہ', 'equity'),
    a('4010', 'Chicken Sales Revenue', 'مرغ فروخت آمدن', 'revenue'),
    a('5010', 'Cost of Birds Purchased (COGS)', 'خریداری لاگت', 'expense'),
    a('5020', 'Vehicle Diesel & Maintenance', 'گاڑی ڈیزل و مرمت', 'expense'),
    a('5030', 'Staff Salaries & Expenses', 'تنخواہیں و اسٹاف خرچ', 'expense'),
    a('5040', 'Mortality & Weight Loss', 'اموات و وزن کمی', 'expense'),
    a('5050', 'Shed Rent & Utilities', 'شیڈ کرایہ و یوٹیلیٹیز', 'expense'),
    a('5060', 'Other Operating Expenses', 'دیگر کاروباری اخراجات', 'expense'),
  ];
}

/** A fresh BR-LIVE broiler row (used when local inventory has none — P0-5 / P1-7). */
const freshBroilerRow = (weightKg: number, count: number): InventoryItem => ({
  id: 'inv-item-1',
  code: 'BR-LIVE',
  name: 'Live Broiler Chicken',
  urduName: 'زندہ برائلر مرغ',
  category: 'broiler',
  currentWeightKg: weightKg,
  currentCount: count,
  unit: 'kg',
});

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
  // Ref mirror of the BR-LIVE stock row, updated synchronously by the stock
  // persist path (P1-31): rapid purchases must build on each other's
  // persisted value, not on the same stale pre-update base.
  const broilerStockRef = React.useRef<InventoryItem | null>(null);
  useEffect(() => {
    stateRef.current = appState;
    broilerStockRef.current =
      appState.inventory.find((i) => i.code === 'BR-LIVE' || i.id === 'inv-item-1') ?? null;
  }, [appState]);

  /** Pull every collection from Supabase and reconcile (server wins). */
  const refreshFromServer = React.useCallback(async () => {
    if (!session) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    try {
      const { state: remote, failed } = await fetchAll(supabase);
      if (failed.length > 0) {
        // A single failed collection used to vanish silently: its slice kept
        // whatever local state it had (often empty after a blank first run),
        // so the dashboard showed 0 for cash/stock/expenses with a clean
        // Online badge. Name the stale slices so the red chip shows them.
        noteSyncProblem(
          `Could not refresh from the server: ${failed.join(', ')} — showing the last saved data for those.`
        );
      }
      // Include quarantined entries: an unapplied local change is still the
      // freshest known state, so it must keep winning over stale server rows.
      const pending = await peekOutbox(true).catch(() => []);
      const next = reconcileState(stateRef.current, remote, pending);
      // P0-4: the server COA was empty (Chart tab showed a header only, and
      // every JV failed to sync with "account code(s) not found"). Seed the
      // structure (0 balances) once so the accounts exist everywhere; the
      // owner then sets opening balances in Accounting -> Chart of Accounts.
      // Only when the accounts fetch itself succeeded — an RLS/network
      // hiccup must not seed over unknown server state.
      let settled = next;
      if (next.accounts.length === 0 && !failed.includes('accounts')) {
        const seeded = coaStructure();
        settled = { ...next, accounts: seeded };
        for (const a of seeded) void persist('upsert', 'chart_of_accounts', a);
      }
      stateRef.current = settled;
      setAppState(settled);
      void snapshotState(settled).catch(() => {});
    } catch (e) {
      /* keep local state; will retry on next sync tick — but say so: a
         refresh that fails silently is how stale/demo data stays on screen */
      console.error('refreshFromServer failed:', e);
      noteSyncProblem('Could not refresh from the server — showing the last saved data on this device.');
    }
  }, [session]);

  // Initial cloud load once signed in.
  useEffect(() => {
    if (session && profile) void refreshFromServer();
  }, [session, profile, refreshFromServer]);

  // Start the offline outbox engine; refresh after each successful sync run.
  // NOTE: the refresh used to be gated on pendingCount === 0 ("drain first").
  // That stalled ALL server refreshes for the whole session whenever the
  // queue could not drain — e.g. a void-chained reissue waiting on a dead
  // void — so data from other devices never appeared. reconcileState already
  // shields pending writes, so refreshing with a non-empty queue is safe
  // and is what keeps the 30s poll working.
  const lastSyncAtRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (!session) return;
    const engine = startSyncEngine(supabase);
    const unsub = engine.subscribe((s) => {
      if (
        !s.isSyncing &&
        s.lastSyncAt &&
        s.lastSyncAt !== lastSyncAtRef.current
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
    setAppState((prev) => ({ ...prev, todayMandiRate: rate, mandiRateDate: todayPKT() }));
    void persist('insert', 'mandi_rates', {
      id: crypto.randomUUID(),
      marketDate: todayPKT(),
      city: 'Lahore',
      broilerRatePer40kg: rate,
    });
  };

  // 0. PARTY CRUD OPERATIONS (Customers & Suppliers)
  const handleAddParty = (party: Party) => {
    party = withUuid(party); // server PKs are UUIDs
    // P2-16: no silent duplicate parties. Same normalized name AND same
    // non-empty phone -> block; name-only match -> confirm first.
    const normName = party.name.trim().toLowerCase();
    const normPhone = (party.phone || '').trim();
    const sameNameAndPhone = stateRef.current.parties.some(
      (p) => p.name.trim().toLowerCase() === normName && (p.phone || '').trim() !== '' && (p.phone || '').trim() === normPhone
    );
    if (normPhone !== '' && sameNameAndPhone) {
      window.alert(
        `A party named "${party.name}" with phone ${party.phone} already exists — not added again.`
      );
      return;
    }
    const sameName = stateRef.current.parties.some(
      (p) => p.name.trim().toLowerCase() === normName
    );
    if (sameName && !window.confirm(`A party named "${party.name}" already exists. Add another one anyway?`)) {
      return;
    }
    setAppState((prev) => {
      let updatedEntries = prev.ledgerEntries;
      if (party.openingBalance !== 0) {
        const openingLedgerEntry: LedgerEntry = {
          id: `led-open-${Date.now()}`,
          partyId: party.id,
          partyType: party.partyType,
          entryDate: party.createdAt ? party.createdAt.split('T')[0] : todayPKT(),
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
    // Compute the merged party OUTSIDE the updater: the opening-balance
    // delta shifts currentBalance, and the *merged* party (not the raw
    // modal payload) is what must reach the server — persisting the raw
    // payload would write a stale current_balance and corrupt the server's
    // balance chain.
    const s0 = stateRef.current;
    const old0 = s0.parties.find((p) => p.id === updatedParty.id);
    const delta0 = old0 ? updatedParty.openingBalance - old0.openingBalance : 0;
    const merged0: Party = old0
      ? { ...updatedParty, currentBalance: old0.currentBalance + delta0 }
      : updatedParty;
    setAppState((prev) => {
      // Opening-balance edits must flow into the khata: shift the running
      // balances of every entry for this party by the delta so the chain
      // stays truthful, and refresh the opening entry itself.
      const delta = delta0;
      const mergedParty: Party = merged0;

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
    persistIfUuid('update', 'parties', merged0);
  };

  const handleDeleteParty = (partyId: string) => {
    const s = stateRef.current;
    const party = s.parties.find((p) => p.id === partyId);
    if (!party) return false;
    const isUrdu = s.language === 'ur';
    // Documents linked to this party. Invoices/receipts can never be
    // hard-deleted through RLS (append-only by design) and the FKs are
    // NO ACTION, so a party with history is removed through the
    // delete_party_cascade RPC, which wipes the party + every linked
    // document in one server transaction.
    const linkedInvoices = s.invoices.filter((i) => i.customerId === partyId);
    const linkedReceipts = s.receipts.filter((r) => r.partyId === partyId);
    const linkedPurchases = s.purchases.filter((p) => p.supplierId === partyId);
    const linkedOrders = s.orders.filter((o) => o.customerId === partyId);
    const docCount =
      linkedInvoices.length +
      linkedReceipts.length +
      linkedPurchases.length +
      linkedOrders.length;

    if (docCount === 0) {
      // No documents: the old plain delete (any manager+; RLS parties_delete_mgr).
      setAppState((prev) => ({
        ...prev,
        parties: prev.parties.filter((p) => p.id !== partyId),
        ledgerEntries: prev.ledgerEntries.filter((l) => l.partyId !== partyId),
      }));
      if (isUuid(partyId)) void persist('delete', 'parties', { id: partyId });
      return true;
    }

    // Cascade delete destroys audit history. It used to be owner-only, but
    // the shop staff hit a dead end ("only the owner can delete") when they
    // tried to delete a khata with history — so any staff role that can open
    // the khata now gets the same single confirm below (with the linked
    // counts) and the cascade runs. The RPC enforces the role list
    // server-side too (migration 20261126000001: owner/manager/accountant/
    // cashier). Run that migration or staff deletes bounce back on refresh.
    const ok = window.confirm(
      isUrdu
        ? `”${party.urduName || party.name}“ کا کھاتہ اور اس سے جڑا تمام ریکارڈ مستقل حذف ہو جائے گا: ${linkedInvoices.length} سیل، ${linkedReceipts.length} رسیدیں، ${linkedOrders.length} آرڈر، ${linkedPurchases.length} خریداریاں اور مکمل کھاتہ۔ یہ واپس نہیں ہوگا۔ جاری رکھیں؟`
        : `This permanently deletes the account of "${party.name}" and ALL of its linked data: ${linkedInvoices.length} sales, ${linkedReceipts.length} receipts, ${linkedOrders.length} orders, ${linkedPurchases.length} purchases and the full ledger. This cannot be undone. Continue?`
    );
    if (!ok) return false;

    // Optimistic local removal. Stock + cash mirror the server RPC and the
    // void flows exactly: live (non-void) invoices restore BR-LIVE stock and
    // rewind the day's sale/cash totals, purchases remove stock and return
    // their paid cash, live cash receipts rewind the safe. Voided docs
    // already had all of this reversed when they were voided.
    const liveInvoices = linkedInvoices.filter((i) => !i.isVoid);
    const liveReceipts = linkedReceipts.filter((r) => !r.isVoid);
    const birdEst = (w: number, c?: number) => c || Math.round(w / 2);
    const stockKg =
      liveInvoices.reduce((a, i) => a + i.netWeightKg, 0) -
      linkedPurchases.reduce((a, p) => a + p.netWeightKg, 0);
    const stockBirds =
      liveInvoices.reduce((a, i) => a + birdEst(i.netWeightKg, i.birdCount), 0) -
      linkedPurchases.reduce((a, p) => a + birdEst(p.netWeightKg, p.birdCount), 0);
    const invoiceCash = liveInvoices.reduce((a, i) => a + (i.receivedCash || 0), 0);
    const invoiceTotRec = liveInvoices.reduce(
      (a, i) => a + (i.receivedCash || 0) + (i.receivedAC || 0),
      0
    );
    const invoiceKg = liveInvoices.reduce((a, i) => a + i.netWeightKg, 0);
    const invoiceAmt = liveInvoices.reduce((a, i) => a + i.totalAmount, 0);
    const receiptCashDelta = liveReceipts
      .filter((r) => r.paymentMode === 'cash')
      .reduce((a, r) => a + (r.partyType === 'supplier' ? -r.amount : r.amount), 0);
    const receiptCollections = liveReceipts
      .filter((r) => r.partyType === 'customer')
      .reduce((a, r) => a + r.amount, 0);
    const purchaseCash = linkedPurchases.reduce((a, p) => a + (p.paidCash || 0), 0);
    const broiler = s.inventory.find(
      (i) => i.category === 'broiler' && (i.id === 'inv-item-1' || i.code === 'BR-LIVE')
    );
    const broilerAfter = broiler
      ? {
          ...broiler,
          currentWeightKg: Math.max(0, broiler.currentWeightKg + stockKg),
          currentCount: Math.max(0, (broiler.currentCount || 0) + stockBirds),
        }
      : null;

    setAppState((prev) => ({
      ...prev,
      parties: prev.parties.filter((p) => p.id !== partyId),
      invoices: prev.invoices.filter((i) => i.customerId !== partyId),
      receipts: prev.receipts.filter((r) => r.partyId !== partyId),
      purchases: prev.purchases.filter((p) => p.supplierId !== partyId),
      orders: prev.orders.filter((o) => o.customerId !== partyId),
      ledgerEntries: prev.ledgerEntries.filter((l) => l.partyId !== partyId),
      inventory: broilerAfter
        ? prev.inventory.map((inv) => (inv.id === broilerAfter.id ? broilerAfter : inv))
        : prev.inventory,
      dayClosing: {
        ...prev.dayClosing,
        systemCash: Math.max(0, prev.dayClosing.systemCash - invoiceCash - receiptCashDelta + purchaseCash),
        physicalCash: Math.max(0, prev.dayClosing.physicalCash - invoiceCash - receiptCashDelta + purchaseCash),
        totalSalesKg: Math.max(0, prev.dayClosing.totalSalesKg - invoiceKg),
        totalSalesAmount: Math.max(0, prev.dayClosing.totalSalesAmount - invoiceAmt),
        totalCollections: Math.max(0, prev.dayClosing.totalCollections - invoiceTotRec - receiptCollections),
      },
    }));
    if (isUuid(partyId)) {
      // Cascade FIRST so the outbox replays it before anything that follows.
      void persist('insert', 'party_deletes', { id: partyId, partyId });
      // Stock upsert, same pattern as the void flow (persistInvoiceStock).
      if (broilerAfter) void persist('upsert', 'products', broilerAfter);
    }
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
    const discountAmount = invoice.discountAmount || 0;
    // Gross bird value: total is already net of discount, so add it back —
    // the discount gets its own credit row below (2c) instead of silently
    // shrinking the bird row.
    const birdTotal = Math.max(0, invoice.totalAmount - chargesTotal + discountAmount);

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

    // 2c. One credit row for a flat discount, so the khata shows it
    // explicitly. Chained onto the running balance like the charge rows.
    if (discountAmount > 0) {
      chargeRunBal = Math.round(chargeRunBal - discountAmount);
      newLedgerEntries.push({
        id: `led-${Date.now()}-1d`,
        partyId: invoice.customerId,
        partyType: 'customer',
        entryDate: invoice.invoiceDate,
        detail: `Discount (رعایت) on ${invoice.invoiceNumber}`,
        detailUrdu: `رعایت: ${invoice.invoiceNumber} پر ${discountAmount.toLocaleString()} روپے`,
        folioNo: invoice.invoiceNumber,
        debit: 0,
        credit: discountAmount,
        runningBalance: chargeRunBal,
        refType: 'invoice_discount',
        refId: invoice.id,
        createdAt: new Date().toISOString()
      });
    }

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
    // first — sale, charge, discount and payment rows alike — mirroring the server
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

  // reversePurchaseForVoid: mirror of reverseInvoiceForVoid for a supplier
  // purchase — marks the purchase void, posts a local reversal row for its
  // trigger-posted ledger row, takes the supplier balance back down by
  // (total − paid), returns the paid cash to the safe and takes the stock
  // back out of BR-LIVE. The server void_purchase() does the same on its
  // side; the audit trail stays intact (nothing hard-deleted).
  const reversePurchaseForVoid = (prev: AppState, purchase: Purchase, reason: string): AppState => {
    if (purchase.isVoid) return prev;
    const now = new Date().toISOString();
    const todayStr = todayPKT();

    const party = prev.parties.find((p) => p.id === purchase.supplierId);
    const curBal = party?.currentBalance ?? purchase.newBalance;

    // Reverse the posted (non-void) purchase ledger row, newest first —
    // mirroring the server void_purchase(). There is exactly one such row
    // (debit = total, credit = paid), but walk the set generically.
    const posted = prev.ledgerEntries
      .filter((e) => e.refId === purchase.id && e.refType === 'purchase' && !e.isVoid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));

    let bal = curBal;
    const reversals: LedgerEntry[] = posted.map((row, i) => {
      bal = Math.round(bal - (row.debit || 0) + (row.credit || 0));
      return {
        id: `led-void-pur-${Date.now()}-${i}`,
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
        refId: purchase.id,
        createdAt: now,
      };
    });
    const newBal = bal;

    const voidedIds = new Set(posted.map((r) => r.id));
    const ledgerEntries = [
      ...prev.ledgerEntries.map((e) => (voidedIds.has(e.id) ? { ...e, isVoid: true } : e)),
      ...reversals,
    ];

    const updatedParties = prev.parties.map((p) =>
      p.id === purchase.supplierId ? { ...p, currentBalance: newBal } : p
    );

    // The purchase took paidCash out of the safe; the void returns it.
    const updatedDayClosing: DayClosing = {
      ...prev.dayClosing,
      systemCash: prev.dayClosing.systemCash + (purchase.paidCash || 0),
      physicalCash: prev.dayClosing.physicalCash + (purchase.paidCash || 0),
    };

    const updatedInventory = prev.inventory.map((inv) => {
      if (inv.category === 'broiler' && (inv.id === 'inv-item-1' || inv.code === 'BR-LIVE')) {
        return {
          ...inv,
          currentWeightKg: Math.max(0, inv.currentWeightKg - purchase.netWeightKg),
          currentCount: Math.max(0, (inv.currentCount || 0) - (purchase.birdCount || Math.round(purchase.netWeightKg / 2))),
        };
      }
      return inv;
    });

    return {
      ...prev,
      parties: updatedParties,
      purchases: prev.purchases.map((p) =>
        p.id === purchase.id ? { ...p, isVoid: true, voidReason: reason } : p
      ),
      ledgerEntries,
      dayClosing: updatedDayClosing,
      inventory: updatedInventory,
    };
  };

  // P0-5: persist the BR-LIVE stock movement server-side even when local
  // inventory is empty (fresh/blank device). Base on the synchronously
  // maintained broiler ref (P1-31: rapid saves build on each other, not on
  // the same stale pre-update base); fall back to fetching the server row
  // by code and upserting from server values, or insert a 0-row if missing.
  const persistStockDelta = async (weightDelta: number, countDelta: number) => {
    const base = broilerStockRef.current;
    if (base) {
      const nextRow: InventoryItem = {
        ...base,
        currentWeightKg: Math.max(0, base.currentWeightKg + weightDelta),
        currentCount: Math.max(0, (base.currentCount || 0) + countDelta),
      };
      broilerStockRef.current = nextRow;
      void persist('upsert', 'products', nextRow);
      return;
    }
    try {
      const serverItems = await fetchProducts(supabase);
      const server = serverItems.find((i) => i.code === 'BR-LIVE');
      const row: InventoryItem = server ?? freshBroilerRow(0, 0);
      const nextRow: InventoryItem = {
        ...row,
        currentWeightKg: Math.max(0, row.currentWeightKg + weightDelta),
        currentCount: Math.max(0, (row.currentCount || 0) + countDelta),
      };
      broilerStockRef.current = nextRow;
      void persist('upsert', 'products', nextRow);
    } catch {
      // Offline or products fetch failed: the sale/purchase is saved locally
      // and the server row is created on the next successful stock persist.
      // Never block the sale on this.
    }
  };

  // 1. SAVE INVOICE & AUTO-UPDATE LEDGERS, INVENTORY & ORDERS ATOMICALLY
  // Local apply is optimistic; the outbox replays to Supabase where DB
  // triggers post the authoritative ledger rows and balances (reconciled
  // back on the next refresh — see reconcileState).
  const handleSaveInvoice = (invoice: Invoice, linkedOrderId?: string) => {
    invoice = withUuid(invoice);
    const effects = invoiceAccountEffects(invoice);
    const { accounts, touched } = applyAccountEffectsTo(stateRef.current.accounts, effects);
    setAppState((prev) => ({ ...applyInvoiceToState(prev, invoice, linkedOrderId), accounts }));
    void persist('insert', 'invoices', invoice);
    for (const a of touched) void persist('upsert', 'chart_of_accounts', a);
    if (linkedOrderId && isUuid(linkedOrderId)) {
      void persist('update', 'orders', { id: linkedOrderId, status: 'invoiced' });
    }
    // Broiler stock movement -> products (upsert by code)
    void persistStockDelta(
      -invoice.netWeightKg,
      -(invoice.birdCount || Math.round(invoice.netWeightKg / 2))
    );
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
    const { accounts, touched } = applyAccountEffectsTo(
      s.accounts,
      reverseAccountEffects(invoiceAccountEffects(invoice))
    );
    setAppState((prev) => ({ ...reverseInvoiceForVoid(prev, invoice, voidReason), accounts }));
    // Void FIRST so the outbox replays it before anything that follows.
    // partyId lets the reconciler keep the local party balance until the
    // void RPC lands on the server.
    void persist('insert', 'invoice_voids', { id: invoiceId, invoiceId, reason: voidReason, partyId: invoice.customerId });
    for (const a of touched) void persist('upsert', 'chart_of_accounts', a);
    void persistStockDelta(
      invoice.netWeightKg,
      invoice.birdCount || Math.round(invoice.netWeightKg / 2)
    );
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
    const effects = [
      ...reverseAccountEffects(invoiceAccountEffects(current)),
      ...invoiceAccountEffects(fresh),
    ];
    const { accounts, touched } = applyAccountEffectsTo(s.accounts, effects);
    setAppState((prev) => ({ ...applyInvoiceToState(reverseInvoiceForVoid(prev, current, voidReason), fresh), accounts }));
    void persist('insert', 'invoice_voids', { id: current.id, invoiceId: current.id, reason: voidReason, partyId: current.customerId });
    // voidsInvoiceId chains the pair in the sync engine: the reissue waits
    // until the void has replayed, so a failed void can never double-count.
    void persist('insert', 'invoices', { ...fresh, voidsInvoiceId: current.id });
    for (const a of touched) void persist('upsert', 'chart_of_accounts', a);
    // Single stock upsert: restore the old sale's stock, deduct the new one.
    void persistStockDelta(
      current.netWeightKg - fresh.netWeightKg,
      (current.birdCount || Math.round(current.netWeightKg / 2)) -
        (fresh.birdCount || Math.round(fresh.netWeightKg / 2))
    );
  };

  // 2. SAVE PAYMENT-ONLY RECEIPT VOUCHER
  const handleSaveReceipt = (receipt: ReceiptVoucher) => {
    receipt = withUuid(receipt);
    const { accounts, touched } = applyAccountEffectsTo(
      stateRef.current.accounts,
      receiptAccountEffects(receipt)
    );
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
        dayClosing: updatedDayClosing,
        accounts,
      };
    });
    void persist('insert', 'receipts', receipt);
    for (const a of touched) void persist('upsert', 'chart_of_accounts', a);
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
    const { accounts, touched } = applyAccountEffectsTo(
      s.accounts,
      reverseAccountEffects(receiptAccountEffects(receipt))
    );
    setAppState((prev) => {
      const party = prev.parties.find((p) => p.id === receipt.partyId);
      const curBal = party?.currentBalance ?? receipt.newBalance;
      const newBal = curBal + receipt.amount;

      const reversal: LedgerEntry = {
        id: `led-void-rec-${Date.now()}`,
        partyId: receipt.partyId,
        partyType: receipt.partyType,
        entryDate: todayPKT(),
        detail: `VOID reversal (${voidReason}): payment ${receipt.receiptNumber}`,
        detailUrdu: `وائڈ واپسی (${voidReason}): ادائیگی ${receipt.receiptNumber}`,
        folioNo: receipt.receiptNumber,
        // W9: the original receipt posts credit=amount for BOTH party types
        // (customer: receivable down; supplier: payable down), so the
        // reversal is always debit=amount. The old code posted credit for
        // suppliers, which moved the balance the wrong way.
        debit: receipt.amount,
        credit: 0,
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
        accounts,
      };
    });
    void persist('insert', 'receipt_voids', { id: receiptId, receiptId, reason: voidReason, partyId: receipt.partyId });
    for (const a of touched) void persist('upsert', 'chart_of_accounts', a);
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
    if (entry.refType === 'opening') {
      // Opening rows exist only on this device (no server row, no ref_id for
      // the RPC fallback) — a ledger_edits entry could never apply and would
      // poison the outbox. The server's source of truth for the opening
      // balance is parties.opening_balance (the RPC syncs it too), so persist
      // the party instead.
      const party = s.parties.find((p) => p.id === entry.partyId);
      if (party) {
        const ob = Math.round((patch.debit || 0) - (patch.credit || 0));
        const updated = { ...party, openingBalance: ob };
        persistIfUuid('update', 'parties', updated);
      }
    } else {
      void persist('insert', 'ledger_edits', {
        id: entryId,
        entryId,
        ...patch,
        refId: entry.refId,
        refType: entry.refType,
        partyId: entry.partyId,
      });
    }
  };

  // 3. SAVE SUPPLIER PURCHASE & UPDATE INVENTORY & CASH
  const handleAddPurchase = (purchase: Purchase) => {
    purchase = withUuid(purchase);
    const { accounts, touched } = applyAccountEffectsTo(
      stateRef.current.accounts,
      purchaseAccountEffects(purchase)
    );
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

      // Increase Live Broiler stock. P0-5: if no local broiler row exists
      // (fresh device), create it from this purchase instead of no-op'ing.
      let updatedInventory = prev.inventory.map((inv) => {
        if (inv.category === 'broiler' && (inv.id === 'inv-item-1' || inv.code === 'BR-LIVE')) {
          return {
            ...inv,
            currentWeightKg: inv.currentWeightKg + purchase.netWeightKg,
            currentCount: (inv.currentCount || 0) + (purchase.birdCount || Math.round(purchase.netWeightKg / 2))
          };
        }
        return inv;
      });
      if (!updatedInventory.some((inv) => inv.category === 'broiler' && (inv.id === 'inv-item-1' || inv.code === 'BR-LIVE'))) {
        updatedInventory = [
          ...updatedInventory,
          freshBroilerRow(
            purchase.netWeightKg,
            purchase.birdCount || Math.round(purchase.netWeightKg / 2)
          ),
        ];
      }

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
        dayClosing: updatedDayClosing,
        accounts,
      };
    });
    void persist('insert', 'purchases', purchase);
    for (const a of touched) void persist('upsert', 'chart_of_accounts', a);
    // P1-31: the stock persist builds on the synchronously maintained
    // broiler ref (persistStockDelta), so two rapid purchases no longer
    // read the same stale pre-update base and overwrite each other.
    void persistStockDelta(
      purchase.netWeightKg,
      purchase.birdCount || Math.round(purchase.netWeightKg / 2)
    );
  };

  // 3. DELETE (VOID) A SUPPLIER PURCHASE — mirrors handleDeleteInvoice:
  // posts a reversal row, restores the supplier balance and the paid cash,
  // takes the stock back out, and marks the purchase void (never
  // hard-deleted, so the audit trail stays intact). The server side is the
  // void_purchase() RPC (migration 20261126000002). Single confirm dialog
  // is the only gate — same as the party cascade delete.
  const handleDeletePurchase = (purchaseId: string, reason?: string): boolean => {
    const s = stateRef.current;
    const purchase = s.purchases.find((p) => p.id === purchaseId);
    if (!purchase || purchase.isVoid) return false;
    const supplier = s.parties.find((p) => p.id === purchase.supplierId);
    const label = supplier?.urduName || supplier?.name || purchase.supplierName;
    const confirmText =
      s.language === 'ur'
        ? `”${label}“ کی خریداری ${purchase.purchaseNumber} (${purchase.netWeightKg} کلو، Rs ${purchase.totalAmount.toLocaleString()}) وائڈ (حذف) ہو جائے گی — اسٹاک کم ہوگا، بقایا واپس ہوگا اور ادا شدہ نقد واپس آئے گا۔ یہ واپس نہیں ہوگا۔ جاری رکھیں؟`
        : `This will void purchase ${purchase.purchaseNumber} from ${label} (${purchase.netWeightKg} kg, Rs ${purchase.totalAmount.toLocaleString()}) — stock will reduce, the balance will reverse and the paid cash will return. This cannot be undone. Continue?`;
    if (!window.confirm(confirmText)) return false;
    const voidReason = reason || (s.language === 'ur' ? 'صارف نے حذف کیا' : 'Deleted by user');
    const { accounts, touched } = applyAccountEffectsTo(
      s.accounts,
      reverseAccountEffects(purchaseAccountEffects(purchase))
    );
    setAppState((prev) => ({ ...reversePurchaseForVoid(prev, purchase, voidReason), accounts }));
    // Void FIRST so the outbox replays it before anything that follows.
    void persist('insert', 'purchase_voids', { id: purchaseId, purchaseId, reason: voidReason, partyId: purchase.supplierId });
    for (const a of touched) void persist('upsert', 'chart_of_accounts', a);
    void persistStockDelta(
      -purchase.netWeightKg,
      -(purchase.birdCount || Math.round(purchase.netWeightKg / 2))
    );
    return true;
  };

  // 3.5. EXPENSES HANDLERS
  const handleAddExpense = (expense: ExpenseItem) => {
    expense = withUuid(expense);
    const { accounts, touched } = applyAccountEffectsTo(
      stateRef.current.accounts,
      expenseAccountEffects(expense)
    );
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
        dayClosing: updatedDayClosing,
        accounts,
      };
    });
    void persist('insert', 'expenses', expense);
    for (const a of touched) void persist('upsert', 'chart_of_accounts', a);
  };

  const handleDeleteExpense = (expenseId: string) => {
    const target0 = stateRef.current.expenses.find((e) => e.id === expenseId);
    const { accounts, touched } = target0
      ? applyAccountEffectsTo(
          stateRef.current.accounts,
          reverseAccountEffects(expenseAccountEffects(target0))
        )
      : { accounts: stateRef.current.accounts, touched: [] as AccountItem[] };
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
        dayClosing: updatedDayClosing,
        accounts,
      };
    });
    if (isUuid(expenseId)) void persist('delete', 'expenses', { id: expenseId });
    for (const a of touched) void persist('upsert', 'chart_of_accounts', a);
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
    const todayStr = todayPKT();
    // P1-23: an advance is a receivable (advanceBalance), NOT an expense.
    // The old code also created a labor expense for the same amount, so the
    // advance was expensed AND tracked as recoverable (double-counted in
    // P&L), and HRView pre-incremented the balance on top of this handler.
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
        dayClosing: updatedDayClosing
      };
    });

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
    // P1-16: the receivables account is 1050, NOT 1020 (1020 is Meezan
    // Bank). The old code linked a party's balance to the bank account, so
    // a default JV with a party linked silently reduced that party's balance.
    const { accounts, touched } = applyAccountEffectsTo(stateRef.current.accounts, [
      { code: entry.debitAccountCode, debit: entry.amount, credit: 0 },
      { code: entry.creditAccountCode, debit: 0, credit: entry.amount },
    ]);
    setAppState((prev) => {
      const updatedGeneral = [entry, ...(prev.generalEntries || [])];

      let updatedParties = prev.parties;
      let updatedLedger = prev.ledgerEntries;

      if (entry.partyId) {
        const party = prev.parties.find(p => p.id === entry.partyId);
        if (party) {
          const isCustomerCredit = entry.creditAccountCode === '1050';
          const isCustomerDebit = entry.debitAccountCode === '1050';
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

      const updatedAccounts = accounts;

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
    // P0-4: the touched account balances now sync too (they were local-only).
    void persist('insert', 'journal_entries', { entry });
    for (const a of touched) void persist('upsert', 'chart_of_accounts', a);
  };

  const handleDeleteGeneralEntry = (entryId: string) => {
    const target = stateRef.current.generalEntries?.find((g) => g.id === entryId);
    if (!target) return;
    // Deleting a JV must reverse its effects (the old code only removed the
    // entry row, leaving the party balance, khata row and account balances
    // wrong). Mirror handleAddGeneralEntry with debit/credit swapped.
    const { accounts, touched } = applyAccountEffectsTo(stateRef.current.accounts, [
      { code: target.debitAccountCode, debit: 0, credit: target.amount },
      { code: target.creditAccountCode, debit: target.amount, credit: 0 },
    ]);
    setAppState((prev) => {
      let parties = prev.parties;
      let ledgerEntries = prev.ledgerEntries;
      if (target.partyId) {
        const party = prev.parties.find((p) => p.id === target.partyId);
        if (party) {
          const isCustomerCredit = target.creditAccountCode === '1050';
          const isCustomerDebit = target.debitAccountCode === '1050';
          const balDelta = isCustomerCredit ? target.amount : isCustomerDebit ? -target.amount : 0;
          parties = prev.parties.map((p) =>
            p.id === target.partyId ? { ...p, currentBalance: p.currentBalance + balDelta } : p
          );
          ledgerEntries = prev.ledgerEntries.filter((l) => l.refId !== entryId);
        }
      }
      let dayClosing = prev.dayClosing;
      if (target.debitAccountCode === '1010') {
        dayClosing = {
          ...prev.dayClosing,
          physicalCash: Math.max(0, prev.dayClosing.physicalCash - target.amount),
          systemCash: Math.max(0, prev.dayClosing.systemCash - target.amount),
        };
      } else if (target.creditAccountCode === '1010') {
        dayClosing = {
          ...prev.dayClosing,
          physicalCash: prev.dayClosing.physicalCash + target.amount,
          systemCash: prev.dayClosing.systemCash + target.amount,
        };
      }
      return {
        ...prev,
        generalEntries: (prev.generalEntries || []).filter((g) => g.id !== entryId),
        parties,
        ledgerEntries,
        accounts,
        dayClosing,
      };
    });
    if (isUuid(entryId)) void persist('delete', 'journal_entries', { id: entryId });
    for (const a of touched) void persist('upsert', 'chart_of_accounts', a);
  };

  // P1-8: mortality posts a journal entry — Dr 5040 Mortality & Weight Loss
  // / Cr 1060 Farm Inventory, amount = dead kg valued at the mandi rate.
  // (5040 is the dedicated mortality account; 5020 is Diesel — the audit
  // note's "5020" was the seed's diesel code, corrected here.) Skipped when
  // the computed amount is 0 (no rate set yet).
  const handleRecordMortality = (deadKg: number, reason: string) => {
    const s = stateRef.current;
    if (deadKg <= 0 || s.todayMandiRate <= 0) return;
    const amount = Math.round((deadKg * s.todayMandiRate) / 40);
    if (amount <= 0) return;
    handleAddGeneralEntry({
      id: crypto.randomUUID(),
      entryNumber: nextDocNumber('JV', s.generalEntries.map((g) => g.entryNumber), 200),
      entryDate: todayPKT(),
      description: `Mortality: ${deadKg} kg — ${reason}`,
      descriptionUrdu: `اموات: ${deadKg} کلو — ${reason}`,
      debitAccountCode: '5040',
      debitAccountName: 'Mortality & Weight Loss',
      creditAccountCode: '1060',
      creditAccountName: 'Live Birds Farm Inventory',
      amount,
      createdBy: 'System / سسٹم',
      createdAt: new Date().toISOString(),
    });
  };

  // P0-4(e): Chart of Accounts opening-balance editor (AccountingView).
  const handleUpdateAccounts = (updatedAccounts: AccountItem[]) => {
    setAppState((prev) => ({ ...prev, accounts: updatedAccounts }));
    for (const a of updatedAccounts) void persist('upsert', 'chart_of_accounts', a);
  };

  // 9. SETTINGS: 1-CLICK QUICK BUSINESS SETUP
  // Shop name/owner/city are saved to Business Settings by SettingsView
  // (useBusiness) — this handler owns rate/cash/stock/closing only.
  const handleQuickBusinessSetup = (config: {
    shopNameUrdu: string;
    shopNameEn: string;
    ownerName: string;
    city: string;
    openingCash: number;
    mandiRate: number;
    startingStockKg: number;
  }) => {
    const today = todayPKT();
    // P1-7: match the broiler row by code BR-LIVE (not only the seed id
    // inv-item-1, which is gone after any server refresh); create it when
    // no local broiler row exists at all.
    const s0 = stateRef.current;
    const existing = s0.inventory.find(
      (inv) => inv.category === 'broiler' && (inv.code === 'BR-LIVE' || inv.id === 'inv-item-1')
    );
    const freshBroiler: InventoryItem = existing
      ? {
          ...existing,
          currentWeightKg: config.startingStockKg,
          currentCount: Math.round(config.startingStockKg / 2),
        }
      : freshBroilerRow(config.startingStockKg, Math.round(config.startingStockKg / 2));
    // P0-4: the opening cash lands on account 1010 (Cash in Hand) so the
    // cash card is true on every device; seed the COA structure first when
    // there are no accounts at all.
    const baseAccounts = s0.accounts.length > 0 ? s0.accounts : coaStructure();
    const accountsWithCash = baseAccounts.map((a) =>
      a.code === '1010' ? { ...a, balance: config.openingCash } : a
    );
    setAppState((prev) => {
      const freshClosing: DayClosing = {
        id: `close-${today}`,
        date: today,
        physicalCash: config.openingCash,
        systemCash: config.openingCash,
        variance: 0,
        totalSalesKg: 0,
        totalSalesAmount: 0,
        totalCollections: 0,
        isLocked: false,
        lockedBy: 'System / سسٹم'
      };

      const mappedInventory = prev.inventory.map((inv) => {
        if (inv.category === 'broiler' && (inv.code === 'BR-LIVE' || inv.id === 'inv-item-1')) {
          return {
            ...inv,
            currentWeightKg: config.startingStockKg,
            currentCount: Math.round(config.startingStockKg / 2)
          };
        }
        return inv;
      });
      const freshInventory = mappedInventory.some(
        (inv) => inv.category === 'broiler' && (inv.code === 'BR-LIVE' || inv.id === 'inv-item-1')
      )
        ? mappedInventory
        : [...mappedInventory, freshBroiler];

      return {
        ...prev,
        todayMandiRate: config.mandiRate,
        mandiRateDate: today,
        dayClosing: freshClosing,
        inventory: freshInventory,
        accounts: accountsWithCash,
      };
    });
    void persist('upsert', 'day_closings', {
      ...stateRef.current.dayClosing,
      date: today,
      physicalCash: config.openingCash,
      systemCash: config.openingCash,
      variance: 0,
      totalSalesKg: 0,
      totalSalesAmount: 0,
      totalCollections: 0,
      isLocked: false,
    } as DayClosing);
    for (const a of accountsWithCash) void persist('upsert', 'chart_of_accounts', a);
    void persist('upsert', 'products', freshBroiler);
    void persist('insert', 'mandi_rates', {
      id: crypto.randomUUID(),
      marketDate: today,
      city: config.city || 'Lahore',
      broilerRatePer40kg: config.mandiRate,
    });
  };

  // 10. SETTINGS: RESET SEED DATA
  const handleResetSeedData = () => {
    localStorage.removeItem('murgh_mandi_erp_data_v1');
    setAppState(loadSeedState());
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
            ledgerEntries={appState.ledgerEntries}
            orders={appState.orders}
            vehicles={appState.vehicles}
            trips={appState.trips}
            inventory={appState.inventory}
            accounts={appState.accounts}
            todayMandiRate={appState.todayMandiRate}
            currentRole={role}
            language={appState.language}
            expenses={appState.expenses}
            purchases={appState.purchases}
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
            inventory={appState.inventory}
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
            ledgerEntries={appState.ledgerEntries}
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
          <div className="space-y-4 max-w-3xl mx-auto">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
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

            {/* W8: the screen used to show no list/totals/history at all. */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h3 className="text-sm font-extrabold text-slate-900">
                  {appState.language === 'ur' ? 'وصولی واؤچرز کی تاریخ' : 'Receipt Voucher History'}
                </h3>
                <div className="flex gap-4 text-xs">
                  <span className="text-emerald-700 font-bold">
                    {appState.language === 'ur' ? 'وصولی' : 'Received'}: {formatPKR(appState.receipts.filter((r) => !r.isVoid && r.partyType === 'customer').reduce((s, r) => s + r.amount, 0), true, appState.language)}
                  </span>
                  <span className="text-rose-700 font-bold">
                    {appState.language === 'ur' ? 'ادائیگی' : 'Paid out'}: {formatPKR(appState.receipts.filter((r) => !r.isVoid && r.partyType === 'supplier').reduce((s, r) => s + r.amount, 0), true, appState.language)}
                  </span>
                  <span className="text-slate-500">
                    {appState.receipts.filter((r) => !r.isVoid).length} {appState.language === 'ur' ? 'واؤچر' : 'vouchers'}
                  </span>
                </div>
              </div>
              {appState.receipts.length === 0 ? (
                <p className="text-xs text-slate-500">
                  {appState.language === 'ur' ? 'ابھی تک کوئی وصولی واؤچر نہیں۔' : 'No receipt vouchers yet.'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500 border-b">
                        <th className="py-2 pr-2">{appState.language === 'ur' ? 'تاریخ' : 'Date'}</th>
                        <th className="py-2 pr-2">{appState.language === 'ur' ? 'نمبر' : 'No.'}</th>
                        <th className="py-2 pr-2">{appState.language === 'ur' ? 'فریق' : 'Party'}</th>
                        <th className="py-2 pr-2">{appState.language === 'ur' ? 'قسم' : 'Type'}</th>
                        <th className="py-2 pr-2 text-right">{appState.language === 'ur' ? 'رقم' : 'Amount'}</th>
                        <th className="py-2 pr-2">{appState.language === 'ur' ? 'طریقہ' : 'Mode'}</th>
                        <th className="py-2 pr-2 text-right">{appState.language === 'ur' ? 'بقیہ' : 'Balance'}</th>
                        <th className="py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {[...appState.receipts]
                        .sort((a, b) => b.receiptDate.localeCompare(a.receiptDate) || b.receiptNumber.localeCompare(a.receiptNumber))
                        .map((r) => {
                          const party = appState.parties.find((p) => p.id === r.partyId);
                          return (
                            <tr key={r.id} className={`border-b last:border-0 ${r.isVoid ? 'opacity-50 line-through' : ''}`}>
                              <td className="py-2 pr-2 whitespace-nowrap">{r.receiptDate}</td>
                              <td className="py-2 pr-2 font-mono">{r.receiptNumber}{r.isVoid ? ' (VOID)' : ''}</td>
                              <td className="py-2 pr-2">{party?.name || '—'}{party?.partyType === 'supplier' ? ' (Supplier)' : ''}</td>
                              <td className="py-2 pr-2">{r.partyType === 'supplier' ? (appState.language === 'ur' ? 'سپلائر کو ادائیگی' : 'Supplier payment') : (appState.language === 'ur' ? 'گاہک سے وصولی' : 'Customer receipt')}</td>
                              <td className={`py-2 pr-2 text-right font-bold ${r.partyType === 'supplier' ? 'text-rose-700' : 'text-emerald-700'}`}>
                                {r.partyType === 'supplier' ? '−' : '+'}{formatPKR(r.amount, true, appState.language)}
                              </td>
                              <td className="py-2 pr-2">{r.paymentMode}</td>
                              <td className="py-2 pr-2 text-right">{formatPKR(r.newBalance, true, appState.language)}</td>
                              <td className="py-2 text-right">
                                {!r.isVoid && (
                                  <button
                                    onClick={() => handleDeleteReceipt(r.id)}
                                    className="px-2 py-1 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-[11px] font-bold"
                                  >
                                    {appState.language === 'ur' ? 'وائڈ' : 'Void'}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
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
            onDeletePurchase={handleDeletePurchase}
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
            expenses={appState.expenses}
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
            onRecordMortality={handleRecordMortality}
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
            onUpdateAccounts={handleUpdateAccounts}
            inventory={appState.inventory}
            employees={appState.employees}
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
        receipts={appState.receipts}
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
