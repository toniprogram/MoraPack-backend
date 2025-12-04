import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Tooltip, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useRef, useState, useMemo } from 'react';
import type { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import planeIconUrl from '/images/plane-line.svg?url';
import type { Airport } from '../../types/airport';
import type { ActiveAirportTick } from '../../types/simulation';
import type { SegmentoVuelo, VueloEnMovimiento } from '../../hooks/useSimulacion';
import { Plane, Building } from 'lucide-react';
import { OrdersList, type OrderLoadView } from '../simulacion/OrdersList';

// Iconos Default Leaflet
const iconProto = L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown };
delete iconProto._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Iconos personalizados
const defaultAirportIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [12, 15],
  iconAnchor: [6, 15],
  popupAnchor: [1, -18],
  shadowSize: [20, 20]
});

const hubIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [12, 15],
  iconAnchor: [6, 15],
  popupAnchor: [1, -18],
  shadowSize: [20, 20]
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
  return ['SPIM', 'LIM', 'UBBB', 'GYD', 'EBCI', 'BRU', 'CRL'].includes(c);
};

const getHubColor = (originCode: string) => {
  const code = originCode ? originCode.toUpperCase() : '';
  if (code === 'SPIM' || code === 'LIM') return { hex: '#22c55e', twClass: 'text-success' };
  if (code === 'UBBB' || code === 'GYD') return { hex: '#3b82f6', twClass: 'text-info' };
  if (code === 'EBCI' || code === 'BRU' || code === 'CRL') return { hex: '#ef4444', twClass: 'text-error' };
  return { hex: '#a6adbb', twClass: 'text-base-content' };
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

const getPlaneIcon = (originCode: string, rotation: number) => {
  const { twClass } = getHubColor(originCode);
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
        <img src="${planeIconUrl}" alt="plane" class="${twClass}" width="${PLANE_SIZE}" height="${PLANE_SIZE}" style="display: block; filter: drop-shadow(0px 2px 2px rgba(0,0,0,0.5)); pointer-events: none;" />
      </div>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'bg-transparent border-none',
    iconSize: [PLANE_HITBOX, PLANE_HITBOX],
    iconAnchor: [PLANE_CENTER, PLANE_CENTER],
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
  const initialPosition: LatLngExpression = [20, 0];
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
      zoom={2}
      minZoom={2}
      className="w-full h-full z-0"
      style={{ backgroundColor: mapTheme === 'dark' ? '#1f2937' : '#e5e7eb' }}
    >
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
      <div className="leaflet-bottom leaflet-left m-2 z-[1000]">
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
        const stockPct = Math.min(100, Math.round((stockActual / capacidadMax) * 100));

        return (
          <Marker
            key={aeropuerto.id}
            position={[aeropuerto.latitude, aeropuerto.longitude]}
            icon={esSede ? hubIcon : defaultAirportIcon}
            opacity={
              (!filtroHubActivo || filtroHubActivo === aeropuerto.id)
                ? (airportHighlights.size > 0 && !airportHighlights.has(aeropuerto.id || aeropuerto.code || '') ? 0.2 : 1.0)
                : 0.5
            }
            zIndexOffset={esSede ? 1000 : 0}
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
            <Popup className="p-0 overflow-hidden rounded-xl" minWidth={200}>
              <div className="bg-base-100 text-base-content text-xs w-52 shadow-xl overflow-hidden">
                <div className="bg-base-200 p-2 border-b border-base-content/10 flex items-center gap-2">
                    <Building size={14} className="text-primary"/>
                    <div>
                        <div className="font-bold text-sm leading-none">{aeropuerto.id}</div>
                        <div className="text-[10px] opacity-60 truncate w-36">{aeropuerto.name}</div>
                    </div>
                </div>
                <div className="p-3 space-y-2">
                    <div className="flex justify-between mb-1 text-[10px] font-semibold uppercase opacity-70">
                        <span>Almacén</span>
                        <span>{stockActual} / {capacidadMax}</span>
                    </div>
                    <progress
                        className={`progress w-full h-2 ${stockPct > 80 ? 'progress-warning' : 'progress-info'}`}
                        value={stockActual}
                        max={capacidadMax}
                    ></progress>
                    <div className="text-right mt-1 text-[10px] font-mono opacity-50">{stockPct}% Ocupado</div>
                    <div className="border-t border-base-300 pt-2">
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
            icon={getPlaneIcon(vuelo.origenCode, bearing)}
            zIndexOffset={2000}
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
            <Popup className="p-0 overflow-hidden rounded-xl" maxWidth={320}>
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
