import { useState, useEffect } from 'react';
import { 
  Party, 
  Invoice, 
  ReceiptVoucher, 
  LedgerEntry, 
  Purchase, 
  OrderItem, 
  Vehicle, 
  Trip, 
  InventoryItem, 
  AccountItem, 
  Employee, 
  DayClosing, 
  UserRole,
  ExpenseItem 
} from '../types';
import { calculateInvoice } from '../utils/calculations';

const STORAGE_KEY = 'murgh_mandi_erp_data_v1';

// Initial Mock Seed Data matching the prompt and 3 reference images
const INITIAL_PARTIES: Party[] = [
  {
    id: 'cust-1',
    partyType: 'customer',
    name: 'Sami Khan Chicken Shop',
    urduName: 'سمی خان چکن شاپ',
    phone: '03001234567',
    whatsapp: '03001234567',
    address: 'Shop #14, Main Gol Market, Shadman',
    city: 'Lahore',
    openingBalance: 0,
    currentBalance: 4400, // Result after row 1 (24400 - 20000 = 4400)
    creditLimit: 300000,
    defaultKilo: 80,
    cnic: '35201-1234567-1',
    createdAt: '2024-01-01'
  },
  {
    id: 'cust-2',
    partyType: 'customer',
    name: 'Haji Aslam Meat Mart',
    urduName: 'حاجی اسلم میٹ مارٹ',
    phone: '03219876543',
    whatsapp: '03219876543',
    address: 'Bhatti Gate Chowk',
    city: 'Lahore',
    openingBalance: 4000,
    currentBalance: 6800, // Handwritten sheet result: 4000 + 19800 - 9000 - 8000 = 6800
    creditLimit: 250000,
    defaultKilo: 60,
    cnic: '35202-9876543-3',
    createdAt: '2024-01-02'
  },
  {
    id: 'cust-3',
    partyType: 'customer',
    name: 'Malik Brothers Poultry',
    urduName: 'ملک برادرز پولٹری',
    phone: '03335551234',
    whatsapp: '03335551234',
    address: 'Dharampura Bazar',
    city: 'Lahore',
    openingBalance: 8400,
    currentBalance: -11600, // Reference image 1 row 3: Advance (-11600)
    creditLimit: 200000,
    defaultKilo: 80,
    cnic: '35201-5551234-5',
    createdAt: '2024-01-03'
  },
  {
    id: 'cust-4',
    partyType: 'customer',
    name: 'Bismillah Tikka Corner',
    urduName: 'بسم اللہ تکہ کارنر',
    phone: '03451122334',
    whatsapp: '03451122334',
    address: 'Food Street, Old Anarkali',
    city: 'Lahore',
    openingBalance: 15000,
    currentBalance: 32000,
    creditLimit: 150000,
    defaultKilo: 100,
    createdAt: '2024-01-04'
  },
  {
    id: 'supp-1',
    partyType: 'supplier',
    name: 'Big Bird Breeders & Hatchery',
    urduName: 'بگ برڈ بریڈرز اینڈ ہیچری',
    phone: '04235750000',
    whatsapp: '03008456789',
    address: 'Raiwind Road Farm Area',
    city: 'Lahore',
    openingBalance: 200000,
    currentBalance: 310000,
    creditLimit: 1500000,
    defaultKilo: 2000,
    createdAt: '2024-01-01'
  },
  {
    id: 'supp-2',
    partyType: 'supplier',
    name: 'National Poultry Feeds',
    urduName: 'نیشنل پولٹری فیڈز',
    phone: '04235900000',
    whatsapp: '03224455667',
    address: 'Multan Road Industrial Area',
    city: 'Lahore',
    openingBalance: 100000,
    currentBalance: 180000,
    creditLimit: 800000,
    defaultKilo: 500,
    createdAt: '2024-01-01'
  }
];

