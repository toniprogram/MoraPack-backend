import { Package, Plane, ChevronLeft, ChevronRight } from 'lucide-react';
import { SidebarFilters } from './SidebarFilters';
import { useState } from 'react';
import { SidebarEnviosPanel } from './SidebarEnviosPanel';
import { SidebarVuelosPanel } from './SidebarVuelosPanel';
import { SidebarAeropuertosPanel } from './SidebarAeropuertosPanel';
import { useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Airport } from '../../types/airport';
import type { EnvioInfo, FlightGroup } from '../../types/simulacionUI';
import type { ActiveAirportTick } from '../../types/simulation';
import type { VueloEnMovimiento } from '../../hooks/useSimulacion';
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
  filtroTexto: string;
  setFiltroTexto: Dispatch<SetStateAction<string>>;
  enviosFiltrados: EnvioInfo[];
  vuelosFiltrados: FlightGroup[];
  vuelosTotal: number;
  aeropuertos: Airport[];
  activeAirports: ActiveAirportTick[];
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
  filtroTexto,
  setFiltroTexto,
  enviosFiltrados,
  vuelosFiltrados,
  vuelosTotal,
  aeropuertos,
  activeAirports,
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
  return (
    <div className={`bg-base-100 shadow-lg flex flex-col border-r border-base-300 transition-all ${collapsed ? 'w-9' : 'w-80'}`}>
      <div className="flex items-center justify-between p-2">
        <div className={`flex items-center gap-2 ${collapsed ? 'hidden' : ''}`}>
          <span className="font-bold text-sm ml-2">Simulación</span>
        </div>
        <button
          aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          className="btn btn-ghost btn-sm btn-square"
          onClick={() => setCollapsed(c => !c)}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
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
