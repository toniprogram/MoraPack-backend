import { Play, Pause, XCircle } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import type { OrderRequest } from '../../types/orderRequest';

interface SidebarFiltersProps {
  ordenesParaSimular: OrderRequest[];
  startDate: string;
  endDate: string;
  setStartDate: Dispatch<SetStateAction<string>>;
  setEndDate: Dispatch<SetStateAction<string>>;
  hastaColapso: boolean;
  setHastaColapso: Dispatch<SetStateAction<boolean>>;
  estaActivo: boolean;
  estaVisualizando: boolean;
  animPaused: boolean;
  isStarting: boolean;
  estaSincronizando: boolean;
  onIniciar: () => void;
  onTerminar: () => void;
  onPausar: () => void;
  filtroHub: string;
  setFiltroHub: Dispatch<SetStateAction<string>>;
  selectedOrderIds: string[] | null;
  clearSelectedOrders: () => void;
  status: string;
}

export function SidebarFilters({
  ordenesParaSimular,
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  hastaColapso,
  setHastaColapso,
  estaActivo,
  estaVisualizando,
  animPaused,
  isStarting,
  estaSincronizando,
  onIniciar,
  onTerminar,
  onPausar,
  filtroHub,
  setFiltroHub,
  selectedOrderIds,
  clearSelectedOrders,
  status,
}: SidebarFiltersProps) {
  const inputsBloqueados = status !== 'idle' && status !== 'completed';
  const formatLocalNoSeconds = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const handleStartChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const v = event.target.value;
    setStartDate(v);
    if (!v) {
      setEndDate('');
      return;
    }
    try {
      const d = new Date(v);
      // add 7 days
      d.setDate(d.getDate() + 7);
      setEndDate(formatLocalNoSeconds(d));
    } catch (e) {
      // ignore parse errors
    }
  };
  return (
    <>
      <div className="bg-primary text-primary-content p-4">
        <div className="space-y-2">
          {ordenesParaSimular.length > 0 && (
            <div className="text-xs text-success-content text-center">
              {ordenesParaSimular.length} órdenes listas para sincronizar
            </div>
          )}

          <div className="space-y-2 text-xs text-base-content/90">
            <div>
              <label className="block uppercase tracking-wide text-[10px] text-base-content/90 mb-1">
                Inicio (UTC)
              </label>
              <input
                type="datetime-local"
                className="input input-sm w-full text-base-content/90"
                value={startDate}
                onChange={handleStartChange}
                disabled={inputsBloqueados}
              />
            </div>
            <div>
              <label className="block uppercase tracking-wide text-[10px] text-base-content/90 mb-1">
                Fin (UTC)
              </label>  
              <input
                type="datetime-local"
              className="input input-sm w-full text-base-content/90"
              value={hastaColapso ? '' : endDate}
              onChange={(event) => setEndDate(event.target.value)}
              disabled={inputsBloqueados || hastaColapso}
            />
            <div className="flex items-center justify-end mt-2 gap-1">
              <span className="text-[10px] text-base-content/90">Hasta el colapso</span>
              <input
                type="checkbox"
                className="toggle toggle-xs toggle-primary"
                checked={hastaColapso}
                onChange={(e) => {
                  setHastaColapso(e.target.checked);
                }}
                disabled={inputsBloqueados}
              />
            </div>
          </div>
          </div>

          <div className="flex gap-2">
            <button
              className={`btn btn-sm flex-1 ${animPaused || (!estaActivo && !estaVisualizando) ? 'btn-success' : (estaActivo ? 'btn-warning' : 'btn-success')}`}
              onClick={() => {
                if (!estaActivo && !estaVisualizando) {
                  onIniciar();
                } else {
                  onPausar();
                }
              }}
              disabled={estaSincronizando || isStarting}
            >
              {animPaused ? (
                <span className="flex items-center gap-2">
                  <Play size={16} /> <span>Reanudar</span>
                </span>
              ) : estaActivo ? (
                <span className="flex items-center gap-2">
                  <Pause size={16} /> <span>Pausar</span>
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Play size={16} /> <span>{isStarting ? 'Preparando...' : (estaVisualizando ? 'Reanudar' : 'Iniciar')}</span>
                </span>
              )}
            </button>

            <button
              className="btn btn-sm btn-error flex-1"
              onClick={onTerminar}
              disabled={isStarting ? true : (!estaActivo && !estaVisualizando)}
            >
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
