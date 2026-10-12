// ============================================================================
// Murgh Mandi ERP — Supabase data-access layer (src/lib/db.ts)
//
// camelCase app types (src/types/index.ts) <-> snake_case Postgres rows.
// Rules enforced here:
//   * NUMERIC columns are coerced to numbers (PostgREST may return strings).
//   * Dates/timestamps are surfaced as ISO strings, matching app types.
//   * NEVER write to ledger_entries from the client — DB triggers own it.
//   * NEVER send previous_balance / new_balance on invoice/receipt inserts —
//     the BEFORE INSERT triggers (process_invoice_ledger / process_receipt_ledger)
//     compute them and update parties.current_balance atomically.
//   * Purchases have no ledger trigger, so previous/new balance ARE sent for them
//     (columns are NOT NULL with no default).
//   * All writers accept client-generated UUID primary keys so offline outbox
//     replays are idempotent (upsert on conflict of the PK).
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Party,
  Invoice,
  ReceiptVoucher,
  LedgerEntry,
  Purchase,
  OrderItem,
  Vehicle,
  Trip,
  TripPing,
  InventoryItem,
  AccountItem,
  Employee,
  DayClosing,
  ExpenseItem,
  GeneralJournalEntry,
  UserProfile,
  BusinessSettings,
} from '../types';
import type { AppState } from '../services/store';

export type Db = SupabaseClient;
type Row = Record<string, any>;

// ---------------------------------------------------------------------------
// Coercion helpers
// ---------------------------------------------------------------------------

const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const str = (v: unknown, fallback = ''): string =>
  v === null || v === undefined ? fallback : String(v);

const optStr = (v: unknown): string | undefined =>
  v === null || v === undefined || v === '' ? undefined : String(v);

const optNum = (v: unknown): number | undefined =>
  v === null || v === undefined || v === '' ? undefined : num(v);

const iso = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

const isUuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Pass a value through only when it is a real UUID (FK columns reject junk). */
const uuidOrUndefined = (v: unknown): string | undefined =>
  isUuid(v) ? v : undefined;

// ---------------------------------------------------------------------------
// App-only auxiliary types (no 1:1 row in src/types/index.ts)
// ---------------------------------------------------------------------------

export interface MandiRate {
  id: string;
  marketDate: string; // YYYY-MM-DD
  city: string;
  broilerRatePer40kg: number;
  layerRatePer40kg?: number;
  desiRatePer40kg?: number;
  notes?: string;
  createdAt: string;
}

export type MandiRateInput = Omit<MandiRate, 'id' | 'createdAt'> & {
  id?: string;
};

export interface EmployeeAdvance {
  id: string;
  employeeId: string;
  advanceDate: string;
  amount: number;
  recoveryPlan?: string;
  status: string;
  createdAt: string;
}

export type EmployeeAdvanceInput = Omit<EmployeeAdvance, 'id' | 'createdAt'> & {
  id?: string;
};

export interface WhatsappLogInput {
  id?: string;
  recipientPhone: string;
  refType: string;
  refId?: string;
  messageSnippet?: string;
  sharedBy?: string; // profiles UUID; omitted unless a real UUID
}

/** Server-reconciled result after inserting an invoice or receipt. */
export interface InvoiceWriteResult {
  invoice: Invoice;
  ledger: LedgerEntry[];
  party: Party | null;
}

export interface ReceiptWriteResult {
  receipt: ReceiptVoucher;
  ledger: LedgerEntry[];
  party: Party | null;
}

// ---------------------------------------------------------------------------
// Row -> app mappers (snake_case -> camelCase)
// ---------------------------------------------------------------------------

function mapParty(r: Row): Party {
  return {
    id: str(r.id),
    partyType: (r.party_type as Party['partyType']) ?? 'customer',
    name: str(r.name),
    urduName: str(r.urdu_name),
    phone: str(r.phone),
    whatsapp: str(r.whatsapp),
    address: str(r.address),
    city: str(r.city, 'Lahore'),
    openingBalance: num(r.opening_balance),
    currentBalance: num(r.current_balance),
    creditLimit: num(r.credit_limit),
    defaultKilo: num(r.default_kilo),
    cnic: optStr(r.cnic),
    ntn: optStr(r.ntn),
    createdAt: iso(r.created_at),
  };
}

function mapInvoice(r: Row): Invoice {
  const customer = r.customer ?? {};
  return {
    id: str(r.id),
    invoiceNumber: str(r.invoice_number),
    invoiceDate: str(r.invoice_date),
    customerId: str(r.customer_id),
    customerName: str(customer.name, str(r.customer_name)),
    customerUrduName: str(customer.urdu_name),
    mandiRatePer40kg: num(r.mandi_rate_per_40kg),
    saleRatePer40kg: num(r.sale_rate_per_40kg),
    grossWeightKg: num(r.gross_weight_kg),
    shrinkageKg: num(r.shrinkage_kg),
    netWeightKg: num(r.net_weight_kg),
    birdCount: num(r.bird_count),
    mannDivisor: num(r.mann_divisor, 40),
    totalAmount: num(r.total_amount),
    receivedCash: num(r.received_cash),
    receivedAC: num(r.received_ac),
    acPaymentMode: (r.ac_payment_mode as Invoice['acPaymentMode']) ?? 'cash',
    acRefNo: optStr(r.ac_ref_no),
    discountAmount: optNum(r.discount_amount),
    previousBalance: num(r.previous_balance),
    newBalance: num(r.new_balance),
    vehicleId: optStr(r.vehicle_id),
    driverId: optStr(r.driver_id),
    shareToken: str(r.share_token),
    notes: optStr(r.void_reason),
    createdBy: str(r.created_by_name ?? ''),
    createdAt: iso(r.created_at),
  };
}

