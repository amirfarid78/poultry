import React, { useState, useEffect, useRef } from 'react';
import { 
  Party, 
  Invoice, 
  InvoiceCharge,
  PaymentMode, 
  Vehicle, 
  UserRole,
  OrderItem 
} from '../../types';
import { 
  calculateInvoice, 
  formatPKR, 
  generateInvoiceWhatsAppUrl 
} from '../../utils/calculations';
import { generateInvoicePDF, brandingFromSettings, loadLogoDataUrl } from '../../utils/pdfGenerator';
import { useBusiness } from '../../context/BusinessContext';
import { PartyModal } from '../common/PartyModal';
import { 
  Plus, 
  Save, 
  Printer, 
  Share2, 
  AlertTriangle, 
  CheckCircle, 
  ArrowRight, 
  Calendar, 
  Scale, 
  TrendingUp, 
  Percent, 
  CreditCard, 
  Receipt,
  User,
  UserPlus,
  Truck,
  Eye,
  FileText,
  Download,
  FileDown,
  X,
  Zap,
  Mic,
  MicOff,
  Copy,
  Check,
  Sparkles,
  Volume2,
  Edit3,
  Trash2
} from 'lucide-react';

interface POSViewProps {
  parties: Party[];
  invoices: Invoice[];
  vehicles: Vehicle[];
  todayMandiRate: number;
  currentRole: UserRole;
  language: 'en' | 'ur';
  prefillOrder?: OrderItem | null;
  onClearPrefillOrder?: () => void;
  onAddParty?: (party: Party) => void;
  onSaveInvoice: (invoice: Invoice, linkedOrderId?: string) => void;
  onUpdateInvoice?: (oldInvoice: Invoice, updated: Invoice) => void;
  onDeleteInvoice?: (invoiceId: string) => void;
  onOpenReceiptModal: () => void;
  onViewPublicInvoice: (invoice: Invoice) => void;
}

