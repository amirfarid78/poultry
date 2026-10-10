import { UserRole } from '../types';

export type ViewKey =
  | 'dashboard'
  | 'pos'
  | 'expenses'
  | 'customer_ledger'
  | 'daily_sheet'
  | 'receipt'
  | 'supplier'
  | 'orders'
  | 'fleet'
  | 'inventory'
  | 'accounting'
  | 'hr'
  | 'tests'
  | 'settings';

export const ALL_ROLES: UserRole[] = [
  'owner',
  'manager',
  'accountant',
  'cashier',
  'order_booker',
  'driver',
  'stock_keeper',
  'auditor'
];

/** Which roles may open each view. Mirrors the RLS matrix on the backend. */
export const VIEW_PERMISSIONS: Record<ViewKey, UserRole[]> = {
  dashboard: ALL_ROLES,
  pos: ['owner', 'manager', 'cashier'],
  expenses: ['owner', 'manager', 'accountant', 'cashier'],
  customer_ledger: ['owner', 'manager', 'accountant', 'cashier', 'auditor'],
  daily_sheet: ['owner', 'manager', 'accountant', 'cashier'],
  receipt: ['owner', 'manager', 'cashier'],
  supplier: ['owner', 'manager', 'accountant', 'stock_keeper'],
  orders: ['owner', 'manager', 'order_booker', 'cashier'],
  fleet: ['owner', 'manager', 'driver'],
  inventory: ['owner', 'manager', 'stock_keeper'],
  accounting: ['owner', 'manager', 'accountant'],
  hr: ['owner', 'manager'],
  tests: ['owner'],
  settings: ['owner', 'manager']
};

/** The tab a user lands on right after login, by role. */
export const DEFAULT_TAB: Record<UserRole, ViewKey> = {
  owner: 'dashboard',
  manager: 'dashboard',
  accountant: 'dashboard',
  cashier: 'pos',
  order_booker: 'orders',
  driver: 'fleet',
  stock_keeper: 'inventory',
  auditor: 'dashboard'
};

/** True when `role` may open `view`. */
export function canView(role: UserRole, view: string): boolean {
  const allowed = VIEW_PERMISSIONS[view as ViewKey];
  return !!allowed && allowed.includes(role);
}
