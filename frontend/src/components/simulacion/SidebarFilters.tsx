import { Play, Pause, XCircle } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import type { OrderRequest } from '../../types/orderRequest';

interface SidebarFiltersProps {
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
  filtroHub: string;
  setFiltroHub: Dispatch<SetStateAction<string>>;
  selectedOrderIds: string[] | null;
  clearSelectedOrders: () => void;
}

export function SidebarFilters({
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
  filtroHub,
  setFiltroHub,
  selectedOrderIds,
  clearSelectedOrders,
}: SidebarFiltersProps) {
  return (
    <>
      <div className="bg-primary text-primary-content p-4">
        <div className="space-y-2">
          {ordenesParaSimular.length > 0 && (
            <div className="text-xs text-success-content text-center">
              {ordenesParaSimular.length} órdenes listas para sincronizar
            </div>
          )}

          <div className="space-y-2 text-xs text-primary-content/90">
            <div>
              <label className="block uppercase tracking-wide text-[10px] text-primary-content/70 mb-1">
                Inicio (UTC)
              </label>
              <input
                type="datetime-local"
                className="input input-sm w-full"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                disabled={estaActivo}
              />
            </div>
            <div>
              <label className="block uppercase tracking-wide text-[10px] text-primary-content/70 mb-1">
                Fin (UTC)
              </label>
              <input
                type="datetime-local"
                className="input input-sm w-full"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                disabled={estaActivo}
              />
              <p className="text-[10px] text-primary-content/70 mt-1">
                Vacío = usa todo el rango de pedidos proyectados guardados.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              className={`btn btn-sm flex-1 ${estaActivo ? 'btn-warning' : 'btn-primary'}`}
              onClick={() => {
                if (!estaActivo && !estaVisualizando) {
                  onIniciar();
                } else {
                  onPausar();
                }
              }}
              disabled={estaSincronizando || isStarting}
            >
              {estaActivo ? (
                <>
                  <Pause size={16} /> Pausar
                </>
              ) : (
                <>
                  <Play size={16} /> {isStarting ? 'Preparando...' : (estaVisualizando ? 'Reanudar' : 'Iniciar')}
                </>
              )}
            </button>

            <button className="btn btn-sm btn-error flex-1" onClick={onTerminar}>
              <XCircle size={16} /> Terminar
            </button>
          </div>
        </div>
      </div>

      <div className="p-3 bg-base-200 border-b border-base-300 space-y-3">
        <h3 className="text-sm font-semibold text-base-content">Filtros de Visualización</h3>

        <div>
          <label className="block uppercase tracking-wide text-[10px] text-base-content/70 mb-2">
            Hub de Origen
          </label>
          <select
            className="select select-sm w-full"
            value={filtroHub}
            onChange={(e) => setFiltroHub(e.target.value)}
            disabled={false}
          >
            <option value="">Todos</option>
            <option value="SPIM">Lima (SPIM)</option>
            <option value="EBCI">Bruselas (EBCI)</option>
            <option value="UBBB">Baku (UBBB)</option>
          </select>
          {selectedOrderIds && (
            <button
              className="btn btn-ghost btn-xs mt-2"
              onClick={clearSelectedOrders}
            >
              Limpiar selección de avión
            </button>
          )}
        </div>
      </div>
    </>
  );
}