const INITIAL_INVOICES: Invoice[] = [
  {
    id: 'inv-1001',
    invoiceNumber: 'INV-2401',
    invoiceDate: '2024-10-06',
    customerId: 'cust-1',
    customerName: 'Sami Khan Chicken Shop',
    customerUrduName: 'سمی خان چکن شاپ',
    mandiRatePer40kg: 12000,
    saleRatePer40kg: 12200,
    grossWeightKg: 80,
    shrinkageKg: 0,
    netWeightKg: 80,
    birdCount: 40,
    mannDivisor: 40,
    totalAmount: 24400,
    receivedCash: 20000,
    receivedAC: 0,
    acPaymentMode: 'cash',
    previousBalance: 0,
    newBalance: 4400,
    shareToken: 'tok-sami-2401',
    createdBy: 'Zahid Hussain',
    createdAt: '2024-10-06T09:00:00Z'
  },
  {
    id: 'inv-1002',
    invoiceNumber: 'INV-2402',
    invoiceDate: '2024-10-07',
    customerId: 'cust-2',
    customerName: 'Haji Aslam Meat Mart',
    customerUrduName: 'حاجی اسلم میٹ مارٹ',
    mandiRatePer40kg: 13000,
    saleRatePer40kg: 13200,
    grossWeightKg: 60,
    shrinkageKg: 0,
    netWeightKg: 60,
    birdCount: 30,
    mannDivisor: 40,
    totalAmount: 19800,
    receivedCash: 9000,
    receivedAC: 8000,
    acPaymentMode: 'bank_transfer',
    acRefNo: 'MEEZAN-99812',
    previousBalance: 4000,
    newBalance: 6800,
    shareToken: 'tok-aslam-2402',
    createdBy: 'Zahid Hussain',
    createdAt: '2024-10-07T08:30:00Z'
  }
];

const INITIAL_LEDGER_ENTRIES: LedgerEntry[] = [
  {
    id: 'led-1',
    partyId: 'cust-1',
    partyType: 'customer',
    entryDate: '2024-10-05',
    detail: 'Carried Forward Opening Balance',
    detailUrdu: 'سابقہ بقایا رقم',
    folioNo: 'PG-01',
    debit: 0,
    credit: 0,
    runningBalance: 0,
    refType: 'opening',
    createdAt: '2024-10-05T00:00:00Z'
  },
  {
    id: 'led-2',
    partyId: 'cust-1',
    partyType: 'customer',
    entryDate: '2024-10-06',
    detail: 'Sale: 80.0 kg @ Rs 12,200/40kg',
    detailUrdu: 'مرغ فروخت: 80.0 کلو، ریٹ 12,200',
    folioNo: 'INV-2401',
    debit: 24400,
    credit: 0,
    runningBalance: 24400,
    refType: 'invoice',
    refId: 'inv-1001',
    createdAt: '2024-10-06T09:00:00Z'
  },
  {
    id: 'led-3',
    partyId: 'cust-1',
    partyType: 'customer',
    entryDate: '2024-10-06',
    detail: 'Cash Wasool (Received)',
    detailUrdu: 'نقد وصولی',
    folioNo: 'INV-2401',
    debit: 0,
    credit: 20000,
    runningBalance: 4400,
    refType: 'invoice_payment',
    refId: 'inv-1001',
    createdAt: '2024-10-06T09:01:00Z'
  },
  // Haji Aslam entries matching handwritten sheet:
  {
    id: 'led-4',
    partyId: 'cust-2',
    partyType: 'customer',
    entryDate: '2024-10-06',
    detail: 'Previous Balance (A=4000)',
    detailUrdu: 'سابقہ بقایا',
    folioNo: 'PG-02',
    debit: 4000,
    credit: 0,
    runningBalance: 4000,
    refType: 'opening',
    createdAt: '2024-10-06T00:00:00Z'
  },
  {
    id: 'led-5',
    partyId: 'cust-2',
    partyType: 'customer',
    entryDate: '2024-10-07',
    detail: 'Sale: 60.0 kg @ Rs 13,200/40kg (Total 19,800)',
    detailUrdu: 'مرغ فروخت: 60.0 کلو، ریٹ 13,200',
    folioNo: 'INV-2402',
    debit: 19800,
    credit: 0,
    runningBalance: 23800,
    refType: 'invoice',
    refId: 'inv-1002',
    createdAt: '2024-10-07T08:30:00Z'
  },
  {
    id: 'led-6',
    partyId: 'cust-2',
    partyType: 'customer',
    entryDate: '2024-10-07',
    detail: 'Wasool Cash (C=9000) + AC Bank (B=8000)',
    detailUrdu: 'نقد وصولی: 9,000 + بینک وصولی: 8,000',
    folioNo: 'INV-2402',
    debit: 0,
    credit: 17000,
    runningBalance: 6800,
    refType: 'invoice_payment',
    refId: 'inv-1002',
    createdAt: '2024-10-07T08:31:00Z'
  },
  // Malik Brothers Advance Entry:
  {
    id: 'led-7',
    partyId: 'cust-3',
    partyType: 'customer',
    entryDate: '2024-10-05',
    detail: 'Balance after prior sales',
    detailUrdu: 'سابقہ بقایا',
    folioNo: 'PG-03',
    debit: 8400,
    credit: 0,
    runningBalance: 8400,
    refType: 'opening',
    createdAt: '2024-10-05T00:00:00Z'
  },
  {
    id: 'led-8',
    partyId: 'cust-3',
    partyType: 'customer',
    entryDate: '2024-10-06',
    detail: 'Payment Voucher - Advance payment received',
    detailUrdu: 'نقد وصولی - پیشگی رقم',
    folioNo: 'REC-104',
    debit: 0,
    credit: 20000,
    runningBalance: -11600,
    refType: 'receipt',
    createdAt: '2024-10-06T11:00:00Z'
  }
];

