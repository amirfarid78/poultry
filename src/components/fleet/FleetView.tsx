import React, { useState, useEffect, useRef } from 'react';
import { Vehicle, Trip, UserRole, StaffProfile, OrderItem } from '../../types';
import { supabase } from '../../lib/supabase';
import { insertTripPing } from '../../lib/db';
import {
  Truck, MapPin, Navigation, Play, Square, CheckCircle2, Fuel,
  Gauge, BatteryMedium, Radio, User, Clock, Plus, Pencil, X,
  AlertTriangle, Package, Route as RouteIcon, Calendar
} from 'lucide-react';
import L from 'leaflet';

interface FleetViewProps {
  vehicles: Vehicle[];
  trips: Trip[];
  orders: OrderItem[];
  staffProfiles: StaffProfile[];
  currentUserId: string | null;
  currentRole: UserRole;
  language: 'en' | 'ur';
  onAddVehicle: (vehicle: Vehicle) => void;
  onUpdateVehicle: (vehicle: Vehicle) => void;
  onAddTrip: (trip: Trip) => void;
  onUpdateTrip: (trip: Trip) => void;
}

type FleetTab = 'tracking' | 'vehicles' | 'trips' | 'driver';

const emptyVehicle = (): Vehicle => ({
  id: `veh-${Date.now()}`,
  plateNumber: '',
  model: '',
  capacityKg: 3000,
  isActive: true,
});

export const FleetView: React.FC<FleetViewProps> = ({
  vehicles,
  trips,
  orders,
  staffProfiles,
  currentUserId,
  currentRole,
  language,
  onAddVehicle,
  onUpdateVehicle,
  onAddTrip,
  onUpdateTrip,
}) => {
  const isUrdu = language === 'ur';
  const isDriver = currentRole === 'driver';
  const canManage = currentRole === 'owner' || currentRole === 'manager';

  // Drivers land on their console; managers on live tracking
  const [activeTab, setActiveTab] = useState<FleetTab>(isDriver ? 'driver' : 'tracking');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
          <Truck className="w-6 h-6 text-emerald-600" />
          <span>{isUrdu ? 'گاڑیاں، لائیو ٹریکنگ و ڈلیوری' : 'Fleet, Live Tracking & Delivery'}</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          {isUrdu
            ? 'گاڑی رجسٹریشن، ڈرائیور اسائنمنٹ، لائیو GPS ٹریکنگ اور ڈلیوری مینجمنٹ'
            : 'Vehicle registration, driver assignment, live GPS tracking and delivery management.'}
        </p>

        {/* Tab bar */}
        <div className="flex gap-2 mt-4 flex-wrap">
          {!isDriver && (
            <TabButton active={activeTab === 'tracking'} onClick={() => setActiveTab('tracking')}
              icon={<Radio className="w-4 h-4" />} label={isUrdu ? 'لائیو ٹریکنگ' : 'Live Tracking'} />
          )}
          {canManage && (
            <TabButton active={activeTab === 'vehicles'} onClick={() => setActiveTab('vehicles')}
              icon={<Truck className="w-4 h-4" />} label={isUrdu ? 'گاڑیاں' : 'Vehicles'} />
          )}
          {canManage && (
            <TabButton active={activeTab === 'trips'} onClick={() => setActiveTab('trips')}
              icon={<RouteIcon className="w-4 h-4" />} label={isUrdu ? 'ٹرپس' : 'Trips'} />
          )}
          <TabButton active={activeTab === 'driver'} onClick={() => setActiveTab('driver')}
            icon={<Navigation className="w-4 h-4" />} label={isUrdu ? 'ڈرائیور پینل' : 'Driver Console'} />
        </div>
      </div>

      {activeTab === 'tracking' && !isDriver && (
        <LiveTrackingMap
          vehicles={vehicles} trips={trips} language={language} onUpdateTrip={onUpdateTrip}
        />
      )}

      {activeTab === 'vehicles' && canManage && (
        <VehicleManager
          vehicles={vehicles} staffProfiles={staffProfiles} language={language}
          onAddVehicle={onAddVehicle} onUpdateVehicle={onUpdateVehicle}
        />
      )}

      {activeTab === 'trips' && canManage && (
        <TripManager
          vehicles={vehicles} trips={trips} orders={orders} staffProfiles={staffProfiles}
          language={language} onAddTrip={onAddTrip}
        />
      )}

      {activeTab === 'driver' && (
        <DriverConsole
          vehicles={vehicles} trips={trips} currentUserId={currentUserId}
          language={language} onUpdateTrip={onUpdateTrip}
        />
      )}
    </div>
  );
};

