import { useMemo, useRef, useState } from 'react';
import { Radio, Server, Package, Plane, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, Clock3 } from 'lucide-react';
import type { Airport } from '../../types/airport';
import type { ActiveAirportTick } from '../../types/simulation';
import type { FlightGroup } from '../../types/simulacionUI';
import type { OperationMetrics, OrderStatusDetail, SegmentoVuelo, VueloEnMovimiento } from '../../hooks/useOperacion';
import { SidebarVuelosPanel } from '../simulacion/SidebarVuelosPanel';
import { SidebarAeropuertosPanel } from '../simulacion/SidebarAeropuertosPanel';
import { PedidoCard, type PedidoCardData } from '../shared/PedidoCard';
import { SidebarTabs } from '../shared/SidebarTabs';
import { SidebarFilters } from '../simulacion/SidebarFilters';

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
  const inputValue = getInputValue();
  const canApplyTime = useMemo(() => {
    const parsed = new Date(inputValue);
    if (Number.isNaN(parsed.getTime())) return false;
    const simStr = simClock.toISOString().slice(0, 16);
    return inputValue !== simStr;
  }, [inputValue, simClock]);
  const [collapsed, setCollapsed] = useState(false);
  const [vistaPanel, setVistaPanel] = useState<'pedidos' | 'vuelos' | 'aeropuertos'>('pedidos');
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [selectedAirportIds, setSelectedAirportIds] = useState<string[] | null>(null);
  const [timeCollapsed, setTimeCollapsed] = useState(false);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [hastaColapso, setHastaColapso] = useState(false);
  const [filtroHub, setFiltroHub] = useState('');
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'enproceso' | 'planificados' | 'entregados'>('enproceso');
  const panelScrollRef = useRef<HTMLDivElement | null>(null);

  const flightGroups: FlightGroup[] = useMemo(() => {
      const nowMs = simClock.getTime(); // Obtenemos el tiempo actual de simulación

      // Filtramos primero para quedarnos solo con los que ya salieron (o están saliendo)
      const activeNow = activeSegments.filter(seg => {
          const dep = Date.parse(seg.departureUtc);
          return dep <= nowMs;
      });

      return activeNow.map(seg => {
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
    }, [activeSegments, simClock]);

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

  const mapEstado = (s: OrderStatusDetail['status']) => {
    switch (s) {
      case 'IN_FLIGHT': return 'En vuelo';
      case 'WAITING': return 'Planificado';
      case 'LAYOVER': return 'Escala';
      case 'COMPLETED': return 'Entregado';
      default: return s;
    }
  };

  const filteredOrders = useMemo(() => {
    return orderStatusList.filter((o) => {
      if (filtroTexto) {
        const t = filtroTexto.toLowerCase();
        const match = o.orderId.toLowerCase().includes(t)
          || o.finalDestination?.toLowerCase().includes(t)
          || (o.currentFlightId ?? '').toLowerCase().includes(t);
        if (!match) return false;
      }
      if (filtroHub) {
        const hub = (o.finalDestination ?? '').toLowerCase();
        if (!hub.includes(filtroHub.toLowerCase())) return false;
      }
      const st = o.status;
      if (filtroEstado === 'planificados' && st !== 'WAITING') return false;
      if (filtroEstado === 'entregados' && st !== 'COMPLETED') return false;
      if (filtroEstado === 'enproceso' && st === 'COMPLETED') return false;
      return true;
    });
  }, [orderStatusList, filtroTexto, filtroHub, filtroEstado]);

  const vuelosFiltrados = useMemo<FlightGroup[]>(() => {
        const term = filtroTexto.toLowerCase();
        if (!term) return flightGroups;

        return flightGroups.filter(v => {
          return (
            v.flightId.toLowerCase().includes(term) ||
            v.origen.toLowerCase().includes(term) ||
            v.destino.toLowerCase().includes(term) ||
            v.pedidos.some(p => p.toLowerCase().includes(term))
          );
        });
    }, [flightGroups, filtroTexto]);
    const aeropuertosFiltrados = useMemo(() => {
        const term = filtroTexto.toLowerCase();
        if (!term) return aeropuertos;

        return aeropuertos.filter(a => {
          const nameMatch = a.name?.toLowerCase().includes(term);
          const cityMatch = (a as any).city?.toLowerCase().includes(term);
          const codeMatch = (a.code || a.id)?.toLowerCase().includes(term);

          return nameMatch || cityMatch || codeMatch;
        });
    }, [aeropuertos, filtroTexto]);



  return (
    <div className={`max-w-full flex flex-col bg-base-100 z-20 h-full max-h-full shrink-0 border-r border-base-300 shadow-lg transition-all overflow-hidden ${collapsed ? 'w-9' : 'w-80'}`}>
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
      <div className="p-2 bg-base-100 border-b border-base-300 shrink-0 space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold uppercase text-base-content/70 flex items-center gap-2">
            <span>Hora de operación (UTC)</span>
            <span className="badge badge-ghost badge-xs font-mono">UTC</span>
          </label>
          <button
            className="btn btn-ghost btn-xs btn-square"
            onClick={() => setTimeCollapsed(v => !v)}
          >
            {timeCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>

        {!timeCollapsed && (
          <>
            <div className="flex gap-1">
              <input
                type="datetime-local"
                className="input input-xs input-bordered w-full font-mono"
                value={inputValue}
                onChange={handleTimeChange}
              />
              <button
                onClick={() => actions.setManualTime(new Date(`${getInputValue()}:00Z`))}
                className="btn btn-xs btn-outline btn-square"
                disabled={!canApplyTime}
                title="Aplicar hora"
              >
                <Clock3 size={14} />
              </button>
              <button
                onClick={() => actions.resetTime()}
                className="btn btn-xs btn-outline"
                title="Volver al presente"
              >
                <RefreshCw size={14} />
              </button>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => actions.planificar()}
                disabled={isRealtimeDisabled}
                className="btn btn-primary btn-xs flex-1 gap-1.5 font-bold shadow-lg hover:shadow-primary/20 transition-all"
              >
                {isReplanning ? <span className="loading loading-spinner loading-xs"></span> : <Server size={16} />}
                {isReplanning ? 'Optimizando' : 'Planificar'}
              </button>
              <button
                onClick={() => {
                  if (window.confirm('¿Eliminar toda la planificación actual?')) {
                    actions.clearPlan();
                  }
                }}
                disabled={isClearingPlan || isReplanning || status === 'buffering'}
                className="btn btn-error btn-outline btn-xs flex-1 gap-1.5 font-semibold"
              >
                {isClearingPlan ? <span className="loading loading-spinner loading-xs"></span> : <RefreshCw size={14} />}
                Eliminar plan
              </button>
            </div>
          </>
        )}

        {timeCollapsed && (
          <div className="flex items-center justify-between text-xs text-base-content/70 border border-base-300 rounded-lg px-2 py-1">
            <span className="font-mono">{getInputValue()}</span>
            <div className="flex gap-1">
              <button
                onClick={() => actions.resetTime()}
                className="btn btn-ghost btn-xs btn-square"
                title="Volver al presente"
              >
                <RefreshCw size={12} />
              </button>
              <button
                onClick={() => actions.planificar()}
                disabled={isRealtimeDisabled}
                className="btn btn-primary btn-xs btn-square"
              >
                {isReplanning ? <span className="loading loading-spinner loading-2xs"></span> : <Server size={12} />}
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {!collapsed && (
      <>
        <SidebarFilters
          ordenesParaSimular={[]}
          startDate={startDate}
          endDate={endDate}
          setStartDate={setStartDate}
          setEndDate={setEndDate}
          hastaColapso={hastaColapso}
          setHastaColapso={setHastaColapso}
          filtroHub={filtroHub}
          setFiltroHub={setFiltroHub}
          selectedOrderIds={null}
          clearSelectedOrders={() => {}}
          status={status}
          filtroTexto={filtroTexto}
          setFiltroTexto={setFiltroTexto}
          filtroEstado={filtroEstado}
          setFiltroEstado={setFiltroEstado}
          vistaPanel={vistaPanel === 'pedidos' ? 'envios' : vistaPanel}
          hideDateSection
        />

        <SidebarTabs
          activeKey={vistaPanel}
          onChange={(key) => setVistaPanel(key as typeof vistaPanel)}
          items={[
            { key: 'pedidos', label: (<><Package size={16} className="inline mr-1" />Peds. ({orderStatusList.length})</>) },
            { key: 'vuelos', label: (<><Plane size={16} className="inline mr-1" />Vuelos ({flightGroups.length})</>) },
            { key: 'aeropuertos', label: (<>Aeropuertos</>) },
          ]}
        />

        <div ref={panelScrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 bg-base-200 scrollbar-thin scrollbar-thumb-base-300">
          {vistaPanel === 'pedidos' && (
            <>
              {filteredOrders.length === 0 ? (
                <div className="text-center text-base-content/60 mt-12 text-sm px-6 flex flex-col items-center">
                  <div className="w-16 h-16 bg-base-100 rounded-full flex items-center justify-center mb-3">
                    <Package size={32} className="opacity-20" />
                  </div>
                  <p className="font-medium">Sin pedidos operativos</p>
                  <p className="text-xs mt-2 opacity-60">Registra pedidos como "REAL" y ejecuta el planificador.</p>
                </div>
              ) : (
                filteredOrders.map((order) => {
                  const rutas = (order.routesDetail ?? []).map(r => ({
                    routeIndex: r.routeIndex,
                    segments: r.segments.map(seg => ({
                      flightId: seg.flightId,
                      origin: seg.origin,
                      destination: seg.destination,
                      departureUtc: seg.departureUtc,
                      arrivalUtc: seg.arrivalUtc,
                      quantity: seg.quantity,
                    }))
                  })).filter(r => r.segments.length > 0);

                  const cardData: PedidoCardData = {
                    orderId: order.orderId,
                    estado: mapEstado(order.status),
                    cantidad: order.quantity,
                    slackMinutes: order.slackMinutes,
                    creationMs: undefined,
                    arrivalMs: order.arrivalTime ? Date.parse(order.arrivalTime) : undefined,
                    origen: order.originAirport,
                    destino: order.finalDestination,
                    currentFlightId: order.currentFlightId,
                    progressPct: order.progress,
                    rutas,
                  };

                  return (
                    <PedidoCard
                      key={order.orderId}
                      data={cardData}
                      isSelected={false}
                      hasSelection={false}
                      currentTime={simClock}
                      onSelect={() => {}}
                    />
                  );
                })
              )}
            </>
          )}

          {vistaPanel === 'vuelos' && (
            <SidebarVuelosPanel
              //vuelosFiltrados={flightGroups}
              vuelosFiltrados={vuelosFiltrados}
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
              //aeropuertos={aeropuertos}
              aeropuertos={aeropuertosFiltrados}
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

        {/* Se omite barra inferior para ahorrar espacio */}
      </>
      )}
    </div>
  );
}