const INITIAL_VEHICLES: Vehicle[] = [
  {
    id: 'veh-1',
    plateNumber: 'LES-4412',
    model: 'Toyota Hilux 4x4 Poultry Dala',
    capacityKg: 2200,
    driverId: 'emp-1',
    driverName: 'Muhammad Tariq',
    isActive: true
  },
  {
    id: 'veh-2',
    plateNumber: 'RIA-9102',
    model: 'FAW Carrier Shehzore Cage Truck',
    capacityKg: 3800,
    driverId: 'emp-4',
    driverName: 'Naveed Akhtar',
    isActive: true
  }
];

const INITIAL_TRIPS: Trip[] = [
  {
    id: 'trip-101',
    tripNumber: 'TRIP-901',
    vehicleId: 'veh-1',
    plateNumber: 'LES-4412',
    driverId: 'emp-1',
    driverName: 'Muhammad Tariq',
    status: 'ongoing',
    startTime: '2024-10-08T05:30:00Z',
    fuelExpense: 4500,
    totalLoadKg: 1850,
    deliveredKg: 780,
    currentLat: 31.5204, // Lahore Center
    currentLng: 74.3587,
    stops: [
      {
        customerId: 'cust-1',
        customerName: 'Sami Khan Chicken Shop',
        kg: 148,
        isDelivered: true,
        deliveredAt: '2024-10-08T06:45:00Z'
      },
      {
        customerId: 'cust-2',
        customerName: 'Haji Aslam Meat Mart',
        kg: 160,
        isDelivered: true,
        deliveredAt: '2024-10-08T07:30:00Z'
      },
      {
        customerId: 'cust-3',
        customerName: 'Malik Brothers Poultry',
        kg: 120,
        isDelivered: false
      },
      {
        customerId: 'cust-4',
        customerName: 'Bismillah Tikka Corner',
        kg: 150,
        isDelivered: false
      }
    ],
    path: [
      [31.4820, 74.3030],
      [31.4980, 74.3210],
      [31.5120, 74.3410],
      [31.5204, 74.3587]
    ]
  }
];

