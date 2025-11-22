import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useState } from 'react';
import type { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Airport } from '../../types/airport';
import type { SegmentoVuelo, VueloEnMovimiento } from '../../hooks/useOperacion';
import { Plane, Box, Building } from 'lucide-react';

// Iconos Default Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Iconos personalizados
const defaultAirportIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [15, 25],
  iconAnchor: [7, 25],
  popupAnchor: [1, -20],
  shadowSize: [25, 25]
});

const hubIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
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

const PLANE_SIZE = 32;
const PLANE_CENTER = 16;

const getPlaneIcon = (originCode: string, rotation: number) => {
  const { twClass } = getHubColor(originCode);

  const html = `
    <div style="
      width: ${PLANE_SIZE}px;
      height: ${PLANE_SIZE}px;
      display: flex;
      align-items: center;
      justify-content: center;
      transform: rotate(${rotation}deg);
      transform-origin: center center;
      transition: transform 150ms linear;
      will-change: transform;
    ">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="${twClass} fill-current drop-shadow-xl" width="${PLANE_SIZE}" height="${PLANE_SIZE}" style="display: block; filter: drop-shadow(0px 2px 2px rgba(0,0,0,0.5));">
        <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
      </svg>
    </div>
  `;

  return L.divIcon({
    html: html,
    className: 'bg-transparent border-none',
    iconSize: [PLANE_SIZE, PLANE_SIZE],
    iconAnchor: [PLANE_CENTER, PLANE_CENTER],
  });
};

const calculateBearing = (fromLat: number, fromLon: number, toLat: number, toLon: number) => {
  const fromLatRad = (fromLat * Math.PI) / 180;
  const toLatRad = (toLat * Math.PI) / 180;
  const deltaLonRad = ((toLon - fromLon) * Math.PI) / 180;

  const y = Math.sin(deltaLonRad) * Math.cos(toLatRad);
  const x = Math.cos(fromLatRad) * Math.sin(toLatRad) - Math.sin(fromLatRad) * Math.cos(toLatRad) * Math.cos(deltaLonRad);

  const rawBearing = (Math.atan2(y, x) * 180) / Math.PI;
  return Number.isNaN(rawBearing) ? 0 : (rawBearing + 360) % 360;
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
  airportStocks?: Record<string, number>;
}

export function MapaVuelos({ activeSegments, aeropuertos, isLoading, vuelosEnMovimiento, filtroHubActivo, airportStocks = {} }: MapaVuelosProps) {
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

  const coordsAeropuertos = new Map<string, LatLngExpression>(
    aeropuertos
      .filter((a) => typeof a.latitude === 'number' && typeof a.longitude === 'number')
      .map((a) => [a.id, [a.latitude, a.longitude]])
  );

  return (
    <MapContainer
      center={initialPosition}
      zoom={2}
      minZoom={2}
      className="w-full h-full z-0"
      style={{ backgroundColor: mapTheme === 'dark' ? '#1f2937' : '#e5e7eb' }}
    >
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
        <div className="card compact bg-base-100/90 shadow-xl border border-base-content/10 text-[10px] p-2 backdrop-blur-sm w-32">
            <h4 className="font-bold mb-1 text-base-content uppercase tracking-wider border-b border-base-content/10 pb-1">Leyenda</h4>
            <ul className="space-y-1 font-semibold">
            <li className="flex items-center gap-2 text-success">
                <span className="w-2 h-2 rounded-full bg-current"></span> Lima (SPIM)
            </li>
            <li className="flex items-center gap-2 text-error">
                <span className="w-2 h-2 rounded-full bg-current"></span> Bruselas (EBCI)
            </li>
            <li className="flex items-center gap-2 text-info">
                <span className="w-2 h-2 rounded-full bg-current"></span> Baku (UBBB)
            </li>
            </ul>
        </div>
      </div>

      {/* AEROPUERTOS */}
      {aeropuertos.slice(0, 50).map(aeropuerto => {
        const esSede = isMainHub(aeropuerto.id || aeropuerto.code || '');
        const stockActual = airportStocks[aeropuerto.id || aeropuerto.code || ''] || 0;
        const capacidadMax = aeropuerto.storageCapacity || 3000; //AHORA ESTA HARDCODEADO
        const stockPct = Math.min(100, Math.round((stockActual / capacidadMax) * 100));

        return (
          <Marker
            key={aeropuerto.id}
            position={[aeropuerto.latitude, aeropuerto.longitude]}
            icon={esSede ? hubIcon : defaultAirportIcon}
            opacity={!filtroHubActivo || filtroHubActivo === aeropuerto.id ? 1.0 : 0.5}
            zIndexOffset={esSede ? 1000 : 0}
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
                <div className="p-3">
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
        const opacity = (filtroHubActivo && segmento.origin !== filtroHubActivo) ? 0.1 : 0.4;

        return (
          <Polyline
            key={segmento.id}
            positions={[origenCoords, destinoCoords]}
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

        if (!origenCoords || !destinoCoords || isNaN(vuelo.latActual)) return null;

        const [dLat, dLon] = destinoCoords as [number, number];
        const bearing = calculateBearing(vuelo.latActual, vuelo.lonActual, dLat, dLon);

        const capacityPct = vuelo.capacidadTotal > 0
            ? Math.round((vuelo.capacidadUsada / vuelo.capacidadTotal) * 100)
            : 0;

        return (
          <Marker
            key={vuelo.id}
            position={[vuelo.latActual, vuelo.lonActual]}
            icon={getPlaneIcon(vuelo.origenCode, bearing)}
            zIndexOffset={2000}
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

                {/* TABLA DE PEDIDOS */}
                <div className="max-h-40 overflow-y-auto scrollbar-thin bg-base-100">
                    <table className="table table-xs table-pin-rows w-full">
                        <thead className="bg-base-200">
                            <tr>
                                <th className="pl-3">Pedido</th>
                                <th className="text-right pr-3">Carga</th>
                            </tr>
                        </thead>
                        <tbody>
                            {vuelo.pedidos.map((p, idx) => (
                                <tr key={idx} className="hover:bg-base-200/50">
                                    <td className="pl-3">
                                        <div className="font-mono font-bold text-xs text-primary">{p.orderId}</div>
                                    </td>
                                    <td className="text-right font-mono pr-3">
                                        <div className="flex items-center justify-end gap-1">
                                            <Box size={10} className="opacity-50"/>
                                            {p.cantidad}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
