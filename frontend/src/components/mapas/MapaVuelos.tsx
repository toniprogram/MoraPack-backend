import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Tooltip, useMapEvents, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useRef, useState, useMemo } from 'react';
import type { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Airport } from '../../types/airport';
import { FlightsList } from '../simulacion/FlightsList';
import type { ActiveAirportTick } from '../../types/simulation';
import { OrdersList, type OrderLoadView } from '../simulacion/OrdersList';
import type { SegmentoVuelo, VueloEnMovimiento } from '../../hooks/useSimulacion';
import { Plane, Building } from 'lucide-react';

const getStatusColor = (pct: number) => {
  if (pct === 0) return '#22c55e';
  if (pct < 10) return '#22c55e'; // Verde (Ok)
  if (pct < 20) return '#eab308'; // Amarillo (Advertencia)
  if (pct <= 30) return '#ef4444'; // Rojo (Crítico/Lleno)
  return '#22c55e';
};
const getAirportIcon = (pct: number, forPopup = false, lat?: number, northBound?: number) => {
  const color = getStatusColor(pct);
  const animId = `airport-${Math.random().toString(36).substr(2, 9)}`;
  const size = forPopup ? 20 : 20;
  const iconSize = forPopup ? 12 : 12;
  const nearTop = lat !== undefined ? lat > 10 : false; // 10° al sur del ecuador
  const anchorY = size; // ancla siempre abajo, solo movemos el offset
  const popupY = nearTop ? 295 : -30;


  return L.divIcon({
    className: 'bg-transparent border-none',
    html: `
      <style>
        @keyframes ${animId}-subtle {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-2px); }
        }
      </style>

      <div style="
        background: linear-gradient(135deg, ${color} 0%, ${color} 100%);
        width: ${size}px;
        height: ${size}px;
        border-radius: 5px;
        border: 2px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.4),
                    0 1px 2px rgba(0,0,0,0.2),
                    inset 0 1px 0 rgba(255,255,255,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s ease;
        position: relative;
      " onmouseover="this.style.transform='scale(1.15)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.5)'"
         onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 2px 6px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.3)'">

        <svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0px 1px 2px rgba(0,0,0,0.5));">
          <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
        </svg>

        <div style="
          position: absolute;
          top: -2px;
          right: -2px;
          width: 6px;
          height: 6px;
          background-color: white;
          border-radius: 50%;
          border: 1px solid ${color};
          box-shadow: 0 1px 2px rgba(0,0,0,0.4);
        "></div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, anchorY],
    popupAnchor: [0, popupY],
  });
};

const getHubIcon = (pct: number, hubHex?: string, forPopup = false, lat?: number, northBound?: number) => {
  const fallback = getStatusColor(pct);
  const colorHex = hubHex ?? fallback;
  const animId = `pulse-${Math.random().toString(36).substr(2, 9)}`;
  const outerSize = forPopup ? 32 : 32;
  const innerSize = forPopup ? 18 : 34;
  const iconSize = forPopup ? 18 : 22;
  const borderWidth = forPopup ? 2 : 3;
  const nearTop = lat !== undefined ? lat > -10 : false; // 10° al NORTE del ecuador
  const anchorY = 10; // ancla fija abajo, solo cambia offset
  const popupY = nearTop ? 170 : -25;

  if (forPopup) {
    return `
      <div style="position: relative; width: ${outerSize}px; height: ${outerSize}px; display: inline-block;">
        <div style="
          position: absolute;
          top: 0;
          left: 0;
          width: ${outerSize}px;
          height: ${outerSize}px;
          border-radius: 50%;
          border: 2px dashed ${colorHex};
          opacity: 0.5;
        "></div>
        <div style="
          position: absolute;
          top: ${(outerSize - innerSize) / 2}px;
          left: ${(outerSize - innerSize) / 2}px;
          background: ${colorHex};
          width: ${innerSize}px;
          height: ${innerSize}px;
          border-radius: 50%;
          border: ${borderWidth}px solid ${colorHex};
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 12px ${colorHex}99;
        ">
          <svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0px 1px 3px rgba(0,0,0,0.7));">
            <path d="M4 16h16"/>
            <path d="M4 20h16"/>
            <path d="M8 12h8l-2-8H10l-2 8Z"/>
            <circle cx="12" cy="2" r="1.5" fill="${colorHex}"/>
            <path d="M17.8 19.2 16 11l3.5-3.5" opacity="0.8"/>
            <path d="M6.2 19.2 8 11 4.5 7.5" opacity="0.8"/>
          </svg>
        </div>
      </div>
    `;
  }

  return L.divIcon({
    className: 'bg-transparent border-none',
    html: `
      <style>
        @keyframes ${animId} {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 16px ${colorHex}cc,
                        0 0 32px ${colorHex}66,
                        inset 0 0 12px rgba(0,0,0,0.2);
          }
          50% {
            transform: scale(1.08);
            box-shadow: 0 0 24px ${colorHex},
                        0 0 48px ${colorHex}99,
                        inset 0 0 12px rgba(0,0,0,0.2);
          }
        }

        @keyframes ${animId}-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      </style>

      <div style="position: relative; width: ${outerSize}px; height: ${outerSize}px;">
        <div style="
          position: absolute;
          top: 0;
          left: 0;
          width: ${outerSize}px;
          height: ${outerSize}px;
          border-radius: 50%;
          border: 2.5px dashed ${colorHex};
          opacity: 0.6;
          animation: ${animId}-rotate 8s linear infinite;
        "></div>

        <div style="
          position: absolute;
          top: ${(outerSize - innerSize) / 2}px;
          left: ${(outerSize - innerSize) / 2}px;
          background: ${colorHex};
          width: ${innerSize}px;
          height: ${innerSize}px;
          border-radius: 50%;
          border: ${borderWidth}px solid ${colorHex};
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: ${animId} 2.5s ease-in-out infinite;
        ">
          <svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.7));">
            <path d="M4 16h16"/>
            <path d="M4 20h16"/>
            <path d="M8 12h8l-2-8H10l-2 8Z"/>
            <circle cx="12" cy="2" r="1.5" fill="${colorHex}"/>
            <path d="M17.8 19.2 16 11l3.5-3.5" opacity="0.8"/>
            <path d="M6.2 19.2 8 11 4.5 7.5" opacity="0.8"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [outerSize, outerSize],
    iconAnchor: [outerSize / 2, anchorY],
    popupAnchor: [0, popupY],
  });
};
// Fix básico de Leaflet
const iconProto = L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown };
delete iconProto._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function MapResizer({ isLoading }: { isLoading: boolean }) {
  const map = useMap();
  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    const container = map.getContainer();
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [map]);

  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => map.invalidateSize(), 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading, map]);
  return null;
}

