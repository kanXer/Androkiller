import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, ExternalLink, Globe, Layers, Eye } from 'lucide-react';

// Fix default Leaflet icon paths in Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export default function GpsMap({ locations = [], currentDevice }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const accuracyCircleRef = useRef(null);
  const polylineRef = useRef(null);
  const [mapMode, setMapMode] = useState('LEAFLET'); // 'LEAFLET' or 'OSM_EMBED'

  const latestLocation = locations[0] || null;
  const lat = latestLocation?.latitude || 26.77788;
  const lng = latestLocation?.longitude || 83.37018;

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (mapMode !== 'LEAFLET' || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [lat, lng],
        zoom: 16,
        zoomControl: true,
        scrollWheelZoom: true,
        touchZoom: true
      });

      // 100% Free Official OpenStreetMap Tiles (Zero API key required)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    if (lat && lng) {
      if (!markerRef.current) {
        const customIcon = L.divIcon({
          className: 'custom-tracker-pin',
          html: `<div style="
            width: 24px;
            height: 24px;
            background: #00E5FF;
            border: 3px solid #FFFFFF;
            border-radius: 50%;
            box-shadow: 0 0 16px #00E5FF, 0 0 6px rgba(0,0,0,0.5);
            animation: pulse-ring 2s infinite;
          "></div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        markerRef.current = L.marker([lat, lng], { icon: customIcon }).addTo(map);
      } else {
        markerRef.current.setLatLng([lat, lng]);
      }

      markerRef.current.bindPopup(`
        <div style="font-family: sans-serif; font-size: 13px; line-height: 1.5; color: #1e293b;">
          <strong style="color: #0284c7;">📍 ${currentDevice?.deviceName || 'Child Device'}</strong><br/>
          <b>Lat:</b> ${lat.toFixed(6)}<br/>
          <b>Lng:</b> ${lng.toFixed(6)}<br/>
          <b>Accuracy:</b> ±${(latestLocation?.accuracy || 0).toFixed(1)} m<br/>
          <b>Speed:</b> ${(latestLocation?.speed || 0).toFixed(1)} m/s
        </div>
      `);

      if (latestLocation?.accuracy) {
        if (!accuracyCircleRef.current) {
          accuracyCircleRef.current = L.circle([lat, lng], {
            radius: latestLocation.accuracy,
            color: '#00E5FF',
            fillColor: '#00E5FF',
            fillOpacity: 0.15,
            weight: 1.5
          }).addTo(map);
        } else {
          accuracyCircleRef.current.setLatLng([lat, lng]);
          accuracyCircleRef.current.setRadius(latestLocation.accuracy);
        }
      }

      const trailPoints = locations
        .filter(loc => loc.latitude && loc.longitude)
        .map(loc => [loc.latitude, loc.longitude]);

      if (trailPoints.length > 1) {
        if (!polylineRef.current) {
          polylineRef.current = L.polyline(trailPoints, {
            color: '#38bdf8',
            weight: 3,
            opacity: 0.8,
            dashArray: '6, 6'
          }).addTo(map);
        } else {
          polylineRef.current.setLatLngs(trailPoints);
        }
      }

      map.setView([lat, lng], map.getZoom());
    }

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => clearTimeout(timer);
  }, [locations, currentDevice, mapMode, lat, lng]);

  const recenterMap = () => {
    if (mapInstanceRef.current && lat && lng) {
      mapInstanceRef.current.setView([lat, lng], 16);
      markerRef.current?.openPopup();
    }
  };

  // Free OpenStreetMap embed URL (100% Free, Zero API Key)
  const delta = 0.006;
  const osmEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - delta}%2C${lat - delta}%2C${lng + delta}%2C${lat + delta}&layer=mapnik&marker=${lat}%2C${lng}`;

  return (
    <div className="relative w-full h-[340px] sm:h-[420px] lg:h-[480px] rounded-xl sm:rounded-2xl overflow-hidden border border-slate-800 shadow-xl bg-slate-900 flex flex-col">
      {/* Map Control Bar Top */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Telemetry coordinate pill */}
        <div className="bg-slate-900/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-cyan-500/40 text-[11px] sm:text-xs text-slate-200 shadow-xl flex items-center space-x-2 pointer-events-auto">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0"></span>
          <span className="font-mono">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </span>
          <span className="text-slate-400 text-[10px]">±{latestLocation?.accuracy?.toFixed(1) || '0'}m</span>
        </div>

        {/* View toggles and 100% Free indicator */}
        <div className="flex items-center space-x-1.5 bg-slate-900/95 backdrop-blur-md p-1 rounded-xl border border-slate-700 shadow-xl pointer-events-auto">
          <button
            onClick={() => setMapMode('LEAFLET')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center space-x-1 ${
              mapMode === 'LEAFLET' ? 'bg-cyan-500 text-black font-bold' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>Interactive Map</span>
          </button>

          <button
            onClick={() => setMapMode('OSM_EMBED')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center space-x-1 ${
              mapMode === 'OSM_EMBED' ? 'bg-cyan-500 text-black font-bold' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Globe className="w-3 h-3" />
            <span>OSM Free Embed</span>
          </button>

          {mapMode === 'LEAFLET' && (
            <button
              onClick={recenterMap}
              className="p-1 rounded-lg text-slate-300 hover:text-cyan-400 hover:bg-slate-800 transition-colors"
              title="Recenter Map"
            >
              <Navigation className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Map Content: Either Leaflet or Direct OSM Iframe Embed */}
      {mapMode === 'LEAFLET' ? (
        <div ref={mapContainerRef} className="w-full h-full" />
      ) : (
        <div className="w-full h-full pt-12 bg-slate-950 flex flex-col">
          <iframe
            title="OpenStreetMap Free Embed"
            src={osmEmbedUrl}
            className="w-full h-full border-0"
            loading="lazy"
          />
        </div>
      )}

      {/* External Map Navigation Links Bottom Right */}
      <div className="absolute bottom-3 right-3 z-[1000] flex items-center space-x-1.5">
        <a
          href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-[10px] sm:text-[11px] font-mono text-cyan-400 transition-colors shadow-lg"
        >
          <span>OpenStreetMap (Free)</span>
          <ExternalLink className="w-3 h-3 ml-0.5" />
        </a>

        <a
          href={`https://www.google.com/maps?q=${lat},${lng}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-[10px] sm:text-[11px] font-mono text-emerald-400 transition-colors shadow-lg"
        >
          <span>Google Maps</span>
          <ExternalLink className="w-3 h-3 ml-0.5" />
        </a>
      </div>
    </div>
  );
}
