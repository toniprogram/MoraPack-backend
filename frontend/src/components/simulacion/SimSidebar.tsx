import { Package, Plane } from 'lucide-react';
import { SidebarFilters } from './SidebarFilters';
import { SidebarEnviosPanel } from './SidebarEnviosPanel';
import { SidebarVuelosPanel } from './SidebarVuelosPanel';
import { SidebarAeropuertosPanel } from './SidebarAeropuertosPanel';
import type { Dispatch, SetStateAction } from 'react';
import type { Airport } from '../../types/airport';
import type { EnvioInfo, FlightGroup } from '../../types/simulacionUI';
import type { SimulationSnapshot } from '../../types/simulation';
import type { VueloEnMovimiento } from '../../hooks/useSimulacion';
import type { OrderRequest } from '../../types/orderRequest';

type VistaPanel = 'envios' | 'vuelos' | 'aeropuertos';

interface SimSidebarProps {
  ordenesParaSimular: OrderRequest[];
  startDate: string;
  endDate: string;
  setStartDate: Dispatch<SetStateAction<string>>;
  setEndDate: Dispatch<SetStateAction<string>>;
  estaActivo: boolean;
  estaVisualizando: boolean;
  isStarting: boolean;
  estaSincronizando: boolean;
  onIniciar: () => void;
  onTerminar: () => void;
  onPausar: () => void;
  vistaPanel: VistaPanel;
  setVistaPanel: Dispatch<SetStateAction<VistaPanel>>;
  panelSnapshot: SimulationSnapshot | null;
  enviosFiltrados: EnvioInfo[];
  vuelosFiltrados: FlightGroup[];
  vuelosTotal: number;
  aeropuertos: Airport[];
  filtroHub: string;
  setFiltroHub: Dispatch<SetStateAction<string>>;
  selectedOrderIds: string[] | null;
  clearSelectedOrders: () => void;
  vuelosEnMovimiento: VueloEnMovimiento[];
}

export function SimSidebar({
  ordenesParaSimular,
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  estaActivo,
  estaVisualizando,
  isStarting,
  estaSincronizando,
  onIniciar,
  onTerminar,
  onPausar,
  vistaPanel,
  setVistaPanel,
  panelSnapshot,
  enviosFiltrados,
  vuelosFiltrados,
  vuelosTotal,
  aeropuertos,
  filtroHub,
  setFiltroHub,
  selectedOrderIds,
  clearSelectedOrders,
  vuelosEnMovimiento,
}: SimSidebarProps) {
  return (
    <div className="w-80 bg-base-100 shadow-lg flex flex-col border-r border-base-300">
      <SidebarFilters
        ordenesParaSimular={ordenesParaSimular}
        startDate={startDate}
        endDate={endDate}
        setStartDate={setStartDate}
        setEndDate={setEndDate}
        estaActivo={estaActivo}
        estaVisualizando={estaVisualizando}
        isStarting={isStarting}
        estaSincronizando={estaSincronizando}
        onIniciar={onIniciar}
        onTerminar={onTerminar}
        onPausar={onPausar}
        filtroHub={filtroHub}
        setFiltroHub={setFiltroHub}
        hasSnapshot={!!panelSnapshot}
        selectedOrderIds={selectedOrderIds}
        clearSelectedOrders={clearSelectedOrders}
      />

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

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-base-100">
        {vistaPanel === 'envios' && (
        <SidebarEnviosPanel
          panelSnapshot={panelSnapshot}
          enviosFiltrados={enviosFiltrados}
          ordenesParaSimular={ordenesParaSimular}
        />
      )}

        {vistaPanel === 'vuelos' && (
          <SidebarVuelosPanel
            vuelosFiltrados={vuelosFiltrados}
            vuelosTotal={vuelosTotal}
            vuelosEnMovimiento={vuelosEnMovimiento}
          />
        )}

        {vistaPanel === 'aeropuertos' && (
          <SidebarAeropuertosPanel aeropuertos={aeropuertos} />
        )}
      </div>
    </div>
  );
}