function MapClickReset({ onClear }: { onClear?: () => void }) {
  useMapEvents({
    click: () => onClear?.(),
  });
  return null;
}

const isMainHub = (code: string) => {
  const c = code ? code.toUpperCase() : '';
  return ['SPIM','UBBB','EBCI'].includes(c);
};

const getHubColor = (originCode: string) => {
  const code = originCode ? originCode.toUpperCase() : '';
  // Colores diferenciados del semáforo (verde/amarillo/rojo) para evitar confusión visual.
  if (code === 'SPIM' || code === 'LIM') return { hex: '#22d3ee', twClass: 'text-sky-400' };   // Celeste
  if (code === 'UBBB' || code === 'GYD') return { hex: '#fb923c', twClass: 'text-orange-400' }; // Naranja
  if (code === 'EBCI' || code === 'BRU' || code === 'CRL') return { hex: '#f472b6', twClass: 'text-pink-400' }; // Rosado
  return { hex: '#a6adbb', twClass: 'text-base-content' };
};

const getLoadColor = (pct: number) => {
  if (pct >= 20) return { hex: '#ef4444', twClass: 'text-error' };   // Rojo (Crítico/Lleno)
  if (pct >= 10) return { hex: '#eab308', twClass: 'text-warning' }; // Amarillo (Llenándose)
  return { hex: '#22c55e', twClass: 'text-success' };                // Verde (Ok)
};

