import React, { useState, useEffect, useRef } from 'react';
import { Vehicle, Trip, UserRole } from '../../types';
import { formatPKR } from '../../utils/calculations';
import { 
  Truck, 
  MapPin, 
  Navigation, 
  Play, 
  Square, 
  CheckCircle2, 
  Fuel, 
  Gauge, 
  BatteryMedium, 
  Radio, 
  RotateCcw,
  User,
  Clock
} from 'lucide-react';
import L from 'leaflet';

interface FleetViewProps {
  vehicles: Vehicle[];
  trips: Trip[];
  currentRole: UserRole;
  language: 'en' | 'ur';
  onUpdateTrip: (trip: Trip) => void;
}

export const FleetView: React.FC<FleetViewProps> = ({
  vehicles,
  trips,
  currentRole,
  language,
  onUpdateTrip
}) => {
  const isUrdu = language === 'ur';
  const [selectedTripId, setSelectedTripId] = useState<string>(trips[0]?.id || '');
  const activeTrip = trips.find((t) => t.id === selectedTripId) || trips[0];

  const [isDriverTracking, setIsDriverTracking] = useState<boolean>(activeTrip?.status === 'ongoing');
  const [driverSpeed, setDriverSpeed] = useState<number>(38); // km/h
  const [batteryLevel, setBatteryLevel] = useState<number>(84);
  const [geoNotice, setGeoNotice] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const pathPolylineRef = useRef<L.Polyline | null>(null);

  // Initialize or update Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (!activeTrip) return;

    const lat = activeTrip ? activeTrip.currentLat : 31.5204;
    const lng = activeTrip ? activeTrip.currentLng : 74.3587;

    if (!leafletMapRef.current) {
      const map = L.map(mapContainerRef.current).setView([lat, lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(map);

      // Custom Truck Icon
      const truckIcon = L.divIcon({
        className: 'custom-truck-pin',
        html: `<div style="background-color: #166534; color: white; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.4); border: 2px solid #ffffff;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18.5" r="2.5"/><circle cx="7" cy="18.5" r="2.5"/></svg>
               </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      const marker = L.marker([lat, lng], { icon: truckIcon }).addTo(map);
      if (activeTrip) {
        marker.bindPopup(`<b>${activeTrip.plateNumber}</b><br/>Driver: ${activeTrip.driverName}<br/>Trip: ${activeTrip.tripNumber}`);
      }

      const polyline = L.polyline(activeTrip?.path ?? [], { color: '#059669', weight: 4, opacity: 0.8 }).addTo(map);

      // Stop pins
      activeTrip.stops.forEach((stop, idx) => {
        const stopIcon = L.divIcon({
          className: 'stop-pin',
          html: `<div style="background-color: ${stop.isDelivered ? '#10b981' : '#f59e0b'}; color: white; border-radius: 12px; padding: 2px 6px; font-size: 10px; font-weight: bold; border: 1px solid white;">
                  ${idx + 1}. ${stop.kg}kg
                 </div>`,
          iconSize: [40, 20],
          iconAnchor: [20, 10]
        });
        // slightly jitter position for demo visualization around Lahore
        const stopLat = lat + (idx === 0 ? -0.015 : idx === 1 ? 0.012 : idx === 2 ? -0.008 : 0.02);
        const stopLng = lng + (idx === 0 ? 0.018 : idx === 1 ? -0.015 : idx === 2 ? -0.02 : 0.015);
        L.marker([stopLat, stopLng], { icon: stopIcon })
          .addTo(map)
          .bindPopup(`<b>${stop.customerName}</b><br/>Required: ${stop.kg} kg<br/>Status: ${stop.isDelivered ? 'Delivered' : 'Pending'}`);
      });

      leafletMapRef.current = map;
      markerRef.current = marker;
      pathPolylineRef.current = polyline;
    } else {
      leafletMapRef.current.setView([lat, lng], 13);
      if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
      if (pathPolylineRef.current) pathPolylineRef.current.setLatLngs(activeTrip.path);
    }
  }, [activeTrip]);

  // GPS Simulation or Real Geolocation Ping
  const handleSendPing = () => {
    if (!activeTrip) return;

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          updatePosition(pos.coords.latitude, pos.coords.longitude, pos.coords.speed || 35);
          setGeoNotice(isUrdu ? 'اصلی جی پی ایس کوآرڈینیٹس موصول ہوئے!' : 'Received real phone GPS coordinates!');
          setTimeout(() => setGeoNotice(null), 4000);
        },
        (err) => {
          // Fallback simulation move along Lahore corridor
          simulateNextPing();
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      simulateNextPing();
    }
  };

  const simulateNextPing = () => {
    const latDelta = (Math.random() - 0.4) * 0.003;
    const lngDelta = (Math.random() - 0.4) * 0.003;
    const newLat = activeTrip.currentLat + latDelta;
    const newLng = activeTrip.currentLng + lngDelta;
    const newSpeed = Math.floor(30 + Math.random() * 25);
    updatePosition(newLat, newLng, newSpeed);
    setGeoNotice(isUrdu ? 'گاڑی کی نئی لائیو لوکیشن اپ ڈیٹ ہوگئی' : 'Vehicle live coordinates simulated on route');
    setTimeout(() => setGeoNotice(null), 4000);
  };

  const updatePosition = (lat: number, lng: number, speed: number) => {
    setDriverSpeed(speed);
    const updatedPath: [number, number][] = [...activeTrip.path, [lat, lng]];
    const updatedTrip: Trip = {
      ...activeTrip,
      currentLat: lat,
      currentLng: lng,
      path: updatedPath
    };
    onUpdateTrip(updatedTrip);

    if (leafletMapRef.current && markerRef.current && pathPolylineRef.current) {
      markerRef.current.setLatLng([lat, lng]);
      pathPolylineRef.current.setLatLngs(updatedPath);
      leafletMapRef.current.panTo([lat, lng]);
    }
  };

  const handleStartTrip = () => {
    const updated: Trip = {
      ...activeTrip,
      status: 'ongoing',
      startTime: new Date().toISOString()
    };
    onUpdateTrip(updated);
    setIsDriverTracking(true);
  };

  const handleEndTrip = () => {
    const updated: Trip = {
      ...activeTrip,
      status: 'completed',
      endTime: new Date().toISOString()
    };
    onUpdateTrip(updated);
    setIsDriverTracking(false);
  };

  const handleConfirmStopDelivery = (stopIdx: number) => {
    const stop = activeTrip.stops[stopIdx];
    if (!stop || stop.isDelivered) return;

    const newStops = [...activeTrip.stops];
    newStops[stopIdx] = {
      ...stop,
      isDelivered: true,
      deliveredAt: new Date().toISOString()
    };

    const newDeliveredKg = activeTrip.deliveredKg + stop.kg;

    const updated: Trip = {
      ...activeTrip,
      stops: newStops,
      deliveredKg: newDeliveredKg
    };
    onUpdateTrip(updated);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Truck className="w-6 h-6 text-emerald-600" />
            <span>{isUrdu ? 'گاڑیاں، لائیو ٹریکنگ و ڈلیوری مانیٹرنگ' : 'Fleet Management & Live GPS Tracking'}</span>
          </h2>
          <p className="text-xs text-slate-500">
            {isUrdu 
              ? 'ڈرائیور فون سے لوکیشن براڈکاسٹ کرتا ہے اور ایڈمن بغیر کسی بامعاوضہ API کے لائیو نقشے پر دیکھ سکتا ہے۔' 
              : 'Zero-cost OpenStreetMap + Leaflet live vehicle tracking with battery throttle & offline resilience.'}
          </p>
        </div>

        {/* Trip Selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-700">
            {isUrdu ? 'فعال ٹرپ:' : 'Active Trip:'}
          </label>
          <select
            value={selectedTripId}
            onChange={(e) => setSelectedTripId(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white"
          >
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.tripNumber} ({t.plateNumber}) - {t.driverName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {geoNotice && (
        <div className="p-3 bg-emerald-600 text-white rounded-xl text-xs font-medium flex items-center gap-2 animate-in fade-in">
          <Radio className="w-4 h-4 animate-pulse" />
          <span>{geoNotice}</span>
        </div>
      )}

      {/* Grid: Live Map Left (7 cols), Driver Mobile Console Right (5 cols) */}
      {activeTrip ? (
      <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Leaflet Map Card (Cols 7) */}
        <div className="lg:col-span-7 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <span className="text-xs font-bold text-slate-800">
                {activeTrip ? `${activeTrip.plateNumber} (${activeTrip.driverName})` : isUrdu ? 'کوئی ٹرپ نہیں' : 'No trips yet'}
              </span>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full uppercase">
                {activeTrip.status}
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-600 font-mono">
              <span className="flex items-center gap-1">
                <Gauge className="w-3.5 h-3.5 text-slate-400" />
                {driverSpeed} km/h
              </span>
              <span className="flex items-center gap-1">
                <BatteryMedium className="w-3.5 h-3.5 text-emerald-500" />
                {batteryLevel}%
              </span>
            </div>
          </div>

          {/* Leaflet Map Div */}
          <div 
            ref={mapContainerRef} 
            className="h-[420px] w-full rounded-xl overflow-hidden border border-slate-200 shadow-inner z-0" 
          />

          {/* Trip Load Summary Bar */}
          <div className="grid grid-cols-3 gap-2 pt-1 text-center text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 block uppercase font-bold">{isUrdu ? 'کل لوڈ' : 'Total Load'}</span>
              <span className="font-mono font-bold text-slate-900 text-sm">{activeTrip.totalLoadKg} kg</span>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
              <span className="text-[10px] text-emerald-700 block uppercase font-bold">{isUrdu ? 'ڈیلیور شدہ' : 'Delivered'}</span>
              <span className="font-mono font-bold text-emerald-800 text-sm">{activeTrip.deliveredKg} kg</span>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
              <span className="text-[10px] text-amber-700 block uppercase font-bold">{isUrdu ? 'بقایا لوڈ' : 'Remaining'}</span>
              <span className="font-mono font-bold text-amber-900 text-sm">
                {activeTrip.totalLoadKg - activeTrip.deliveredKg} kg
              </span>
            </div>
          </div>
        </div>

        {/* Driver Phone Console & Stops (Cols 5) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Driver PWA Action Console Box */}
          <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-xl border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {isUrdu ? 'ڈرائیور موبائل پینل' : 'Driver Mobile Console (PWA)'}
                  </h3>
                  <p className="text-[10px] text-slate-400">{activeTrip ? `${activeTrip.driverName} — ${activeTrip.plateNumber}` : ''}</p>
                </div>
              </div>

              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                isDriverTracking ? 'bg-emerald-500/20 text-emerald-400 animate-pulse' : 'bg-slate-800 text-slate-400'
              }`}>
                {isDriverTracking ? '● GPS BROADCAST ON' : 'OFFLINE'}
              </span>
            </div>

            {/* Trip Control Buttons */}
            <div className="grid grid-cols-2 gap-2">
              {!isDriverTracking ? (
                <button
                  onClick={handleStartTrip}
                  className="col-span-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition"
                >
                  <Play className="w-4 h-4" />
                  <span>{isUrdu ? 'ٹرپ شروع کریں (Start Trip)' : 'Start Trip & GPS Broadcast'}</span>
                </button>
              ) : (
                <>
                  <button
                    onClick={handleSendPing}
                    className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition"
                  >
                    <Radio className="w-3.5 h-3.5 animate-pulse" />
                    <span>{isUrdu ? 'لوکیشن پنگ بھیجیں' : 'Send GPS Ping'}</span>
                  </button>

                  <button
                    onClick={handleEndTrip}
                    className="py-2.5 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>{isUrdu ? 'ٹرپ ختم کریں' : 'End Trip'}</span>
                  </button>
                </>
              )}
            </div>

            {/* Stops Checklist */}
            <div className="space-y-2 pt-2">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
                {isUrdu ? 'ڈلیوری اسٹاپس و رسید تصدیق:' : 'Delivery Stops & Shop Receipts:'}
              </span>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {activeTrip.stops.map((stop, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border flex items-center justify-between transition ${
                      stop.isDelivered 
                        ? 'bg-slate-800/50 border-emerald-500/40 text-slate-300' 
                        : 'bg-slate-800 border-slate-700 text-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <span className="w-4 h-4 rounded-full bg-slate-700 text-slate-300 text-[10px] flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span>{stop.customerName}</span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono block ml-5">
                        {stop.kg} kg مال
                      </span>
                    </div>

                    <div>
                      {stop.isDelivered ? (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-bold">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{isUrdu ? 'پہنچ گیا' : 'Delivered'}</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleConfirmStopDelivery(idx)}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold transition shadow-sm"
                        >
                          {isUrdu ? 'مال دیا (Confirm)' : 'Delivered'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      </>) : (
        <div className="bg-white p-10 rounded-2xl border border-slate-200 shadow-sm text-center">
          <Truck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700">
            {isUrdu ? 'کوئی ڈلیوری ٹرپ نہیں ہے' : 'No delivery trips yet'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {isUrdu
              ? 'آرڈرز سے پہلا ٹرپ بنائیں تاکہ لائیو ٹریکنگ شروع ہو۔'
              : 'Create your first trip from Orders to start live tracking.'}
          </p>
        </div>
      )}
    </div>
  );
};