const INITIAL_ORDERS: OrderItem[] = [
  {
    id: 'ord-1',
    orderNumber: 'ORD-701',
    orderDate: '2024-10-08',
    customerId: 'cust-1',
    customerName: 'Sami Khan Chicken Shop',
    customerUrduName: 'سمی خان چکن شاپ',
    bookerId: 'emp-2',
    bookerName: 'Shahid Mehmood',
    assignedVehicleId: 'veh-1',
    expectedKg: 148,
    quotedRatePer40kg: 12200,
    deliverySlot: 'Morning (06:00 - 08:00)',
    deliveryRoute: 'Shadman & Gol Market Route',
    status: 'delivered',
    specialNotes: 'Require medium bird size ~2.1kg',
    createdAt: '2024-10-07T18:00:00Z'
  },
  {
    id: 'ord-2',
    orderNumber: 'ORD-702',
    orderDate: '2024-10-08',
    customerId: 'cust-4',
    customerName: 'Bismillah Tikka Corner',
    customerUrduName: 'بسم اللہ تکہ کارنر',
    bookerId: 'emp-2',
    bookerName: 'Shahid Mehmood',
    assignedVehicleId: 'veh-1',
    expectedKg: 150,
    quotedRatePer40kg: 12250,
    deliverySlot: 'Afternoon (12:00 - 14:00)',
    deliveryRoute: 'Anarkali Food Street',
    status: 'out_for_delivery',
    createdAt: '2024-10-07T19:30:00Z'
  },
  {
    id: 'ord-3',
    orderNumber: 'ORD-703',
    orderDate: '2024-10-08',
    customerId: 'cust-2',
    customerName: 'Haji Aslam Meat Mart',
    customerUrduName: 'حاجی اسلم میٹ مارٹ',
    bookerId: 'emp-2',
    bookerName: 'Shahid Mehmood',
    assignedVehicleId: 'veh-2',
    expectedKg: 200,
    quotedRatePer40kg: 12200,
    deliverySlot: 'Evening (17:00 - 19:00)',
    deliveryRoute: 'Bhatti Gate & Walled City',
    status: 'confirmed',
    createdAt: '2024-10-08T07:15:00Z'
  }
];

const INITIAL_INVENTORY: InventoryItem[] = [
  {
    id: 'inv-item-1',
    code: 'BR-LIVE',
    name: 'Broiler Live (Shed Farm 1)',
    urduName: 'زندہ برائلر مرغی (شیڈ 1)',
    category: 'broiler',
    currentWeightKg: 6450,
    currentCount: 3100,
    unit: 'kg'
  },
  {
    id: 'inv-item-2',
    code: 'BR-LIVE-2',
    name: 'Broiler Live (Shed Farm 2)',
    urduName: 'زندہ برائلر مرغی (شیڈ 2)',
    category: 'broiler',
    currentWeightKg: 4200,
    currentCount: 1950,
    unit: 'kg'
  },
  {
    id: 'inv-item-3',
    code: 'BR-DRESSED',
    name: 'Dressed Clean Chicken',
    urduName: 'صاف شدہ چکن گوشت',
    category: 'dressed',
    currentWeightKg: 380,
    currentCount: 220,
    unit: 'kg'
  },
  {
    id: 'inv-item-4',
    code: 'FEED-BAG',
    name: 'Broiler Starter Feed (50kg Bag)',
    urduName: 'برائلر اسٹارٹر فیڈ بیگ',
    category: 'feed',
    currentWeightKg: 4500,
    currentCount: 90,
    unit: 'bags'
  }
];