const PLANE_SIZE = 20; // tamaño visual del avión (reducido)
const PLANE_HITBOX = 40; // área clickeable (no visible) más grande
const PLANE_CENTER = PLANE_HITBOX / 2;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

const haversine = (a: [number, number], b: [number, number]) => {
  const R = 6371e3; // metros
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
};

const bearingBetween = (from: [number, number], to: [number, number]) => {
  const lat1 = toRad(from[0]);
  const lat2 = toRad(to[0]);
  const dLon = toRad(to[1] - from[1]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const brng = Math.atan2(y, x);
  return (toDeg(brng) + 360) % 360;
};

// Devuelve una lista de puntos siguiendo el arco de gran círculo entre dos coordenadas [lat, lon]
const greatCirclePath = (from: [number, number], to: [number, number], steps = 64): [number, number][] => {
  const [lat1, lon1] = from.map(toRad);
  const [lat2, lon2] = to.map(toRad);

  const delta = 2 * Math.asin(Math.sqrt(
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
  ));

  if (!Number.isFinite(delta) || delta === 0) {
    return [from, to];
  }

  const path: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * delta) / Math.sin(delta);
    const B = Math.sin(f * delta) / Math.sin(delta);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lon = Math.atan2(y, x);
    path.push([toDeg(lat), toDeg(lon)]);
  }
  return path;
};
// Cacheamos rutas por origen-destino para no recalcular en cada render
const pathCache = new Map<string, [number, number][]>();
const getCachedPath = (from: [number, number], to: [number, number], steps = 64) => {
  const key = `${from[0]},${from[1]}|${to[0]},${to[1]}|${steps}`;
  const cached = pathCache.get(key);
  if (cached) return cached;
  const path = greatCirclePath(from, to, steps);
  pathCache.set(key, path);
  return path;
};

// Devuelve posición y rumbo aproximados sobre el arco, según porcentaje de progreso (0-100)
const positionAlongPath = (path: [number, number][], progress: number) => {
  if (!path.length) {
    return { coord: [0, 0] as [number, number], bearing: 0 };
  }
  if (path.length === 1) {
    return { coord: path[0], bearing: 0 };
  }
  const target = Math.max(0, Math.min(100, progress)) / 100;
  const segLengths: number[] = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const len = haversine(path[i], path[i + 1]);
    segLengths.push(len);
    total += len;
  }
  let dist = total * target;
  for (let i = 0; i < segLengths.length; i++) {
    if (dist <= segLengths[i]) {
      const f = segLengths[i] === 0 ? 0 : dist / segLengths[i];
      const p1 = path[i];
      const p2 = path[i + 1];
      const lat = p1[0] + (p2[0] - p1[0]) * f;
      const lon = p1[1] + (p2[1] - p1[1]) * f;
      return { coord: [lat, lon] as [number, number], bearing: bearingBetween(p1, p2) };
    }
    dist -= segLengths[i];
  }
  const last = path[path.length - 1];
  const prev = path[path.length - 2];
  return { coord: last, bearing: bearingBetween(prev, last) };
};

// Devuelve la porción restante del camino a partir del progreso (0-100).
const getRemainingPath = (path: [number, number][], progress: number): [number, number][] => {
  if (!path || path.length === 0) return [];
  if (path.length === 1) return path;
  const target = Math.max(0, Math.min(100, progress)) / 100;
  const segLengths: number[] = [];
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const len = haversine(path[i], path[i + 1]);
    segLengths.push(len);
    total += len;
  }
  if (total === 0) return path;
  let dist = total * target;
  for (let i = 0; i < segLengths.length; i++) {
    if (dist <= segLengths[i]) {
      const f = segLengths[i] === 0 ? 0 : dist / segLengths[i];
      const p1 = path[i];
      const p2 = path[i + 1];
      const lat = p1[0] + (p2[0] - p1[0]) * f;
      const lon = p1[1] + (p2[1] - p1[1]) * f;
      const current: [number, number] = [lat, lon];
      return [current, ...path.slice(i + 1)];
    }
    dist -= segLengths[i];
  }
  // Si el progreso es 100% o más, no queda camino
  return [];
};

