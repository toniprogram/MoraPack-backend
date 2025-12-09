import { Package, Plane, ChevronLeft, ChevronRight, Play, Pause, XCircle } from 'lucide-react';
import { SidebarFilters } from './SidebarFilters';
import { useState, useRef } from 'react';
import { SidebarEnviosPanel } from './SidebarEnviosPanel';
import { SidebarVuelosPanel } from './SidebarVuelosPanel';
import { SidebarAeropuertosPanel } from './SidebarAeropuertosPanel';
import type { Dispatch, SetStateAction } from 'react';
import type { Airport } from '../../types/airport';
import type { EnvioInfo, FlightGroup } from '../../types/simulacionUI';
import type { ActiveAirportTick } from '../../types/simulation';
import type { VueloEnMovimiento, SegmentoVuelo } from '../../hooks/useSimulacion';
import type { OrderRequest } from '../../types/orderRequest';

type VistaPanel = 'envios' | 'vuelos' | 'aeropuertos';

interface SimSidebarProps {
  ordenesParaSimular: OrderRequest[];
  startDate: string;
  endDate: string;
  setStartDate: Dispatch<SetStateAction<string>>;
  setEndDate: Dispatch<SetStateAction<string>>;
  hastaColapso: boolean;
  setHastaColapso: Dispatch<SetStateAction<boolean>>;
  estaActivo: boolean;
  estaVisualizando: boolean;
  isStarting: boolean;
  estaSincronizando: boolean;
  onIniciar: () => void;
  onTerminar: () => void;
  onPausar: () => void;
  vistaPanel: VistaPanel;
  setVistaPanel: Dispatch<SetStateAction<VistaPanel>>;
  filtroEstado: 'enproceso' | 'planificados' | 'entregados' | 'todos';
  setFiltroEstado: Dispatch<SetStateAction<'enproceso' | 'planificados' | 'entregados' | 'todos'>>;
  filtroTexto: string;
  setFiltroTexto: Dispatch<SetStateAction<string>>;
  enviosFiltrados: EnvioInfo[];
  vuelosFiltrados: FlightGroup[];
  vuelosTotal: number;
  aeropuertos: Airport[];
  activeAirports: ActiveAirportTick[];
  activeSegments: SegmentoVuelo[];
  filtroHub: string;
  setFiltroHub: Dispatch<SetStateAction<string>>;
  selectedOrderIds: string[] | null;
  onSelectOrders: (orderIds: string[] | null) => void;
  clearSelectedOrders: () => void;
  vuelosEnMovimiento: VueloEnMovimiento[];
  selectedFlightId: string | null;
  onSelectFlight: (flightId: string | null) => void;
  selectedAirportIds: string[] | null;
  onSelectAirport: (airportId: string | null) => void;
  animPaused: boolean;
  status: string;
}