const INITIAL_ACCOUNTS: AccountItem[] = [
  { code: '1010', name: 'Cash in Hand (Galla)', urduName: 'نقد کیش گلہ', category: 'asset', balance: 840000 },
  { code: '1020', name: 'Meezan Bank Current A/C', urduName: 'میزان بینک اکاؤنٹ', category: 'asset', balance: 1450000 },
  { code: '1030', name: 'JazzCash Merchant Wallet', urduName: 'جاز کیش مرچنٹ', category: 'asset', balance: 120000 },
  { code: '1040', name: 'Easypaisa Business Wallet', urduName: 'ایزی پیسہ بزنس', category: 'asset', balance: 85000 },
  { code: '1050', name: 'Customer Receivables (Udhaar)', urduName: 'گاہکوں سے بقایا جات', category: 'asset', balance: 650000 },
  { code: '1060', name: 'Live Birds Farm Inventory', urduName: 'زندہ مرغ اسٹاک', category: 'asset', balance: 920000 },
  { code: '2010', name: 'Supplier Payables', urduName: 'سپلائرز کے واجبات', category: 'liability', balance: 490000 },
  { code: '3010', name: 'Owner Capital', urduName: 'مالک کا سرمایہ', category: 'equity', balance: 2500000 },
  { code: '4010', name: 'Chicken Sales Revenue', urduName: 'مرغ فروخت آمدن', category: 'revenue', balance: 1450000 },
  { code: '5010', name: 'Cost of Birds Purchased (COGS)', urduName: 'خریداری لاگت', category: 'expense', balance: 1120000 },
  { code: '5020', name: 'Vehicle Diesel & Maintenance', urduName: 'گاڑی ڈیزل و مرمت', category: 'expense', balance: 65000 },
  { code: '5030', name: 'Staff Salaries & Expenses', urduName: 'تنخواہیں و اسٹاف خرچ', category: 'expense', balance: 95000 }
];

const INITIAL_EMPLOYEES: Employee[] = [
  {
    id: 'emp-1',
    code: 'EMP-101',
    name: 'Muhammad Tariq',
    urduName: 'محمد طارق (ڈرائیور)',
    role: 'driver',
    phone: '03017778899',
    cnic: '35201-4433221-1',
    monthlySalary: 42000,
    advanceBalance: 5000,
    joiningDate: '2023-04-01'
  },
  {
    id: 'emp-2',
    code: 'EMP-102',
    name: 'Shahid Mehmood',
    urduName: 'شاہد محمود (آرڈر بکر)',
    role: 'order_booker',
    phone: '03214433221',
    cnic: '35202-8877665-3',
    monthlySalary: 38000,
    advanceBalance: 0,
    joiningDate: '2023-06-15'
  },
  {
    id: 'emp-3',
    code: 'EMP-103',
    name: 'Zahid Hussain',
    urduName: 'زاہد حسین (منشی / کیشئر)',
    role: 'cashier',
    phone: '03332211445',
    cnic: '35201-1122334-9',
    monthlySalary: 48000,
    advanceBalance: 2000,
    joiningDate: '2022-10-01'
  }
];

const INITIAL_DAY_CLOSING: DayClosing = {
  id: 'close-1',
  date: '2024-10-07',
  physicalCash: 840000,
  systemCash: 840000,
  variance: 0,
  totalSalesKg: 2840,
  totalSalesAmount: 865000,
  totalCollections: 720000,
  isLocked: false,
  lockedBy: 'Owner'
};

