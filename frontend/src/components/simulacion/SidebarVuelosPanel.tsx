import { Plane } from 'lucide-react';
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
}

const ITEM_HEIGHT = 180;
const BUFFER_ITEMS = 10;

export function SidebarVuelosPanel({
  vuelosFiltrados,
  vuelosTotal,
  vuelosEnMovimiento,
  selectedFlightId,
  onSelectFlight,
  scrollParent,
  selectedOrders,
  selectedAirportIds,
}: SidebarVuelosPanelProps) {
  // prioriza el vuelo seleccionado al inicio de la lista
  const orderedFlights = useMemo(() => {
    if (!selectedFlightId) return vuelosFiltrados;
    const idx = vuelosFiltrados.findIndex(v => (v.segmentId ?? v.departureUtc) === selectedFlightId);
    if (idx === -1) return vuelosFiltrados;
    const selected = vuelosFiltrados[idx];
    const rest = [...vuelosFiltrados.slice(0, idx), ...vuelosFiltrados.slice(idx + 1)];
    return [selected, ...rest];
  }, [vuelosFiltrados, selectedFlightId]);

  // ventana virtualizada con buffer
  const [windowStart, setWindowStart] = useState(0);
  const [windowEnd, setWindowEnd] = useState(Math.min(orderedFlights.length, 20));

  // reset cuando cambia la lista
  useEffect(() => {
    setWindowStart(0);
    setWindowEnd(Math.min(orderedFlights.length, 20));
  }, [orderedFlights.length, selectedFlightId]);

  // listener de scroll en el contenedor compartido (throttled via rAF)
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

  // Lleva el scroll al inicio cuando se selecciona un vuelo (porque se reordena al tope)
  useEffect(() => {
    if (selectedFlightId && scrollParent) {
      scrollParent.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [selectedFlightId, scrollParent]);

  return (
    <>
      {vuelosTotal === 0 && (
        <div className="text-center text-base-content/60 py-8">
          No hay vuelos activos
        </div>
      )}
      {vuelosTotal > 0 && orderedFlights.length === 0 && (
         <div className="text-center text-base-content/60 py-8">
          No se encontraron vuelos con los filtros actuales.
        </div>
      )}

      {vuelosVentana.length > 0 && (
        <>
          <div style={{ height: windowStart * ITEM_HEIGHT }} />
          {vuelosVentana.map((vuelo, offsetIdx) => {
            const absoluteIndex = windowStart + offsetIdx;
            const flightKey = vuelo.segmentId ?? vuelo.flightId ?? vuelo.departureUtc;
            const flightOrders = vuelo.pedidos;
            const matchesOrder = selectedOrders && selectedOrders.length > 0
              ? flightOrders.some(id => selectedOrders.includes(id))
              : true;
            const matchesAirport = selectedAirportIds && selectedAirportIds.length > 0
              ? selectedAirportIds.includes(vuelo.origen) || selectedAirportIds.includes(vuelo.destino)
              : true;
            const isSelected = selectedFlightId === flightKey;
            const shouldHighlight = isSelected || (selectedFlightId === null && matchesOrder && matchesAirport);
            const isDimmed = !shouldHighlight;
            const vueloEnCurso = vuelosEnMovimiento.find(v => v.id === (vuelo.segmentId ?? vuelo.departureUtc));
            const pedidosList: OrderLoadView[] = vueloEnCurso?.pedidos?.map(p => ({ orderId: p.orderId, cantidad: p.cantidad }))
              ?? vuelo.pedidos.map(pid => ({ orderId: pid, cantidad: 1 }));

            return (
              <div
                key={`${flightKey}-${absoluteIndex}`}
                style={{ minHeight: ITEM_HEIGHT }}
                className={`card bg-base-200 shadow-sm hover:shadow-md transition-shadow mb-2 ${isDimmed ? 'opacity-40' : ''} ${isSelected ? 'ring-2 ring-primary' : ''}`}
                onClick={() => onSelectFlight(isSelected ? null : flightKey)}
              >
                <div className="card-body p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Plane size={16} className="text-primary" />
                      <span className="font-bold text-sm text-primary">
                        {vuelo.origen} → {vuelo.destino}
                      </span>
                    </div>

                    {vueloEnCurso && (
                      <span className={`badge badge-xs ${
                        vueloEnCurso.progreso >= 100
                          ? 'badge-info'
                          : 'badge-success'
                      }`}>
                        {vueloEnCurso.progreso >= 100 ? 'Aterrizado' : 'En vuelo'}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-base-content/70 font-semibold mb-1">
                    📅 {vuelo.fecha}
                  </div>

                  <div className="flex justify-between text-xs text-base-content/60 mb-2">
                    <div>
                      <span className="text-base-content/60">Salida:</span> {vuelo.hora}
                    </div>
                    <div>
                      <span className="text-base-content/60">Llegada:</span> {vuelo.horaLlegada}
                    </div>
                  </div>

                  <div className="mt-2 pt-2 border-t border-base-300">
                    <p className="text-xs text-base-content/70 font-semibold mb-1">
                      Pedidos ({vuelo.pedidos.length}):
                    </p>
                    <OrdersList items={pedidosList} />
                  </div>

                  {vueloEnCurso && (
                    <div className="mt-3">
                      <div className="w-full bg-base-300 rounded-full h-2">
                        <div
                          className="bg-success h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(vueloEnCurso.progreso, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-base-content/70 mt-1 text-center">
                        {Math.round(vueloEnCurso.progreso)}%
                        {vueloEnCurso.progreso >= 100 && ' - Completado'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div style={{ height: Math.max(0, (orderedFlights.length - windowEnd) * ITEM_HEIGHT) }} />
        </>
      )}
    </>
  );
}
