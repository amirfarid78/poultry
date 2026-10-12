import React, { useState, useEffect } from 'react';
import { UserRole, StaffProfile, UserInvite } from '../../types';
import { supabase } from '../../lib/supabase';
import {
  fetchStaffProfiles, fetchUserInvites, createUserInvite,
  deleteUserInvite, updateStaffRole, setStaffActive,
} from '../../lib/db';
import { ALL_ROLES } from '../../lib/permissions';
import { Users, UserPlus, Mail, Trash2, CheckCircle2, Clock, Shield, X } from 'lucide-react';

const ROLE_LABELS: Record<UserRole, { en: string; ur: string }> = {
  owner: { en: 'Owner', ur: 'مالک' },
  manager: { en: 'Manager', ur: 'مینیجر' },
  accountant: { en: 'Accountant', ur: 'اکاؤنٹنٹ' },
  cashier: { en: 'Cashier', ur: 'کیشیئر' },
  order_booker: { en: 'Order Booker', ur: 'آرڈر بکر' },
  driver: { en: 'Driver', ur: 'ڈرائیور' },
  stock_keeper: { en: 'Stock Keeper', ur: 'اسٹاک کیپر' },
  auditor: { en: 'Auditor', ur: 'آڈیٹر' },
};

export const UserManagement: React.FC<{ language: 'en' | 'ur'; currentUserId: string | null }> = ({
  language, currentUserId,
}) => {
  const isUrdu = language === 'ur';
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [invites, setInvites] = useState<UserInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('cashier');
  const [inviting, setInviting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [p, i] = await Promise.all([
        fetchStaffProfiles(supabase),
        fetchUserInvites(supabase),
      ]);
      setProfiles(p);
      setInvites(i);
    } catch (e: any) {
      setNotice(e?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.includes('@')) return;
    setInviting(true);
    try {
      await createUserInvite(supabase, inviteEmail, inviteRole);
      setNotice(isUrdu
        ? `${inviteEmail} کو ${ROLE_LABELS[inviteRole].ur} کے طور پر مدعو کر دیا — وہ اس ای میل سے سائن اپ کریں۔`
        : `Invited ${inviteEmail} as ${ROLE_LABELS[inviteRole].en} — they should sign up with this email.`);
      setInviteEmail('');
      await load();
    } catch (e: any) {
      setNotice(e?.message || 'Invite failed');
    } finally {
      setInviting(false);
    }
    setTimeout(() => setNotice(null), 5000);
  };

  const handleRoleChange = async (p: StaffProfile, role: UserRole) => {
    if (p.id === currentUserId && role !== 'owner') {
      if (!window.confirm(isUrdu ? 'آپ اپنا اپنا مالک رول ہٹا رہے ہیں — جاری رکھیں؟' : 'You are removing your own owner role — continue?')) return;
    }
    try {
      await updateStaffRole(supabase, p.id, role);
      setProfiles((prev) => prev.map((x) => (x.id === p.id ? { ...x, role } : x)));
    } catch (e: any) {
      setNotice(e?.message || 'Role change failed');
      setTimeout(() => setNotice(null), 4000);
    }
  };

  const handleToggleActive = async (p: StaffProfile) => {
    try {
      await setStaffActive(supabase, p.id, !p.isActive);
      setProfiles((prev) => prev.map((x) => (x.id === p.id ? { ...x, isActive: !x.isActive } : x)));
    } catch (e: any) {
      setNotice(e?.message || 'Failed');
      setTimeout(() => setNotice(null), 4000);
    }
  };

  const handleDeleteInvite = async (id: string) => {
    try {
      await deleteUserInvite(supabase, id);
      setInvites((prev) => prev.filter((x) => x.id !== id));
    } catch { /* ignore */ }
  };

  if (loading) {
    return <div className="p-6 text-center text-sm text-slate-500">{isUrdu ? 'لوڈ ہو رہا ہے...' : 'Loading users...'}</div>;
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium">
          {notice}
        </div>
      )}

      {/* Invite new user */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-1">
          <UserPlus className="w-4 h-4 text-emerald-600" />
          {isUrdu ? 'نیا صارف مدعو کریں' : 'Invite New User'}
        </h3>
        <p className="text-[11px] text-slate-500 mb-3">
          {isUrdu
            ? 'ای میل درج کریں اور رول منتخب کریں — صارف اسی ای میل سے سائن اپ کرے گا اور خودکار طور پر یہ رول مل جائے گا۔'
            : 'Enter their email and pick a role — they sign up with that email and automatically get the role.'}
        </p>
        <form onSubmit={handleInvite} className="flex flex-wrap gap-2">
          <input
            type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="driver@example.com"
            className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-slate-300 text-xs"
          />
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as UserRole)}
            className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold">
            {ALL_ROLES.filter((r) => r !== 'owner').map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r].en} ({ROLE_LABELS[r].ur})</option>
            ))}
          </select>
          <button type="submit" disabled={inviting}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5">
            <Mail className="w-4 h-4" />
            {inviting ? '...' : (isUrdu ? 'دعوت بھیجیں' : 'Send Invite')}
          </button>
        </form>

        {/* Pending invites */}
        {invites.filter((i) => !i.acceptedAt).length > 0 && (
          <div className="mt-4 space-y-1.5">
            <p className="text-[11px] font-bold text-slate-500 uppercase">{isUrdu ? 'زیر التواء دعوتیں' : 'Pending invites'}</p>
            {invites.filter((i) => !i.acceptedAt).map((inv) => (
              <div key={inv.id} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs">
                <span className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span className="font-mono font-bold">{inv.email}</span>
                  <span className="text-amber-700 font-bold">→ {ROLE_LABELS[inv.role].en}</span>
                </span>
                <button onClick={() => handleDeleteInvite(inv.id)} className="p-1 text-slate-400 hover:text-rose-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Staff list */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-emerald-600" />
          {isUrdu ? `اسٹاف (${profiles.length})` : `Staff (${profiles.length})`}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-700 uppercase text-[11px]">
              <tr>
                <th className="p-3">{isUrdu ? 'نام / ای میل' : 'Name / Email'}</th>
                <th className="p-3">{isUrdu ? 'رول' : 'Role'}</th>
                <th className="p-3 text-center">{isUrdu ? 'حیثیت' : 'Status'}</th>
                <th className="p-3 text-center">{isUrdu ? 'فعال / غیر فعال' : 'Enable / Disable'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {profiles.map((p) => (
                <tr key={p.id} className={`hover:bg-slate-50 ${!p.isActive ? 'opacity-50' : ''}`}>
                  <td className="p-3">
                    <p className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-slate-400" />
                      {p.fullName || (isUrdu ? 'نام نہیں' : 'No name')}
                      {p.id === currentUserId && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">
                          {isUrdu ? 'آپ' : 'YOU'}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono ml-5">{p.email}</p>
                  </td>
                  <td className="p-3">
                    <select value={p.role} onChange={(e) => handleRoleChange(p, e.target.value as UserRole)}
                      disabled={p.id === currentUserId && p.role === 'owner' && profiles.filter((x) => x.role === 'owner' && x.isActive).length === 1}
                      className="px-2 py-1.5 rounded-lg border border-slate-300 text-[11px] font-bold bg-white">
                      {ALL_ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r].en} ({ROLE_LABELS[r].ur})</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3 text-center">
                    {p.isActive ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" /> {isUrdu ? 'فعال' : 'Active'}
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">
                        {isUrdu ? 'غیر فعال' : 'Disabled'}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <button onClick={() => handleToggleActive(p)}
                      disabled={p.id === currentUserId}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition disabled:opacity-30 ${
                        p.isActive
                          ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                          : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      }`}>
                      {p.isActive ? (isUrdu ? 'غیر فعال کریں' : 'Disable') : (isUrdu ? 'فعال کریں' : 'Enable')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400 mt-3">
          {isUrdu
            ? 'نوٹ: غیر فعال صارف لاگ اِن نہیں کر سکے گا۔ رول تبدیل کرنے پر متعلقہ اسکرینز خودکار بدل جاتی ہیں۔'
            : 'Note: disabled users cannot sign in. Changing a role instantly changes which screens they can open.'}
        </p>
      </div>
    </div>
  );
};
