import React, { useState } from 'react';
import { Party, OrderItem, Vehicle, OrderStatus, UserRole, StaffProfile } from '../../types';
import { ClipboardList, Plus, Check, Printer, ArrowRight, Pencil, Trash2, X, User } from 'lucide-react';

interface OrdersViewProps {
  orders: OrderItem[];
  parties: Party[];
  vehicles: Vehicle[];
  staffProfiles: StaffProfile[];
  currentUserId: string | null;
  currentUserName: string | null;
  currentRole: UserRole;
  language: 'en' | 'ur';
  onAddOrder: (order: OrderItem) => void;
  onUpdateOrder: (order: OrderItem) => void;
  onDeleteOrder: (orderId: string) => void;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus) => void;
  onConvertOrderToInvoice: (order: OrderItem) => void;
}

const emptyForm = () => ({
  customerId: '',
  expectedKg: 80,
  expectedBirdCount: 40,
  quotedRate: 0,
  deliverySlot: 'Morning (06:00 - 08:00)',
  deliveryRoute: '',
  assignedVehicleId: '',
  assignedDriverId: '',
  specialNotes: '',
});

export const OrdersView: React.FC<OrdersViewProps> = ({
  orders,
  parties,
  vehicles,
  staffProfiles,
  currentUserId,
  currentUserName,
  currentRole,
  language,
  onAddOrder,
  onUpdateOrder,
  onDeleteOrder,
  onUpdateOrderStatus,
  onConvertOrderToInvoice
}) => {
  const isUrdu = language === 'ur';
  const customers = parties.filter((p) => p.partyType === 'customer');
  const drivers = staffProfiles.filter((p) => p.role === 'driver' && p.isActive);
  const canEdit = ['owner', 'manager', 'order_booker'].includes(currentRole);
  const canDelete = ['owner', 'manager'].includes(currentRole);

  const [showModal, setShowModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<OrderItem | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const openAdd = () => {
    setEditingOrder(null);
    setForm({ ...emptyForm(), customerId: customers[0]?.id || '', assignedVehicleId: vehicles[0]?.id || '' });
    setShowModal(true);
  };

  const openEdit = (o: OrderItem) => {
    setEditingOrder(o);
    setForm({
      customerId: o.customerId,
      expectedKg: o.expectedKg,
      expectedBirdCount: o.expectedBirdCount || 0,
      quotedRate: o.quotedRatePer40kg,
      deliverySlot: o.deliverySlot,
      deliveryRoute: o.deliveryRoute,
      assignedVehicleId: o.assignedVehicleId || '',
      assignedDriverId: (o as any).assignedDriverId || '',
      specialNotes: o.specialNotes || '',
    });
    setShowModal(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cust = parties.find((p) => p.id === form.customerId) || customers[0];
    if (!cust) return;
    const driver = drivers.find((d) => d.id === form.assignedDriverId);

    if (editingOrder) {
      onUpdateOrder({
        ...editingOrder,
        customerId: cust.id,
        customerName: cust.name,
        customerUrduName: cust.urduName,
        expectedKg: form.expectedKg,
        expectedBirdCount: form.expectedBirdCount,
        quotedRatePer40kg: form.quotedRate,
        deliverySlot: form.deliverySlot,
        deliveryRoute: form.deliveryRoute,
        assignedVehicleId: form.assignedVehicleId || undefined,
        specialNotes: form.specialNotes,
        ...(form.assignedDriverId ? { assignedDriverId: form.assignedDriverId, assignedDriverName: driver?.fullName } : {}),
      } as OrderItem);
    } else {
      const newOrder: OrderItem = {
        id: `ord-${Date.now()}`,
        orderNumber: `ORD-${700 + orders.length + 1}`,
        orderDate: new Date().toISOString().split('T')[0],
        customerId: cust.id,
        customerName: cust.name,
        customerUrduName: cust.urduName,
        bookerId: currentUserId || 'unknown',
        bookerName: currentUserName || currentRole,
        assignedVehicleId: form.assignedVehicleId || undefined,
        expectedKg: form.expectedKg,
        expectedBirdCount: form.expectedBirdCount,
        quotedRatePer40kg: form.quotedRate,
        deliverySlot: form.deliverySlot,
        deliveryRoute: form.deliveryRoute,
        status: 'booked',
        specialNotes: form.specialNotes,
        createdAt: new Date().toISOString(),
      } as OrderItem;
      if (form.assignedDriverId) {
        (newOrder as any).assignedDriverId = form.assignedDriverId;
        (newOrder as any).assignedDriverName = driver?.fullName;
      }
      onAddOrder(newOrder);
    }
    setShowModal(false);
    setEditingOrder(null);
  };

  const handleDelete = (o: OrderItem) => {
    const msg = isUrdu
      ? `کیا آپ واقعی آرڈر ${o.orderNumber} حذف کرنا چاہتے ہیں؟`
      : `Delete order ${o.orderNumber}?`;
    if (window.confirm(msg)) onDeleteOrder(o.id);
  };

  // Filters
  const filtered = orders.filter((o) => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        (o.customerUrduName || '').includes(search)
      );
    }
    return true;
  });

  const totalBookedKg = filtered.reduce((sum, o) => sum + o.expectedKg, 0);
  const todayOrders = orders.filter((o) => o.orderDate === new Date().toISOString().split('T')[0]);

  const statusColor = (s: string) =>
    s === 'delivered' ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
    : s === 'out_for_delivery' ? 'bg-amber-100 text-amber-800 border-amber-300'
    : s === 'cancelled' ? 'bg-rose-100 text-rose-700 border-rose-300'
    : 'bg-slate-100 text-slate-800 border-slate-300';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-emerald-600" />
            <span>{isUrdu ? 'روزانہ آرڈر شیٹ و بکنگ' : 'Daily Order Sheet & Booking'}</span>
          </h2>
          <p className="text-xs text-slate-500">
            {isUrdu ? 'مارکیٹ سے پیشگی آرڈر بکنگ، گاڑی و ڈرائیور الاٹمنٹ' : 'Advance orders, vehicle & driver allocation, 1-click invoice conversion.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 transition">
            <Printer className="w-4 h-4" />
            <span>{isUrdu ? 'آرڈر شیٹ پرنٹ' : 'Print Sheet'}</span>
          </button>
          {canEdit && (
            <button onClick={openAdd}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md transition">
              <Plus className="w-4 h-4" />
              <span>{isUrdu ? 'نیا آرڈر بک کریں' : 'Book New Order'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">{isUrdu ? 'کل آرڈرز' : 'Total Orders'}</span>
          <p className="text-2xl font-black text-slate-900 font-mono mt-1">{orders.length}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">{isUrdu ? "آج کے آرڈرز" : "Today's Orders"}</span>
          <p className="text-2xl font-black text-emerald-700 font-mono mt-1">{todayOrders.length}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">{isUrdu ? 'کل درکار وزن' : 'Required Weight'}</span>
          <p className="text-2xl font-black text-slate-900 font-mono mt-1">{totalBookedKg.toLocaleString()} <span className="text-sm">kg</span></p>
          <span className="text-[10px] text-slate-400 font-mono">= {(totalBookedKg / 40).toFixed(1)} Mann</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">{isUrdu ? 'زیر التواء' : 'Pending'}</span>
          <p className="text-2xl font-black text-amber-600 font-mono mt-1">
            {orders.filter((o) => ['booked', 'confirmed'].includes(o.status)).length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-3 items-center">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={isUrdu ? 'تلاش: آرڈر نمبر یا گاہک...' : 'Search order # or customer...'}
          className="px-3 py-2 rounded-xl border border-slate-300 text-xs flex-1 min-w-[200px]" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold">
          <option value="all">{isUrdu ? 'تمام اسٹیٹس' : 'All statuses'}</option>
          <option value="booked">Booked</option>
          <option value="confirmed">Confirmed</option>
          <option value="loaded">Loaded</option>
          <option value="out_for_delivery">Out for Delivery</option>
          <option value="delivered">Delivered</option>
          <option value="invoiced">Invoiced</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Orders table */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-800">
          {isUrdu ? 'آرڈرز کی مکمل فہرست' : 'All Orders'} ({filtered.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[11px]">
              <tr>
                <th className="p-3 border-b">{isUrdu ? 'آرڈر #' : 'Order #'}</th>
                <th className="p-3 border-b">{isUrdu ? 'تاریخ' : 'Date'}</th>
                <th className="p-3 border-b">{isUrdu ? 'گاہک' : 'Customer'}</th>
                <th className="p-3 border-b">{isUrdu ? 'بکر' : 'Booker'}</th>
                <th className="p-3 border-b text-right">{isUrdu ? 'کلو' : 'Kg'}</th>
                <th className="p-3 border-b text-right">{isUrdu ? 'ریٹ' : 'Rate'}</th>
                <th className="p-3 border-b">{isUrdu ? 'گاڑی / ڈرائیور' : 'Vehicle / Driver'}</th>
                <th className="p-3 border-b text-center">{isUrdu ? 'اسٹیٹس' : 'Status'}</th>
                <th className="p-3 border-b text-center">{isUrdu ? 'ایکشن' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((ord) => {
                const veh = vehicles.find((v) => v.id === ord.assignedVehicleId);
                return (
                  <tr key={ord.id} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-mono font-bold text-slate-900">{ord.orderNumber}</td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">{ord.orderDate}</td>
                    <td className="p-3">
                      <p className="font-semibold text-slate-800">{ord.customerUrduName || ord.customerName}</p>
                      <p className="text-[10px] text-slate-400">{ord.deliveryRoute} • {ord.deliverySlot}</p>
                    </td>
                    <td className="p-3 text-slate-600">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{ord.bookerName}</span>
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-800">{ord.expectedKg}</td>
                    <td className="p-3 text-right font-mono text-slate-700">Rs {ord.quotedRatePer40kg.toLocaleString()}</td>
                    <td className="p-3 text-slate-600 text-[11px]">
                      <p className="font-mono font-bold">{veh ? veh.plateNumber : '—'}</p>
                      <p>{(ord as any).assignedDriverName || ''}</p>
                    </td>
                    <td className="p-3 text-center">
                      <select value={ord.status} disabled={!canEdit}
                        onChange={(e) => onUpdateOrderStatus(ord.id, e.target.value as OrderStatus)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${statusColor(ord.status)} ${!canEdit ? 'opacity-60' : ''}`}>
                        <option value="booked">Booked</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="loaded">Loaded</option>
                        <option value="out_for_delivery">Out for Delivery</option>
                        <option value="delivered">Delivered</option>
                        <option value="invoiced">Invoiced</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        {canEdit && (
                          <button onClick={() => openEdit(ord)} title={isUrdu ? 'ترمیم' : 'Edit'}
                            className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500"><Pencil className="w-4 h-4" /></button>
                        )}
                        {canDelete && (
                          <button onClick={() => handleDelete(ord)} title={isUrdu ? 'حذف' : 'Delete'}
                            className="p-1.5 rounded-lg hover:bg-rose-100 text-rose-500"><Trash2 className="w-4 h-4" /></button>
                        )}
                        <button onClick={() => onConvertOrderToInvoice(ord)} title={isUrdu ? 'انوائس بنائیں' : 'Make invoice'}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1">
                          <span>{isUrdu ? 'انوائس' : 'Invoice'}</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="p-8 text-center text-slate-400">{isUrdu ? 'کوئی آرڈر نہیں ملا' : 'No orders found'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingOrder ? (isUrdu ? 'آرڈر میں ترمیم' : 'Edit Order') : (isUrdu ? 'نیا آرڈر بک کریں' : 'Book New Order')}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">{isUrdu ? 'گاہک *' : 'Customer *'}</label>
                <select value={form.customerId} onChange={(e) => set('customerId', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold" required>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.urduName || c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isUrdu ? 'وزن (کلو) *' : 'Weight (kg) *'}</label>
                  <input type="number" value={form.expectedKg} onChange={(e) => set('expectedKg', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold" required min={1} />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isUrdu ? 'پرندے' : 'Birds'}</label>
                  <input type="number" value={form.expectedBirdCount} onChange={(e) => set('expectedBirdCount', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isUrdu ? 'ریٹ /40کلو' : 'Rate /40kg'}</label>
                  <input type="number" value={form.quotedRate} onChange={(e) => set('quotedRate', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isUrdu ? 'ڈلیوری سلاٹ' : 'Delivery Slot'}</label>
                  <select value={form.deliverySlot} onChange={(e) => set('deliverySlot', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300">
                    <option>Morning (06:00 - 08:00)</option>
                    <option>Midday (11:00 - 13:00)</option>
                    <option>Evening (17:00 - 19:00)</option>
                    <option>Night (21:00 - 23:00)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isUrdu ? 'روٹ / ایریا' : 'Route / Area'}</label>
                  <input value={form.deliveryRoute} onChange={(e) => set('deliveryRoute', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300" placeholder={isUrdu ? 'مثلاً مین مارکیٹ' : 'e.g. Main Market'} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isUrdu ? 'گاڑی' : 'Vehicle'}</label>
                  <select value={form.assignedVehicleId} onChange={(e) => set('assignedVehicleId', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300">
                    <option value="">{isUrdu ? 'بعد میں' : 'Assign later'}</option>
                    {vehicles.filter((v) => v.isActive).map((v) => (
                      <option key={v.id} value={v.id}>{v.plateNumber} ({v.model})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isUrdu ? 'ڈرائیور' : 'Driver'}</label>
                  <select value={form.assignedDriverId} onChange={(e) => set('assignedDriverId', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300">
                    <option value="">{isUrdu ? 'بعد میں' : 'Assign later'}</option>
                    {drivers.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">{isUrdu ? 'خصوصی نوٹ' : 'Special Notes'}</label>
                <textarea value={form.specialNotes} onChange={(e) => set('specialNotes', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300" rows={2} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl">{isUrdu ? 'منسوخ' : 'Cancel'}</button>
                <button type="submit" className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center gap-1">
                  <Check className="w-4 h-4" />{editingOrder ? (isUrdu ? 'اپ ڈیٹ کریں' : 'Update') : (isUrdu ? 'آرڈر محفوظ کریں' : 'Save Order')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