function TabButton({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition ${
        active
          ? 'bg-emerald-600 text-white shadow-md'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ============================================================================
// VEHICLE MANAGER — registration, documents, driver assignment
// ============================================================================
function VehicleManager({ vehicles, staffProfiles, language, onAddVehicle, onUpdateVehicle }: {
  vehicles: Vehicle[];
  staffProfiles: StaffProfile[];
  language: 'en' | 'ur';
  onAddVehicle: (v: Vehicle) => void;
  onUpdateVehicle: (v: Vehicle) => void;
}) {
  const isUrdu = language === 'ur';
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const drivers = staffProfiles.filter((p) => p.role === 'driver' && p.isActive);

  const openAdd = () => { setEditing(emptyVehicle()); setShowModal(true); };
  const openEdit = (v: Vehicle) => { setEditing({ ...v }); setShowModal(true); };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !editing.plateNumber.trim()) return;
    const isNew = !vehicles.some((v) => v.id === editing.id);
    if (isNew) onAddVehicle(editing); else onUpdateVehicle(editing);
    setShowModal(false);
    setEditing(null);
  };

  const today = new Date().toISOString().split('T')[0];
  const isExpiringSoon = (dateStr?: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr).getTime();
    const now = Date.now();
    return d < now + 30 * 24 * 3600 * 1000; // within 30 days or expired
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">
          {isUrdu ? `رجسٹرڈ گاڑیاں (${vehicles.length})` : `Registered Vehicles (${vehicles.length})`}
        </h3>
        <button onClick={openAdd}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md transition">
          <Plus className="w-4 h-4" />
          <span>{isUrdu ? 'نئی گاڑی رجسٹر کریں' : 'Register Vehicle'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {vehicles.map((v) => (
          <div key={v.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono font-black text-lg text-slate-900">{v.plateNumber}</p>
                <p className="text-xs text-slate-500">{v.model}{v.year ? ` • ${v.year}` : ''}{v.color ? ` • ${v.color}` : ''}</p>
              </div>
              <div className="flex items-center gap-1">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${v.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-500'}`}>
                  {v.isActive ? (isUrdu ? 'فعال' : 'Active') : (isUrdu ? 'غیر فعال' : 'Inactive')}
                </span>
                <button onClick={() => openEdit(v)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-50 rounded-lg p-2">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">{isUrdu ? 'گنجائش' : 'Capacity'}</span>
                <span className="font-mono font-bold">{v.capacityKg.toLocaleString()} kg</span>
              </div>
              <div className="bg-slate-50 rounded-lg p-2">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">{isUrdu ? 'ڈرائیور' : 'Driver'}</span>
                <span className="font-bold text-slate-800">{v.driverName || (isUrdu ? 'تفویض نہیں' : 'Unassigned')}</span>
              </div>
            </div>
            {(v.insuranceExpiry || v.fitnessExpiry) && (
              <div className="flex gap-2 text-[11px]">
                {v.insuranceExpiry && (
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full font-bold ${isExpiringSoon(v.insuranceExpiry) ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                    {isExpiringSoon(v.insuranceExpiry) && <AlertTriangle className="w-3 h-3" />}
                    {isUrdu ? 'انشورنس' : 'Insurance'}: {v.insuranceExpiry}
                  </span>
                )}
                {v.fitnessExpiry && (
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full font-bold ${isExpiringSoon(v.fitnessExpiry) ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                    {isExpiringSoon(v.fitnessExpiry) && <AlertTriangle className="w-3 h-3" />}
                    {isUrdu ? 'فٹنس' : 'Fitness'}: {v.fitnessExpiry}
                  </span>
                )}
              </div>
            )}
            {(v.engineNumber || v.chassisNumber) && (
              <p className="text-[10px] text-slate-400 font-mono">
                {v.engineNumber ? `Eng: ${v.engineNumber}` : ''}{v.engineNumber && v.chassisNumber ? ' • ' : ''}{v.chassisNumber ? `Ch: ${v.chassisNumber}` : ''}
              </p>
            )}
          </div>
        ))}
        {vehicles.length === 0 && (
          <div className="col-span-full bg-white p-10 rounded-2xl border border-slate-200 text-center">
            <Truck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-600">{isUrdu ? 'کوئی گاڑی رجسٹر نہیں' : 'No vehicles registered yet'}</p>
          </div>
        )}
      </div>

      {showModal && editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {vehicles.some((v) => v.id === editing.id)
                  ? (isUrdu ? 'گاڑی کی تفصیل اپ ڈیٹ کریں' : 'Edit Vehicle')
                  : (isUrdu ? 'نئی گاڑی رجسٹر کریں' : 'Register New Vehicle')}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isUrdu ? 'نمبر پلیٹ *' : 'Plate Number *'}</label>
                  <input value={editing.plateNumber} onChange={(e) => setEditing({ ...editing, plateNumber: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold uppercase" required placeholder="LEA-1234" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isUrdu ? 'ماڈل' : 'Model'}</label>
                  <input value={editing.model} onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300" placeholder="Suzuki Ravi" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isUrdu ? 'گنجائش (کلو)' : 'Capacity (kg)'}</label>
                  <input type="number" value={editing.capacityKg} onChange={(e) => setEditing({ ...editing, capacityKg: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isUrdu ? 'سال' : 'Year'}</label>
                  <input type="number" value={editing.year || ''} onChange={(e) => setEditing({ ...editing, year: parseInt(e.target.value) || undefined })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300" placeholder="2022" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isUrdu ? 'رنگ' : 'Color'}</label>
                  <input value={editing.color || ''} onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300" placeholder="White" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isUrdu ? 'ڈرائیور تفویض کریں' : 'Assign Driver'}</label>
                  <select value={editing.driverId || ''} onChange={(e) => {
                    const d = drivers.find((x) => x.id === e.target.value);
                    setEditing({ ...editing, driverId: d?.id, driverName: d?.fullName || undefined });
                  }} className="w-full px-3 py-2 rounded-xl border border-slate-300">
                    <option value="">{isUrdu ? 'منتخب کریں' : 'Select driver'}</option>
                    {drivers.map((d) => <option key={d.id} value={d.id}>{d.fullName} ({d.email})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isUrdu ? 'انجن نمبر' : 'Engine No.'}</label>
                  <input value={editing.engineNumber || ''} onChange={(e) => setEditing({ ...editing, engineNumber: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isUrdu ? 'چیسز نمبر' : 'Chassis No.'}</label>
                  <input value={editing.chassisNumber || ''} onChange={(e) => setEditing({ ...editing, chassisNumber: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isUrdu ? 'انشورنس میعاد' : 'Insurance Expiry'}</label>
                  <input type="date" value={editing.insuranceExpiry || ''} onChange={(e) => setEditing({ ...editing, insuranceExpiry: e.target.value || undefined })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isUrdu ? 'فٹنس میعاد' : 'Fitness Expiry'}</label>
                  <input type="date" value={editing.fitnessExpiry || ''} onChange={(e) => setEditing({ ...editing, fitnessExpiry: e.target.value || undefined })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300" />
                </div>
              </div>
              <label className="flex items-center gap-2 font-bold text-slate-700">
                <input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
                  className="w-4 h-4 rounded" />
                {isUrdu ? 'گاڑی فعال ہے' : 'Vehicle is active'}
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl">{isUrdu ? 'منسوخ' : 'Cancel'}</button>
                <button type="submit" className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl">
                  {isUrdu ? 'محفوظ کریں' : 'Save Vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// LIVE TRACKING MAP — admin sees all vehicles live via Supabase Realtime
// ============================================================================
function LiveTrackingMap({ vehicles, trips, language, onUpdateTrip }: {
  vehicles: Vehicle[];
  trips: Trip[];
  language: 'en' | 'ur';
  onUpdateTrip: (t: Trip) => void;
}) {
  const isUrdu = language === 'ur';
  const [selectedTripId, setSelectedTripId] = useState<string>(trips.find((t) => t.status === 'ongoing')?.id || trips[0]?.id || '');
  const activeTrip = trips.find((t) => t.id === selectedTripId) || trips.find((t) => t.status === 'ongoing') || trips[0];

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const [lastPingAt, setLastPingAt] = useState<Record<string, string>>({});
  const [liveCount, setLiveCount] = useState(0);

  const truckIcon = (plate: string) => L.divIcon({
    className: 'custom-truck-pin',
    html: `<div style="background-color:#166534;color:white;border-radius:50%;width:38px;height:38px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.4);border:2px solid #fff;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18.5" r="2.5"/><circle cx="7" cy="18.5" r="2.5"/></svg>
    </div><div style="background:#0f172a;color:#fff;font-size:9px;font-weight:bold;padding:1px 5px;border-radius:6px;margin-top:2px;white-space:nowrap;">${plate}</div>`,
    iconSize: [60, 48],
    iconAnchor: [30, 24],
  });

  // Init map once
  useEffect(() => {
    if (!mapContainerRef.current || leafletMapRef.current) return;
    const map = L.map(mapContainerRef.current).setView([31.5204, 74.3587], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    leafletMapRef.current = map;
  }, []);

  // Realtime subscription: live pings from all drivers
  useEffect(() => {
    const channel = supabase
      .channel('fleet-live-pings')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trip_pings' }, (payload) => {
        const ping = payload.new as { trip_id: string; lat: number; lng: number; speed_kmh: number; created_at: string };
        const trip = trips.find((t) => t.id === ping.trip_id);
        if (!trip || !leafletMapRef.current) return;
        const lat = Number(ping.lat), lng = Number(ping.lng);
        let marker = markersRef.current.get(trip.id);
        if (!marker) {
          marker = L.marker([lat, lng], { icon: truckIcon(trip.plateNumber) }).addTo(leafletMapRef.current);
          marker.bindPopup(`<b>${trip.plateNumber}</b><br/>Driver: ${trip.driverName}`);
          markersRef.current.set(trip.id, marker);
        } else {
          marker.setLatLng([lat, lng]);
        }
        setLastPingAt((p) => ({ ...p, [trip.id]: ping.created_at }));
        setLiveCount((c) => c + 1);
        // Update trip's current position in app state
        onUpdateTrip({ ...trip, currentLat: lat, currentLng: lng, path: [...trip.path, [lat, lng]] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips.length]);

  // Seed markers from current trip positions
  useEffect(() => {
    if (!leafletMapRef.current) return;
    const ongoing = trips.filter((t) => t.status === 'ongoing');
    ongoing.forEach((t) => {
      if (!markersRef.current.has(t.id) && t.currentLat && t.currentLng) {
        const m = L.marker([t.currentLat, t.currentLng], { icon: truckIcon(t.plateNumber) })
          .addTo(leafletMapRef.current!);
        m.bindPopup(`<b>${t.plateNumber}</b><br/>Driver: ${t.driverName}`);
        markersRef.current.set(t.id, m);
      }
    });
    if (activeTrip?.currentLat) leafletMapRef.current.setView([activeTrip.currentLat, activeTrip.currentLng], 13);
  }, [trips, activeTrip]);

  const ongoingTrips = trips.filter((t) => t.status === 'ongoing');

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
          <span className="text-sm font-bold text-slate-800">
            {isUrdu ? `${ongoingTrips.length} گاڑیاں روٹ پر (لائیو)` : `${ongoingTrips.length} vehicles on route (live)`}
          </span>
        </div>
        <select value={selectedTripId} onChange={(e) => setSelectedTripId(e.target.value)}
          className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold bg-white">
          <option value="">{isUrdu ? 'تمام گاڑیاں' : 'All vehicles'}</option>
          {trips.map((t) => (
            <option key={t.id} value={t.id}>{t.tripNumber} ({t.plateNumber}) — {t.status}</option>
          ))}
        </select>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div ref={mapContainerRef} className="h-[460px] w-full rounded-xl overflow-hidden border border-slate-200 z-0" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          {ongoingTrips.map((t) => (
            <button key={t.id} onClick={() => setSelectedTripId(t.id)}
              className={`p-3 rounded-xl border text-left transition ${selectedTripId === t.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}>
              <p className="font-mono font-black text-sm text-slate-900">{t.plateNumber}</p>
              <p className="text-[11px] text-slate-500 flex items-center gap-1"><User className="w-3 h-3" />{t.driverName}</p>
              <p className="text-[10px] text-slate-400 font-mono mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {lastPingAt[t.id] ? new Date(lastPingAt[t.id]).toLocaleTimeString() : (isUrdu ? 'پنگ نہیں' : 'no ping yet')}
              </p>
              <p className="text-[11px] font-bold text-emerald-700 mt-0.5">
                {t.deliveredKg}/{t.totalLoadKg} kg {isUrdu ? 'ڈیلیور' : 'delivered'}
              </p>
            </button>
          ))}
          {ongoingTrips.length === 0 && (
            <p className="col-span-full text-center text-xs text-slate-400 py-4">
              {isUrdu ? 'اس وقت کوئی گاڑی روٹ پر نہیں — ڈرائیور ٹرپ شروع کرے تو یہاں لائیو نظر آئے گی۔' : 'No vehicles on route right now — they will appear here live when a driver starts a trip.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TRIP MANAGER — create trips from orders, assign vehicle + driver
// ============================================================================
function TripManager({ vehicles, trips, orders, staffProfiles, language, onAddTrip }: {
  vehicles: Vehicle[];
  trips: Trip[];
  orders: OrderItem[];
  staffProfiles: StaffProfile[];
  language: 'en' | 'ur';
  onAddTrip: (t: Trip) => void;
}) {
  const isUrdu = language === 'ur';
  const [showModal, setShowModal] = useState(false);
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id || '');
  const [driverId, setDriverId] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const drivers = staffProfiles.filter((p) => p.role === 'driver' && p.isActive);

  const pendingOrders = orders.filter((o) => ['booked', 'confirmed'].includes(o.status));

  const toggleOrder = (id: string) =>
    setSelectedOrderIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const selectedOrders = orders.filter((o) => selectedOrderIds.includes(o.id));
  const totalKg = selectedOrders.reduce((s, o) => s + o.expectedKg, 0);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    const driver = drivers.find((d) => d.id === driverId);
    if (!vehicle || selectedOrders.length === 0) return;
    const trip: Trip = {
      id: `trip-${Date.now()}`,
      tripNumber: `TRIP-${1000 + trips.length + 1}`,
      vehicleId: vehicle.id,
      plateNumber: vehicle.plateNumber,
      driverId: driver?.id || vehicle.driverId || '',
      driverName: driver?.fullName || vehicle.driverName || '',
      status: 'planned',
      fuelExpense: 0,
      totalLoadKg: totalKg,
      deliveredKg: 0,
      currentLat: 31.5204,
      currentLng: 74.3587,
      stops: selectedOrders.map((o) => ({
        customerId: o.customerId,
        customerName: o.customerUrduName || o.customerName,
        kg: o.expectedKg,
        isDelivered: false,
      })),
      path: [],
    };
    onAddTrip(trip);
    setShowModal(false);
    setSelectedOrderIds([]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">
          {isUrdu ? `ڈلیوری ٹرپس (${trips.length})` : `Delivery Trips (${trips.length})`}
        </h3>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md transition">
          <Plus className="w-4 h-4" />
          <span>{isUrdu ? 'نیا ٹرپ بنائیں' : 'Create Trip'}</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-100 text-slate-700 uppercase text-[11px]">
            <tr>
              <th className="p-3">{isUrdu ? 'ٹرپ #' : 'Trip #'}</th>
              <th className="p-3">{isUrdu ? 'گاڑی' : 'Vehicle'}</th>
              <th className="p-3">{isUrdu ? 'ڈرائیور' : 'Driver'}</th>
              <th className="p-3 text-right">{isUrdu ? 'لوڈ' : 'Load'}</th>
              <th className="p-3 text-center">{isUrdu ? 'اسٹاپس' : 'Stops'}</th>
              <th className="p-3 text-center">{isUrdu ? 'اسٹیٹس' : 'Status'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {trips.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="p-3 font-mono font-bold">{t.tripNumber}</td>
                <td className="p-3 font-mono">{t.plateNumber}</td>
                <td className="p-3">{t.driverName}</td>
                <td className="p-3 text-right font-mono">{t.deliveredKg}/{t.totalLoadKg} kg</td>
                <td className="p-3 text-center">{t.stops.filter((s) => s.isDelivered).length}/{t.stops.length}</td>
                <td className="p-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    t.status === 'ongoing' ? 'bg-emerald-100 text-emerald-800' :
                    t.status === 'completed' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-800'
                  }`}>{t.status}</span>
                </td>
              </tr>
            ))}
            {trips.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-slate-400">{isUrdu ? 'کوئی ٹرپ نہیں' : 'No trips yet'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">{isUrdu ? 'نیا ڈلیوری ٹرپ' : 'New Delivery Trip'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isUrdu ? 'گاڑی' : 'Vehicle'}</label>
                  <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold" required>
                    {vehicles.filter((v) => v.isActive).map((v) => (
                      <option key={v.id} value={v.id}>{v.plateNumber} ({v.model})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{isUrdu ? 'ڈرائیور' : 'Driver'}</label>
                  <select value={driverId} onChange={(e) => setDriverId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300">
                    <option value="">{isUrdu ? 'گاڑی کا ڈرائیور' : 'Vehicle\'s driver'}</option>
                    {drivers.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {isUrdu ? `آرڈرز منتخب کریں (کل: ${totalKg} کلو)` : `Select orders (total: ${totalKg} kg)`}
                </label>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {pendingOrders.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 p-2.5 hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={selectedOrderIds.includes(o.id)} onChange={() => toggleOrder(o.id)} className="w-4 h-4" />
                      <span className="font-mono font-bold">{o.orderNumber}</span>
                      <span className="flex-1">{o.customerUrduName || o.customerName}</span>
                      <span className="font-mono font-bold text-emerald-700">{o.expectedKg} kg</span>
                    </label>
                  ))}
                  {pendingOrders.length === 0 && (
                    <p className="p-4 text-center text-slate-400">{isUrdu ? 'کوئی زیر التواء آرڈر نہیں' : 'No pending orders'}</p>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl">{isUrdu ? 'منسوخ' : 'Cancel'}</button>
                <button type="submit" disabled={selectedOrders.length === 0}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-40">
                  {isUrdu ? 'ٹرپ بنائیں' : 'Create Trip'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// DRIVER CONSOLE — driver's own trips, auto GPS broadcast, delivery checklist
// ============================================================================
function DriverConsole({ vehicles, trips, currentUserId, language, onUpdateTrip }: {
  vehicles: Vehicle[];
  trips: Trip[];
  currentUserId: string | null;
  language: 'en' | 'ur';
  onUpdateTrip: (t: Trip) => void;
}) {
  const isUrdu = language === 'ur';
  // Driver sees trips assigned to them (by user id) or, as fallback, all active trips
  const myTrips = trips.filter((t) =>
    (currentUserId && t.driverId === currentUserId) || t.status === 'ongoing' || t.status === 'planned'
  );
  const [selectedTripId, setSelectedTripId] = useState<string>(
    myTrips.find((t) => t.status === 'ongoing')?.id || myTrips[0]?.id || ''
  );
  const activeTrip = myTrips.find((t) => t.id === selectedTripId) || myTrips[0];

  const [broadcasting, setBroadcasting] = useState(false);
  const [lastPing, setLastPing] = useState<string | null>(null);
  const [pingError, setPingError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(0);
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<number>(0);

  // Cleanup watch on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const sendPing = async (lat: number, lng: number, spd: number) => {
    if (!activeTrip) return;
    // Throttle: max 1 ping per 10 seconds to save battery + DB writes
    const now = Date.now();
    if (now - lastSentRef.current < 10000 && lastSentRef.current !== 0) return;
    lastSentRef.current = now;
    try {
      await insertTripPing(supabase, activeTrip.id, {
        lat,
        lng,
        speed: Math.round(spd || 0),
        timestamp: new Date().toISOString(),
      });
      setLastPing(new Date().toLocaleTimeString());
      setPingError(null);
      // Update local trip position too
      onUpdateTrip({
        ...activeTrip,
        currentLat: lat,
        currentLng: lng,
        path: [...activeTrip.path, [lat, lng]],
      });
    } catch (e: any) {
      setPingError(e?.message || 'Ping failed');
    }
  };

  const startBroadcast = () => {
    if (!activeTrip) return;
    if (!('geolocation' in navigator)) {
      setPingError(isUrdu ? 'اس ڈیوائس پر GPS دستیاب نہیں' : 'GPS not available on this device');
      return;
    }
    // Mark trip ongoing
    onUpdateTrip({ ...activeTrip, status: 'ongoing', startTime: activeTrip.startTime || new Date().toISOString() });
    setBroadcasting(true);
    lastSentRef.current = 0;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const spd = pos.coords.speed ? pos.coords.speed * 3.6 : 0; // m/s → km/h
        setSpeed(Math.round(spd));
        void sendPing(pos.coords.latitude, pos.coords.longitude, spd);
      },
      (err) => {
        setPingError(isUrdu ? `GPS خرابی: ${err.message}` : `GPS error: ${err.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  };

  const stopBroadcast = () => {
    if (watchIdRef.current !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setBroadcasting(false);
    if (activeTrip) {
      onUpdateTrip({ ...activeTrip, status: 'completed', endTime: new Date().toISOString() });
    }
  };

  const confirmDelivery = (stopIdx: number) => {
    if (!activeTrip) return;
    const stop = activeTrip.stops[stopIdx];
    if (!stop || stop.isDelivered) return;
    const newStops = [...activeTrip.stops];
    newStops[stopIdx] = { ...stop, isDelivered: true, deliveredAt: new Date().toISOString() };
    onUpdateTrip({ ...activeTrip, stops: newStops, deliveredKg: activeTrip.deliveredKg + stop.kg });
  };

  if (!activeTrip) {
    return (
      <div className="bg-white p-10 rounded-2xl border border-slate-200 text-center">
        <Navigation className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-sm font-bold text-slate-700">{isUrdu ? 'آپ کے لیے کوئی ٹرپ تفویض نہیں' : 'No trips assigned to you yet'}</p>
        <p className="text-xs text-slate-500 mt-1">{isUrdu ? 'مینجر سے رابطہ کریں' : 'Contact your manager to get a trip assigned.'}</p>
      </div>
    );
  }

  const doneStops = activeTrip.stops.filter((s) => s.isDelivered).length;

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* Trip selector */}
      {myTrips.length > 1 && (
        <select value={selectedTripId} onChange={(e) => setSelectedTripId(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold bg-white">
          {myTrips.map((t) => (
            <option key={t.id} value={t.id}>{t.tripNumber} ({t.plateNumber}) — {t.status}</option>
          ))}
        </select>
      )}

      {/* Status card */}
      <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono font-black text-xl">{activeTrip.plateNumber}</p>
            <p className="text-xs text-slate-400">{activeTrip.tripNumber} • {doneStops}/{activeTrip.stops.length} {isUrdu ? 'اسٹاپس مکمل' : 'stops done'}</p>
          </div>
          <span className={`text-[11px] font-bold px-3 py-1 rounded-full ${broadcasting ? 'bg-emerald-500/20 text-emerald-400 animate-pulse' : 'bg-slate-800 text-slate-400'}`}>
            {broadcasting ? (isUrdu ? '● لائیو GPS جاری' : '● LIVE GPS ON') : activeTrip.status.toUpperCase()}
          </span>
        </div>

        {/* Live stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-slate-800 rounded-xl p-3">
            <Gauge className="w-4 h-4 text-slate-400 mx-auto mb-1" />
            <p className="font-mono font-bold text-lg">{speed}</p>
            <p className="text-[10px] text-slate-400">km/h</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-3">
            <Package className="w-4 h-4 text-slate-400 mx-auto mb-1" />
            <p className="font-mono font-bold text-lg">{activeTrip.totalLoadKg - activeTrip.deliveredKg}</p>
            <p className="text-[10px] text-slate-400">{isUrdu ? 'کلو باقی' : 'kg left'}</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-3">
            <Radio className="w-4 h-4 text-slate-400 mx-auto mb-1" />
            <p className="font-mono font-bold text-sm">{lastPing || '—'}</p>
            <p className="text-[10px] text-slate-400">{isUrdu ? 'آخری پنگ' : 'last ping'}</p>
          </div>
        </div>

        {pingError && (
          <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg p-2">{pingError}</p>
        )}

        {/* Start / Stop */}
        {!broadcasting ? (
          <button onClick={startBroadcast} disabled={activeTrip.status === 'completed'}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-lg">
            <Play className="w-5 h-5" />
            {isUrdu ? 'ٹرپ شروع کریں + لائیو لوکیشن آن کریں' : 'Start Trip + Live Location'}
          </button>
        ) : (
          <button onClick={stopBroadcast}
            className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2">
            <Square className="w-5 h-5" />
            {isUrdu ? 'ٹرپ مکمل کریں (GPS بند)' : 'Complete Trip (GPS Off)'}
          </button>
        )}
        <p className="text-[10px] text-slate-500 text-center">
          {isUrdu
            ? 'لوکیشن ہر 10 سیکنڈ بعد خودکار بھیجی جاتی ہے — بیٹری بچانے کے لیے وقفہ رکھا گیا ہے۔'
            : 'Location auto-broadcasts every 10 seconds to save battery.'}
        </p>
      </div>

      {/* Delivery checklist */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-emerald-600" />
          {isUrdu ? 'ڈلیوری اسٹاپس' : 'Delivery Stops'}
        </h3>
        {activeTrip.stops.map((stop, idx) => (
          <div key={idx} className={`p-3 rounded-xl border flex items-center justify-between ${stop.isDelivered ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
            <div>
              <p className="font-bold text-sm text-slate-800">{idx + 1}. {stop.customerName}</p>
              <p className="text-xs text-slate-500 font-mono">{stop.kg} kg {stop.deliveredAt ? `• ${new Date(stop.deliveredAt).toLocaleTimeString()}` : ''}</p>
            </div>
            {stop.isDelivered ? (
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-bold">
                <CheckCircle2 className="w-5 h-5" /> {isUrdu ? 'پہنچ گیا' : 'Delivered'}
              </span>
            ) : (
              <button onClick={() => confirmDelivery(idx)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold">
                {isUrdu ? 'ڈیلیور کر دیا' : 'Mark Delivered'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
