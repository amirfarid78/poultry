import { supabase } from './supabase';
import { Invoice, PaymentMode } from '../types';

/** Shape of the public.invoices row as returned by the anon client (snake_case). */
interface InvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  customer_id: string | null;
  mandi_rate_per_40kg: number | string;
  sale_rate_per_40kg: number | string;
  gross_weight_kg: number | string;
  shrinkage_kg: number | string | null;
  net_weight_kg: number | string;
  bird_count: number | string | null;
  mann_divisor: number | string | null;
  total_amount: number | string;
  received_cash: number | string | null;
  received_ac: number | string | null;
  ac_payment_mode: string | null;
  ac_ref_no: string | null;
  discount_amount: number | string | null;
  previous_balance: number | string;
  new_balance: number | string;
  vehicle_id: string | null;
  driver_id: string | null;
  share_token: string;
  created_by: string | null;
  created_at: string;
}

const num = (v: number | string | null | undefined): number =>
  v === null || v === undefined ? 0 : Number(v);

/** Convert a Supabase invoices row into the app's camelCase Invoice model. */
export function mapInvoiceRow(row: InvoiceRow, customerName: string, customerUrduName: string): Invoice {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    customerId: row.customer_id ?? '',
    customerName,
    customerUrduName,
    mandiRatePer40kg: num(row.mandi_rate_per_40kg),
    saleRatePer40kg: num(row.sale_rate_per_40kg),
    grossWeightKg: num(row.gross_weight_kg),
    shrinkageKg: num(row.shrinkage_kg),
    netWeightKg: num(row.net_weight_kg),
    birdCount: num(row.bird_count),
    mannDivisor: num(row.mann_divisor) || 40,
    totalAmount: num(row.total_amount),
    receivedCash: num(row.received_cash),
    receivedAC: num(row.received_ac),
    acPaymentMode: (row.ac_payment_mode ?? 'cash') as PaymentMode,
    acRefNo: row.ac_ref_no ?? undefined,
    discountAmount: num(row.discount_amount),
    previousBalance: num(row.previous_balance),
    newBalance: num(row.new_balance),
    vehicleId: row.vehicle_id ?? undefined,
    driverId: row.driver_id ?? undefined,
    shareToken: row.share_token,
    createdBy: row.created_by ?? '',
    createdAt: row.created_at
  };
}

/**
 * Fetch a single invoice by its public share_token using the anon key.
 * The backend keeps a public SELECT policy on invoices for share_token links
 * (customer WhatsApp links). Parties are staff-only under RLS, so the customer
 * name falls back to a placeholder for anonymous viewers.
 */
export async function fetchPublicInvoice(shareToken: string): Promise<Invoice | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('share_token', shareToken)
    .is('is_void', false)
    .maybeSingle<InvoiceRow>();

  if (error || !data) return null;

  let customerName = 'Customer';
  let customerUrduName = 'گاہک';
  if (data.customer_id) {
    try {
      const { data: party } = await supabase
        .from('parties')
        .select('name, urdu_name')
        .eq('id', data.customer_id)
        .maybeSingle();
      if (party) {
        customerName = party.name ?? customerName;
        customerUrduName = party.urdu_name ?? customerUrduName;
      }
    } catch {
      // anon cannot read parties under RLS — keep the placeholder
    }
  }

  return mapInvoiceRow(data, customerName, customerUrduName);
}
