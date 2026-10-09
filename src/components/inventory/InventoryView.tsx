import React, { useState } from 'react';
import { InventoryItem, UserRole } from '../../types';
import { Layers, Plus, AlertTriangle, ArrowDown, ArrowUp, Activity } from 'lucide-react';

interface InventoryViewProps {
  inventory: InventoryItem[];
  currentRole: UserRole;
  language: 'en' | 'ur';
  onUpdateInventory: (items: InventoryItem[]) => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  inventory,
  currentRole,
  language,
  onUpdateInventory
}) => {
  const isUrdu = language === 'ur';
  const [showMortalityModal, setShowMortalityModal] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string>(inventory[0]?.id || '');
  const [deadCount, setDeadCount] = useState<number>(5);
  const [deadKg, setDeadKg] = useState<number>(10.5);
  const [reason, setReason] = useState<string>('گرمی و ٹرانسپورٹ دباؤ (Heat stress during transit)');

  const totalBirds = inventory.reduce((sum, item) => sum + item.currentCount, 0);
  const totalWeight = inventory.reduce((sum, item) => sum + item.currentWeightKg, 0);

  const handleRecordMortality = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = inventory.map((item) => {
      if (item.id === selectedItemId) {
        return {
          ...item,
          currentCount: Math.max(0, item.currentCount - deadCount),
          currentWeightKg: Math.max(0, item.currentWeightKg - deadKg)
        };
      }
      return item;
    });

    onUpdateInventory(updated);
    setShowMortalityModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Layers className="w-6 h-6 text-emerald-600" />
            <span>{isUrdu ? 'فارم انوینٹری، شیڈ اسٹاک و اموات (Mortality)' : 'Farm Inventory & Live Bird Stock'}</span>
          </h2>
          <p className="text-xs text-slate-500">
            {isUrdu 
              ? 'زندہ برائلر مرغی تعداد و وزن، فیڈ بیگز، جھاڑ (Shrinkage) اور شیڈ اموات ریکارڈ' 
              : 'Live birds head count & weight in kg, feed bags, mortality tracking & shrinkage alerts.'}
          </p>
        </div>

        <button
          onClick={() => setShowMortalityModal(true)}
          className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md transition"
        >
          <AlertTriangle className="w-4 h-4" />
          <span>{isUrdu ? 'اموات / جھاڑ درج کریں' : 'Record Mortality / Shrinkage'}</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">
            {isUrdu ? 'کل زندہ مرغ تعداد (Head Count)' : 'Total Live Birds Count'}
          </span>
          <p className="text-2xl font-black text-slate-900 font-mono mt-1">
            {totalBirds.toLocaleString()} Birds
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">
            {isUrdu ? 'کل موجود زندہ وزن (Total Weight)' : 'Total Live Weight in Sheds'}
          </span>
          <p className="text-2xl font-black text-emerald-700 font-mono mt-1">
            {totalWeight.toLocaleString()} kg
          </p>
          <span className="text-[10px] text-slate-400 font-mono">
            = {(totalWeight / 40).toFixed(1)} Mann (من)
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">
            {isUrdu ? 'اوسط وزن فی مرغ (Avg Bird Weight)' : 'Average Weight per Bird'}
          </span>
          <p className="text-2xl font-black text-slate-800 font-mono mt-1">
            {totalBirds > 0 ? (totalWeight / totalBirds).toFixed(2) : 0} kg
          </p>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-slate-800">
          {isUrdu ? 'شیڈ و اسٹاک تفصیلات' : 'Shed & Warehouse Stock Breakdown'}
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left text-slate-700 border-collapse">
            <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[11px]">
              <tr>
                <th className="p-3 border-b">{isUrdu ? 'آئٹم کوڈ' : 'Code'}</th>
                <th className="p-3 border-b">{isUrdu ? 'پروڈکٹ نام' : 'Product Name'}</th>
                <th className="p-3 border-b">{isUrdu ? 'کیٹیگری' : 'Category'}</th>
                <th className="p-3 border-b text-right">{isUrdu ? 'تعداد' : 'Count'}</th>
                <th className="p-3 border-b text-right">{isUrdu ? 'موجود وزن (کلو)' : 'Weight (Kg)'}</th>
                <th className="p-3 border-b text-right">{isUrdu ? 'من (40kg)' : 'Mann'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inventory.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition">
                  <td className="p-3 font-mono font-bold text-slate-900">{item.code}</td>
                  <td className="p-3 font-semibold text-slate-800">
                    <span>{item.name}</span>
                    <span className="font-urdu text-emerald-800 mr-2 text-[13px]"> ({item.urduName})</span>
                  </td>
                  <td className="p-3 capitalize">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                      {item.category}
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900">
                    {item.currentCount} {item.unit}
                  </td>
                  <td className="p-3 text-right font-mono font-extrabold text-emerald-800 text-sm">
                    {item.currentWeightKg.toLocaleString()} kg
                  </td>
                  <td className="p-3 text-right font-mono text-slate-500">
                    {(item.currentWeightKg / 40).toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Mortality Modal */}
      {showMortalityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 text-slate-800 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              <span>{isUrdu ? 'مرغ اموات یا جھاڑ درج کریں' : 'Record Bird Mortality / Shrinkage'}</span>
            </h3>

            <form onSubmit={handleRecordMortality} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isUrdu ? 'شیڈ / آئٹم منتخب کریں:' : 'Select Shed / Item:'}
                </label>
                <select
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                >
                  {inventory.filter(i => i.category === 'broiler').map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.currentCount} birds, {i.currentWeightKg} kg)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isUrdu ? 'مردہ مرغ تعداد:' : 'Dead Count (Birds):'}
                  </label>
                  <input
                    type="number"
                    value={deadCount}
                    onChange={(e) => setDeadCount(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-rose-700"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {isUrdu ? 'ضائع شدہ وزن (کلو):' : 'Lost Weight (Kg):'}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={deadKg}
                    onChange={(e) => setDeadKg(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-rose-700"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isUrdu ? 'وجہ / تفصیل:' : 'Reason / Cause:'}
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMortalityModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  {isUrdu ? 'منسوخ' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl"
                >
                  {isUrdu ? 'نقصان ریکارڈ کریں' : 'Deduct from Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
