import { useMemo, useRef, useState } from 'react';
import { Radio, Server, Package, Plane, Box, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Airport } from '../../types/airport';
import type { ActiveAirportTick } from '../../types/simulation';
import type { FlightGroup } from '../../types/simulacionUI';
import type { OperationMetrics, OrderStatusDetail, SegmentoVuelo, VueloEnMovimiento } from '../../hooks/useOperacion';
import { SidebarVuelosPanel } from '../simulacion/SidebarVuelosPanel';
import { SidebarAeropuertosPanel } from '../simulacion/SidebarAeropuertosPanel';
import { OrderCardDetail } from './OrderCardDetail';

interface OperacionSidebarProps {
  aeropuertos: Airport[];
  activeSegments: SegmentoVuelo[];
  activeAirports: ActiveAirportTick[];
  vuelosEnMovimiento: VueloEnMovimiento[];
  orderStatusList: OrderStatusDetail[];
  metrics: OperationMetrics;
  status: 'idle' | 'buffering' | 'running' | 'error';
  simClock: Date;
  isRealtime: boolean;
  isReplanning: boolean;
  isClearingPlan: boolean;
  lastUpdated: Date | null;
  actions: {
    planificar: () => void;
    clearPlan: () => void;
    setManualTime: (d: Date) => void;
    resetTime: () => void;
  };
  formatDateTime: (s: string) => string;
  formatShortTime: (s: string) => string;
  getInputValue: () => string;
  handleTimeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function OperacionSidebar({
  aeropuertos,
  activeSegments,
  activeAirports,
  vuelosEnMovimiento,
  orderStatusList,
  metrics,
  status,
  simClock,
  isRealtime,
  isReplanning,
  isClearingPlan,
  lastUpdated,
  actions,
  formatDateTime,
  formatShortTime,
  getInputValue,
  handleTimeChange,
}: OperacionSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [vistaPanel, setVistaPanel] = useState<'pedidos' | 'vuelos' | 'aeropuertos'>('pedidos');
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [selectedAirportIds, setSelectedAirportIds] = useState<string[] | null>(null);
  const panelScrollRef = useRef<HTMLDivElement | null>(null);

  const flightGroups: FlightGroup[] = useMemo(() => {
    return activeSegments.map(seg => {
      const dep = seg.departureUtc ? new Date(seg.departureUtc) : null;
      const arr = seg.arrivalUtc ? new Date(seg.arrivalUtc) : null;
      return {
        segmentId: seg.id,
        flightId: seg.flightId || seg.id,
        origen: seg.origin,
        destino: seg.destination,
        pedidos: seg.orderIds || [],
        hora: dep ? dep.toLocaleTimeString('es-PE', { timeZone: 'UTC', hour12: false, hour: '2-digit', minute: '2-digit' }) : '--:--',
        horaLlegada: arr ? arr.toLocaleTimeString('es-PE', { timeZone: 'UTC', hour12: false, hour: '2-digit', minute: '2-digit' }) : '--:--',
        fecha: dep ? dep.toLocaleDateString('es-PE', { timeZone: 'UTC', day: '2-digit', month: 'short' }) : '--/--',
        departureUtc: seg.departureUtc,
        arrivalUtc: seg.arrivalUtc,
      };
    });
  }, [activeSegments]);

  const handleSelectAirport = (airportId: string | null) => {
    if (!airportId) {
      setSelectedAirportIds(null);
      return;
    }
    const current = new Set(selectedAirportIds ?? []);
    if (current.has(airportId)) {
      current.delete(airportId);
    } else {
      current.add(airportId);
    }
    const next = Array.from(current);
    setSelectedAirportIds(next.length > 0 ? next : null);
  };

  const isRealtimeDisabled = status === 'buffering' || isReplanning || !isRealtime;

  return (
    <div className={`max-w-full flex flex-col bg-base-100 z-20 h-full shrink-0 border-r border-base-300 shadow-lg transition-all ${collapsed ? 'w-9' : 'w-80'}`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-base-300 bg-base-100">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Radio className={status === 'running' ? 'text-success animate-pulse' : 'text-base-content/70'} size={18} />
            <div>
              <div className="text-sm font-semibold text-base-content/90">Estado {status.toUpperCase()}</div>
            </div>
          </div>
        )}
        <button
          className="btn btn-ghost btn-xs btn-square"
          onClick={() => setCollapsed(v => !v)}
          aria-label={collapsed ? 'Expandir panel' : 'Colapsar panel'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {collapsed && (
        <div className="flex flex-col items-center gap-2 py-3 bg-base-100">
          <div className="tooltip tooltip-right" data-tip="Ejecutar planificador">
            <button
              onClick={() => actions.planificar()}
              disabled={status === 'buffering' || isReplanning}
              className="btn btn-primary btn-xs btn-circle"
            >
              {isReplanning ? <span className="loading loading-spinner loading-2xs" /> : <Server size={14} />}
            </button>
          </div>
          <div className="text-[10px] font-mono text-base-content/70 text-center px-1">
            {lastUpdated ? formatShortTime(lastUpdated.toISOString()) : '--:--'}
          </div>
        </div>
      )}

      {!collapsed && (
      <div className="p-5 bg-base-100 border-b border-base-300 shrink-0">
        <div className="bg-base-200 rounded-lg border border-base-300 p-2 text-center">
          <div className="flex items-center justify-between text-[11px] text-base-content/70 mb-2">
            <span className="uppercase font-semibold">Hora (UTC)</span>
            <span className="badge badge-ghost badge-xs font-mono">UTC</span>
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <input
                type="datetime-local"
                className="input input-xs input-bordered w-full font-mono h-8"
                value={getInputValue()}
                onChange={handleTimeChange}
              />
            </div>
            <button
              onClick={() => actions.resetTime()}
              className="btn btn-xs btn-square btn-ghost"
              title="Volver al presente"
            >
              <RefreshCw size={12} />
            </button>
          </div>
        </div>
      </div>
      )}

      {!collapsed && (
      <>
        <div className="flex border-b border-base-300 bg-base-200">
          <button
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              vistaPanel === 'pedidos'
                ? 'border-b-2 border-primary text-primary bg-base-100'
                : 'text-base-content/60 hover:text-primary hover:bg-base-300'
            }`}
            onClick={() => setVistaPanel('pedidos')}
          >
            <Package size={16} className="inline mr-1" />
            Peds. ({orderStatusList.length})
          </button>
          <button
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              vistaPanel === 'vuelos'
                ? 'border-b-2 border-primary text-primary bg-base-100'
                : 'text-base-content/60 hover:text-primary hover:bg-base-300'
            }`}
            onClick={() => setVistaPanel('vuelos')}
          >
            <Plane size={16} className="inline mr-1" />
            Vuelos ({flightGroups.length})
          </button>
          <button
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              vistaPanel === 'aeropuertos'
                ? 'border-b-2 border-primary text-primary bg-base-100'
                : 'text-base-content/60 hover:text-primary hover:bg-base-300'
            }`}
            onClick={() => setVistaPanel('aeropuertos')}
        >
          {/* sin ícono para aeropuertos */}
          Aeropuertos ({aeropuertos.length})
        </button>
      </div>

        <div ref={panelScrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 bg-base-200 scrollbar-thin scrollbar-thumb-base-300">
          {vistaPanel === 'pedidos' && (
            <>
              {orderStatusList.length === 0 ? (
                <div className="text-center text-base-content/60 mt-12 text-sm px-6 flex flex-col items-center">
                  <div className="w-16 h-16 bg-base-100 rounded-full flex items-center justify-center mb-3">
                    <Package size={32} className="opacity-20" />
                  </div>
                  <p className="font-medium">Sin pedidos operativos</p>
                  <p className="text-xs mt-2 opacity-60">Registra pedidos como "REAL" y ejecuta el planificador.</p>
                </div>
              ) : (
                orderStatusList.map((order) => (
                  <OrderCardDetail key={order.orderId} order={order} formatDateTime={formatDateTime}/>
                ))
              )}
            </>
          )}

          {vistaPanel === 'vuelos' && (
            <SidebarVuelosPanel
              vuelosFiltrados={flightGroups}
              vuelosTotal={flightGroups.length}
              vuelosEnMovimiento={vuelosEnMovimiento}
              selectedFlightId={selectedFlightId}
              onSelectFlight={setSelectedFlightId}
              scrollParent={panelScrollRef.current}
              selectedOrders={null}
              selectedAirportIds={selectedAirportIds}
            />
          )}

          {vistaPanel === 'aeropuertos' && (
            <SidebarAeropuertosPanel
              aeropuertos={aeropuertos}
              activeAirports={activeAirports}
              activeSegments={activeSegments}
              selectedAirportIds={selectedAirportIds}
              onSelectAirport={handleSelectAirport}
              selectedOrders={null}
              scrollParent={panelScrollRef.current}
              onSelectOrders={undefined}
              onSelectFlight={setSelectedFlightId}
            />
          )}
        </div>

        <div className="p-4 bg-base-100 border-t border-base-300 shrink-0">
          <div className="flex justify-between text-[10px] text-base-content/60 mb-2 font-mono">
            <span>Last Sync: {lastUpdated ? formatShortTime(lastUpdated.toISOString()) : '--:--'}</span>
            {!isRealtime && <span className="text-warning">Modo histórico</span>}
          </div>
          <div className="space-y-2">
            <button
              onClick={() => actions.planificar()}
              disabled={isRealtimeDisabled}
              className="btn btn-primary w-full gap-2 font-bold shadow-lg hover:shadow-primary/20 transition-all"
            >
              {isReplanning ? <span className="loading loading-spinner loading-xs"></span> : <Server size={16} />}
              {isReplanning ? 'OPTIMIZANDO...' : 'EJECUTAR PLANIFICADOR'}
            </button>
            <button
              onClick={() => {
                if (window.confirm('¿Eliminar toda la planificación actual?')) {
                  actions.clearPlan();
                }
              }}
              disabled={isClearingPlan || isReplanning || status === 'buffering'}
              className="btn btn-error btn-outline w-full gap-2 font-semibold"
            >
              {isClearingPlan ? <span className="loading loading-spinner loading-xs"></span> : <RefreshCw size={14} />}
              Borrar planificación
            </button>
          </div>
          {!isRealtime && (
            <p className="text-[11px] text-warning mt-2">
              Ajusta el reloj al presente para ejecutar el planificador.
            </p>
          )}
        </div>
      </>
      )}
    </div>
  );
}