const INITIAL_EXPENSES: ExpenseItem[] = [
  {
    id: 'exp-1',
    expenseNumber: 'EXP-101',
    date: '2024-10-07',
    category: 'fuel',
    categoryName: 'Vehicle Diesel / Fuel',
    categoryUrduName: 'گاڑی پیٹرول و ڈیزل خرچ',
    amount: 4500,
    paymentMode: 'cash',
    vehicleId: 'veh-1',
    description: 'Diesel for Toyota Dala LES-4412 morning trip',
    descriptionUrdu: 'ٹویوٹا ڈالا LES-4412 مارننگ سپلائی ڈیزل',
    paidTo: 'PSO Pump Shadman',
    createdBy: 'Muhammad Tariq',
    createdAt: '2024-10-07T06:30:00Z'
  },
  {
    id: 'exp-2',
    expenseNumber: 'EXP-102',
    date: '2024-10-07',
    category: 'labor',
    categoryName: 'Unloading & Crate Labor',
    categoryUrduName: 'کریٹ ان لوڈنگ و ڈیلیوری مزدوری',
    amount: 6000,
    paymentMode: 'cash',
    description: 'Daily market loading labor wages for 2 workers',
    descriptionUrdu: 'دو لیبر ورکرز کی روزانہ اجرت برائے لوڈنگ',
    paidTo: 'Babu Lal & Team',
    createdBy: 'Zahid Hussain',
    createdAt: '2024-10-07T12:00:00Z'
  },
  {
    id: 'exp-3',
    expenseNumber: 'EXP-103',
    date: '2024-10-07',
    category: 'food_chai',
    categoryName: 'Staff Tea & Refreshment',
    categoryUrduName: 'اسٹاف چائے، روٹی و ریفریشمنٹ',
    amount: 1500,
    paymentMode: 'cash',
    description: 'Daily staff chai & hotel lunch',
    descriptionUrdu: 'روزانہ اسٹاف چائے و دوپہر کھانا',
    paidTo: 'Bismillah Hotel',
    createdBy: 'Zahid Hussain',
    createdAt: '2024-10-07T14:00:00Z'
  },
  {
    id: 'exp-4',
    expenseNumber: 'EXP-104',
    date: '2024-10-06',
    category: 'repairs',
    categoryName: 'Crate Repair & Welding',
    categoryUrduName: 'مرغی کے پنجرے و کریٹ ویلڈنگ',
    amount: 2200,
    paymentMode: 'cash',
    description: 'Welding iron cage door latch',
    descriptionUrdu: 'لوہے کے ڈالا پنجرے کی مرمت و ویلڈنگ',
    paidTo: 'Akram Welder',
    createdBy: 'Zahid Hussain',
    createdAt: '2024-10-06T16:00:00Z'
  }
];

export interface AppState {
  currentRole: UserRole;
  language: 'en' | 'ur';
  todayMandiRate: number;
  parties: Party[];
  invoices: Invoice[];
  receipts: ReceiptVoucher[];
  ledgerEntries: LedgerEntry[];
  purchases: Purchase[];
  expenses: ExpenseItem[];
  orders: OrderItem[];
  vehicles: Vehicle[];
  trips: Trip[];
  inventory: InventoryItem[];
  accounts: AccountItem[];
  employees: Employee[];
  dayClosing: DayClosing;
  isOffline: boolean;
}

export function loadSavedState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...parsed,
        expenses: parsed.expenses && parsed.expenses.length > 0 ? parsed.expenses : INITIAL_EXPENSES,
        isOffline: !navigator.onLine
      };
    }
  } catch (err) {
    console.error('Error loading stored ERP data:', err);
  }

  return {
    currentRole: 'owner',
    language: 'ur', // Default Urdu for Pakistani shopkeepers
    todayMandiRate: 12000,
    parties: INITIAL_PARTIES,
    invoices: INITIAL_INVOICES,
    receipts: [],
    ledgerEntries: INITIAL_LEDGER_ENTRIES,
    purchases: [],
    expenses: INITIAL_EXPENSES,
    orders: INITIAL_ORDERS,
    vehicles: INITIAL_VEHICLES,
    trips: INITIAL_TRIPS,
    inventory: INITIAL_INVENTORY,
    accounts: INITIAL_ACCOUNTS,
    employees: INITIAL_EMPLOYEES,
    dayClosing: INITIAL_DAY_CLOSING,
    isOffline: !navigator.onLine
  };
}

export function saveStateToStorage(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Storage quota exceeded or error saving:', e);
  }
}