const getPlaneIcon = (_originCode: string, rotation: number, capacityPct: number) => {
  const { hex } = getLoadColor(capacityPct);
  const html = `
    <div style="
      width: ${PLANE_HITBOX}px;
      height: ${PLANE_HITBOX}px;
      position: relative;
      cursor: pointer;
    ">
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(${rotation}deg);
        transform-origin: center center;
        transition: transform 150ms linear;
        will-change: transform;
        width: ${PLANE_SIZE}px;
        height: ${PLANE_SIZE}px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="${PLANE_SIZE}" height="${PLANE_SIZE}" viewBox="0 0 1024 1024" fill="${hex}" stroke="${hex}" style="display:block; filter: drop-shadow(0px 2px 2px rgba(0,0,0,0.5)); pointer-events:none;">
          <path d="M597.333333 381.738667L938.666667 597.333333v85.333334l-341.333334-107.776v228.693333l128 71.082667V938.666667l-192-42.666667L341.333333 938.666667v-64l128-71.125334v-228.693333L128 682.666667v-85.333334l341.333333-215.594666V149.333333a64 64 0 0 1 128 0v232.405334z" />
        </svg>
      </div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'bg-transparent border-none',
    iconSize: [PLANE_HITBOX, PLANE_HITBOX],
    iconAnchor: [PLANE_CENTER, PLANE_CENTER], // ancla al centro para alinear con la ruta
    popupAnchor: [0, 18], // desplaza solo el popup
  });
};

const formatDateTime = (isoDate: string) => {
    if(!isoDate) return '--/-- --:--';
    const d = new Date(isoDate);
    return d.toLocaleString('es-PE', {
        timeZone: 'UTC',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }) + ' UTC';
};

interface MapaVuelosProps {
  activeSegments: SegmentoVuelo[];
  aeropuertos: Airport[];
  isLoading: boolean;
  vuelosEnMovimiento: VueloEnMovimiento[];
  filtroHubActivo: string;
  activeAirports?: ActiveAirportTick[];
  onSelectOrders?: (orderIds: string[] | null) => void;
  selectedFlightId?: string | null;
  onSelectFlight?: (flightId: string | null) => void;
  selectedOrders?: string[] | null;
  selectedAirportIds?: string[] | null;
  onSelectAirport?: (airportId: string | null) => void;
}

export function MapaVuelos({
  activeSegments,
  aeropuertos,
  isLoading,
  vuelosEnMovimiento,
  filtroHubActivo,
  activeAirports = [],
  onSelectOrders,
  selectedFlightId,
  onSelectFlight,
  selectedOrders,
  selectedAirportIds,
  onSelectAirport,
}: MapaVuelosProps) {
  const initialPosition: LatLngExpression = [15, 0];
  const [mapTheme, setMapTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const resolveTheme = () => {
      const theme = (document.documentElement.getAttribute('data-theme') || '').toLowerCase();
      if (theme.includes('business') || theme.includes('dark')) {
        setMapTheme('dark');
      } else {
        setMapTheme('light');
      }
    };
    resolveTheme();
    const observer = new MutationObserver(resolveTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const coordsAeropuertos = new Map<string, [number, number]>(
    aeropuertos
      .filter((a) => typeof a.latitude === 'number' && typeof a.longitude === 'number')
      .map((a) => [a.id, [a.latitude, a.longitude]])
  );

  // Limitar el mapa al bounding box de aeropuertos para que Leaflet no considere espacio "extra" hacia arriba/abajo.
  const maxBounds = useMemo(() => {
    if (!aeropuertos.length) return null;
    const lats = aeropuertos.map(a => a.latitude).filter(n => typeof n === 'number');
    const lngs = aeropuertos.map(a => a.longitude).filter(n => typeof n === 'number');
    if (!lats.length || !lngs.length) return null;
    const padding = 5; // grados de margen
    const southWest: [number, number] = [Math.min(...lats) - padding, Math.min(...lngs) - padding];
    const northEast: [number, number] = [Math.max(...lats) + padding, Math.max(...lngs) + padding];
    return [southWest, northEast] as const;
  }, [aeropuertos]);
  const northBound = maxBounds ? maxBounds[1][0] : 90;
  const popupOffsetForLat = (lat: number): [number, number] => {
    const nearTop = lat > -10; // considerar todo lo que esté al norte del ecuador (margen de 10°)
    return nearTop ? [0, 260] : [0, 32];
  };
  const pathsPorSegmento = useRef(new Map<string, [number, number][]>());
  const segmentsMap = useMemo(() => {
    const m = new Map<string, SegmentoVuelo>();
    activeSegments.forEach(s => m.set(s.id, s));
    return m;
  }, [activeSegments]);

  const airportHighlights = useMemo(() => {
    const set = new Set<string>();
    if (selectedAirportIds && selectedAirportIds.length > 0) {
      selectedAirportIds.forEach(a => a && set.add(a));
      return set;
    }
    if (selectedOrders && selectedOrders.length > 0) {
      activeAirports.forEach(a => {
        const has = a.orderLoads?.some(ol => selectedOrders.includes(ol.orderId));
        if (has) set.add(a.airportCode);
      });
      return set;
    }
    if (selectedFlightId) {
      const seg = segmentsMap.get(selectedFlightId);
      if (seg?.origin) set.add(seg.origin);
      if (seg?.destination) set.add(seg.destination);
      return set;
    }
    return set;
  }, [selectedAirportIds, selectedOrders, selectedFlightId, activeAirports, segmentsMap]);

  return (
    <MapContainer
      center={initialPosition}
      zoom={3}
      minZoom={3}
      maxZoom={3}
      zoomControl={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      touchZoom={false}
      boxZoom={false}
      dragging={false}
      maxBounds={maxBounds || undefined}
      maxBoundsViscosity={1}
      className="w-full h-full z-0"
      style={{ backgroundColor: mapTheme === 'dark' ? '#1f2937' : '#e5e7eb' }}
    >
      {/* Sin controles de zoom ni wheel/pinch */}
      <MapClickReset onClear={() => { onSelectOrders?.(null); onSelectFlight?.(null); onSelectAirport?.(null); }} />
      {mapTheme === 'dark' ? (
        <TileLayer
          key="dark"
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap &copy; CARTO'
          noWrap={false}
        />
      ) : (
        <TileLayer
          key="light"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
          noWrap={false}
        />
      )}

      <MapResizer isLoading={isLoading} />

      {/* LEYENDA */}
      <div className="leaflet-bottom leaflet-left m-2 z-[200] pointer-events-auto">
        <div className="card compact bg-base-100/90 shadow-xl border border-base-content/10 text-[10px] p-2 backdrop-blur-sm w-36">
          <h4 className="font-bold mb-1 text-base-content uppercase tracking-wider border-b border-base-content/10 pb-1">
            Leyenda
          </h4>
          <ul className="space-y-2 font-semibold">
            <li className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-base-content/80 inline-block"></span>
              <span>Aeropuerto</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="h-[2px] w-3 border-t border-dashed border-info"></span>
              <span>Vuelo en progreso</span>
            </li>
            <li className="flex items-center gap-2">
              <Plane size={14} className="text-base-content" />
              <span>Avión</span>
            </li>
          </ul>
        </div>
      </div>

      {/* AEROPUERTOS */}
      {aeropuertos.slice(0, 50).map(aeropuerto => {
        const esSede = isMainHub(aeropuerto.id || aeropuerto.code || '');
        const live = activeAirports.find(a => a.airportCode === (aeropuerto.id || aeropuerto.code));
        const stockActual = live?.currentLoad ?? 0;
        const capacidadMax = live?.maxThroughputPerHour ?? aeropuerto.storageCapacity ?? 0;
        const targetInfinite = ['SPIM', 'LIM', 'EBCI', 'BRU', 'UBBB', 'GYD'];
        const isInfinite = targetInfinite.includes(aeropuerto.id) || targetInfinite.includes(aeropuerto.code);
        const stockPct = (isInfinite || capacidadMax === 0)
            ? 0
            : Math.min(100, Math.round((stockActual / capacidadMax) * 100));
        let statusColorClass = 'text-success';
        let progressClass = 'progress-success';
        if (!isInfinite) {
            if (stockPct >= 90) {
                statusColorClass = 'text-error';
                progressClass = 'progress-error';
            } else if (stockPct >= 70) {
                statusColorClass = 'text-warning';
                progressClass = 'progress-warning';
            }
        } else {
            statusColorClass = 'text-success';
            progressClass = 'progress-success';
        }
        return (
          <Marker
            key={aeropuerto.id}
            position={[aeropuerto.latitude, aeropuerto.longitude]}
            icon={esSede
              ? getHubIcon(stockPct, getHubColor(aeropuerto.id || aeropuerto.code || '').hex, false, aeropuerto.latitude, northBound)
              : getAirportIcon(stockPct, false, aeropuerto.latitude, northBound)
            }
            opacity={
              (!filtroHubActivo || filtroHubActivo === aeropuerto.id)
                ? (airportHighlights.size > 0 && !airportHighlights.has(aeropuerto.id || aeropuerto.code || '') ? 0.2 : 1.0)
                : 0.5
            }
            zIndexOffset={esSede ? 3000 : 2000}
            eventHandlers={{
              click: () => {
                const code = aeropuerto.id || aeropuerto.code || null;
                onSelectAirport?.(code);
                const loads = live?.orderLoads?.map(ol => ol.orderId) ?? [];
                if (loads.length) onSelectOrders?.(loads);
              }
            }}
          >
            {esSede && (
              <Tooltip
                permanent
                direction="bottom"
                offset={[0, 20]}
                className="bg-base-100 text-base-content border border-base-content/20 font-bold px-1.5 py-0.5 rounded shadow-md text-[10px] uppercase tracking-wide"
              >
                {aeropuerto.name}
              </Tooltip>
            )}

            {/* POPUP DETALLADO DE AEROPUERTO */}
            <Popup
              className="p-0 overflow-hidden rounded-xl thin-popup"
              minWidth={200}
              autoPan={false}
              autoPanOnFocus={false}
            >
              <div className="bg-base-100 text-base-content text-xs w-52 shadow-xl overflow-hidden">
                <div className="bg-base-200 p-2 border-b border-base-content/10 flex items-center gap-2">
                    <Building size={14} className="text-primary"/>
                    <div>
                        <div className="font-bold text-sm leading-none">{aeropuerto.id}</div>
                        <div className="text-[10px] opacity-60 truncate w-36">{aeropuerto.name}</div>
                    </div>
                </div>
                <div className="p-3 space-y-2">
                    {!isInfinite && (
                        <>
                            <div className="flex justify-between mb-1 text-[10px] font-semibold uppercase opacity-70">
                                <span>Almacén</span>
                                <span className={`font-mono ${statusColorClass}`}>
                                    {stockActual} / {capacidadMax}
                                </span>
                            </div>
                            <progress
                                className={`progress w-full h-2 ${progressClass}`}
                                value={stockActual}
                                max={capacidadMax || 1}
                            ></progress>

                            <div className={`font-mono text-right mt-1 text-[10px] ${statusColorClass}`}>
                                {stockPct}% Ocupado
                            </div>
                        </>
                    )}
                    {!isInfinite && (
                        <div className="border-t border-base-300 pt-2 mt-2">
                          <div className="text-[10px] font-semibold uppercase opacity-70 mb-1">Pedidos en almacén</div>
                          <OrdersList
                            items={(live?.orderLoads ?? []).map(ol => ({ orderId: ol.orderId, cantidad: ol.quantity }))}
                            selectedOrders={selectedOrders}
                            onSelectOrder={(oid) => {
                              onSelectOrders?.([oid]);
                              onSelectAirport?.(aeropuerto.id || aeropuerto.code || null);
                            }}
                          />
                        </div>
                    )}
                    <div className="border-t border-base-300 pt-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-semibold uppercase opacity-70">Vuelos Salientes</span>
                      </div>
                      <FlightsList
                        vuelos={activeSegments.filter(s => s.origin === (aeropuerto.id || aeropuerto.code))}
                        onSelectFlight={onSelectFlight}
                        onSelectOrders={onSelectOrders}
                      />
                    </div>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* RUTAS */}
      {activeSegments.map((segmento) => {
        const origenCoords = coordsAeropuertos.get(segmento.origin);
        const destinoCoords = coordsAeropuertos.get(segmento.destination);
        if (!origenCoords || !destinoCoords) return null;

        const { hex: colorHex } = getHubColor(segmento.origin);
        const hasOrderMatch = selectedOrders && selectedOrders.length > 0
          ? (segmento.orderLoads?.some(ol => selectedOrders.includes(ol.orderId)) ||
              segmento.orderIds?.some(id => selectedOrders.includes(id)))
          : true;
        const hasAirportMatch = selectedAirportIds && selectedAirportIds.length > 0
          ? selectedAirportIds.includes(segmento.origin) || selectedAirportIds.includes(segmento.destination)
          : true;
        const isSelected = selectedFlightId === segmento.id;
        const shouldHighlight = isSelected || (!selectedFlightId && hasOrderMatch && hasAirportMatch);
        const opacityBase = (filtroHubActivo && segmento.origin !== filtroHubActivo) ? 0.1 : 0.4;
        const dimmed = !shouldHighlight;
        const opacity = dimmed ? 0.1 : opacityBase;
          const path = getCachedPath([origenCoords[0], origenCoords[1]], [destinoCoords[0], destinoCoords[1]], 64);
          pathsPorSegmento.current.set(segmento.id, path);

          // Si existe un vuelo correspondiente en movimiento, recortamos la ruta
          const vueloMatch = vuelosEnMovimiento?.find(v => v.id === segmento.id);
          let polyPositions: [number, number][] = path;
          if (vueloMatch) {
            polyPositions = getRemainingPath(path, vueloMatch.progreso);
          }

          if (!polyPositions || polyPositions.length < 2) return null;

          return (
            <Polyline
              key={segmento.id}
              positions={polyPositions}
              pathOptions={{
                  color: colorHex,
                  weight: 1.5,
                  opacity: opacity,
                  dashArray: '4, 8'
              }}
            />
          );
      })}

      {/* AVIONES */}
      {vuelosEnMovimiento?.map((vuelo) => {
        const origenCoords = coordsAeropuertos.get(vuelo.origenCode);
        const destinoCoords = coordsAeropuertos.get(vuelo.destinoCode);
        if (!origenCoords || !destinoCoords) return null;

        const path = pathsPorSegmento.current.get(vuelo.id) ??
          getCachedPath([origenCoords[0], origenCoords[1]], [destinoCoords[0], destinoCoords[1]], 64);
        const { coord, bearing } = positionAlongPath(path, vuelo.progreso);
        const segMatch = activeSegments.find(s => s.id === vuelo.id);
        const hasOrderMatch = selectedOrders && selectedOrders.length > 0
          ? vuelo.pedidos.some(p => selectedOrders.includes(p.orderId)) ||
            (segMatch?.orderLoads?.some(ol => selectedOrders.includes(ol.orderId)) ?? false)
          : true;
        const hasAirportMatch = selectedAirportIds && selectedAirportIds.length > 0
          ? selectedAirportIds.includes(vuelo.origenCode) || selectedAirportIds.includes(vuelo.destinoCode)
          : true;
        const isSelected = selectedFlightId === vuelo.id;
        const shouldHighlight = isSelected || (!selectedFlightId && hasOrderMatch && hasAirportMatch);
        const dimmed = !shouldHighlight;

        const capacityPct = vuelo.capacidadTotal > 0
            ? Math.round((vuelo.capacidadUsada / vuelo.capacidadTotal) * 100)
            : 0;

        const pedidosTooltip: OrderLoadView[] = vuelo.pedidos.length > 0
          ? vuelo.pedidos.map(p => ({ orderId: p.orderId, cantidad: p.cantidad }))
          : (segMatch?.orderLoads?.map(load => ({
              orderId: load.orderId,
              cantidad: load.quantity
            })) ?? (segMatch?.orderIds ?? []).map(id => ({ orderId: id, cantidad: 1 })));

        return (
          <Marker
            key={vuelo.id}
            position={[coord[0], coord[1]]}
            icon={getPlaneIcon(vuelo.origenCode, bearing, capacityPct)}
            zIndexOffset={1000}
            opacity={dimmed ? 0.35 : 1}
            eventHandlers={{
              click: () => {
                const orders = vuelo.pedidos?.map(p => p.orderId) ?? [];
                onSelectOrders?.(orders);
                onSelectFlight?.(vuelo.id);
              },
              popupclose: () => {
                onSelectOrders?.(null);
                onSelectFlight?.(null);
                onSelectAirport?.(null);
              },
            }}
          >
            <Popup
              className="p-0 overflow-hidden rounded-xl thin-popup"
              maxWidth={320}
              autoPan={false}
              autoPanOnFocus={false}
              offset={popupOffsetForLat(coord[0])}
            >
              <div className="bg-base-100 text-base-content text-xs w-72 shadow-xl overflow-hidden">

                {/* HEADER VUELO */}
                <div className="bg-base-200 p-3 border-b border-base-content/10 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Plane size={16} className="text-primary"/>
                        <span className="font-bold text-sm">{vuelo.flightId}</span>
                    </div>
                    <div className="badge badge-sm badge-neutral">
                        {Math.round(vuelo.progreso)}% Completado
                    </div>
                </div>

                {/* INFO RUTA */}
                <div className="p-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center border-b border-base-content/10">
                    <div>
                        <div className="font-black text-lg">{vuelo.origenCode}</div>
                        <div className="text-[10px] opacity-70">{formatDateTime(vuelo.salidaProgramada)}</div>
                    </div>
                    <div className="flex flex-col items-center">
                        <div className="text-[9px] opacity-50 mb-1">➔</div>
                    </div>
                    <div>
                        <div className="font-black text-lg">{vuelo.destinoCode}</div>
                        <div className="text-[10px] opacity-70">{formatDateTime(vuelo.llegadaProgramada)}</div>
                    </div>
                </div>

                {/* CAPACIDAD */}
                <div className="p-3 border-b border-base-content/10">
                    <div className="flex justify-between mb-1 text-[10px] font-semibold uppercase opacity-70">
                        <span>Capacidad de Bodega</span>
                        <span>{vuelo.capacidadUsada} / {vuelo.capacidadTotal}</span>
                    </div>
                    <progress
                        className={`progress w-full h-2 ${capacityPct > 90 ? 'progress-error' : 'progress-success'}`}
                        value={vuelo.capacidadUsada}
                        max={vuelo.capacidadTotal}
                    ></progress>
                </div>

                <OrdersList
                  items={pedidosTooltip}
                  selectedOrders={selectedOrders}
                  onSelectOrder={(oid) => {
                    onSelectOrders?.([oid]);
                    onSelectFlight?.(vuelo.id);
                  }}
                />
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