export function SimSidebar({
  ordenesParaSimular,
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  hastaColapso,
  setHastaColapso,
  estaActivo,
  estaVisualizando,
  isStarting,
  estaSincronizando,
  onIniciar,
  onTerminar,
  onPausar,
  vistaPanel,
  setVistaPanel,
  filtroEstado,
  setFiltroEstado,
  filtroTexto,
  setFiltroTexto,
  enviosFiltrados,
  vuelosFiltrados,
  vuelosTotal,
  aeropuertos,
  activeAirports,
  activeSegments,
  filtroHub,
  setFiltroHub,
  selectedOrderIds,
  onSelectOrders,
  clearSelectedOrders,
  vuelosEnMovimiento,
  selectedFlightId,
  onSelectFlight,
  selectedAirportIds,
  onSelectAirport,
  animPaused,
  status,
}: SimSidebarProps) {
  const [collapsed, setCollapsed] = useState(true);
  const enviosToShow = enviosFiltrados;
  const vuelosToShow = vuelosFiltrados;
  const scrollRef = useRef<HTMLDivElement>(null);
  const controlIsDisabled = estaSincronizando || isStarting;
  const terminarDisabled = isStarting ? true : (!estaActivo && !estaVisualizando);
  const isPaused = animPaused || status === 'paused';
  const playPauseIcon = isPaused || (!estaActivo && !estaVisualizando) ? <Play size={16} /> : <Pause size={16} />;
  const playPauseClass = isPaused || (!estaActivo && !estaVisualizando)
    ? 'btn-success'
    : (estaActivo ? 'btn-warning' : 'btn-success');
  return (
    <div className={`bg-base-100 shadow-lg flex flex-col border-r border-base-300 transition-all ${collapsed ? 'w-9' : 'w-80'}`}>
      <div className="flex items-center justify-between px-2 py-1 border-b border-base-300">
        <div className={`flex items-center gap-2 ${collapsed ? 'hidden' : ''}`}>
          <span className="font-semibold text-xs ml-1 tracking-wide">Parámetros de simulación</span>
        </div>
        <button
          aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          className="btn btn-ghost btn-xs btn-square"
          onClick={() => setCollapsed(c => !c)}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
      {collapsed && (
        <div className="flex flex-col items-center gap-2 pb-2 pt-2">
          <button
            className={`btn btn-circle btn-xs ${playPauseClass}`}
            onClick={() => {
              if (!estaActivo && !estaVisualizando) {
                onIniciar();
              } else {
                onPausar();
              }
            }}
            disabled={controlIsDisabled}
            title={animPaused ? 'Reanudar' : (!estaActivo && !estaVisualizando ? 'Iniciar' : 'Pausar/Reanudar')}
          >
            {playPauseIcon}
          </button>
          <button
            className="btn btn-circle btn-xs btn-error"
            onClick={onTerminar}
            disabled={terminarDisabled}
            title="Terminar simulación"
          >
            <XCircle size={16} />
          </button>
        </div>
      )}
      {!collapsed && (
      <SidebarFilters
        ordenesParaSimular={ordenesParaSimular}
            startDate={startDate}
            endDate={endDate}
            setStartDate={setStartDate}
            setEndDate={setEndDate}
            hastaColapso={hastaColapso}
            setHastaColapso={setHastaColapso}
            estaActivo={estaActivo}
            estaVisualizando={estaVisualizando}
            animPaused={animPaused}
            status={status}
            isStarting={isStarting}
            estaSincronizando={estaSincronizando}
            onIniciar={onIniciar}
            onTerminar={onTerminar}
            onPausar={onPausar}
        filtroHub={filtroHub}
        setFiltroHub={setFiltroHub}
        selectedOrderIds={selectedOrderIds}
        clearSelectedOrders={clearSelectedOrders}
        filtroTexto={filtroTexto}
        setFiltroTexto={setFiltroTexto}
        filtroEstado={filtroEstado}
        setFiltroEstado={setFiltroEstado}
        vistaPanel={vistaPanel}
      />
      )}

      {!collapsed && (
      <div className="flex border-b border-base-300 bg-base-200">
        <button
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            vistaPanel === 'envios'
              ? 'border-b-2 border-primary text-primary bg-base-100'
              : 'text-base-content/60 hover:text-primary hover:bg-base-300'
          }`}
          onClick={() => setVistaPanel('envios')}
        >
          <Package size={16} className="inline mr-1" />
          Peds. ({enviosFiltrados.length})
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
          Vuelos ({vuelosFiltrados.length})
        </button>
        <button
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            vistaPanel === 'aeropuertos'
              ? 'border-b-2 border-primary text-primary bg-base-100'
              : 'text-base-content/60 hover:text-primary hover:bg-base-300'
          }`}
          onClick={() => setVistaPanel('aeropuertos')}
        >
          Aeropuertos
        </button>
      </div>
      )}

      <div ref={scrollRef} className={`flex-1 overflow-y-auto p-3 space-y-2 bg-base-100 ${collapsed ? 'p-0' : ''}`}>
        { !collapsed && vistaPanel === 'envios' && (
          <SidebarEnviosPanel
            enviosFiltrados={enviosToShow}
            ordenesParaSimular={ordenesParaSimular}
            selectedOrders={selectedOrderIds}
            onSelectOrders={onSelectOrders}
            scrollParent={scrollRef.current}
          />
        )}

        { !collapsed && vistaPanel === 'vuelos' && (
          <SidebarVuelosPanel
            vuelosFiltrados={vuelosToShow}
            vuelosTotal={vuelosTotal}
            vuelosEnMovimiento={vuelosEnMovimiento}
            selectedFlightId={selectedFlightId}
            onSelectFlight={onSelectFlight}
            scrollParent={scrollRef.current}
            selectedOrders={selectedOrderIds}
            selectedAirportIds={selectedAirportIds}
          />
        )}

        { !collapsed && vistaPanel === 'aeropuertos' && (
          <SidebarAeropuertosPanel
            aeropuertos={aeropuertos}
            activeAirports={activeAirports}
            activeSegments={activeSegments}
            selectedAirportIds={selectedAirportIds}
            onSelectAirport={onSelectAirport}
            selectedOrders={selectedOrderIds}
            scrollParent={scrollRef.current}
            onSelectOrders={onSelectOrders}
          />
        )}
      </div>
    </div>
  );
}
