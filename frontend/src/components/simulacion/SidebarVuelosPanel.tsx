import { Plane, Box, Clock } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { VueloEnMovimiento } from '../../hooks/useSimulacion';
import type { FlightGroup } from '../../types/simulacionUI';
import { OrdersList, type OrderLoadView } from './OrdersList';
interface SidebarVuelosPanelProps {
  vuelosFiltrados: FlightGroup[];
  vuelosTotal: number;
  vuelosEnMovimiento: VueloEnMovimiento[];
  selectedFlightId: string | null;
  onSelectFlight: (flightId: string | null) => void;
  scrollParent?: HTMLDivElement | null;
  selectedOrders?: string[] | null;
  selectedAirportIds?: string[] | null;
  tipoVuelo?: 'ocupados' | 'vacios';
  currentTime: Date;
}
const ITEM_HEIGHT = 185;
const BUFFER_ITEMS = 10;
export function SidebarVuelosPanel({
  vuelosFiltrados,
  vuelosTotal,
  vuelosEnMovimiento,
  selectedFlightId,
  onSelectFlight,
  scrollParent,
  //selectedOrders,
  //selectedAirportIds,
  tipoVuelo,
  currentTime
}: SidebarVuelosPanelProps) {

  const orderedFlights = useMemo(() => {
    if (!selectedFlightId) return vuelosFiltrados;
    const idx = vuelosFiltrados.findIndex(v => (v.uniqueKey ?? v.segmentId ?? v.departureUtc) === selectedFlightId);
    if (idx === -1) return vuelosFiltrados;
    const selected = vuelosFiltrados[idx];
    const rest = [...vuelosFiltrados.slice(0, idx), ...vuelosFiltrados.slice(idx + 1)];
    return [selected, ...rest];
  }, [vuelosFiltrados, selectedFlightId]);

  const [windowStart, setWindowStart] = useState(0);
  const [windowEnd, setWindowEnd] = useState(Math.min(orderedFlights.length, 20));
  useEffect(() => {
    setWindowStart(0);
    setWindowEnd(Math.min(orderedFlights.length, 20));
  }, [orderedFlights.length, selectedFlightId]);
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
        const endIdx = Math.min(orderedFlights.length, startIdx + visible);
        setWindowStart(startIdx);
        setWindowEnd(endIdx);
        ticking = false;
      });
    };
    handler();
    scrollParent.addEventListener('scroll', handler);
    return () => scrollParent.removeEventListener('scroll', handler);
  }, [scrollParent, orderedFlights.length]);
  const vuelosVentana = orderedFlights.slice(windowStart, windowEnd);
  useEffect(() => {
    if (selectedFlightId && scrollParent) {
      scrollParent.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [selectedFlightId, scrollParent]);
  return (
    <div className="space-y-3 pb-4">
      {vuelosTotal === 0 && (
        <div className="text-center text-base-content/60 py-8 text-xs">
          No hay vuelos {tipoVuelo === 'vacios' ? 'vacíos' : 'activos'} disponibles.
        </div>
      )}
      {vuelosTotal > 0 && orderedFlights.length === 0 && (
         <div className="text-center text-base-content/60 py-8 text-xs">
          No se encontraron resultados con los filtros actuales.
        </div>
      )}
      {vuelosVentana.length > 0 && (
        <>
          <div style={{ height: windowStart * ITEM_HEIGHT }} />
          {vuelosVentana.map((vuelo, offsetIdx) => {
            const absoluteIndex = windowStart + offsetIdx;
            const flightKey = vuelo.uniqueKey ?? vuelo.segmentId ?? vuelo.flightId ?? vuelo.departureUtc;
            const isVacio = tipoVuelo === 'vacios';
            const isSelected = !isVacio && selectedFlightId === flightKey;
            /*const shouldHighlight = !isVacio && (isSelected || (
                selectedFlightId === null &&
                ((selectedAirportIds?.includes(vuelo.origen) || selectedAirportIds?.includes(vuelo.destino)))
            ));*/
            const isDimmed = !isVacio && selectedFlightId && !isSelected;
            const vueloEnCurso = vuelosEnMovimiento.find(v => v.id === (vuelo.segmentId ?? vuelo.departureUtc));
            let progreso = 0;
            let statusLabel = 'Programado';
            if (vueloEnCurso) {
                progreso = vueloEnCurso.progreso;
                statusLabel = progreso >= 100 ? 'Aterrizado' : 'En Vuelo';
            } else {
                const nowMs = currentTime.getTime();
                const startMs = Date.parse(vuelo.departureUtc);
                const endMs = Date.parse(vuelo.arrivalUtc);
                const total = endMs - startMs;
                if (nowMs >= endMs) {
                    progreso = 100;
                    statusLabel = 'Aterrizado';
                } else if (nowMs > startMs && total > 0) {
                    progreso = ((nowMs - startMs) / total) * 100;
                    statusLabel = 'En Ruta';
                } else {
                    statusLabel = 'En Espera';
                }
            }
            const pedidosList: OrderLoadView[] = vueloEnCurso?.pedidos?.map(p => ({ orderId: p.orderId, cantidad: p.cantidad }))
              ?? vuelo.pedidos.map(pid => ({ orderId: pid, cantidad: 1 }));

            // --- ESTILOS ---
            const borderColor = isSelected
                ? 'border-primary ring-1 ring-primary'
                : 'border-base-300';
            // Background
            const bgClass = isSelected ? 'bg-base-200/40' : 'bg-base-100';
            // Clases de interacción
            const interactionClasses = isVacio
                ? 'cursor-default opacity-80'
                : `cursor-pointer hover:shadow-md hover:border-primary/40 ${isDimmed ? 'opacity-40 grayscale-[0.5]' : 'opacity-100'}`;
            return (
              <div
                key={`${flightKey}-${absoluteIndex}`}
                style={{ minHeight: 'fit-content' }}
                className={`
                    card shadow-sm mb-3 border transition-all duration-200
                    ${bgClass} ${borderColor} ${interactionClasses}
                `}
                onClick={() => {
                    if (!isVacio) {
                        onSelectFlight(isSelected ? null : flightKey);
                    }
                }}
              >
                <div className="card-body p-3">
                  {/* HEADER: RUTA Y STATUS */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Plane size={16} className={isSelected ? "text-primary" : "text-base-content/70"} />
                      <span className={`font-bold text-sm ${isSelected ? "text-primary" : "text-base-content"}`}>
                        {vuelo.origen} → {vuelo.destino}
                      </span>
                    </div>
                    <span className={`badge badge-xs font-semibold border-none ${
                        progreso >= 100
                          ? 'bg-base-200 text-base-content/60'
                          : (isVacio ? 'badge-neutral text-neutral-content opacity-70' : 'badge-success text-success-content')
                    }`}>
                        {statusLabel}
                    </span>
                  </div>
                  {/* SUB-HEADER: ID Y FECHA */}
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-xs font-mono text-base-content/70 flex items-center gap-1.5">
                        <span className="opacity-50">Vuelo:</span>
                        <span className="font-bold bg-base-200 px-1.5 py-0.5 rounded text-base-content/90">
                            {vuelo.flightId}
                        </span>
                    </div>
                    <div className="text-[10px] text-base-content/50 font-semibold uppercase tracking-wide">
                        {vuelo.fecha}
                    </div>
                  </div>
                  {/* TIEMPOS (Bloque Gris Sólido) */}
                  <div className="grid grid-cols-2 gap-px bg-base-300 rounded overflow-hidden border border-base-300 mb-2">
                    <div className="bg-base-200/50 p-1.5 flex flex-col items-center">
                        <span className="text-[9px] uppercase font-bold text-base-content/40 block">Salida</span>
                        <span className="text-xs font-mono font-semibold text-base-content/80">{vuelo.hora}</span>
                    </div>
                    <div className="bg-base-200/50 p-1.5 flex flex-col items-center border-l border-base-300">
                        <span className="text-[9px] uppercase font-bold text-base-content/40 block">Llegada</span>
                        <span className="text-xs font-mono font-semibold text-base-content/80">{vuelo.horaLlegada}</span>
                    </div>
                  </div>
                  {/* PEDIDOS */}
                  {!isVacio && vuelo.pedidos.length > 0 && (
                    <div className="mt-1 pt-2 border-t border-base-200 mb-1">
                        <p className="text-[10px] font-bold text-base-content/60 mb-1 uppercase tracking-wide flex items-center gap-1">
                           <Box size={10}/> Pedidos ({vuelo.pedidos.length})
                        </p>
                        <OrdersList items={pedidosList} />
                    </div>
                  )}
                  {/* BARRA DE PROGRESO */}
                  <div className="mt-2">
                    <div className="w-full bg-base-300 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full transition-all duration-500 ${
                            isVacio ? 'bg-neutral opacity-50' : 'bg-success'
                          }`}
                          style={{ width: `${Math.min(progreso, 100)}%` }}
                        />
                    </div>
                    <div className="flex justify-between items-center mt-1">
                        <span className="text-[9px] text-base-content/40 font-mono font-bold">
                            {Math.round(progreso)}%
                        </span>
                        {progreso < 100 && (
                            <Clock size={10} className={`animate-pulse ${isVacio ? 'text-neutral' : 'text-success'}`} />
                        )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div style={{ height: Math.max(0, (orderedFlights.length - windowEnd) * ITEM_HEIGHT) }} />
        </>
      )}
    </div>
  );
}