function mapReceipt(r: Row): ReceiptVoucher {
  return {
    id: str(r.id),
    receiptNumber: str(r.receipt_number),
    receiptDate: str(r.receipt_date),
    partyId: str(r.party_id),
    partyType: (r.party_type as ReceiptVoucher['partyType']) ?? 'customer',
    amount: num(r.amount),
    paymentMode: (r.payment_mode as ReceiptVoucher['paymentMode']) ?? 'cash',
    bankName: optStr(r.bank_name),
    refNo: optStr(r.ref_no),
    notes: optStr(r.notes),
    collectedBy: undefined,
    previousBalance: num(r.previous_balance),
    newBalance: num(r.new_balance),
    shareToken: str(r.share_token),
    createdAt: iso(r.created_at),
  };
}

function mapPurchase(r: Row): Purchase {
  const supplier = r.supplier ?? {};
  return {
    id: str(r.id),
    purchaseNumber: str(r.purchase_number),
    purchaseDate: str(r.purchase_date),
    supplierId: str(r.supplier_id),
    supplierName: str(supplier.name, str(r.supplier_name)),
    ratePer40kg: num(r.rate_per_40kg),
    grossWeightKg: num(r.gross_weight_kg),
    mortalityKg: num(r.mortality_kg),
    netWeightKg: num(r.net_weight_kg),
    birdCount: num(r.bird_count),
    totalAmount: num(r.total_amount),
    paidCash: num(r.paid_cash),
    paidBank: num(r.paid_bank),
    previousBalance: num(r.previous_balance),
    newBalance: num(r.new_balance),
    createdAt: iso(r.created_at),
  };
}

function mapExpense(r: Row): ExpenseItem {
  return {
    id: str(r.id),
    expenseNumber: str(r.expense_number),
    date: str(r.expense_date),
    category: (r.category as ExpenseItem['category']) ?? 'other',
    categoryName: str(r.category_name),
    categoryUrduName: str(r.category_urdu_name),
    amount: num(r.amount),
    paymentMode: (r.payment_mode as ExpenseItem['paymentMode']) ?? 'cash',
    vehicleId: optStr(r.vehicle_id),
    description: str(r.description),
    descriptionUrdu: optStr(r.description_urdu),
    paidTo: optStr(r.paid_to),
    createdBy: '',
    createdAt: iso(r.created_at),
  };
}

function mapLedger(r: Row): LedgerEntry {
  return {
    id: str(r.id),
    partyId: str(r.party_id),
    partyType: (r.party?.party_type as LedgerEntry['partyType']) ?? 'customer',
    entryDate: str(r.entry_date),
    detail: str(r.detail),
    detailUrdu: str(r.detail_urdu),
    folioNo: str(r.folio_no),
    debit: num(r.debit),
    credit: num(r.credit),
    runningBalance: num(r.running_balance),
    refType: (r.ref_type as LedgerEntry['refType']) ?? 'adjustment',
    refId: optStr(r.ref_id),
    mandiRate: optNum(r.mandi_rate),
    rate: optNum(r.rate),
    weightKg: optNum(r.weight_kg),
    createdAt: iso(r.created_at),
  };
}

function mapProduct(r: Row): InventoryItem {
  return {
    id: str(r.id),
    code: str(r.code),
    name: str(r.name),
    urduName: str(r.urdu_name),
    category: (r.category as InventoryItem['category']) ?? 'broiler',
    currentWeightKg: num(r.current_weight_kg),
    currentCount: num(r.current_bird_count),
    unit: str(r.unit_of_measure, 'kg'),
  };
}

function mapMandiRate(r: Row): MandiRate {
  return {
    id: str(r.id),
    marketDate: str(r.market_date),
    city: str(r.city, 'Lahore'),
    broilerRatePer40kg: num(r.broiler_rate_per_40kg),
    layerRatePer40kg: optNum(r.layer_rate_per_40kg),
    desiRatePer40kg: optNum(r.desi_rate_per_40kg),
    notes: optStr(r.notes),
    createdAt: iso(r.created_at),
  };
}

function mapVehicle(r: Row, latestDriver?: { driverId?: string; driverName?: string }): Vehicle {
  return {
    id: str(r.id),
    plateNumber: str(r.plate_number),
    model: str(r.model),
    capacityKg: num(r.capacity_kg),
    driverId: latestDriver?.driverId,
    driverName: latestDriver?.driverName,
    isActive: r.is_active !== false,
  };
}

function mapOrder(r: Row): OrderItem {
  const customer = r.customer ?? {};
  return {
    id: str(r.id),
    orderNumber: str(r.order_number),
    orderDate: str(r.order_date),
    customerId: str(r.customer_id),
    customerName: str(customer.name),
    customerUrduName: str(customer.urdu_name),
    bookerId: str(r.booker_id),
    bookerName: str(r.booker?.full_name),
    assignedVehicleId: optStr(r.assigned_trip?.vehicle_id),
    expectedKg: num(r.expected_kg),
    expectedBirdCount: optNum(r.expected_bird_count),
    quotedRatePer40kg: num(r.quoted_rate_per_40kg),
    deliverySlot: str(r.delivery_time_slot),
    deliveryRoute: str(r.delivery_route),
    status: (r.status as OrderItem['status']) ?? 'booked',
    specialNotes: optStr(r.special_notes),
    createdAt: iso(r.created_at),
  };
}

