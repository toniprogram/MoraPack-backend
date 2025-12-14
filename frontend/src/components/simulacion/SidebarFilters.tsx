import { Play, Pause, XCircle, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
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
      filtroTexto: string;
      setFiltroTexto: Dispatch<SetStateAction<string>>;
  filtroEstado: 'enproceso' | 'planificados' | 'entregados';
  setFiltroEstado: Dispatch<SetStateAction<'enproceso' | 'planificados' | 'entregados'>>;
  vistaPanel: 'envios' | 'vuelos' | 'aeropuertos';
}

export function SidebarFilters({
  ordenesParaSimular,
  startDate,
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
  filtroTexto,
  setFiltroTexto,
  filtroEstado,
  setFiltroEstado,
  vistaPanel,
}: SidebarFiltersProps) {
  const [draftFiltroTexto, setDraftFiltroTexto] = useState(filtroTexto);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    setDraftFiltroTexto(filtroTexto);
  }, [filtroTexto]);
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

      const getPlaceholder = () => {
        switch (vistaPanel) {
          case 'envios': return 'Buscar pedido';
          case 'vuelos': return 'Buscar vuelo';
          case 'aeropuertos': return 'Buscar aeropuerto';
          default: return 'Buscar...';
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
              {!inputsBloqueados && (
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
              )}

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
            <div>
              <div className="relative">
                <input
                  type="text"
                  placeholder={getPlaceholder()}
                  className="input input-sm w-full pr-8 bg-base-100"
                  value={draftFiltroTexto}
                  onChange={(e) => setDraftFiltroTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setFiltroTexto(draftFiltroTexto);
                    }
                  }}
                />
                <button
                  type="button"
                  className="absolute right-1.5 top-1.5 btn btn-ghost btn-xs px-1"
                  onClick={() => setFiltroTexto(draftFiltroTexto)}
                  aria-label="Aplicar búsqueda"
                >
                  <Search size={16} />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                className="btn btn-ghost btn-xs px-2 h-auto min-h-0 inline-flex items-center gap-1"
                onClick={() => setFiltersOpen(v => !v)}
                aria-label={filtersOpen ? 'Contraer filtros' : 'Expandir filtros'}
              >
                <span className="text-[11px] uppercase tracking-wide text-base-content/70">Filtros</span>
                {filtersOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            </div>

            {filtersOpen && (
              <>
                {vistaPanel === 'envios' && (
                  <div className="form-control">
                    <span className="block uppercase tracking-wide text-[10px] text-base-content/70 mb-1">
                      Estado
                    </span>
                    <div className="btn-group w-full">
                      <button
                        className={`btn btn-xs flex-1 rounded-none first:rounded-l-md ${filtroEstado === 'enproceso' ? 'btn-active' : ''}`}
                        onClick={() => setFiltroEstado('enproceso')}
                      >
                        En proceso
                      </button>
                      <button
                        className={`btn btn-xs flex-1 rounded-none ${filtroEstado === 'planificados' ? 'btn-active' : ''}`}
                        onClick={() => setFiltroEstado('planificados')}
                      >
                        Planificados
                      </button>
                      <button
                        className={`btn btn-xs flex-1 rounded-none last:rounded-r-md ${filtroEstado === 'entregados' ? 'btn-active' : ''}`}
                        onClick={() => setFiltroEstado('entregados')}
                      >
                        Entregados
                      </button>
                    </div>
                  </div>
                )}
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
              </>
            )}
          </div>
        </>
      );
    }
