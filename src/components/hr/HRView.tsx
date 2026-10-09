import React, { useState } from 'react';
import { Employee, UserRole } from '../../types';
import { formatPKR } from '../../utils/calculations';
import { Users, Plus, DollarSign, Calendar, CheckCircle } from 'lucide-react';

interface HRViewProps {
  employees: Employee[];
  currentRole: UserRole;
  language: 'en' | 'ur';
  onUpdateEmployees: (emps: Employee[]) => void;
}

export const HRView: React.FC<HRViewProps> = ({
  employees,
  currentRole,
  language,
  onUpdateEmployees
}) => {
  const isUrdu = language === 'ur';
  const [selectedEmpId, setSelectedEmpId] = useState<string>(employees[0]?.id || '');
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState<number>(5000);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedEmp = employees.find((e) => e.id === selectedEmpId) || employees[0];

  const handleGiveAdvance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp || advanceAmount <= 0) return;

    const updated = employees.map((emp) => {
      if (emp.id === selectedEmp.id) {
        return {
          ...emp,
          advanceBalance: emp.advanceBalance + advanceAmount
        };
      }
      return emp;
    });

    onUpdateEmployees(updated);
    setShowAdvanceModal(false);
    setNotice(
      isUrdu 
        ? `${selectedEmp.name} کو Rs ${advanceAmount.toLocaleString()} پیشگی رقم ادا کر دی گئی`
        : `Advance Rs ${advanceAmount.toLocaleString()} given to ${selectedEmp.name}`
    );
    setTimeout(() => setNotice(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-600" />
            <span>{isUrdu ? 'ملازمین، تنخواہیں و پیشگی لون (Advances)' : 'HR, Staff Payroll & Advance Khata'}</span>
          </h2>
          <p className="text-xs text-slate-500">
            {isUrdu 
              ? 'ڈرائیورز، آرڈر بکنگ، منشی تنخواہیں، کمیشن، پیشگی لونز اور ماہانہ کٹوتیاں' 
              : 'Driver and booker payroll, advance loans recovery, and monthly salary slips.'}
          </p>
        </div>

        <button
          onClick={() => setShowAdvanceModal(true)}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md transition"
        >
          <DollarSign className="w-4 h-4" />
          <span>{isUrdu ? 'ملازم کو پیشگی لون دیں' : 'Issue Advance Loan'}</span>
        </button>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-600 text-white rounded-xl text-xs font-medium flex items-center gap-2 animate-in fade-in">
          <CheckCircle className="w-4 h-4" />
          <span>{notice}</span>
        </div>
      )}

      {/* Staff Table */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-slate-800">
          {isUrdu ? 'فعال ملازمین کی فہرست' : 'Active Staff Roster'}
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left text-slate-700 border-collapse">
            <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[11px]">
              <tr>
                <th className="p-3 border-b">{isUrdu ? 'کوڈ' : 'Code'}</th>
                <th className="p-3 border-b">{isUrdu ? 'نام' : 'Name'}</th>
                <th className="p-3 border-b">{isUrdu ? 'عہدہ' : 'Role'}</th>
                <th className="p-3 border-b">{isUrdu ? 'موبائل نمبر' : 'Phone'}</th>
                <th className="p-3 border-b text-right">{isUrdu ? 'ماہانہ تنخواہ' : 'Salary'}</th>
                <th className="p-3 border-b text-right text-rose-700">{isUrdu ? 'پیشگی لون بقایا' : 'Advance Balance'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-50">
                  <td className="p-3 font-mono font-bold text-slate-900">{emp.code}</td>
                  <td className="p-3 font-semibold text-slate-800">
                    <span>{emp.name}</span>
                    <span className="font-urdu text-emerald-800 mr-2 text-[13px]"> ({emp.urduName})</span>
                  </td>
                  <td className="p-3 capitalize">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                      {emp.role}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-slate-600">{emp.phone}</td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900">
                    Rs {emp.monthlySalary.toLocaleString()}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-rose-700">
                    Rs {emp.advanceBalance.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Give Advance Modal */}
      {showAdvanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 text-slate-800 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 mb-3">
              {isUrdu ? 'ملازم کو پیشگی لون / ایڈوانس دیں' : 'Issue Employee Advance / Loan'}
            </h3>

            <form onSubmit={handleGiveAdvance} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isUrdu ? 'ملازم منتخب کریں:' : 'Select Employee:'}
                </label>
                <select
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.role}) - Current Advance: Rs {emp.advanceBalance}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isUrdu ? 'ایڈوانس رقم (روپے):' : 'Advance Amount (PKR):'}
                </label>
                <input
                  type="number"
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-sm"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAdvanceModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  {isUrdu ? 'منسوخ' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl"
                >
                  {isUrdu ? 'رقم ادا کریں' : 'Confirm & Disburse'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
