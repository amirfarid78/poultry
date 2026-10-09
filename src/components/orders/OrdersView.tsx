import React, { useState } from 'react';
import { Party, OrderItem, Vehicle, OrderStatus, UserRole } from '../../types';
import { ClipboardList, Plus, Truck, Check, Share2, Printer, ArrowRight } from 'lucide-react';

interface OrdersViewProps {
  orders: OrderItem[];
  parties: Party[];
  vehicles: Vehicle[];
  currentRole: UserRole;
  language: 'en' | 'ur';
  onAddOrder: (order: OrderItem) => void;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus) => void;
  onConvertOrderToInvoice: (order: OrderItem) => void;
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  orders,
  parties,
  vehicles,
  currentRole,
  language,
  onAddOrder,
  onUpdateOrderStatus,
  onConvertOrderToInvoice
}) => {
  const isUrdu = language === 'ur';
  const customers = parties.filter((p) => p.partyType === 'customer');

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id || '');
  const [expectedKg, setExpectedKg] = useState<number>(80);
  const [quotedRate, setQuotedRate] = useState<number>(12200);
  const [deliverySlot, setDeliverySlot] = useState<string>('Morning (06:00 - 08:00)');
  const [deliveryRoute, setDeliveryRoute] = useState<string>('Main Market Route');
  const [assignedVehicleId, setAssignedVehicleId] = useState<string>(vehicles[0]?.id || '');
  const [specialNotes, setSpecialNotes] = useState<string>('');

  // Daily Order Sheet aggregation
  const totalBookedKg = orders.reduce((sum, o) => sum + o.expectedKg, 0);

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const cust = parties.find((p) => p.id === selectedCustomerId) || customers[0];
    if (!cust) return;

    const newOrder: OrderItem = {
      id: `ord-${Date.now()}`,
      orderNumber: `ORD-${700 + orders.length + 1}`,
      orderDate: new Date().toISOString().split('T')[0],
      customerId: cust.id,
      customerName: cust.name,
      customerUrduName: cust.urduName,
      bookerId: 'emp-2',
      bookerName: 'Shahid Mehmood',
      assignedVehicleId,
      expectedKg,
      quotedRatePer40kg: quotedRate,
      deliverySlot,
      deliveryRoute,
      status: 'booked',
      specialNotes,
      createdAt: new Date().toISOString()
    };

    onAddOrder(newOrder);
    setShowAddModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-emerald-600" />
            <span>{isUrdu ? 'روزانہ آرڈر شیٹ و بکنگ' : 'Daily Order Sheets & Booking'}</span>
          </h2>
          <p className="text-xs text-slate-500">
            {isUrdu 
              ? 'مارکیٹ سے پیشگی آرڈر بکنگ، کل درکار کلو گرام شیٹ، اور گاڑیوں کی الاٹمنٹ' 
              : 'Advance market orders, route consolidation, vehicle allocation and 1-click invoice conversion.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
          >
            <Printer className="w-4 h-4" />
            <span>{isUrdu ? 'آرڈر شیٹ پرنٹ' : 'Print Order Sheet'}</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            <span>{isUrdu ? 'نیا آرڈر بک کریں' : 'Book New Order'}</span>
          </button>
        </div>
      </div>

      {/* Consolidated Daily Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">
            {isUrdu ? 'آج کے کل بک شدہ آرڈرز' : 'Total Orders Booked'}
          </span>
          <p className="text-2xl font-black text-slate-900 font-mono mt-1">
            {orders.length}
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">
            {isUrdu ? 'کل درکار مال کا وزن' : 'Total Required Weight'}
          </span>
          <p className="text-2xl font-black text-emerald-700 font-mono mt-1">
            {totalBookedKg.toLocaleString()} kg
          </p>
          <span className="text-[10px] text-slate-400 font-mono">
            = {(totalBookedKg / 40).toFixed(1)} Mann (من)
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">
            {isUrdu ? 'گاڑیوں کی درکار گنجائش' : 'Vehicles Allocated'}
          </span>
          <p className="text-2xl font-black text-slate-800 font-mono mt-1">
            {vehicles.length} Trucks
          </p>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-800">
          {isUrdu ? 'آرڈرز کی مکمل فہرست و اسٹیٹس' : 'Consolidated Orders & Route Allocation'}
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left text-slate-700 border-collapse">
            <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[11px]">
              <tr>
                <th className="p-3 border-b">{isUrdu ? 'آرڈر #' : 'Order #'}</th>
                <th className="p-3 border-b">{isUrdu ? 'گاہک' : 'Customer'}</th>
                <th className="p-3 border-b">{isUrdu ? 'روٹ / وقت' : 'Route & Slot'}</th>
                <th className="p-3 border-b text-right">{isUrdu ? 'درکار کلو' : 'Expected Kg'}</th>
                <th className="p-3 border-b text-right">{isUrdu ? 'متوقع ریٹ' : 'Quoted Rate'}</th>
                <th className="p-3 border-b">{isUrdu ? 'گاڑی الاٹ' : 'Vehicle'}</th>
                <th className="p-3 border-b text-center">{isUrdu ? 'مرحلہ (Status)' : 'Status'}</th>
                <th className="p-3 border-b text-center">{isUrdu ? 'ایکشن' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((ord) => {
                const veh = vehicles.find((v) => v.id === ord.assignedVehicleId);
                return (
                  <tr key={ord.id} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-mono font-bold text-slate-900">{ord.orderNumber}</td>
                    <td className="p-3 font-semibold text-slate-800">
                      {ord.customerUrduName || ord.customerName}
                    </td>
                    <td className="p-3 text-slate-600">
                      <div>{ord.deliveryRoute}</div>
                      <div className="text-[10px] text-slate-400">{ord.deliverySlot}</div>
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-800 text-sm">
                      {ord.expectedKg} kg
                    </td>
                    <td className="p-3 text-right font-mono text-slate-700">
                      Rs {ord.quotedRatePer40kg.toLocaleString()}
                    </td>
                    <td className="p-3 font-medium text-slate-700">
                      {veh ? veh.plateNumber : 'Unassigned'}
                    </td>
                    <td className="p-3 text-center">
                      <select
                        value={ord.status}
                        onChange={(e) => onUpdateOrderStatus(ord.id, e.target.value as OrderStatus)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${
                          ord.status === 'delivered' 
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                            : ord.status === 'out_for_delivery'
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-slate-100 text-slate-800 border-slate-300'
                        }`}
                      >
                        <option value="booked">Booked (بک شدہ)</option>
                        <option value="confirmed">Confirmed (تصدیق شدہ)</option>
                        <option value="loaded">Loaded (گاڑی میں لوڈ)</option>
                        <option value="out_for_delivery">Out for Delivery (روانہ)</option>
                        <option value="delivered">Delivered (پہنچ گیا)</option>
                        <option value="invoiced">Invoiced (بل بن گیا)</option>
                      </select>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => onConvertOrderToInvoice(ord)}
                        className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold shadow-sm transition flex items-center gap-1 mx-auto"
                        title="Convert into POS Sale Invoice"
                      >
                        <span>{isUrdu ? 'انوائس بنائیں' : 'Make Invoice'}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Order Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 text-slate-800 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 mb-3">
              {isUrdu ? 'نیا آرڈر بک کریں (Order Booker Phone Panel)' : 'Book New Poultry Order'}
            </h3>

            <form onSubmit={handleCreateOrder} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isUrdu ? 'گاہک:' : 'Customer:'}
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-800 font-bold"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.urduName || c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isUrdu ? 'درکار وزن (کلو):' : 'Expected Weight (Kg):'}
                  </label>
                  <input
                    type="number"
                    value={expectedKg}
                    onChange={(e) => setExpectedKg(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isUrdu ? 'متوقع ریٹ / 40 کلو:' : 'Quoted Rate / 40kg:'}
                  </label>
                  <input
                    type="number"
                    value={quotedRate}
                    onChange={(e) => setQuotedRate(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isUrdu ? 'ڈلیوری روٹ / ایریا:' : 'Delivery Route / Area:'}
                </label>
                <input
                  type="text"
                  value={deliveryRoute}
                  onChange={(e) => setDeliveryRoute(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isUrdu ? 'گاڑی الاٹمنٹ:' : 'Assign Vehicle:'}
                </label>
                <select
                  value={assignedVehicleId}
                  onChange={(e) => setAssignedVehicleId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                >
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plateNumber} ({v.model})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  {isUrdu ? 'منسوخ' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl"
                >
                  {isUrdu ? 'آرڈر محفوظ کریں' : 'Save Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
