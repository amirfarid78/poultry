import React, { useState, useEffect } from 'react';
import { Party, PartyType } from '../../types';
import { User, Building2, Phone, MapPin, Scale, CreditCard, X, Check, Shield } from 'lucide-react';

interface PartyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveParty: (party: Party) => void;
  initialParty?: Party | null;
  defaultPartyType?: PartyType;
  language: 'en' | 'ur';
}

export const PartyModal: React.FC<PartyModalProps> = ({
  isOpen,
  onClose,
  onSaveParty,
  initialParty,
  defaultPartyType = 'customer',
  language
}) => {
  const isUrdu = language === 'ur';

  const [partyType, setPartyType] = useState<PartyType>(defaultPartyType);
  const [name, setName] = useState('');
  const [urduName, setUrduName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Lahore');
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [balanceType, setBalanceType] = useState<'receivable' | 'advance'>('receivable');
  const [creditLimit, setCreditLimit] = useState<number>(200000);
  const [defaultKilo, setDefaultKilo] = useState<number>(80);
  const [cnic, setCnic] = useState('');

  useEffect(() => {
    if (initialParty) {
      setPartyType(initialParty.partyType);
      setName(initialParty.name);
      setUrduName(initialParty.urduName || '');
      setPhone(initialParty.phone || '');
      setWhatsapp(initialParty.whatsapp || initialParty.phone || '');
      setAddress(initialParty.address || '');
      setCity(initialParty.city || 'Lahore');
      if (initialParty.openingBalance < 0) {
        setBalanceType('advance');
        setOpeningBalance(Math.abs(initialParty.openingBalance));
      } else {
        setBalanceType('receivable');
        setOpeningBalance(initialParty.openingBalance);
      }
      setCreditLimit(initialParty.creditLimit || 200000);
      setDefaultKilo(initialParty.defaultKilo || 80);
      setCnic(initialParty.cnic || '');
    } else {
      setPartyType(defaultPartyType);
      setName('');
      setUrduName('');
      setPhone('');
      setWhatsapp('');
      setAddress('');
      setCity('Lahore');
      setOpeningBalance(0);
      setBalanceType('receivable');
      setCreditLimit(partyType === 'customer' ? 200000 : 1000000);
      setDefaultKilo(partyType === 'customer' ? 80 : 1000);
      setCnic('');
    }
  }, [initialParty, defaultPartyType, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() && !urduName.trim()) {
      alert(isUrdu ? 'براہ کرم پارٹی کا نام درج کریں' : 'Please provide a party name');
      return;
    }

    const finalOpeningBal = balanceType === 'advance' ? -Math.abs(openingBalance) : Math.abs(openingBalance);

    const savedParty: Party = {
      id: initialParty?.id || `${partyType === 'customer' ? 'cust' : 'supp'}-${Date.now()}`,
      partyType,
      name: name.trim() || urduName.trim(),
      urduName: urduName.trim() || name.trim(),
      phone: phone.trim(),
      whatsapp: whatsapp.trim() || phone.trim(),
      address: address.trim(),
      city: city.trim() || 'Lahore',
      openingBalance: finalOpeningBal,
      currentBalance: initialParty ? initialParty.currentBalance : finalOpeningBal,
      creditLimit: Number(creditLimit) || 0,
      defaultKilo: Number(defaultKilo) || 80,
      cnic: cnic.trim(),
      createdAt: initialParty?.createdAt || new Date().toISOString()
    };

    onSaveParty(savedParty);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-xl w-full p-5 sm:p-6 text-slate-800 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 my-auto max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b pb-3 mb-4">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-xl ${partyType === 'customer' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
              {partyType === 'customer' ? <User className="w-5 h-5" /> : <Building2 className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                {initialParty 
                  ? (isUrdu ? 'کھاتہ دار تفصیلات تبدیل کریں' : 'Edit Party Profile')
                  : (isUrdu ? (partyType === 'customer' ? 'نیا گاہک درج کریں (Add Customer)' : 'نیا سپلائر درج کریں (Add Supplier)') : `Add New ${partyType === 'customer' ? 'Customer' : 'Supplier'}`)}
              </h3>
              <p className="text-[11px] text-slate-500">
                {isUrdu ? 'نام، فون نمبر، بقایا اور ادھار حد کی ترتیبات' : 'Contact details, opening balance, and credit controls'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Party Type selector (if creating new) */}
          {!initialParty && (
            <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
              <button
                type="button"
                onClick={() => setPartyType('customer')}
                className={`flex-1 py-1.5 font-bold rounded-lg transition text-xs flex items-center justify-center gap-1.5 ${
                  partyType === 'customer' ? 'bg-emerald-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>{isUrdu ? 'گاہک / خریدار (Customer)' : 'Customer'}</span>
              </button>
              <button
                type="button"
                onClick={() => setPartyType('supplier')}
                className={`flex-1 py-1.5 font-bold rounded-lg transition text-xs flex items-center justify-center gap-1.5 ${
                  partyType === 'supplier' ? 'bg-blue-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>{isUrdu ? 'سپلائر / فارم (Supplier)' : 'Supplier'}</span>
              </button>
            </div>
          )}

          {/* Names */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                {isUrdu ? 'اردو نام (Urdu Name):' : 'Urdu Name:'} <span className="text-emerald-600 font-normal">*(تجویز کردہ)</span>
              </label>
              <input
                type="text"
                placeholder={partyType === 'customer' ? 'مثلاً: سمی خان چکن شاپ' : 'مثلاً: بگ برڈ ہیچری'}
                value={urduName}
                onChange={(e) => {
                  setUrduName(e.target.value);
                  if (!name) setName(e.target.value);
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-urdu text-sm font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                {isUrdu ? 'انگلش نام (English Name):' : 'English Name:'}
              </label>
              <input
                type="text"
                placeholder="e.g. Sami Khan Chicken Shop"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Contact Numbers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Phone className="w-3 h-3 text-slate-500" />
                <span>{isUrdu ? 'موبائل نمبر (Mobile Phone):' : 'Mobile Phone:'}</span>
              </label>
              <input
                type="tel"
                placeholder="03001234567"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (!whatsapp) setWhatsapp(e.target.value);
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-slate-800 focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                <span className="text-emerald-600 font-bold">WA</span>
                <span>{isUrdu ? 'واٹس ایپ نمبر (WhatsApp):' : 'WhatsApp Number:'}</span>
              </label>
              <input
                type="tel"
                placeholder="03001234567"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-slate-800 focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* City & Address */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-slate-500" />
                <span>{isUrdu ? 'شہر (City):' : 'City:'}</span>
              </label>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-medium text-slate-800 bg-white"
              >
                <option value="Lahore">Lahore (لاہور)</option>
                <option value="Karachi">Karachi (کراچی)</option>
                <option value="Rawalpindi">Rawalpindi (راولپنڈی)</option>
                <option value="Faisalabad">Faisalabad (فیصل آباد)</option>
                <option value="Gujranwala">Gujranwala (گوجرانوالہ)</option>
                <option value="Multan">Multan (ملتان)</option>
                <option value="Sialkot">Sialkot (سیالکوٹ)</option>
                <option value="Peshawar">Peshawar (پشاور)</option>
                <option value="Quetta">Quetta (کوئٹہ)</option>
                <option value="Other">Other (دیگر)</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block font-bold text-slate-700 mb-1">
                {isUrdu ? 'دکان یا فارم کا پتہ (Address):' : 'Shop / Farm Address:'}
              </label>
              <input
                type="text"
                placeholder={isUrdu ? 'مثلاً: شاپ 12، گول مارکیٹ شادمان' : 'e.g. Shop #14, Gol Market'}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-800"
              />
            </div>
          </div>

          {/* Opening Balance */}
          {!initialParty && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-700 flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                  <span>{isUrdu ? 'ابتدائی سابقہ بیلنس (Opening Balance):' : 'Opening Balance:'}</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBalanceType('receivable')}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                      balanceType === 'receivable' ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {isUrdu ? 'بقایا لینا ہے (Receivable)' : 'Receivable (+)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBalanceType('advance')}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                      balanceType === 'advance' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {isUrdu ? 'پیشگی جمع ہے (Advance)' : 'Advance (-)'}
                  </button>
                </div>
              </div>

              <div className="relative">
                <span className="absolute left-3 top-2 font-bold text-slate-400">Rs</span>
                <input
                  type="number"
                  min="0"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-300 font-mono text-sm font-bold text-slate-900 bg-white"
                />
              </div>
              <p className="text-[10px] text-slate-500">
                {isUrdu 
                  ? 'اگر گاہک نے پہلے سے ادھار دینا ہے تو "بقایا لینا ہے" رکھیں، اگر ایڈوانس پیسے جمع ہیں تو "پیشگی جمع ہے" رکھیں۔' 
                  : 'Positive if customer owes money, negative advance if party deposited funds.'}
              </p>
            </div>
          )}

          {/* Credit Limit & Default Lot */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Shield className="w-3 h-3 text-slate-500" />
                <span>{isUrdu ? 'ادھار کی حد (Credit Limit Rs):' : 'Credit Limit (Rs):'}</span>
              </label>
              <input
                type="number"
                value={creditLimit}
                onChange={(e) => setCreditLimit(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-slate-800"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Scale className="w-3 h-3 text-slate-500" />
                <span>{isUrdu ? 'معمول کا لاٹ وزن (Default Kilo):' : 'Default Lot Weight (Kg):'}</span>
              </label>
              <input
                type="number"
                value={defaultKilo}
                onChange={(e) => setDefaultKilo(parseFloat(e.target.value) || 80)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-slate-800"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
            >
              {isUrdu ? 'منسوخ' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-md flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{isUrdu ? 'کھاتہ محفوظ کریں' : 'Save Party'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
