// Types for Murgh Mandi Poultry ERP

export type UserRole = 
  | 'owner'
  | 'manager'
  | 'accountant'
  | 'cashier'
  | 'order_booker'
  | 'driver'
  | 'stock_keeper'
  | 'auditor';

export type PartyType = 'customer' | 'supplier' | 'employee';
export type PaymentMode = 'cash' | 'bank_transfer' | 'cheque' | 'easypaisa' | 'jazzcash' | 'adjustment';
export type OrderStatus = 'booked' | 'confirmed' | 'loaded' | 'out_for_delivery' | 'delivered' | 'invoiced' | 'cancelled';
export type TripStatus = 'planned' | 'ongoing' | 'completed' | 'cancelled';

export interface UserProfile {
  id: string;
  name: string;
  urduName: string;
  role: UserRole;
  phone: string;
  email: string;
}

export interface Party {
  id: string;
  partyType: PartyType;
  name: string;
  urduName: string;
  phone: string;
  whatsapp: string;
  address: string;
  city: string;
  openingBalance: number;
  currentBalance: number; // Positive = owes us; Negative = Advance (with us)
  creditLimit: number;
  defaultKilo: number; // e.g. 80 kg default lot
  cnic?: string;
  ntn?: string;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  partyId: string;
  partyType: PartyType;
  entryDate: string; // YYYY-MM-DD
  detail: string;
  detailUrdu: string;
  folioNo: string; // Page or ref number
  debit: number; // Naam (Customer owes us)
  credit: number; // Jama (Customer paid us)
  runningBalance: number;
  refType: 'invoice' | 'invoice_payment' | 'receipt' | 'purchase' | 'adjustment' | 'opening' | 'journal';
  refId?: string;
  mandiRate?: number; // Mandi Rate per 40kg (منڈی ریٹ)
  rate?: number; // Quoted sale rate or purchase rate per 40kg
  weightKg?: number; // Net weight in kg
  createdAt: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerId: string;
  customerName: string;
  customerUrduName: string;
  mandiRatePer40kg: number;
  saleRatePer40kg: number;
  grossWeightKg: number;
  shrinkageKg: number;
  netWeightKg: number;
  birdCount: number;
  mannDivisor: number; // 40
  totalAmount: number; // round(saleRate * netWeightKg / 40)
  receivedCash: number;
  receivedAC: number;
  acPaymentMode: PaymentMode;
  acRefNo?: string;
  discountAmount?: number;
  previousBalance: number;
  newBalance: number;
  vehicleId?: string;
  driverId?: string;
  shareToken: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface ReceiptVoucher {
  id: string;
  receiptNumber: string;
  receiptDate: string;
  partyId: string;
  partyType: PartyType;
  amount: number;
  paymentMode: PaymentMode;
  bankName?: string;
  refNo?: string;
  notes?: string;
  collectedBy?: string; // Driver, Recovery boy, or Cashier
  previousBalance: number;
  newBalance: number;
  shareToken: string;
  createdAt: string;
}

export interface Purchase {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  supplierId: string;
  supplierName: string;
  ratePer40kg: number;
  grossWeightKg: number;
  mortalityKg: number;
  netWeightKg: number;
  birdCount: number;
  totalAmount: number;
  paidCash: number;
  paidBank: number;
  previousBalance: number;
  newBalance: number;
  createdAt: string;
}

export interface OrderItem {
  id: string;
  orderNumber: string;
  orderDate: string;
  customerId: string;
  customerName: string;
  customerUrduName: string;
  bookerId: string;
  bookerName: string;
  assignedVehicleId?: string;
  expectedKg: number;
  expectedBirdCount?: number;
  quotedRatePer40kg: number;
  deliverySlot: string;
  deliveryRoute: string;
  status: OrderStatus;
  specialNotes?: string;
  createdAt: string;
}

export interface Vehicle {
  id: string;
  plateNumber: string;
  model: string;
  capacityKg: number;
  driverId?: string;
  driverName?: string;
  isActive: boolean;
}

export interface TripPing {
  lat: number;
  lng: number;
  speed: number;
  timestamp: string;
}

export interface Trip {
  id: string;
  tripNumber: string;
  vehicleId: string;
  plateNumber: string;
  driverId: string;
  driverName: string;
  status: TripStatus;
  startTime?: string;
  endTime?: string;
  startKm?: number;
  endKm?: number;
  fuelExpense: number;
  totalLoadKg: number;
  deliveredKg: number;
  currentLat: number;
  currentLng: number;
  stops: {
    customerId: string;
    customerName: string;
    kg: number;
    isDelivered: boolean;
    deliveredAt?: string;
  }[];
  path: [number, number][];
}

export interface InventoryItem {
  id: string;
  code: string;
  name: string;
  urduName: string;
  category: 'broiler' | 'dressed' | 'desi' | 'feed' | 'medicine';
  currentWeightKg: number;
  currentCount: number;
  unit: string;
}

export interface AccountItem {
  code: string;
  name: string;
  urduName: string;
  category: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  balance: number;
}

export interface Employee {
  id: string;
  code: string;
  name: string;
  urduName: string;
  role: UserRole;
  phone: string;
  cnic: string;
  monthlySalary: number;
  advanceBalance: number;
  joiningDate: string;
}

export interface DayClosing {
  id: string;
  date: string;
  physicalCash: number;
  systemCash: number;
  variance: number;
  totalSalesKg: number;
  totalSalesAmount: number;
  totalCollections: number;
  isLocked: boolean;
  lockedBy: string;
}

export type ExpenseCategory = 
  | 'fuel' 
  | 'labor' 
  | 'shed_rent' 
  | 'electricity' 
  | 'feed_misc' 
  | 'food_chai' 
  | 'repairs' 
  | 'other';

export interface ExpenseItem {
  id: string;
  expenseNumber: string;
  date: string;
  category: ExpenseCategory;
  categoryName: string;
  categoryUrduName: string;
  amount: number;
  paymentMode: PaymentMode;
  vehicleId?: string;
  description: string;
  descriptionUrdu?: string;
  paidTo?: string;
  createdBy: string;
  createdAt: string;
}

export interface GeneralJournalEntry {
  id: string;
  entryNumber: string;
  entryDate: string;
  description: string;
  descriptionUrdu: string;
  debitAccountCode: string;
  debitAccountName: string;
  creditAccountCode: string;
  creditAccountName: string;
  amount: number;
  partyId?: string;
  partyName?: string;
  refNo?: string;
  createdBy: string;
  createdAt: string;
}