function mapTrip(r: Row, pings: TripPing[]): Trip {
  const last = pings[pings.length - 1];
  const load = num(r.total_load_kg);
  return {
    id: str(r.id),
    tripNumber: str(r.trip_number),
    vehicleId: str(r.vehicle_id),
    plateNumber: str(r.vehicle?.plate_number),
    driverId: str(r.driver_id),
    driverName: str(r.driver?.full_name),
    status: (r.status as Trip['status']) ?? 'planned',
    startTime: optStr(r.start_time),
    endTime: optStr(r.end_time),
    startKm: optNum(r.start_km),
    endKm: optNum(r.end_km),
    fuelExpense: num(r.fuel_expense),
    totalLoadKg: load,
    deliveredKg: Math.max(0, load - num(r.shortage_kg)),
    currentLat: last ? last.lat : 0,
    currentLng: last ? last.lng : 0,
    stops: [],
    path: pings.map((p) => [p.lat, p.lng] as [number, number]),
  };
}

function mapPing(r: Row): TripPing {
  return {
    lat: num(r.lat),
    lng: num(r.lng),
    speed: num(r.speed),
    timestamp: iso(r.created_at),
  };
}

function mapEmployee(r: Row): Employee {
  return {
    id: str(r.id),
    code: str(r.employee_code),
    name: str(r.name),
    urduName: str(r.urdu_name),
    role: (r.role as Employee['role']) ?? 'cashier',
    phone: str(r.phone),
    cnic: str(r.cnic),
    monthlySalary: num(r.monthly_salary),
    advanceBalance: num(r.advance_balance),
    joiningDate: str(r.joining_date),
  };
}

function mapDayClosing(r: Row): DayClosing {
  return {
    id: str(r.id),
    date: str(r.closing_date),
    physicalCash: num(r.physical_cash_count),
    systemCash: num(r.system_cash_balance),
    variance: num(r.cash_variance),
    totalSalesKg: num(r.total_sales_kg),
    totalSalesAmount: num(r.total_sales_amount),
    totalCollections: num(r.total_recoveries),
    isLocked: r.is_locked === true,
    lockedBy: '',
  };
}

function mapAccount(r: Row): AccountItem {
  return {
    code: str(r.account_code),
    name: str(r.name),
    urduName: str(r.urdu_name),
    category: (r.category as AccountItem['category']) ?? 'asset',
    balance: num(r.balance),
  };
}

function mapJournal(r: Row): GeneralJournalEntry {
  const lines: Row[] = Array.isArray(r.lines) ? r.lines : [];
  const debitLine = lines.find((l) => num(l.debit) > 0) ?? {};
  const creditLine = lines.find((l) => num(l.credit) > 0) ?? {};
  return {
    id: str(r.id),
    entryNumber: str(r.voucher_number),
    entryDate: str(r.entry_date),
    description: str(r.description),
    descriptionUrdu: '',
    debitAccountCode: str(debitLine.account?.account_code),
    debitAccountName: str(debitLine.account?.name),
    creditAccountCode: str(creditLine.account?.account_code),
    creditAccountName: str(creditLine.account?.name),
    amount: Math.max(num(debitLine.debit), num(creditLine.credit)),
    partyId: optStr(r.ref_id),
    partyName: undefined,
    refNo: undefined,
    createdBy: '',
    createdAt: iso(r.created_at),
  };
}

function mapProfile(r: Row): UserProfile {
  return {
    id: str(r.id),
    name: str(r.full_name),
    urduName: str(r.urdu_name),
    role: (r.role as UserProfile['role']) ?? 'cashier',
    phone: str(r.phone),
    email: str(r.email),
  };
}

function mapAdvance(r: Row): EmployeeAdvance {
  return {
    id: str(r.id),
    employeeId: str(r.employee_id),
    advanceDate: str(r.advance_date),
    amount: num(r.amount),
    recoveryPlan: optStr(r.recovery_plan),
    status: str(r.status, 'active'),
    createdAt: iso(r.created_at),
  };
}

// ---------------------------------------------------------------------------
// Fetchers (read-only; RLS enforced by the user's JWT)
// ---------------------------------------------------------------------------

export async function fetchParties(db: Db): Promise<Party[]> {
  const { data, error } = await db.from('parties').select('*').order('name');
  if (error) throw error;
  return (data as Row[]).map(mapParty);
}

