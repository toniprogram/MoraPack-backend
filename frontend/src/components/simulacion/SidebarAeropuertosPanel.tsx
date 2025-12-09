import type { Airport } from '../../types/airport';
import type { ActiveAirportTick } from '../../types/simulation';
import type { SegmentoVuelo } from '../../hooks/useSimulacion';
import { useEffect, useMemo, useState } from 'react';
import { OrdersList } from './OrdersList';
import { FlightsList } from './FlightsList';

interface SidebarAeropuertosPanelProps {
  aeropuertos: Airport[];
  activeAirports: ActiveAirportTick[];
  selectedAirportIds: string[] | null;
  onSelectAirport: (airportId: string | null) => void;
  selectedOrders?: string[] | null;
  scrollParent?: HTMLDivElement | null;
  onSelectOrders?: (orderIds: string[] | null) => void;
  onSelectFlight?: (flightId: string | null) => void;
}

const ITEM_HEIGHT = 190;
const BUFFER_ITEMS = 8;
const INFINITE_CODES = new Set(['SPIM', 'LIM', 'EBCI', 'BRU', 'UBBB', 'GYD']);

const isInfiniteHub = (a: Airport) => {
  const id = (a.id || '').toUpperCase().trim();
  const code = (a.code || '').toUpperCase().trim();
  return INFINITE_CODES.has(a.id) || INFINITE_CODES.has(a.code);
};

export function SidebarAeropuertosPanel({
  aeropuertos,
  activeAirports,
  activeSegments,
  selectedAirportIds,
  onSelectAirport,
  selectedOrders,
  scrollParent,
  onSelectOrders,
  onSelectFlight,
}: SidebarAeropuertosPanelProps) {
  const orderedAirports = useMemo(() => {
    if (!selectedAirportIds || selectedAirportIds.length === 0) return aeropuertos;
    const set = new Set(selectedAirportIds);
    const selected = aeropuertos.filter(a => set.has(a.id || a.code));
    const rest = aeropuertos.filter(a => !set.has(a.id || a.code));
    return [...selected, ...rest];
  }, [aeropuertos, selectedAirportIds]);

  const [windowStart, setWindowStart] = useState(0);
  const [windowEnd, setWindowEnd] = useState(Math.min(orderedAirports.length, 20));

  useEffect(() => {
    setWindowStart(0);
    setWindowEnd(Math.min(orderedAirports.length, 20));
  }, [orderedAirports.length, selectedAirportIds]);

  useEffect(() => {
    if (!scrollParent) return;
    let ticking = false;
    const handler = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const top = scrollParent.scrollTop;
        const height = scrollParent.clientHeight || 600;
        const startIdx = Math.max(0, Math.floor(top / ITEM_HEIGHT) - BUFFER_ITEMS);
        const visible = Math.ceil(height / ITEM_HEIGHT) + BUFFER_ITEMS * 2;
        const endIdx = Math.min(orderedAirports.length, startIdx + visible);
        setWindowStart(startIdx);
        setWindowEnd(endIdx);
        ticking = false;
      });
    };
    handler();
    scrollParent.addEventListener('scroll', handler);
    return () => scrollParent.removeEventListener('scroll', handler);
  }, [scrollParent, orderedAirports.length]);

  useEffect(() => {
    if (selectedAirportIds && selectedAirportIds.length > 0 && scrollParent) {
      scrollParent.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [selectedAirportIds, scrollParent]);

  const visible = orderedAirports.slice(windowStart, windowEnd);

  return (
    <>
      {visible.length === 0 && (
        <div className="text-center text-base-content/60 py-8">
          No hay aeropuertos disponibles
        </div>
      )}
      {visible.length > 0 && (
        <>
          <div style={{ height: windowStart * ITEM_HEIGHT }} />
          {visible.map((aeropuerto, idx) => {
            const live = activeAirports.find(a => a.airportCode === (aeropuerto.id || aeropuerto.code));
            const current = live?.currentLoad ?? 0;
            const max = live?.maxThroughputPerHour ?? aeropuerto.storageCapacity ?? 0;
            const isInfinite = isInfiniteHub(aeropuerto);
            const pct = (isInfinite || max === 0)
              ? 0
              : Math.min(100, Math.round((current / max) * 100));
            const flightOrders = live?.orderLoads ?? [];
            const isSelected = !!selectedAirportIds?.includes((aeropuerto.id || aeropuerto.code || ''));
            const dimmed = !!(selectedAirportIds && selectedAirportIds.length > 0 && !isSelected);
            const vuelosSalientes = (activeSegments ?? []).filter(s => s.origin === (aeropuerto.id || aeropuerto.code));
            let progressColorClass = 'progress-success'; // Verde (< 70%)
            let textColorClass = 'text-success';
            if (pct > 90) {
              progressColorClass = 'progress-error'; // Rojo (> 90%)
              textColorClass = 'text-error';
            } else if (pct > 70) {
              progressColorClass = 'progress-warning'; // Amarillo (70% - 90%)
              textColorClass = 'text-warning';
            }
            return (
        <div
          key={(aeropuerto.id || aeropuerto.code || idx.toString())}
          style={{ minHeight: ITEM_HEIGHT }}
          className={`card bg-base-200 shadow-sm hover:shadow-md transition-shadow ${dimmed ? 'opacity-40' : ''} ${isSelected ? 'ring-2 ring-primary' : ''}`}
          onClick={() => onSelectAirport(isSelected ? null : (aeropuerto.id || aeropuerto.code || null))}
        >
          <div className="card-body p-3">
            <h3 className="font-bold text-sm text-primary">{aeropuerto.id}</h3>
            <p className="text-xs text-base-content/80">{aeropuerto.name}</p>
            {!isInfinite && (
                <div className="text-xs text-base-content/70 mt-1 space-y-1">
                  <div className="flex justify-between">
                    <span>Almacén</span>
                    <span className={`font-mono ${textColorClass}`}>
                        {current} / {max}
                    </span>
                  </div>
                    <progress
                        className={`progress ${progressColorClass} w-full h-2`}
                        value={current}
                        max={max || 1}
                      ></progress>

                      <div className={`font-mono text-right text-[10px] ${textColorClass}`}>
                        {pct}% Ocupado
                      </div>
                </div>
            )}
            {!isInfinite && (
                <div className="border-t border-base-300 pt-2 mt-2">
                  <div className="text-[10px] font-semibold uppercase opacity-70 mb-1">Pedidos en almacén</div>
                  <OrdersList
                    items={flightOrders.map(ol => ({ orderId: ol.orderId, cantidad: ol.quantity }))}
                    selectedOrders={selectedOrders}
                    onSelectOrder={(orderId) => {
                      onSelectOrders?.([orderId]);
                    }}
                  />
                </div>
            )}
            <div className="border-t border-base-300 pt-2 mt-2">
                <div className="text-[10px] font-semibold uppercase opacity-70 mb-1">Vuelos Salientes</div>
                <FlightsList
                    vuelos={vuelosSalientes}
                    onSelectFlight={onSelectFlight}
                    onSelectOrders={onSelectOrders}
                />
            </div>
          </div>
        </div>
            );
          })}
          <div style={{ height: Math.max(0, (orderedAirports.length - windowEnd) * ITEM_HEIGHT) }} />
        </>
      )}
    </>
  );
}