export const POSView: React.FC<POSViewProps> = ({
  parties,
  invoices,
  vehicles,
  todayMandiRate,
  currentRole,
  language,
  prefillOrder,
  onClearPrefillOrder,
  onAddParty,
  onSaveInvoice,
  onUpdateInvoice,
  onDeleteInvoice,
  onOpenReceiptModal,
  onViewPublicInvoice
}) => {
  const isUrdu = language === 'ur';
  const { settings: biz } = useBusiness();
  const customers = parties.filter((p) => p.partyType === 'customer');
  // Voided sales stay in state for audit but never show in the working lists.
  const liveInvoices = invoices.filter((i) => !i.isVoid);
  const canModifySales = currentRole === 'owner' || currentRole === 'manager' || currentRole === 'accountant';

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id || '');
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [mandiRate, setMandiRate] = useState<number>(todayMandiRate ?? 0);
  const [saleRate, setSaleRate] = useState<number>(todayMandiRate > 0 ? todayMandiRate + 200 : 0);
  const [weightKg, setWeightKg] = useState<number>(customers[0]?.defaultKilo || 80);
  const [shrinkageKg, setShrinkageKg] = useState<number>(0);
  const [birdCount, setBirdCount] = useState<number>(40);
  const [receivedCash, setReceivedCash] = useState<number>(0);
  const [receivedAC, setReceivedAC] = useState<number>(0);
  const [acPaymentMode, setAcPaymentMode] = useState<PaymentMode>('bank_transfer');
  const [acRefNo, setAcRefNo] = useState<string>('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(vehicles[0]?.id || '');
  const [notes, setNotes] = useState<string>('');
  // Extra charges on this invoice: labour, loading, transport, or manually named.
  const [charges, setCharges] = useState<InvoiceCharge[]>([]);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);
  const [isAddPartyModalOpen, setIsAddPartyModalOpen] = useState(false);
  // Sale being edited (void + reissue flow). Null = creating a new sale.
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);

  const chargesTotal = charges.reduce((s, c) => s + (c.amount || 0), 0);

  const CHARGE_PRESETS = [
    { name: 'Labour / مزدوری', en: 'Labour' },
    { name: 'Loading / لوڈنگ', en: 'Loading' },
    { name: 'Transport / کرایہ', en: 'Transport' },
    { name: 'Crate Charges / کریٹ', en: 'Crate Charges' },
  ];

  const addCharge = (name = '') => {
    setCharges((prev) => [
      ...prev,
      { id: `chg-${Date.now()}-${prev.length}`, name, amount: 0 },
    ]);
  };
  const updateCharge = (id: string, patch: Partial<InvoiceCharge>) => {
    setCharges((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };
  const removeCharge = (id: string) => {
    setCharges((prev) => prev.filter((c) => c.id !== id));
  };

  const resetSaleForm = () => {
    setSelectedCustomerId(customers[0]?.id || '');
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setMandiRate(todayMandiRate ?? 0);
    setSaleRate(todayMandiRate > 0 ? todayMandiRate + 200 : 0);
    setWeightKg(customers[0]?.defaultKilo || 80);
    setShrinkageKg(0);
    setBirdCount(40);
    setReceivedCash(0);
    setReceivedAC(0);
    setAcRefNo('');
    setNotes('');
    setCharges([]);
    setEditingInvoice(null);
  };

  const startEditInvoice = (inv: Invoice) => {
    setEditingInvoice(inv);
    setSelectedCustomerId(inv.customerId);
    setInvoiceDate(inv.invoiceDate);
    setMandiRate(inv.mandiRatePer40kg);
    setSaleRate(inv.saleRatePer40kg);
    setWeightKg(inv.grossWeightKg);
    setShrinkageKg(inv.shrinkageKg);
    setBirdCount(inv.birdCount);
    setReceivedCash(inv.receivedCash);
    setReceivedAC(inv.receivedAC);
    setAcPaymentMode(inv.acPaymentMode);
    setAcRefNo(inv.acRefNo || '');
    setSelectedVehicleId(inv.vehicleId || '');
    setNotes(inv.notes || '');
    setCharges(
      (inv.charges ?? []).map((c, i) => ({
        id: c.id || `chg-${inv.id}-${i}`,
        name: c.name,
        amount: c.amount,
      }))
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Pre-fill when converting an order into invoice
  useEffect(() => {
    if (prefillOrder) {
      if (prefillOrder.customerId) setSelectedCustomerId(prefillOrder.customerId);
      if (prefillOrder.expectedKg) setWeightKg(prefillOrder.expectedKg);
      if (prefillOrder.quotedRatePer40kg) setSaleRate(prefillOrder.quotedRatePer40kg);
      if (prefillOrder.assignedVehicleId) setSelectedVehicleId(prefillOrder.assignedVehicleId);
      if (prefillOrder.expectedBirdCount) setBirdCount(prefillOrder.expectedBirdCount);
      setNotes(`Converted from Order #${prefillOrder.orderNumber} - Route: ${prefillOrder.deliveryRoute || '-'}`);
    }
  }, [prefillOrder]);

  // Voice Input & Speech Dictation State
  const [isListening, setIsListening] = useState(false);
  // Whether this browser can do on-device speech recognition at all
  // (missing on iPhone Safari and in-app browsers like WhatsApp/Facebook).
  const speechSupported =
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const [speechTranscript, setSpeechTranscript] = useState('');
  const [speechFeedback, setSpeechFeedback] = useState<string | null>(null);

  // Print & PDF Modal State
  const [printModalInvoice, setPrintModalInvoice] = useState<Invoice | null>(null);
  const [printFormat, setPrintFormat] = useState<'thermal80' | 'a4'>('thermal80');
  const [copiedNotice, setCopiedNotice] = useState(false);

  // References for keyboard navigation
  const inputRefs = {
    customer: useRef<HTMLSelectElement>(null),
    date: useRef<HTMLInputElement>(null),
    mandiRate: useRef<HTMLInputElement>(null),
    saleRate: useRef<HTMLInputElement>(null),
    weightKg: useRef<HTMLInputElement>(null),
    shrinkageKg: useRef<HTMLInputElement>(null),
    birdCount: useRef<HTMLInputElement>(null),
    receivedCash: useRef<HTMLInputElement>(null),
    receivedAC: useRef<HTMLInputElement>(null),
    acRefNo: useRef<HTMLInputElement>(null),
  };

  const selectedCustomer = parties.find((p) => p.id === selectedCustomerId) || customers[0];

  // Update default lot weight when customer changes
  const handleCustomerChange = (customerId: string) => {
    setSelectedCustomerId(customerId);
    const cust = parties.find((p) => p.id === customerId);
    if (cust && cust.defaultKilo) {
      setWeightKg(cust.defaultKilo);
    }
  };

  // Calculation Engine
  const calc = calculateInvoice({
    mandiRate,
    saleRate,
    weightKg,
    shrinkageKg,
    divisor: 40,
    previousBalance: selectedCustomer?.currentBalance || 0,
    receivedCash,
    receivedAC,
    chargesTotal
  });

  // Intelligent speech-to-invoice entity parser
  const parseSpeechToInvoice = (text: string) => {
    setSpeechTranscript(text);
    const lower = text.toLowerCase();

    // 1. Match customer
    for (const c of customers) {
      const cNameFirst = c.name ? c.name.toLowerCase().split(' ')[0] : '';
      const cUrduFirst = c.urduName ? c.urduName.split(' ')[0] : '';
      if ((cUrduFirst && text.includes(cUrduFirst)) || (cNameFirst && lower.includes(cNameFirst))) {
        setSelectedCustomerId(c.id);
        if (c.defaultKilo) setWeightKg(c.defaultKilo);
        break;
      }
    }

    // 2. Match weight (kg / کلو)
    const weightMatch = text.match(/(\d+)\s*(kilo|kg|کلو)/i);
    if (weightMatch) {
      setWeightKg(parseInt(weightMatch[1]));
    } else {
      if (text.includes('اسی کلو') || text.includes('80 کلو') || text.includes('اسی')) setWeightKg(80);
      else if (text.includes('ساٹھ کلو') || text.includes('60 کلو') || text.includes('ساٹھ')) setWeightKg(60);
      else if (text.includes('چالیس کلو') || text.includes('40 کلو') || text.includes('چالیس')) setWeightKg(40);
      else if (text.includes('ڈیڑھ سو') || text.includes('150')) setWeightKg(150);
      else if (text.includes('سو کلو') || text.includes('100')) setWeightKg(100);
      else if (text.includes('ایک سو بیس') || text.includes('120')) setWeightKg(120);
    }

    // 3. Match rate
    const rateMatch = text.match(/(?:ریٹ|rate)\s*(\d{4,6})/i) || text.match(/(\d{5})/);
    if (rateMatch) {
      const parsed = parseInt(rateMatch[1]);
      if (parsed >= 5000 && parsed <= 25000) {
        setSaleRate(parsed);
      }
    } else {
      if (text.includes('بارہ ہزار دو سو') || text.includes('12200')) setSaleRate(12200);
      else if (text.includes('بارہ ہزار') || text.includes('12000')) setSaleRate(12000);
      else if (text.includes('تیرہ ہزار دو سو') || text.includes('13200')) setSaleRate(13200);
      else if (text.includes('تیرہ ہزار') || text.includes('13000')) setSaleRate(13000);
    }

    // 4. Match received cash
    const cashMatch = text.match(/(?:وصول|نقد|cash|wasool)\s*(\d+)/i) || text.match(/(\d+)\s*(?:وصول|نقد|cash)/i);
    if (cashMatch) {
      setReceivedCash(parseInt(cashMatch[1]));
    } else {
      if (text.includes('بیس ہزار') || text.includes('20000')) setReceivedCash(20000);
      else if (text.includes('دس ہزار') || text.includes('10000')) setReceivedCash(10000);
      else if (text.includes('نو ہزار') || text.includes('9000')) setReceivedCash(9000);
      else if (text.includes('پانچ ہزار') || text.includes('5000')) setReceivedCash(5000);
    }

    setSpeechFeedback(
      isUrdu 
        ? `آواز سے ڈیٹا محفوظ ہو گیا: "${text}"` 
        : `Extracted from voice: "${text}"`
    );
    setTimeout(() => setSpeechFeedback(null), 5000);
  };

  // Toggle Web Speech recognition
  const toggleSpeechRecognition = () => {
    if (isListening) {
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      // If browser doesn't expose speech recognition, provide helpful feedback
      setSpeechFeedback(
        isUrdu
          ? 'اس براؤزر میں وائس سپورٹ نہیں ہے۔ کروم (Android) میں کھولیں۔'
          : 'Voice input is not supported in this browser. Please open the app in Chrome on Android.'
      );
      setTimeout(() => setSpeechFeedback(null), 5000);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = isUrdu ? 'ur-PK' : 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechTranscript(isUrdu ? 'سن رہا ہوں... بولیے' : 'Listening... Speak now');
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        parseSpeechToInvoice(transcript);
        setIsListening(false);
      };

      recognition.onerror = (err: any) => {
        console.warn('Speech error:', err);
        setIsListening(false);
        setSpeechFeedback(isUrdu ? 'مائیک کی آواز موصول نہیں ہوئی۔ مائیک کی اجازت دیں اور دوبارہ کوشش کریں۔' : 'Could not hear you. Allow microphone access and try again.');
        setTimeout(() => setSpeechFeedback(null), 4000);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (e) {
      console.error(e);
      setIsListening(false);
    }
  };

  // Hotkeys: Ctrl+S to save, Ctrl+P to print
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        handleOpenCurrentInvoicePrint();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCustomerId, mandiRate, saleRate, weightKg, receivedCash, receivedAC]);

  const createInvoiceObject = (): Invoice | null => {
    if (!selectedCustomer) return null;
    if (saleRate <= 0 || weightKg <= 0) return null;

    const nextInvNo = `INV-${2400 + invoices.length + 1}`;
    const token = `tok-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

    // Keep only charge rows with a positive amount; default an empty name.
    const cleanCharges: InvoiceCharge[] = charges
      .filter((c) => (c.amount || 0) > 0)
      .map((c, i) => ({
        id: c.id || `chg-${Date.now()}-${i}`,
        name: c.name.trim() || (isUrdu ? 'اضافی اخراجات' : 'Extra charge'),
        amount: Math.round(c.amount),
      }));
    const cleanChargesTotal = cleanCharges.reduce((s, c) => s + c.amount, 0);

    return {
      id: `inv-${Date.now()}`,
      invoiceNumber: nextInvNo,
      invoiceDate,
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      customerUrduName: selectedCustomer.urduName,
      mandiRatePer40kg: mandiRate,
      saleRatePer40kg: saleRate,
      grossWeightKg: weightKg,
      shrinkageKg,
      netWeightKg: calc.netWeightKg,
      birdCount,
      mannDivisor: 40,
      totalAmount: calc.birdTotal + cleanChargesTotal,
      charges: cleanCharges,
      chargesTotal: cleanChargesTotal,
      receivedCash,
      receivedAC,
      acPaymentMode,
      acRefNo,
      previousBalance: selectedCustomer.currentBalance,
      newBalance: calc.newBalance,
      vehicleId: selectedVehicleId,
      shareToken: token,
      notes,
      createdBy: currentRole === 'owner' ? 'Owner / مالک' : 'Cashier / منشی',
      createdAt: new Date().toISOString()
    };
  };

  const handleSave = (shareWhatsApp = false): Invoice | null => {
    if (!selectedCustomer) return null;

    if (saleRate <= 0 || weightKg <= 0) {
      alert(isUrdu ? 'براہ کرم درست ریٹ اور وزن درج کریں' : 'Please enter valid rate and weight');
      return null;
    }

    const newInvoice = createInvoiceObject();
    if (!newInvoice) return null;

    // EDIT MODE: void the old invoice and issue the corrected one.
    if (editingInvoice && onUpdateInvoice) {
      // The form totals were computed against the live balance, which still
      // includes the old invoice — back its net effect out first.
      const oldTotRec = (editingInvoice.receivedCash || 0) + (editingInvoice.receivedAC || 0);
      const oldNet = editingInvoice.totalAmount - oldTotRec;
      const prevBal = (selectedCustomer?.currentBalance || 0) - oldNet;
      const newTotRec = (newInvoice.receivedCash || 0) + (newInvoice.receivedAC || 0);
      const updated: Invoice = {
        ...newInvoice,
        previousBalance: prevBal,
        newBalance: prevBal + newInvoice.totalAmount - newTotRec,
      };
      const old = editingInvoice;
      onUpdateInvoice(old, updated);
      setSaveSuccessNotice(
        isUrdu
          ? `بل ${old.invoiceNumber} وائڈ کر کے نیا بل ${updated.invoiceNumber} جاری کر دیا گیا!`
          : `Invoice ${old.invoiceNumber} voided — corrected invoice ${updated.invoiceNumber} issued!`
      );
      setTimeout(() => setSaveSuccessNotice(null), 5000);
      resetSaleForm();
      if (onClearPrefillOrder) onClearPrefillOrder();
      return updated;
    }

    onSaveInvoice(newInvoice, prefillOrder?.id);
    if (onClearPrefillOrder) {
      onClearPrefillOrder();
    }

    setSaveSuccessNotice(
      isUrdu 
        ? `انوائس ${newInvoice.invoiceNumber} کامیابی سے محفوظ ہوگئی! نیا بقایا: Rs ${calc.newBalance.toLocaleString()}`
        : `Invoice ${newInvoice.invoiceNumber} saved successfully! New Balance: Rs ${calc.newBalance.toLocaleString()}`
    );
    setTimeout(() => setSaveSuccessNotice(null), 5000);

    if (shareWhatsApp && selectedCustomer.whatsapp) {
      const shareUrl = window.location.origin + `?token=${newInvoice.shareToken}&type=invoice`;
      const waUrl = generateInvoiceWhatsAppUrl({
        phone: selectedCustomer.whatsapp,
        customerName: selectedCustomer.urduName || selectedCustomer.name,
        invoiceNumber: newInvoice.invoiceNumber,
        date: invoiceDate,
        mandiRate,
        saleRate,
        kilo: calc.netWeightKg,
        total: calc.totalAmount,
        receivedCash,
        receivedAC,
        previousBalance: selectedCustomer.currentBalance,
        newBalance: calc.newBalance,
        shareUrl,
        lang: language,
        businessName: `${biz.nameUr} (${biz.nameEn})`,
        charges: newInvoice.charges
      });
      window.open(waUrl, '_blank');
    }

    // Reset received amounts for next invoice, keep rates
    setReceivedCash(0);
    setReceivedAC(0);
    setAcRefNo('');
    setCharges([]);

    return newInvoice;
  };

  const handleOpenCurrentInvoicePrint = () => {
    const inv = createInvoiceObject();
    if (inv) {
      setPrintModalInvoice(inv);
    }
  };

  const handleDownloadPDF = async (inv: Invoice) => {
    try {
      const logoDataUrl = await loadLogoDataUrl(biz.logoUrl);
      const pdf = generateInvoicePDF(inv, brandingFromSettings(biz, logoDataUrl));
      pdf.save(`Invoice_${inv.invoiceNumber}_${inv.customerName.replace(/\s+/g, '_')}.pdf`);
    } catch (e) {
      console.error('Error generating PDF:', e);
      alert('Could not generate PDF. Please try browser print instead.');
    }
  };

  const handleCopyWhatsAppText = (inv: Invoice) => {
    const cust = parties.find((p) => p.id === inv.customerId);
    const totRec = (inv.receivedCash || 0) + (inv.receivedAC || 0);
    const balanceNote = inv.newBalance < 0 
      ? `پیشگی جمع (Advance with Us): Rs ${Math.abs(inv.newBalance).toLocaleString()}`
      : `بقایا واجب الادا (Net Balance Payable): Rs ${inv.newBalance.toLocaleString()}`;
    const invCharges = (inv.charges ?? []).filter((c) => (c.amount || 0) > 0);
    const birdTotal = inv.totalAmount - invCharges.reduce((s, c) => s + c.amount, 0);

    const text = [
      `*${biz.nameUr} - بل انوائس*`,
      `--------------------------------`,
      `*بل نمبر / Inv #:* ${inv.invoiceNumber}`,
      `*تاریخ / Date:* ${inv.invoiceDate}`,
      `*گاہک / Customer:* ${inv.customerUrduName || inv.customerName}`,
      `--------------------------------`,
      `*وزن / Weight:* ${inv.netWeightKg} kg (${inv.birdCount} birds)`,
      `*ریٹ فی من / Rate:* Rs ${inv.saleRatePer40kg.toLocaleString()}/40kg`,
      invCharges.length > 0 ? `*مرغی کی رقم / Birds:* Rs ${birdTotal.toLocaleString()}` : null,
      ...invCharges.map((c) => `*${c.name}:* Rs ${c.amount.toLocaleString()}`),
      `*کل رقم / Total:* Rs ${inv.totalAmount.toLocaleString()}`,
      `--------------------------------`,
      `*نقد وصولی / Wasool:* Rs ${inv.receivedCash.toLocaleString()}`,
      inv.receivedAC > 0 ? `*آن لائن وصولی / AC:* Rs ${inv.receivedAC.toLocaleString()}` : null,
      `*کل وصول / Paid:* Rs ${totRec.toLocaleString()}`,
      `--------------------------------`,
      `*سابقہ بقایا / Prev Bal:* Rs ${inv.previousBalance.toLocaleString()}`,
      `*${balanceNote}*`,
      `--------------------------------`,
      `شکریہ! ${biz.nameEn}`
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(text);
    setCopiedNotice(true);
    setTimeout(() => setCopiedNotice(false), 3000);
  };

  const handleShareWhatsAppDirect = (inv: Invoice) => {
    const cust = parties.find((p) => p.id === inv.customerId);
    if (!cust?.whatsapp) {
      alert(isUrdu ? 'اس گاہک کا واٹس ایپ نمبر درج نہیں ہے' : 'Customer has no WhatsApp number');
      return;
    }
    const shareUrl = window.location.origin + `?token=${inv.shareToken}&type=invoice`;
    const waUrl = generateInvoiceWhatsAppUrl({
      phone: cust.whatsapp,
      customerName: cust.urduName || cust.name,
      invoiceNumber: inv.invoiceNumber,
      date: inv.invoiceDate,
      mandiRate: inv.mandiRatePer40kg,
      saleRate: inv.saleRatePer40kg,
      kilo: inv.netWeightKg,
      total: inv.totalAmount,
      receivedCash: inv.receivedCash,
      receivedAC: inv.receivedAC,
      previousBalance: inv.previousBalance,
      newBalance: inv.newBalance,
      shareUrl,
      lang: language,
      businessName: `${biz.nameUr} (${biz.nameEn})`,
      charges: inv.charges ?? []
    });
    window.open(waUrl, '_blank');
  };

  const isInternalRole = ['owner', 'manager', 'accountant'].includes(currentRole);

  return (
    <div className="space-y-6">
      {/* Success Notification */}
      {saveSuccessNotice && (
        <div className="bg-emerald-600 text-white p-3.5 rounded-xl shadow-lg flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2 font-medium text-sm">
            <CheckCircle className="w-5 h-5 text-emerald-200" />
            <span>{saveSuccessNotice}</span>
          </div>
          <button 
            onClick={() => setSaveSuccessNotice(null)} 
            className="text-emerald-200 hover:text-white text-xs px-2 py-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Speech Voice Feedback Toast */}
      {speechFeedback && (
        <div className="bg-purple-900 text-purple-100 p-3 rounded-xl shadow-lg flex items-center justify-between border border-purple-600 animate-in fade-in">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Volume2 className="w-4 h-4 text-purple-300" />
            <span>{speechFeedback}</span>
          </div>
          <button onClick={() => setSpeechFeedback(null)} className="text-purple-300 text-xs">✕</button>
        </div>
      )}

      {/* POS Top Bar with Voice Dictation Button & Fast Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <span>{isUrdu ? 'سیل انوائس و کاؤنٹر اندراج' : 'POS / Fast Sale Counter'}</span>
            <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
              40 Kg Mann Rule
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isUrdu 
              ? 'فارمولا: کل رقم = ریٹ × کلو ÷ 40 | نیا بقایا = سابقہ بقایا + کل رقم - وصولی نقد - بینک' 
              : 'Formula: Total = Rate × Kilo ÷ 40 | New Balance = Prev + Total - Wasool - AC Payment'}
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* VOICE INPUT BUTTON (Make POS Voice Easy) */}
          <button
            onClick={toggleSpeechRecognition}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition shadow-sm border ${
              isListening
                ? 'bg-red-600 text-white border-red-700 animate-pulse'
                : speechSupported
                  ? 'bg-purple-600 hover:bg-purple-700 text-white border-purple-700'
                  : 'bg-slate-300 text-slate-500 border-slate-400 cursor-not-allowed'
            }`}
            title={
              speechSupported
                ? (isUrdu ? 'بول کر انوائس بنائیں' : 'Voice Input / Dictation')
                : (isUrdu ? 'اس براؤزر میں وائس سپورٹ نہیں — کروم میں کھولیں' : 'Voice not supported in this browser — open in Chrome')
            }
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            <span>
              {isListening
                ? (isUrdu ? 'مائیک سن رہا ہے...' : 'Listening...')
                : (isUrdu ? 'بول کر انوائس بنائیں (Voice)' : 'Voice POS Voice')}
            </span>
            {!speechSupported && !isListening && (
              <span className="text-[9px] font-bold bg-slate-500 text-white px-1.5 py-0.5 rounded">
                {isUrdu ? 'غیر فعال' : 'OFF'}
              </span>
            )}
          </button>

          <button
            onClick={onOpenReceiptModal}
            className="flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 border border-amber-300 px-3 py-2 rounded-xl text-xs font-bold transition shadow-sm"
          >
            <Receipt className="w-4 h-4 text-amber-600" />
            <span>{isUrdu ? 'صرف وصولی واؤچر' : 'Receipt Only'}</span>
          </button>
          
          <button
            onClick={handleOpenCurrentInvoicePrint}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 px-3 py-2 rounded-xl text-xs font-bold transition shadow-sm"
          >
            <Printer className="w-4 h-4 text-slate-700" />
            <span>{isUrdu ? 'پرنٹ و پی ڈی ایف' : 'Print / PDF'}</span>
          </button>

          <button
            onClick={() => handleSave(true)}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition"
          >
            <Share2 className="w-4 h-4 text-emerald-200" />
            <span>{isUrdu ? 'محفوظ و واٹس ایپ' : 'Save & WhatsApp'}</span>
          </button>

          <button
            onClick={() => handleSave(false)}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md transition"
          >
            <Save className="w-4 h-4 text-slate-300" />
            <span>
              {editingInvoice
                ? (isUrdu ? 'ترمیم محفوظ کریں' : 'Save Changes')
                : (isUrdu ? 'محفوظ کریں (Ctrl+S)' : 'Save (Ctrl+S)')}
            </span>
          </button>
          {editingInvoice && (
            <button
              onClick={resetSaleForm}
              className="flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 px-3 py-2 rounded-xl text-xs font-bold transition"
            >
              <X className="w-4 h-4" />
              <span>{isUrdu ? 'ترمیم منسوخ کریں' : 'Cancel Edit'}</span>
            </button>
          )}
        </div>
      </div>

      {/* EDIT MODE BANNER */}
      {editingInvoice && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl px-4 py-2.5 flex items-center gap-2 text-xs font-bold text-amber-900">
          <Edit3 className="w-4 h-4 shrink-0" />
          <span>
            {isUrdu
              ? `بل ${editingInvoice.invoiceNumber} میں ترمیم ہو رہی ہے — محفوظ کرتے ہی پرانا بل وائڈ ہو کر نیا درست بل جاری ہو جائے گا۔`
              : `Editing invoice ${editingInvoice.invoiceNumber} — saving will void it and issue the corrected invoice.`}
          </span>
        </div>
      )}

      {/* QUICK VOICE DICTATION SAMPLE CHIPS & PROMPTS */}
      <div className="bg-purple-50/70 p-3 rounded-2xl border border-purple-200 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 text-xs text-purple-900 font-bold">
          <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
          <span>{isUrdu ? 'فوری وائس ان پٹ ٹیسٹ (1-کلک سیمپلز):' : 'Voice POS Quick Presets (1-Click Fill):'}</span>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={() => parseSpeechToInvoice('سمی خان اسی کلو بارہ ہزار دو سو ریٹ بیس ہزار نقد وصول')}
            className="px-2.5 py-1 bg-white hover:bg-purple-100 border border-purple-300 rounded-lg text-purple-900 font-medium text-[11px] flex items-center gap-1.5 transition"
          >
            <span>🎙️</span>
            <span>{isUrdu ? 'سمی خان: 80 کلو، 12,200 ریٹ، 20,000 وصول' : 'Sami Khan: 80kg, 12,200 rate, 20k cash'}</span>
          </button>

          <button
            type="button"
            onClick={() => parseSpeechToInvoice('حاجی اسلم ساٹھ کلو تیرہ ہزار دو سو ریٹ نو ہزار نقد وصول')}
            className="px-2.5 py-1 bg-white hover:bg-purple-100 border border-purple-300 rounded-lg text-purple-900 font-medium text-[11px] flex items-center gap-1.5 transition"
          >
            <span>🎙️</span>
            <span>{isUrdu ? 'حاجی اسلم: 60 کلو، 13,200 ریٹ، 9,000 وصول' : 'Haji Aslam: 60kg, 13,200 rate, 9k cash'}</span>
          </button>

          <button
            type="button"
            onClick={() => parseSpeechToInvoice('ملک برادرز اسی کلو بارہ ہزار ریٹ بیس ہزار وصول')}
            className="px-2.5 py-1 bg-white hover:bg-purple-100 border border-purple-300 rounded-lg text-purple-900 font-medium text-[11px] flex items-center gap-1.5 transition"
          >
            <span>🎙️</span>
            <span>{isUrdu ? 'ملک برادرز: 80 کلو، 12,000 ریٹ، 20,000 وصول' : 'Malik Bros: 80kg, 12k rate, 20k wasool'}</span>
          </button>
        </div>
      </div>

      {/* CONVERTED ORDER NOTIFICATION BANNER */}
      {prefillOrder && (
        <div className="bg-emerald-50 border-2 border-emerald-400 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs text-emerald-950 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <span className="font-extrabold text-sm">
                {isUrdu 
                  ? `آرڈر #${prefillOrder.orderNumber} (${prefillOrder.customerUrduName || prefillOrder.customerName}) بل بنانے کے لیے منتقل ہو گیا` 
                  : `Order #${prefillOrder.orderNumber} loaded for ${prefillOrder.customerName}`}
              </span>
              <p className="text-[11px] text-emerald-800 mt-0.5">
                {isUrdu 
                  ? `مطلوبہ وزن: ${prefillOrder.expectedKg} کلو | متوقع ریٹ: Rs ${prefillOrder.quotedRatePer40kg.toLocaleString()} | روٹ: ${prefillOrder.deliveryRoute || '-'}` 
                  : `Expected: ${prefillOrder.expectedKg} kg @ Rs ${prefillOrder.quotedRatePer40kg.toLocaleString()}/40kg | Route: ${prefillOrder.deliveryRoute || '-'}`}
              </p>
            </div>
          </div>
          {onClearPrefillOrder && (
            <button
              type="button"
              onClick={onClearPrefillOrder}
              className="px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 rounded-xl transition"
            >
              {isUrdu ? 'آرڈر لنک ختم کریں' : 'Unlink Order'}
            </button>
          )}
        </div>
      )}

      {/* QUICK CUSTOMER SELECTION CHIPS BAR */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
        <div className="text-[11px] font-bold text-slate-500 uppercase mb-2 flex items-center justify-between">
          <span>{isUrdu ? 'فوری گاہک انتخاب (ایک کلک):' : 'Fast 1-Click Customer Selection:'}</span>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-normal">{customers.length} {isUrdu ? 'گاہک موجود ہیں' : 'customers'}</span>
            <button
              type="button"
              onClick={() => setIsAddPartyModalOpen(true)}
              className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-lg border border-emerald-200 transition"
            >
              <UserPlus className="w-3 h-3" />
              <span>{isUrdu ? 'نیا گاہک +' : '+ New Customer'}</span>
            </button>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {customers.map((c) => {
            const isSelected = c.id === selectedCustomerId;
            const isAdv = c.currentBalance < 0;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => handleCustomerChange(c.id)}
                className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold border transition text-left flex items-center gap-2.5 ${
                  isSelected
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-md ring-2 ring-emerald-400'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                }`}
              >
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${
                  isSelected ? 'bg-white text-emerald-800' : 'bg-slate-200 text-slate-700'
                }`}>
                  {c.urduName ? c.urduName.charAt(0) : c.name.charAt(0)}
                </div>
                <div>
                  <div className="font-bold whitespace-nowrap">
                    {c.urduName ? c.urduName : c.name}
                  </div>
                  <div className={`text-[10px] font-mono font-medium ${
                    isSelected 
                      ? 'text-emerald-100' 
                      : isAdv ? 'text-emerald-700 font-bold' : 'text-slate-500'
                  }`}>
                    Bal: {formatPKR(c.currentBalance, true, language)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Grid: Form Left, Live Preview Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Inputs (Cols 7 on Desktop) */}
        <div className="lg:col-span-7 space-y-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          {/* Row 1: Date & Customer */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            {/* Date */}
            <div className="sm:col-span-4">
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>{isUrdu ? '1. تاریخ (Date):' : '1. Date:'}</span>
              </label>
              <input
                ref={inputRefs.date}
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Customer Dropdown */}
            <div className="sm:col-span-8">
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>{isUrdu ? '2. گاہک / دوکان (Customer):' : '2. Customer:'}</span>
                </span>
                {selectedCustomer && (
                  <span className={`text-[11px] font-bold ${selectedCustomer.currentBalance < 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {isUrdu ? 'سابقہ بقایا: ' : 'Prev Bal: '}
                    {formatPKR(selectedCustomer.currentBalance, true, language)}
                  </span>
                )}
              </label>
              <div className="flex items-center gap-1.5">
                <select
                  ref={inputRefs.customer}
                  value={selectedCustomerId}
                  onChange={(e) => handleCustomerChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.urduName ? `${c.urduName} (${c.name})` : c.name} — Bal: {formatPKR(c.currentBalance, true)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setIsAddPartyModalOpen(true)}
                  title={isUrdu ? 'نیا گاہک درج کریں' : 'Add New Customer'}
                  className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 transition shadow-sm"
                >
                  <UserPlus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Mandi Rate & Selling Rate */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            {/* Mandi Rate */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">
                  {isUrdu ? '3. منڈی ریٹ (لازمی درج کریں):' : '3. Mandi Rate (Manual Required):'}
                </label>
                <span className="text-[10px] text-amber-700 font-semibold bg-amber-100 px-1.5 py-0.2 rounded">
                  {isUrdu ? 'روزانہ دستی انٹری' : 'Daily Manual'}
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 text-xs font-bold">Rs</span>
                <input
                  ref={inputRefs.mandiRate}
                  type="number"
                  value={mandiRate || ''}
                  onChange={(e) => setMandiRate(parseFloat(e.target.value) || 0)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 font-mono focus:ring-2 focus:ring-emerald-500"
                  placeholder="12000"
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                {isUrdu ? 'مارکیٹ بینچ مارک ریٹ فی 40 کلو' : 'Market benchmark per 40 kg'}
              </p>
            </div>

            {/* Sale Rate with Margin helper */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">
                  {isUrdu ? '4. فروخت ریٹ (فی 40 کلو):' : '4. Sale Rate (per 40 kg):'}
                </label>
                {isInternalRole && (
                  <span className={`text-[11px] font-bold px-1.5 py-0.2 rounded ${
                    calc.marginPer40kg >= 0 
                      ? 'bg-emerald-100 text-emerald-800' 
                      : 'bg-rose-100 text-rose-800'
                  }`}>
                    {calc.marginPer40kg >= 0 ? `+${calc.marginPer40kg} Margin` : `${calc.marginPer40kg} Loss`}
                  </span>
                )}
              </div>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 text-xs font-bold">Rs</span>
                <input
                  ref={inputRefs.saleRate}
                  type="number"
                  value={saleRate || ''}
                  onChange={(e) => setSaleRate(parseFloat(e.target.value) || 0)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 font-mono focus:ring-2 focus:ring-emerald-500"
                  placeholder="12200"
                />
              </div>

              {/* Quick Margin Preset Buttons */}
              <div className="flex items-center gap-1.5 mt-1.5">
                {[0, 100, 200, 300, 500].map((margin) => (
                  <button
                    key={margin}
                    type="button"
                    onClick={() => setSaleRate(mandiRate + margin)}
                    className="text-[10px] px-2 py-0.5 rounded bg-white hover:bg-emerald-50 border border-slate-200 text-slate-600 hover:text-emerald-700 font-mono font-medium"
                  >
                    +{margin}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Warning if Sale Rate < Mandi Rate */}
          {saleRate < mandiRate && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-800 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                {isUrdu 
                  ? `انتباہ: فروخت ریٹ (Rs ${saleRate}) منڈی ریٹ (Rs ${mandiRate}) سے کم ہے! نقصانی سودا ہے۔` 
                  : `Warning: Sale rate (Rs ${saleRate}) is lower than Mandi rate (Rs ${mandiRate})! Selling at a loss.`}
              </span>
            </div>
          )}

          {/* Row 3: Weight Kg (Kilo) with Quick Mann/Lot Preset Buttons */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 flex items-center gap-1">
                <Scale className="w-3.5 h-3.5 text-slate-400" />
                <span>{isUrdu ? '5. وزن کلو (Kilo):' : '5. Weight in Kilograms (Kilo):'}</span>
              </label>
              <span className="text-[11px] text-slate-500 font-mono">
                = {(weightKg / 40).toFixed(2)} {isUrdu ? 'من (Mann)' : 'Mann'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <input
                  ref={inputRefs.weightKg}
                  type="number"
                  step="0.5"
                  value={weightKg || ''}
                  onChange={(e) => setWeightKg(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-base font-black text-slate-900 font-mono focus:ring-2 focus:ring-emerald-500"
                  placeholder="80"
                />
              </div>

              <div>
                <input
                  ref={inputRefs.birdCount}
                  type="number"
                  value={birdCount || ''}
                  onChange={(e) => setBirdCount(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 font-mono"
                  placeholder={isUrdu ? 'تعداد پرندے (40)' : 'Birds Count (40)'}
                />
              </div>
            </div>

            {/* Quick Lot Buttons (Reference Image default is 80kg / 2 mann) */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] text-slate-500 font-medium">{isUrdu ? 'فوری لاٹ:' : 'Lots:'}</span>
              {[
                { kg: 40, label: '40 kg (1 من)' },
                { kg: 60, label: '60 kg' },
                { kg: 80, label: '80 kg (2 من)' },
                { kg: 100, label: '100 kg' },
                { kg: 120, label: '120 kg (3 من)' },
                { kg: 160, label: '160 kg (4 من)' },
                { kg: 200, label: '200 kg (5 من)' }
              ].map((lot) => (
                <button
                  key={lot.kg}
                  type="button"
                  onClick={() => setWeightKg(lot.kg)}
                  className={`text-[10px] px-2.5 py-1 rounded-lg font-mono font-bold transition ${
                    weightKg === lot.kg
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white hover:bg-slate-200 text-slate-700 border border-slate-300'
                  }`}
                >
                  {lot.label}
                </button>
              ))}
            </div>
          </div>

          {/* Row 4: Cash Received (Wasool) with 1-Click Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200">
            {/* Cash Received */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-800">
                  {isUrdu ? '6. نقد وصولی (Wasool / Cash):' : '6. Cash Received (Wasool):'}
                </label>
                <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100 px-1.5 rounded">
                  {isUrdu ? 'کیش ان ہینڈ' : 'Cash Safe'}
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 text-xs font-bold">Rs</span>
                <input
                  ref={inputRefs.receivedCash}
                  type="number"
                  value={receivedCash || ''}
                  onChange={(e) => setReceivedCash(parseFloat(e.target.value) || 0)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-emerald-300 text-base font-black text-emerald-900 font-mono focus:ring-2 focus:ring-emerald-500 bg-white"
                  placeholder="20000"
                />
              </div>

              {/* Quick Cash Presets */}
              <div className="flex flex-wrap gap-1 mt-1.5">
                <button
                  type="button"
                  onClick={() => setReceivedCash(calc.totalAmount)}
                  className="text-[10px] px-2 py-0.5 rounded bg-emerald-700 text-white font-bold"
                >
                  {isUrdu ? 'پورا کیش' : 'Full Cash'}
                </button>
                <button
                  type="button"
                  onClick={() => setReceivedCash(Math.round(calc.totalAmount / 2))}
                  className="text-[10px] px-2 py-0.5 rounded bg-white border border-emerald-300 text-emerald-800 font-bold"
                >
                  {isUrdu ? 'آدھا' : 'Half'}
                </button>
                <button
                  type="button"
                  onClick={() => setReceivedCash(20000)}
                  className="text-[10px] px-2 py-0.5 rounded bg-white border border-emerald-300 text-emerald-800 font-mono font-bold"
                >
                  20k
                </button>
                <button
                  type="button"
                  onClick={() => setReceivedCash(10000)}
                  className="text-[10px] px-2 py-0.5 rounded bg-white border border-emerald-300 text-emerald-800 font-mono font-bold"
                >
                  10k
                </button>
                <button
                  type="button"
                  onClick={() => setReceivedCash(0)}
                  className="text-[10px] px-2 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-800 font-bold"
                >
                  {isUrdu ? 'خالص ادھار (0)' : 'Udhaar (0)'}
                </button>
              </div>
            </div>

            {/* Bank / Online Account Payment */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-800">
                  {isUrdu ? '7. اکاؤنٹ سے ادائیگی (AC Payment):' : '7. Payment from Account (AC):'}
                </label>
                <span className="text-[10px] text-blue-700 font-semibold bg-blue-100 px-1.5 rounded">
                  {isUrdu ? 'آن لائن / بینک' : 'Online Bank'}
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 text-xs font-bold">Rs</span>
                <input
                  ref={inputRefs.receivedAC}
                  type="number"
                  value={receivedAC || ''}
                  onChange={(e) => setReceivedAC(parseFloat(e.target.value) || 0)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-blue-300 text-base font-black text-blue-900 font-mono focus:ring-2 focus:ring-emerald-500 bg-white"
                  placeholder="0"
                />
              </div>

              {/* Mode & Ref if AC Payment > 0 */}
              {receivedAC > 0 && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <select
                    value={acPaymentMode}
                    onChange={(e) => setAcPaymentMode(e.target.value as PaymentMode)}
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-[11px] font-semibold bg-white"
                  >
                    <option value="bank_transfer">Meezan Bank</option>
                    <option value="jazzcash">JazzCash</option>
                    <option value="easypaisa">Easypaisa</option>
                    <option value="cheque">Cheque</option>
                  </select>
                  <input
                    ref={inputRefs.acRefNo}
                    type="text"
                    value={acRefNo}
                    onChange={(e) => setAcRefNo(e.target.value)}
                    placeholder="Ref # (e.g. TR-998)"
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-[11px]"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Row 4b: Extra Charges (Labour / Loading / Custom) */}
          <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-800">
                {isUrdu ? 'اضافی اخراجات / چارجز (مزدوری، لوڈنگ وغیرہ):' : 'Extra Charges (Labour, Loading, Custom):'}
              </label>
              <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded font-mono">
                + Rs {chargesTotal.toLocaleString()}
              </span>
            </div>

            {charges.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={c.name}
                  onChange={(e) => updateCharge(c.id, { name: e.target.value })}
                  placeholder={isUrdu ? 'چارج کا نام (مثلاً مزدوری)' : 'Charge name (e.g. Labour)'}
                  className="flex-1 px-3 py-1.5 rounded-xl border border-amber-300 text-xs font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-amber-400"
                />
                <div className="relative w-32">
                  <span className="absolute left-2.5 top-1.5 text-slate-400 text-[11px] font-bold">Rs</span>
                  <input
                    type="number"
                    value={c.amount || ''}
                    onChange={(e) => updateCharge(c.id, { amount: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full pl-8 pr-2 py-1.5 rounded-xl border border-amber-300 text-xs font-bold text-slate-900 font-mono bg-white focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeCharge(c.id)}
                  className="p-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 transition"
                  title={isUrdu ? 'حذف کریں' : 'Remove'}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] text-slate-500 font-medium">{isUrdu ? 'فوری چارج:' : 'Quick add:'}</span>
              {CHARGE_PRESETS.map((p) => (
                <button
                  key={p.en}
                  type="button"
                  onClick={() => addCharge(p.name)}
                  className="text-[10px] px-2 py-0.5 rounded bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold transition"
                >
                  + {p.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => addCharge('')}
                className="text-[10px] px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-700 text-white font-bold transition"
              >
                + {isUrdu ? 'اپنا نام لکھیں' : 'Custom name'}
              </button>
            </div>
            <p className="text-[10px] text-slate-500">
              {isUrdu
                ? 'یہ رقم بل کے کل میں جمع ہوگی اور کھاتے میں الگ انٹری کے طور پر ریکارڈ ہوگی۔'
                : 'Added to the bill total and recorded as separate ledger entries.'}
            </p>
          </div>

          {/* Row 5: Delivery Vehicle & Special Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Truck className="w-3.5 h-3.5 text-slate-400" />
                <span>{isUrdu ? 'ڈیلیوری گاڑی:' : 'Delivery Vehicle:'}</span>
              </label>
              <select
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 bg-white"
              >
                <option value="">-- {isUrdu ? 'دکان پر براہ راست ترسیل' : 'Counter / Self Pickup'} --</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plateNumber} ({v.model}) - {v.driverName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isUrdu ? 'اضافی نوٹ / تفصیل:' : 'Notes / Narration:'}
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={isUrdu ? 'خصوصی ہدایات...' : 'e.g. Morning lot, 2 crates'}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs text-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Live Invoice Preview & Balance Calculation (Cols 5 on Desktop) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-emerald-400 font-bold">
                  {isUrdu ? 'لائیو بل پیش نظارہ' : 'Live Counter Preview'}
                </span>
                <h3 className="text-base font-extrabold text-white">
                  {selectedCustomer?.urduName || selectedCustomer?.name}
                </h3>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400">{invoiceDate}</span>
                <p className="text-[10px] text-emerald-400 font-mono">INV-{2400 + invoices.length + 1}</p>
              </div>
            </div>

            {/* Calculations Breakdown */}
            <div className="space-y-2 text-xs divide-y divide-slate-800 font-medium">
              <div className="flex justify-between py-1.5">
                <span className="text-slate-400">{isUrdu ? 'سابقہ بقایا رقم (Previous):' : 'Previous Balance:'}</span>
                <span className={`font-mono font-bold ${
                  (selectedCustomer?.currentBalance || 0) < 0 ? 'text-emerald-400' : 'text-slate-200'
                }`}>
                  {formatPKR(selectedCustomer?.currentBalance || 0, true, language)}
                </span>
              </div>

              <div className="flex justify-between py-1.5">
                <span className="text-slate-400">{isUrdu ? 'وزن (Weight):' : 'Net Weight:'}</span>
                <span className="font-mono text-slate-200">{calc.netWeightKg} kg ({birdCount} birds)</span>
              </div>

              <div className="flex justify-between py-1.5">
                <span className="text-slate-400">{isUrdu ? 'ریٹ فی 40 کلو (Rate):' : 'Rate / 40kg:'}</span>
                <span className="font-mono text-slate-200">Rs {saleRate.toLocaleString()}</span>
              </div>

              <div className="flex justify-between py-1.5">
                <span className="text-slate-400">{isUrdu ? 'مرغی کی رقم (Birds):' : 'Birds Total:'}</span>
                <span className="font-mono text-slate-200">Rs {calc.birdTotal.toLocaleString()}</span>
              </div>

              {chargesTotal > 0 && (
                <div className="py-1.5">
                  <div className="flex justify-between">
                    <span className="text-amber-300">{isUrdu ? 'اضافی اخراجات:' : 'Extra Charges:'}</span>
                    <span className="font-mono text-amber-200">+ Rs {chargesTotal.toLocaleString()}</span>
                  </div>
                  <div className="mt-1 space-y-0.5 pl-2">
                    {charges.filter((c) => (c.amount || 0) > 0).map((c) => (
                      <div key={c.id} className="flex justify-between text-[11px]">
                        <span className="text-slate-400 truncate">{c.name || (isUrdu ? 'اضافی چارج' : 'Extra charge')}</span>
                        <span className="font-mono text-slate-300">Rs {Math.round(c.amount).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-between py-1.5 text-sm font-bold text-white">
                <span className="text-emerald-400">{isUrdu ? 'کل بل (Total Amount):' : 'Total Bill:'}</span>
                <span className="font-mono text-emerald-300">Rs {calc.totalAmount.toLocaleString()}</span>
              </div>

              <div className="flex justify-between py-1.5 text-slate-300">
                <span>{isUrdu ? 'نقد وصولی (Cash Paid):' : 'Cash Received:'}</span>
                <span className="font-mono text-rose-300">- Rs {receivedCash.toLocaleString()}</span>
              </div>

              {receivedAC > 0 && (
                <div className="flex justify-between py-1.5 text-slate-300">
                  <span>{isUrdu ? 'بینک وصولی (AC Paid):' : 'AC Payment:'}</span>
                  <span className="font-mono text-rose-300">- Rs {receivedAC.toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* NEW BALANCE HIGHLIGHT BOX */}
            <div className={`p-4 rounded-xl border ${
              calc.newBalance < 0 
                ? 'bg-emerald-950/70 border-emerald-500/80 text-emerald-100' 
                : 'bg-slate-800/90 border-slate-700 text-slate-100'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs uppercase font-extrabold tracking-wide">
                    {isUrdu ? 'نیا کل بقایا (New Running Balance):' : 'New Balance:'}
                  </span>
                  {calc.newBalance < 0 && (
                    <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-bold mt-0.5">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>{isUrdu ? 'گاہک کی پیشگی جمع رقم (Advance with Us)' : 'Customer Credit / Advance'}</span>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-black font-mono ${
                    calc.newBalance < 0 ? 'text-emerald-400' : 'text-amber-400'
                  }`}>
                    {calc.newBalance < 0 
                      ? `-Rs ${Math.abs(calc.newBalance).toLocaleString()}` 
                      : `Rs ${calc.newBalance.toLocaleString()}`}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {calc.newBalance < 0 ? 'ADVANCE (پیشگی)' : 'RECEIVABLE (واجب الادا)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Profit margin insight for internal management */}
            {isInternalRole && (
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                <span>{isUrdu ? 'منڈی مارجن تخمینہ:' : 'Estimated Mandi Margin:'}</span>
                <span className={`font-mono font-bold ${calc.netMarginTotal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  Rs {calc.netMarginTotal.toLocaleString()} ({calc.marginPer40kg >= 0 ? `+Rs ${calc.marginPer40kg}` : `-Rs ${Math.abs(calc.marginPer40kg)}`}/40kg)
                </span>
              </div>
            )}

            {/* Fast Action Buttons in preview */}
            <div className="pt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSave(true)}
                className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{isUrdu ? 'واٹس ایپ اور محفوظ' : 'Save & WhatsApp'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSave(false)}
                className="w-full py-2.5 px-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition"
              >
                <Save className="w-3.5 h-3.5" />
                <span>
                  {editingInvoice
                    ? (isUrdu ? 'ترمیم محفوظ کریں' : 'Save Changes')
                    : (isUrdu ? 'صرف محفوظ کریں' : 'Save (Ctrl+S)')}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Invoices Table with Direct Print, PDF, WhatsApp and Public View */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-600" />
            <span>{isUrdu ? 'حالیہ جاری کردہ انوائسز (Recent Invoices)' : 'Recent Invoices'}</span>
          </h3>
          <span className="text-xs text-slate-500">
            {liveInvoices.length} {isUrdu ? 'بل کل' : 'total'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left text-slate-700 border-collapse">
            <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[11px]">
              <tr>
                <th className="p-2.5 border-b">{isUrdu ? 'بل نمبر' : 'Inv #'}</th>
                <th className="p-2.5 border-b">{isUrdu ? 'تاریخ' : 'Date'}</th>
                <th className="p-2.5 border-b">{isUrdu ? 'گاہک' : 'Customer'}</th>
                <th className="p-2.5 border-b text-right">{isUrdu ? 'ریٹ' : 'Rate'}</th>
                <th className="p-2.5 border-b text-right">{isUrdu ? 'وزن' : 'Weight'}</th>
                <th className="p-2.5 border-b text-right">{isUrdu ? 'کل رقم' : 'Total'}</th>
                <th className="p-2.5 border-b text-right">{isUrdu ? 'وصولی' : 'Received'}</th>
                <th className="p-2.5 border-b text-right">{isUrdu ? 'نیا بقایا' : 'New Balance'}</th>
                <th className="p-2.5 border-b text-center">{isUrdu ? 'اقدامات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {liveInvoices.slice().reverse().map((inv) => {
                const totRec = (inv.receivedCash || 0) + (inv.receivedAC || 0);
                const cust = parties.find((p) => p.id === inv.customerId);
                return (
                  <tr key={inv.id} className="hover:bg-slate-50 transition">
                    <td className="p-2.5 font-mono font-bold text-slate-900">{inv.invoiceNumber}</td>
                    <td className="p-2.5 text-slate-600">{inv.invoiceDate}</td>
                    <td className="p-2.5 font-semibold text-slate-800">
                      {inv.customerUrduName ? `${inv.customerUrduName}` : inv.customerName}
                    </td>
                    <td className="p-2.5 text-right font-mono">Rs {inv.saleRatePer40kg.toLocaleString()}</td>
                    <td className="p-2.5 text-right font-mono font-bold text-slate-900">{inv.netWeightKg} kg</td>
                    <td className="p-2.5 text-right font-mono font-extrabold text-emerald-800">
                      Rs {inv.totalAmount.toLocaleString()}
                      {(inv.chargesTotal || 0) > 0 && (
                        <div className="text-[10px] font-bold text-amber-700 font-sans">
                          + Rs {(inv.chargesTotal || 0).toLocaleString()} {isUrdu ? 'چارجز' : 'charges'}
                        </div>
                      )}
                    </td>
                    <td className="p-2.5 text-right font-mono text-slate-700">
                      Rs {totRec.toLocaleString()}
                    </td>
                    <td className="p-2.5 text-right font-mono font-bold">
                      <span className={inv.newBalance < 0 ? 'text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded' : 'text-slate-900'}>
                        {formatPKR(inv.newBalance, true, language)}
                      </span>
                    </td>
                    <td className="p-2.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Print Slip Modal */}
                        <button
                          onClick={() => setPrintModalInvoice(inv)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                          title={isUrdu ? 'پرنٹ و رسید' : 'Print Slip'}
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>

                        {/* Download PDF Direct */}
                        <button
                          onClick={() => handleDownloadPDF(inv)}
                          className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 transition"
                          title={isUrdu ? 'پی ڈی ایف ڈاؤن لوڈ' : 'Download PDF'}
                        >
                          <FileDown className="w-3.5 h-3.5" />
                        </button>

                        {/* WhatsApp Direct */}
                        <button
                          onClick={() => handleShareWhatsAppDirect(inv)}
                          className="p-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 transition"
                          title={isUrdu ? 'واٹس ایپ پر بھیجیں' : 'Send on WhatsApp'}
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Public Link View Modal */}
                        <button
                          onClick={() => onViewPublicInvoice(inv)}
                          className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 transition"
                          title={isUrdu ? 'آن لائن رسید دیکھیں' : 'View Public Receipt'}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* Edit Sale (void + reissue) */}
                        {canModifySales && onUpdateInvoice && (
                          <button
                            onClick={() => startEditInvoice(inv)}
                            className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 transition"
                            title={isUrdu ? 'بل میں ترمیم' : 'Edit Sale'}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Delete (Void) Sale */}
                        {canModifySales && onDeleteInvoice && (
                          <button
                            onClick={() => {
                              const ok = window.confirm(
                                isUrdu
                                  ? `کیا واقعی بل ${inv.invoiceNumber} حذف (وائڈ) کرنا ہے؟ کھاتے سے اس کا اثر واپس ہو جائے گا۔`
                                  : `Void invoice ${inv.invoiceNumber}? Its effect on the khata will be reversed.`
                              );
                              if (ok) onDeleteInvoice(inv.id);
                            }}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 transition"
                            title={isUrdu ? 'بل حذف کریں' : 'Delete (Void) Sale'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* DEDICATED PRINT & PREVIEW INVOICE MODAL */}
      {printModalInvoice && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="no-print bg-slate-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-extrabold">
                    {isUrdu ? 'انوائس پرنٹ، پی ڈی ایف و واٹس ایپ' : 'Invoice Print, PDF & WhatsApp'}
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {printModalInvoice.invoiceNumber} — {printModalInvoice.customerUrduName || printModalInvoice.customerName}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Format Toggle */}
                <div className="flex bg-slate-800 p-0.5 rounded-lg text-[11px]">
                  <button
                    onClick={() => setPrintFormat('thermal80')}
                    className={`px-2.5 py-1 rounded-md font-bold transition ${
                      printFormat === 'thermal80' ? 'bg-emerald-600 text-white' : 'text-slate-300'
                    }`}
                  >
                    80mm Thermal
                  </button>
                  <button
                    onClick={() => setPrintFormat('a4')}
                    className={`px-2.5 py-1 rounded-md font-bold transition ${
                      printFormat === 'a4' ? 'bg-emerald-600 text-white' : 'text-slate-300'
                    }`}
                  >
                    A4 / A5 Bill
                  </button>
                </div>

                <button
                  onClick={() => setPrintModalInvoice(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Area */}
            <div className="p-4 max-h-[65vh] overflow-y-auto bg-slate-100 flex justify-center">
              {printFormat === 'thermal80' ? (
                /* 80mm Thermal Receipt Layout */
                <div className="print-receipt-80mm w-[300px] bg-white p-4 shadow-sm border border-slate-300 rounded text-slate-900 font-mono text-[11px] leading-tight">
                  <div className="text-center border-b border-dashed border-slate-400 pb-2 mb-2">
                    <p className="font-urdu text-sm font-bold text-slate-800">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>
                    <div className="flex justify-center my-1">
                      <img src={biz.logoUrl} alt={biz.nameEn} className="h-14 object-contain" />
                    </div>
                    <h2 className="text-sm font-black tracking-tight uppercase text-amber-800">{biz.nameEn}</h2>
                    {biz.nameUr && <p className="font-urdu text-xs font-semibold">{biz.nameUr}</p>}
                    {biz.tagline && <p className="text-[10px] text-slate-600">{biz.tagline}</p>}
                    {(biz.phone || biz.city) && (
                      <p className="text-[10px] text-slate-600" dir="ltr">
                        {[biz.phone, biz.city].filter(Boolean).join(' | ')}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1 mb-2 text-[10px] border-b border-dashed border-slate-400 pb-2">
                    <div className="flex justify-between">
                      <span className="font-bold">INV #: {printModalInvoice.invoiceNumber}</span>
                      <span>{printModalInvoice.invoiceDate}</span>
                    </div>
                    <div>
                      <span className="font-bold">CUSTOMER: </span>
                      <span>{printModalInvoice.customerName}</span>
                    </div>
                    {printModalInvoice.customerUrduName && (
                      <div className="font-urdu font-bold text-right text-xs">
                        {printModalInvoice.customerUrduName}
                      </div>
                    )}
                  </div>

                  {/* Items Table */}
                  <div className="border-b border-dashed border-slate-400 pb-2 mb-2">
                    <div className="flex justify-between font-bold border-b border-slate-300 pb-1 mb-1 text-[10px]">
                      <span>DESC / RATE</span>
                      <span className="text-right">WEIGHT / TOTAL</span>
                    </div>
                    <div className="flex justify-between">
                      <div>
                        <div>Broiler Live ({printModalInvoice.birdCount} birds)</div>
                        <div className="text-[10px] text-slate-600">@ Rs {printModalInvoice.saleRatePer40kg.toLocaleString()}/40kg</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{printModalInvoice.netWeightKg} kg</div>
                        <div className="font-bold">Rs {(printModalInvoice.totalAmount - (printModalInvoice.chargesTotal || 0)).toLocaleString()}</div>
                      </div>
                    </div>
                    {(printModalInvoice.charges ?? []).map((c) => (
                      <div key={c.id} className="flex justify-between mt-1">
                        <div>
                          <div>{c.name}</div>
                          <div className="text-[10px] text-slate-600">{isUrdu ? 'اضافی چارج' : 'Extra charge'}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold">Rs {c.amount.toLocaleString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Mathematical Balance Breakdown */}
                  <div className="space-y-1 text-[11px] border-b border-dashed border-slate-400 pb-2 mb-2">
                    <div className="flex justify-between">
                      <span>Total Bill (Rate x Kg / 40):</span>
                      <span className="font-bold">Rs {printModalInvoice.totalAmount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-slate-700">
                      <span>Cash Wasool (نقد وصولی):</span>
                      <span>-Rs {printModalInvoice.receivedCash.toLocaleString()}</span>
                    </div>
                    {printModalInvoice.receivedAC > 0 && (
                      <div className="flex justify-between text-slate-700">
                        <span>AC Payment (بینک وصولی):</span>
                        <span>-Rs {printModalInvoice.receivedAC.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-600">
                      <span>Previous Balance (سابقہ):</span>
                      <span>
                        {printModalInvoice.previousBalance < 0 
                          ? `-Rs ${Math.abs(printModalInvoice.previousBalance).toLocaleString()} (Adv)` 
                          : `Rs ${printModalInvoice.previousBalance.toLocaleString()}`}
                      </span>
                    </div>
                  </div>

                  {/* New Balance Box */}
                  <div className={`p-2 rounded text-center my-2 border ${
                    printModalInvoice.newBalance < 0
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                      : 'bg-slate-100 border-slate-400 text-slate-900'
                  }`}>
                    <div className="text-[10px] font-bold uppercase">
                      {printModalInvoice.newBalance < 0 ? 'ADVANCE CREDIT (پیشگی جمع)' : 'NET BALANCE PAYABLE (نیا بقایا)'}
                    </div>
                    <div className="text-base font-black font-mono">
                      {printModalInvoice.newBalance < 0 
                        ? `-Rs ${Math.abs(printModalInvoice.newBalance).toLocaleString()}` 
                        : `Rs ${printModalInvoice.newBalance.toLocaleString()}`}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="text-center text-[9px] text-slate-500 pt-1">
                    <p>Computerized Thermal Slip</p>
                    <p className="font-urdu">شکریہ! مال وصولی پر وزن تصدیق فرمائیں</p>
                  </div>
                </div>
              ) : (
                /* A4 / A5 Official Trade Bill Layout */
                <div className="print-page-a4 w-full bg-white p-6 shadow-sm border border-slate-300 rounded text-slate-900 text-xs">
                  <div className="border-b-2 border-amber-600 pb-3 mb-3 flex justify-between items-start">
                    <div className="flex items-start gap-3">
                      <img src={biz.logoUrl} alt={biz.nameEn} className="h-16 object-contain" />
                      <div>
                        <h2 className="text-lg font-black text-amber-800 uppercase tracking-tight">{biz.nameEn}</h2>
                        {biz.nameUr && <p className="font-urdu text-sm font-bold text-slate-700">{biz.nameUr}</p>}
                        {biz.tagline && <p className="text-[10px] text-slate-500">{biz.tagline}</p>}
                        {(biz.phone || biz.city) && (
                          <p className="text-[10px] text-slate-500" dir="ltr">
                            {[biz.phone, biz.city].filter(Boolean).join(' | ')}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded">
                        ORIGINAL INVOICE
                      </span>
                      <p className="text-sm font-mono font-bold mt-1">{printModalInvoice.invoiceNumber}</p>
                      <p className="text-[11px] text-slate-500">{printModalInvoice.invoiceDate}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500">Billed To (Customer):</span>
                      <h4 className="font-bold text-slate-900 text-sm">
                        {printModalInvoice.customerName}
                      </h4>
                      {printModalInvoice.customerUrduName && (
                        <p className="font-urdu text-xs text-slate-700">{printModalInvoice.customerUrduName}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-500">Previous Running Balance:</span>
                      <p className="font-mono font-bold text-slate-800 text-sm">
                        {printModalInvoice.previousBalance < 0 
                          ? `-Rs ${Math.abs(printModalInvoice.previousBalance).toLocaleString()} (Adv)` 
                          : `Rs ${printModalInvoice.previousBalance.toLocaleString()}`}
                      </p>
                    </div>
                  </div>

                  {/* Line items table */}
                  <table className="w-full text-xs border-collapse mb-4">
                    <thead>
                      <tr className="bg-slate-100 text-slate-800 font-bold border-y border-slate-300">
                        <th className="p-2 text-left">Item Description</th>
                        <th className="p-2 text-right">Birds</th>
                        <th className="p-2 text-right">Weight (Kg)</th>
                        <th className="p-2 text-right">Rate / 40kg</th>
                        <th className="p-2 text-right">Total Bill (PKR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      <tr>
                        <td className="p-2 font-medium">Broiler Live Chicken (Mandi Grade)</td>
                        <td className="p-2 text-right font-mono">{printModalInvoice.birdCount}</td>
                        <td className="p-2 text-right font-mono font-bold">{printModalInvoice.netWeightKg} kg</td>
                        <td className="p-2 text-right font-mono">Rs {printModalInvoice.saleRatePer40kg.toLocaleString()}</td>
                        <td className="p-2 text-right font-mono font-bold text-emerald-800">
                          Rs {(printModalInvoice.totalAmount - (printModalInvoice.chargesTotal || 0)).toLocaleString()}
                        </td>
                      </tr>
                      {(printModalInvoice.charges ?? []).map((c) => (
                        <tr key={c.id}>
                          <td className="p-2 font-medium text-amber-900">{c.name} <span className="text-[10px] text-slate-500">(Extra charge)</span></td>
                          <td className="p-2 text-right font-mono">-</td>
                          <td className="p-2 text-right font-mono">-</td>
                          <td className="p-2 text-right font-mono">-</td>
                          <td className="p-2 text-right font-mono font-bold text-amber-800">
                            Rs {c.amount.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Summary math */}
                  <div className="flex justify-end mb-4">
                    <div className="w-64 space-y-1.5 text-xs">
                      <div className="flex justify-between py-1 border-b border-slate-200">
                        <span className="text-slate-600">Total Bill Amount:</span>
                        <span className="font-mono font-bold">Rs {printModalInvoice.totalAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-200">
                        <span className="text-slate-600">Cash Received (Wasool):</span>
                        <span className="font-mono font-bold text-rose-700">- Rs {printModalInvoice.receivedCash.toLocaleString()}</span>
                      </div>
                      {printModalInvoice.receivedAC > 0 && (
                        <div className="flex justify-between py-1 border-b border-slate-200">
                          <span className="text-slate-600">AC / Online Received:</span>
                          <span className="font-mono font-bold text-rose-700">- Rs {printModalInvoice.receivedAC.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between py-1 border-b border-slate-200">
                        <span className="text-slate-600">Previous Balance:</span>
                        <span className="font-mono">
                          {printModalInvoice.previousBalance < 0 
                            ? `-Rs ${Math.abs(printModalInvoice.previousBalance).toLocaleString()}` 
                            : `Rs ${printModalInvoice.previousBalance.toLocaleString()}`}
                        </span>
                      </div>
                      <div className={`flex justify-between p-2 rounded font-bold ${
                        printModalInvoice.newBalance < 0 ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-200 text-slate-900'
                      }`}>
                        <span>{printModalInvoice.newBalance < 0 ? 'ADVANCE CREDIT:' : 'NET BALANCE PAYABLE:'}</span>
                        <span className="font-mono">
                          {printModalInvoice.newBalance < 0 
                            ? `-Rs ${Math.abs(printModalInvoice.newBalance).toLocaleString()}` 
                            : `Rs ${printModalInvoice.newBalance.toLocaleString()}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Signatures */}
                  <div className="grid grid-cols-2 gap-8 pt-8 mt-4 border-t border-slate-200 text-center text-[10px] text-slate-500">
                    <div>
                      <div className="w-32 mx-auto border-b border-slate-400 mb-1"></div>
                      <p>Customer Signature (دستخط گاہک)</p>
                    </div>
                    <div>
                      <div className="w-32 mx-auto border-b border-slate-400 mb-1"></div>
                      <p>Authorized Signature (دستخط منشی / مالک)</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions Footer */}
            <div className="no-print p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyWhatsAppText(printModalInvoice)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
                >
                  {copiedNotice ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedNotice ? (isUrdu ? 'کاپی ہوگیا!' : 'Copied!') : (isUrdu ? 'واٹس ایپ متن کاپی' : 'Copy WhatsApp Text')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleShareWhatsAppDirect(printModalInvoice)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm"
                >
                  <Share2 className="w-4 h-4" />
                  <span>{isUrdu ? 'واٹس ایپ بھیجیں' : 'Send on WhatsApp'}</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadPDF(printModalInvoice)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>{isUrdu ? 'پی ڈی ایف محفوظ کریں' : 'Download PDF'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-md"
                >
                  <Printer className="w-4 h-4 text-emerald-400" />
                  <span>{isUrdu ? 'ابھی پرنٹ کریں' : 'Print Slip Now'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Customer Modal */}
      <PartyModal
        isOpen={isAddPartyModalOpen}
        onClose={() => setIsAddPartyModalOpen(false)}
        onSaveParty={(newParty) => {
          if (onAddParty) {
            onAddParty(newParty);
          }
          setSelectedCustomerId(newParty.id);
          if (newParty.defaultKilo) {
            setWeightKg(newParty.defaultKilo);
          }
          setSaveSuccessNotice(
            isUrdu 
              ? `نیا گاہک "${newParty.urduName || newParty.name}" کامیابی سے شامل ہو گیا!` 
              : `Customer "${newParty.name}" added successfully!`
          );
          setTimeout(() => setSaveSuccessNotice(null), 4000);
        }}
        defaultPartyType="customer"
        language={language}
      />
    </div>
  );
};