export async function fetchInvoices(db: Db, limit = 1000): Promise<Invoice[]> {
  const { data, error } = await db
    .from('invoices')
    .select('*, customer:parties!invoices_customer_id_fkey(name,urdu_name)')
    .order('invoice_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as Row[]).map(mapInvoice);
}

export async function fetchInvoiceById(db: Db, id: string): Promise<Invoice | null> {
  const { data, error } = await db
    .from('invoices')
    .select('*, customer:parties!invoices_customer_id_fkey(name,urdu_name)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapInvoice(data as Row) : null;
}

export async function fetchReceipts(db: Db, limit = 1000): Promise<ReceiptVoucher[]> {
  const { data, error } = await db
    .from('receipts')
    .select('*')
    .order('receipt_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as Row[]).map(mapReceipt);
}

export async function fetchReceiptById(db: Db, id: string): Promise<ReceiptVoucher | null> {
  const { data, error } = await db.from('receipts').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? mapReceipt(data as Row) : null;
}

export async function fetchPurchases(db: Db, limit = 1000): Promise<Purchase[]> {
  const { data, error } = await db
    .from('purchases')
    .select('*, supplier:parties!purchases_supplier_id_fkey(name,urdu_name)')
    .order('purchase_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as Row[]).map(mapPurchase);
}

export async function fetchExpenses(db: Db, limit = 1000): Promise<ExpenseItem[]> {
  const { data, error } = await db
    .from('expenses')
    .select('*')
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as Row[]).map(mapExpense);
}

/** Read-only. Client never writes ledger_entries; triggers own them. */
export async function fetchLedgerEntries(db: Db, limit = 2000): Promise<LedgerEntry[]> {
  const { data, error } = await db
    .from('ledger_entries')
    .select('*, party:parties!ledger_entries_party_id_fkey(party_type)')
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as Row[]).map(mapLedger);
}

export async function fetchLedgerByRef(db: Db, refId: string): Promise<LedgerEntry[]> {
  const { data, error } = await db
    .from('ledger_entries')
    .select('*, party:parties!ledger_entries_party_id_fkey(party_type)')
    .eq('ref_id', refId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as Row[]).map(mapLedger);
}

export async function fetchProducts(db: Db): Promise<InventoryItem[]> {
  const { data, error } = await db.from('products').select('*').order('code');
  if (error) throw error;
  return (data as Row[]).map(mapProduct);
}

export async function fetchMandiRates(db: Db, limit = 60): Promise<MandiRate[]> {
  const { data, error } = await db
    .from('mandi_rates')
    .select('*')
    .order('market_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as Row[]).map(mapMandiRate);
}

export async function fetchLatestMandiRate(db: Db, city = 'Lahore'): Promise<MandiRate | null> {
  const { data, error } = await db
    .from('mandi_rates')
    .select('*')
    .eq('city', city)
    .order('market_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapMandiRate(data as Row) : null;
}

export async function fetchVehicles(db: Db): Promise<Vehicle[]> {
  const { data, error } = await db.from('vehicles').select('*').order('plate_number');
  if (error) throw error;
  const vehicles = data as Row[];
  // Best-effort driver enrichment: latest trip per vehicle carries the driver.
  const { data: trips } = await db
    .from('trips')
    .select('vehicle_id, driver_id, driver:profiles!trips_driver_id_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(200);
  const latest = new Map<string, { driverId?: string; driverName?: string }>();
  for (const t of (trips ?? []) as Row[]) {
    const vid = str(t.vehicle_id);
    if (vid && !latest.has(vid)) {
      latest.set(vid, {
        driverId: optStr(t.driver_id),
        driverName: optStr(t.driver?.full_name),
      });
    }
  }
  return vehicles.map((v) => mapVehicle(v, latest.get(str(v.id))));
}

export async function fetchTrips(db: Db, limit = 50): Promise<Trip[]> {
  const { data, error } = await db
    .from('trips')
    .select(
      '*, vehicle:vehicles!trips_vehicle_id_fkey(plate_number), driver:profiles!trips_driver_id_fkey(full_name)'
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const trips = data as Row[];
  const ids = trips.map((t) => str(t.id)).filter(Boolean);
  const pingsByTrip = new Map<string, TripPing[]>();
  if (ids.length > 0) {
    const { data: pings } = await db
      .from('trip_pings')
      .select('*')
      .in('trip_id', ids)
      .order('created_at', { ascending: true })
      .limit(5000);
    for (const p of (pings ?? []) as Row[]) {
      const tid = str(p.trip_id);
      if (!pingsByTrip.has(tid)) pingsByTrip.set(tid, []);
      pingsByTrip.get(tid)!.push(mapPing(p));
    }
  }
  return trips.map((t) => mapTrip(t, pingsByTrip.get(str(t.id)) ?? []));
}

export interface DbTripPing extends TripPing {
  id: number;
  tripId: string;
}

export async function fetchTripPings(db: Db, tripId?: string, limit = 500): Promise<DbTripPing[]> {
  let q = db.from('trip_pings').select('*').order('created_at', { ascending: true }).limit(limit);
  if (tripId) q = q.eq('trip_id', tripId);
  const { data, error } = await q;
  if (error) throw error;
  return (data as Row[]).map((r) => ({ ...mapPing(r), id: num(r.id), tripId: str(r.trip_id) }));
}

export async function fetchOrders(db: Db, limit = 1000): Promise<OrderItem[]> {
  const { data, error } = await db
    .from('orders')
    .select(
      '*, customer:parties!orders_customer_id_fkey(name,urdu_name),' +
        ' booker:profiles!orders_booker_id_fkey(full_name),' +
        ' assigned_trip:trips!orders_assigned_trip_id_fkey(vehicle_id)'
    )
    .order('order_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as Row[]).map(mapOrder);
}

export async function fetchEmployees(db: Db): Promise<Employee[]> {
  const { data, error } = await db.from('employees').select('*').order('name');
  if (error) throw error;
  return (data as Row[]).map(mapEmployee);
}

/** Latest day closing (roznamcha); null when none exists yet. */
export async function fetchDayClosing(db: Db): Promise<DayClosing | null> {
  const { data, error } = await db
    .from('day_closings')
    .select('*')
    .order('closing_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapDayClosing(data as Row) : null;
}

export async function fetchAccounts(db: Db): Promise<AccountItem[]> {
  const { data, error } = await db.from('chart_of_accounts').select('*').order('account_code');
  if (error) throw error;
  return (data as Row[]).map(mapAccount);
}

export async function fetchJournalEntries(db: Db, limit = 500): Promise<GeneralJournalEntry[]> {
  const { data, error } = await db
    .from('journal_entries')
    .select(
      '*, lines:journal_lines(id, debit, credit,' +
        ' account:chart_of_accounts!journal_lines_account_id_fkey(account_code, name, urdu_name))'
    )
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as Row[]).map(mapJournal);
}

export async function fetchProfiles(db: Db): Promise<UserProfile[]> {
  const { data, error } = await db.from('profiles').select('*').order('full_name');
  if (error) throw error;
  return (data as Row[]).map(mapProfile);
}

// ---------------------------------------------------------------------------
// Business settings (single-row branding/profile table)
// ---------------------------------------------------------------------------

function mapBusinessSettings(r: Row): BusinessSettings {
  return {
    id: 1,
    nameEn: r.name_en || 'Nawaz Poultry',
    nameUr: r.name_ur || 'نواز پولٹری',
    tagline: r.tagline || '',
    phone: r.phone || '',
    address: r.address || '',
    city: r.city || '',
    logoUrl: r.logo_url || '/logo.png',
    updatedAt: r.updated_at || new Date().toISOString(),
  };
}

export async function fetchBusinessSettings(db: Db): Promise<BusinessSettings | null> {
  const { data, error } = await db
    .from('business_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapBusinessSettings(data as Row) : null;
}

export async function updateBusinessSettings(
  db: Db,
  patch: Partial<Omit<BusinessSettings, 'id' | 'updatedAt'>>
): Promise<BusinessSettings> {
  const row: Row = { id: 1 };
  if (patch.nameEn !== undefined) row.name_en = patch.nameEn;
  if (patch.nameUr !== undefined) row.name_ur = patch.nameUr;
  if (patch.tagline !== undefined) row.tagline = patch.tagline;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.address !== undefined) row.address = patch.address;
  if (patch.city !== undefined) row.city = patch.city;
  if (patch.logoUrl !== undefined) row.logo_url = patch.logoUrl;
  const { data, error } = await db
    .from('business_settings')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return mapBusinessSettings(data as Row);
}

/**
 * Loads every collection in parallel. Returns a Partial<AppState>:
 * todayMandiRate comes from the latest Lahore mandi rate; dayClosing is the
 * most recent roznamcha (omitted when none exists). currentRole / language /
 * isOffline stay local-only (offline bootstrap cache).
 */
export async function fetchAll(db: Db): Promise<Partial<AppState>> {
  const [
    parties,
    invoices,
    receipts,
    ledgerEntries,
    purchases,
    expenses,
    generalEntries,
    orders,
    vehicles,
    trips,
    inventory,
    accounts,
    employees,
    mandiRates,
    dayClosing,
  ] = await Promise.all([
    fetchParties(db),
    fetchInvoices(db),
    fetchReceipts(db),
    fetchLedgerEntries(db),
    fetchPurchases(db),
    fetchExpenses(db),
    fetchJournalEntries(db),
    fetchOrders(db),
    fetchVehicles(db),
    fetchTrips(db),
    fetchProducts(db),
    fetchAccounts(db),
    fetchEmployees(db),
    fetchMandiRates(db, 1),
    fetchDayClosing(db),
  ]);

  const state: Partial<AppState> = {
    parties,
    invoices,
    receipts,
    ledgerEntries,
    purchases,
    expenses,
    generalEntries,
    orders,
    vehicles,
    trips,
    inventory,
    accounts,
    employees,
  };
  if (mandiRates.length > 0) state.todayMandiRate = mandiRates[0].broilerRatePer40kg;
  if (dayClosing) state.dayClosing = dayClosing;
  return state;
}

// ---------------------------------------------------------------------------
// App -> DB mappers (camelCase -> snake_case) used by writers AND the sync engine
// ---------------------------------------------------------------------------

export type OutboxTable =
  | 'parties'
  | 'invoices'
  | 'receipts'
  | 'purchases'
  | 'expenses'
  | 'orders'
  | 'trip_pings'
  | 'products'
  | 'mandi_rates'
  | 'employees'
  | 'employee_advances'
  | 'day_closings'
  | 'journal_entries'
  | 'whatsapp_share_logs'
  | 'vehicles'
  | 'trips';

function rowParty(p: Party): Row {
  return {
    id: p.id,
    party_type: p.partyType,
    name: p.name,
    urdu_name: p.urduName || null,
    phone: p.phone || null,
    whatsapp: p.whatsapp || null,
    address: p.address || null,
    city: p.city || 'Lahore',
    opening_balance: p.openingBalance,
    current_balance: p.currentBalance,
    credit_limit: p.creditLimit,
    default_kilo: p.defaultKilo,
    cnic: p.cnic || null,
    ntn: p.ntn || null,
  };
}

function rowInvoice(inv: Invoice): Row {
  // previous_balance / new_balance are computed by the DB trigger — never sent.
  // net_weight_kg / margin_per_40kg are GENERATED columns — never sent.
  return {
    id: inv.id,
    invoice_number: inv.invoiceNumber,
    invoice_date: inv.invoiceDate,
    customer_id: inv.customerId,
    // order_id: the app Invoice type carries no order linkage; omit.
    product_id: undefined,
    vehicle_id: uuidOrUndefined(inv.vehicleId),
    driver_id: uuidOrUndefined(inv.driverId),
    mandi_rate_per_40kg: inv.mandiRatePer40kg,
    sale_rate_per_40kg: inv.saleRatePer40kg,
    gross_weight_kg: inv.grossWeightKg,
    shrinkage_kg: inv.shrinkageKg,
    bird_count: inv.birdCount,
    mann_divisor: inv.mannDivisor,
    total_amount: inv.totalAmount,
    received_cash: inv.receivedCash,
    received_ac: inv.receivedAC,
    ac_payment_mode: inv.acPaymentMode,
    ac_ref_no: inv.acRefNo || null,
    discount_amount: inv.discountAmount ?? 0,
    share_token: inv.shareToken || undefined,
  };
}

function rowReceipt(r: ReceiptVoucher): Row {
  // previous_balance / new_balance are computed by the DB trigger — never sent.
  return {
    id: r.id,
    receipt_number: r.receiptNumber,
    receipt_date: r.receiptDate,
    party_id: r.partyId,
    party_type: r.partyType,
    amount: r.amount,
    payment_mode: r.paymentMode,
    bank_name: r.bankName || null,
    ref_no: r.refNo || null,
    notes: r.notes || null,
    share_token: r.shareToken || undefined,
  };
}

function rowPurchase(p: Purchase): Row {
  // No ledger trigger for purchases: previous/new balance must be supplied.
  return {
    id: p.id,
    purchase_number: p.purchaseNumber,
    purchase_date: p.purchaseDate,
    supplier_id: p.supplierId,
    rate_per_40kg: p.ratePer40kg,
    gross_weight_kg: p.grossWeightKg,
    mortality_kg: p.mortalityKg,
    net_weight_kg: p.netWeightKg,
    bird_count: p.birdCount,
    total_amount: p.totalAmount,
    paid_cash: p.paidCash,
    paid_bank: p.paidBank,
    previous_balance: p.previousBalance,
    new_balance: p.newBalance,
  };
}

function rowExpense(e: ExpenseItem): Row {
  return {
    id: e.id,
    expense_number: e.expenseNumber,
    expense_date: e.date,
    category: e.category,
    category_name: e.categoryName || null,
    category_urdu_name: e.categoryUrduName || null,
    amount: e.amount,
    payment_mode: e.paymentMode,
    vehicle_id: uuidOrUndefined(e.vehicleId),
    description: e.description || null,
    description_urdu: e.descriptionUrdu || null,
    paid_to: e.paidTo || null,
  };
}

function rowOrder(o: OrderItem): Row {
  return {
    id: o.id,
    order_number: o.orderNumber,
    order_date: o.orderDate,
    customer_id: o.customerId,
    booker_id: uuidOrUndefined(o.bookerId),
    expected_kg: o.expectedKg,
    expected_bird_count: o.expectedBirdCount ?? null,
    quoted_rate_per_40kg: o.quotedRatePer40kg,
    delivery_time_slot: o.deliverySlot || null,
    delivery_route: o.deliveryRoute || null,
    status: o.status,
    special_notes: o.specialNotes || null,
  };
}

function rowPing(p: TripPing & { tripId: string }): Row {
  return {
    trip_id: p.tripId,
    lat: p.lat,
    lng: p.lng,
    speed: p.speed,
  };
}

function rowProduct(i: InventoryItem): Row {
  return {
    // Seed demo ids (e.g. 'inv-item-1') are not UUIDs: omit so the DB default
    // generates one. Upserts match on `code` anyway.
    id: isUuid(i.id) ? i.id : undefined,
    code: i.code,
    name: i.name,
    urdu_name: i.urduName,
    category: i.category,
    current_weight_kg: i.currentWeightKg,
    current_bird_count: i.currentCount,
    unit_of_measure: i.unit,
  };
}

function rowMandiRate(m: MandiRateInput & { id: string }): Row {
  return {
    id: isUuid(m.id) ? m.id : undefined,
    market_date: m.marketDate,
    city: m.city,
    broiler_rate_per_40kg: m.broilerRatePer40kg,
    layer_rate_per_40kg: m.layerRatePer40kg ?? null,
    desi_rate_per_40kg: m.desiRatePer40kg ?? null,
    notes: m.notes || null,
  };
}

function rowAdvance(a: EmployeeAdvanceInput & { id: string }): Row {
  return {
    id: a.id,
    employee_id: a.employeeId,
    advance_date: a.advanceDate,
    amount: a.amount,
    recovery_plan: a.recoveryPlan || null,
    status: a.status || 'active',
  };
}

function rowDayClosing(d: DayClosing): Row {
  // cash_variance is GENERATED — never sent. locked_by is a profiles UUID;
  // the app stores a name there, so it is omitted unless it is a real UUID.
  // Local ids like 'close-2024-10-07' are not UUIDs: omit for DB default.
  return {
    id: isUuid(d.id) ? d.id : undefined,
    closing_date: d.date,
    physical_cash_count: d.physicalCash,
    system_cash_balance: d.systemCash,
    total_sales_kg: d.totalSalesKg,
    total_sales_amount: d.totalSalesAmount,
    total_recoveries: d.totalCollections,
    is_locked: d.isLocked,
    locked_by: uuidOrUndefined(d.lockedBy),
  };
}

function rowJournalEntry(e: GeneralJournalEntry): Row {
  return {
    id: e.id,
    voucher_number: e.entryNumber,
    entry_date: e.entryDate,
    description: e.description,
    ref_type: 'journal',
    ref_id: uuidOrUndefined(e.partyId),
  };
}

function rowWhatsappLog(l: WhatsappLogInput & { id: string }): Row {
  return {
    id: l.id,
    recipient_phone: l.recipientPhone,
    ref_type: l.refType,
    ref_id: uuidOrUndefined(l.refId),
    message_snippet: l.messageSnippet || null,
    shared_by: uuidOrUndefined(l.sharedBy),
  };
}

/**
 * camelCase payload -> snake_case DB row for a given outbox table.
 * The sync engine uses this to replay offline writes.
 * Throws for ledger_entries: the client must never write there.
 */
export function mapToDbRow(table: OutboxTable, payload: any): Row {
  switch (table) {
    case 'parties':
      return rowParty(payload as Party);
    case 'invoices':
      return rowInvoice(payload as Invoice);
    case 'receipts':
      return rowReceipt(payload as ReceiptVoucher);
    case 'purchases':
      return rowPurchase(payload as Purchase);
    case 'expenses':
      return rowExpense(payload as ExpenseItem);
    case 'orders':
      return rowOrder(payload as OrderItem);
    case 'trip_pings':
      return rowPing(payload as TripPing & { tripId: string });
    case 'products':
      return rowProduct(payload as InventoryItem);
    case 'mandi_rates':
      return rowMandiRate(payload as MandiRateInput & { id: string });
    case 'employee_advances':
      return rowAdvance(payload as EmployeeAdvanceInput & { id: string });
    case 'day_closings':
      return rowDayClosing(payload as DayClosing);
    case 'journal_entries':
      return rowJournalEntry(payload as GeneralJournalEntry);
    case 'whatsapp_share_logs':
      return rowWhatsappLog(payload as WhatsappLogInput & { id: string });
    case 'vehicles':
      return rowVehicle(payload as Vehicle);
    case 'trips':
      return rowTrip(payload as Trip);
    case 'employees':
      return rowEmployee(payload as Employee);
    default:
      throw new Error(`mapToDbRow: unsupported table "${table}" (ledger_entries is never client-written)`);
  }
}

function rowVehicle(v: Vehicle): Row {
  return {
    id: v.id,
    plate_number: v.plateNumber,
    model: v.model,
    capacity_kg: optNum(v.capacityKg),
    is_active: v.isActive,
  };
}

function rowTrip(t: Trip): Row {
  // App-only fields (plateNumber, driverName, currentLat/Lng, stops, path,
  // deliveredKg) have no columns. shortage_kg is derived when possible.
  const total = optNum(t.totalLoadKg);
  const delivered = optNum(t.deliveredKg);
  return {
    id: t.id,
    trip_number: t.tripNumber,
    vehicle_id: uuidOrUndefined(t.vehicleId),
    driver_id: uuidOrUndefined(t.driverId),
    status: t.status,
    start_time: t.startTime || undefined,
    end_time: t.endTime || undefined,
    fuel_expense: optNum(t.fuelExpense),
    total_load_kg: total,
    shortage_kg:
      total !== undefined && delivered !== undefined
        ? Math.max(0, total - delivered)
        : undefined,
  };
}

function rowEmployee(e: Employee): Row {
  return {
    id: e.id,
    employee_code: e.code,
    name: e.name,
    urdu_name: e.urduName || undefined,
    role: e.role,
    phone: e.phone,
    cnic: e.cnic || undefined,
    monthly_salary: optNum(e.monthlySalary),
    advance_balance: optNum(e.advanceBalance),
    joining_date: e.joiningDate || undefined,
    // App Employee has no isActive flag; default true on insert, omit on partial updates.
    is_active: (e as { isActive?: boolean }).isActive,
  };
}

/**
 * onConflict target for idempotent replays. trip_pings is append-only
 * (BIGSERIAL id) so it has no conflict target and replays as plain INSERT.
 */
export function conflictTarget(table: OutboxTable): string | null {
  switch (table) {
    case 'products':
      return 'code';
    case 'mandi_rates':
      return 'market_date,city';
    case 'day_closings':
      return 'closing_date';
    case 'trip_pings':
      return null;
    default:
      return 'id';
  }
}

// ---------------------------------------------------------------------------
// Writers (camelCase app objects in, snake_case rows out)
// ---------------------------------------------------------------------------

async function insertOne(db: Db, table: string, row: Row): Promise<Row> {
  const cleaned: Row = {};
  for (const [k, v] of Object.entries(row)) if (v !== undefined) cleaned[k] = v;
  const { data, error } = await db.from(table).insert(cleaned).select().single();
  if (error) throw error;
  return data as Row;
}

export async function insertParty(db: Db, party: Party): Promise<Party> {
  return mapParty(await insertOne(db, 'parties', rowParty(party)));
}

export async function updateParty(db: Db, party: Partial<Party> & { id: string }): Promise<Party> {
  const row = rowParty(party as Party);
  delete row.id;
  const cleaned: Row = {};
  for (const [k, v] of Object.entries(row)) if (v !== undefined) cleaned[k] = v;
  const { data, error } = await db.from('parties').update(cleaned).eq('id', party.id).select().single();
  if (error) throw error;
  return mapParty(data as Row);
}

/**
 * Inserts an invoice; the DB trigger computes previous/new balances, posts
 * ledger rows and updates the party. Re-fetches invoice + ledger + party so
 * the caller can reconcile server-computed balances.
 */
export async function insertInvoice(db: Db, invoice: Invoice): Promise<InvoiceWriteResult> {
  await insertOne(db, 'invoices', rowInvoice(invoice));
  const [inv, ledger, parties] = await Promise.all([
    fetchInvoiceById(db, invoice.id),
    fetchLedgerByRef(db, invoice.id),
    db.from('parties').select('*').eq('id', invoice.customerId).maybeSingle(),
  ]);
  if (!inv) throw new Error(`insertInvoice: invoice ${invoice.id} not found after insert`);
  return {
    invoice: inv,
    ledger,
    party: parties.data ? mapParty(parties.data as Row) : null,
  };
}

/** Same trigger-driven flow as invoices (receipts). */
export async function insertReceipt(db: Db, receipt: ReceiptVoucher): Promise<ReceiptWriteResult> {
  await insertOne(db, 'receipts', rowReceipt(receipt));
  const [rec, ledger, parties] = await Promise.all([
    fetchReceiptById(db, receipt.id),
    fetchLedgerByRef(db, receipt.id),
    db.from('parties').select('*').eq('id', receipt.partyId).maybeSingle(),
  ]);
  if (!rec) throw new Error(`insertReceipt: receipt ${receipt.id} not found after insert`);
  return {
    receipt: rec,
    ledger,
    party: parties.data ? mapParty(parties.data as Row) : null,
  };
}

export async function insertPurchase(db: Db, purchase: Purchase): Promise<Purchase> {
  return mapPurchase(await insertOne(db, 'purchases', rowPurchase(purchase)));
}

export async function insertExpense(db: Db, expense: ExpenseItem): Promise<ExpenseItem> {
  return mapExpense(await insertOne(db, 'expenses', rowExpense(expense)));
}

export async function insertOrder(db: Db, order: OrderItem): Promise<OrderItem> {
  return mapOrder(await insertOne(db, 'orders', rowOrder(order)));
}

export async function updateOrderStatus(
  db: Db,
  orderId: string,
  status: OrderItem['status']
): Promise<void> {
  const { error } = await db.from('orders').update({ status }).eq('id', orderId);
  if (error) throw error;
}

export async function insertTripPing(db: Db, tripId: string, ping: TripPing): Promise<void> {
  const { error } = await db.from('trip_pings').insert(rowPing({ ...ping, tripId }));
  if (error) throw error;
}

/** Upsert by unique product code (idempotent). */
export async function upsertProducts(db: Db, items: InventoryItem[]): Promise<InventoryItem[]> {
  const rows = items.map(rowProduct);
  const { data, error } = await db.from('products').upsert(rows, { onConflict: 'code' }).select();
  if (error) throw error;
  return (data as Row[]).map(mapProduct);
}

export async function insertMandiRate(db: Db, rate: MandiRateInput): Promise<MandiRate> {
  const withId = { ...rate, id: rate.id ?? crypto.randomUUID() };
  return mapMandiRate(await insertOne(db, 'mandi_rates', rowMandiRate(withId)));
}

export async function insertEmployeeAdvance(
  db: Db,
  advance: EmployeeAdvanceInput
): Promise<EmployeeAdvance> {
  const withId = { ...advance, id: advance.id ?? crypto.randomUUID() };
  return mapAdvance(await insertOne(db, 'employee_advances', rowAdvance(withId)));
}

/** Upsert by unique closing_date (one roznamcha per day). */
export async function upsertDayClosing(db: Db, closing: DayClosing): Promise<DayClosing> {
  const { data, error } = await db
    .from('day_closings')
    .upsert(rowDayClosing(closing), { onConflict: 'closing_date' })
    .select()
    .single();
  if (error) throw error;
  return mapDayClosing(data as Row);
}

/**
 * Inserts a journal entry with its debit/credit lines. Account ids are
 * resolved from chart_of_accounts by code. Idempotency: voucher_number is
 * UNIQUE — replays that hit a duplicate key should be treated as already
 * synced (see sync.ts).
 */
export async function insertJournalEntry(
  db: Db,
  entry: GeneralJournalEntry
): Promise<GeneralJournalEntry> {
  const entryRow = await insertOne(db, 'journal_entries', rowJournalEntry(entry));

  const { data: accounts, error: accErr } = await db
    .from('chart_of_accounts')
    .select('id, account_code')
    .in('account_code', [entry.debitAccountCode, entry.creditAccountCode]);
  if (accErr) throw accErr;
  const byCode = new Map(((accounts ?? []) as Row[]).map((a) => [str(a.account_code), str(a.id)]));
  const debitAccountId = byCode.get(entry.debitAccountCode);
  const creditAccountId = byCode.get(entry.creditAccountCode);
  if (!debitAccountId || !creditAccountId) {
    throw new Error(
      `insertJournalEntry: account code(s) not found in chart_of_accounts: ` +
        `${entry.debitAccountCode}, ${entry.creditAccountCode}`
    );
  }

  const { error: lineErr } = await db.from('journal_lines').insert([
    { journal_entry_id: entryRow.id, account_id: debitAccountId, debit: entry.amount, credit: 0 },
    { journal_entry_id: entryRow.id, account_id: creditAccountId, debit: 0, credit: entry.amount },
  ]);
  if (lineErr) throw lineErr;
  return { ...entry, id: str(entryRow.id) };
}

export async function insertWhatsappLog(db: Db, log: WhatsappLogInput): Promise<string> {
  const withId = { ...log, id: log.id ?? crypto.randomUUID() };
  const row = await insertOne(db, 'whatsapp_share_logs', rowWhatsappLog(withId));
  return str(row.id);
}
