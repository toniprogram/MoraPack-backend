import { Search, ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction, ReactNode } from 'react';
import type { OrderRequest } from '../../types/orderRequest';
interface SidebarFiltersProps {
  ordenesParaSimular: OrderRequest[];
  startDate: string;
  endDate: string;
  setStartDate: Dispatch<SetStateAction<string>>;
  setEndDate: Dispatch<SetStateAction<string>>;
  hastaColapso: boolean;
  setHastaColapso: Dispatch<SetStateAction<boolean>>;
  filtroHub: string;
  setFiltroHub: Dispatch<SetStateAction<string>>;
  selectedOrderIds: string[] | null;
  clearSelectedOrders: () => void;
  status: string;
  filtroTexto: string;
  setFiltroTexto: Dispatch<SetStateAction<string>>;
  filtroEstado: 'enproceso' | 'planificados' | 'entregados';
  setFiltroEstado: Dispatch<SetStateAction<'enproceso' | 'planificados' | 'entregados'>>;
  vistaPanel: 'envios' | 'pedidos' | 'vuelos' | 'aeropuertos';
  afterDates?: ReactNode;
  hideDateSection?: boolean;
  tipoVuelo?: 'ocupados' | 'vacios';
  setTipoVuelo?: (t: 'ocupados' | 'vacios') => void;
}
export function SidebarFilters({
  ordenesParaSimular,
  startDate,
  setStartDate,
  setEndDate,
  hastaColapso,
  setHastaColapso,
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
  afterDates,
  hideDateSection = false,
  tipoVuelo,
  setTipoVuelo
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
      // add 7 days logic from your snippet
      d.setDate(d.getDate() + 7);
      setEndDate(formatLocalNoSeconds(d));
    } catch (e) {
      // ignore parse errors
    }
  };
  const getPlaceholder = () => {
    switch (vistaPanel) {
      case 'envios':
      case 'pedidos': return 'Buscar pedido';
      case 'vuelos': return 'Buscar vuelo';
      case 'aeropuertos': return 'Buscar aeropuerto';
      default: return 'Buscar...';
    }
  };
  return (
    <>
      {!hideDateSection && (
        <div className="bg-base-100 text-base-content space-y-2 border-b border-base-300 p-3">
          {ordenesParaSimular.length > 0 && (
            <div className="text-xs text-success text-center">
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
              <div className="flex items-center justify-end gap-1">
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
          )}

          {afterDates}
        </div>
      )}
      <div className="p-3 bg-base-200 border-b border-base-300 space-y-3">
        {/* BARRA DE BUSQUEDA */}
        <div className="flex gap-1 items-center">
          <input
            type="text"
            placeholder={getPlaceholder()}
            className="input input-sm w-full bg-base-100"
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
            className="btn btn-sm px-3 bg-base-200 border border-base-300 text-base-content/80 hover:bg-base-300"
            onClick={() => setFiltroTexto(draftFiltroTexto)}
            aria-label="Aplicar búsqueda"
          >
            <Search size={16} />
          </button>
        </div>
        {/* BOTON EXPANDIR FILTROS */}
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
        {/* CONTENIDO DE FILTROS */}
        {filtersOpen && (
          <div className="animate-in fade-in slide-in-from-top-1 duration-200 space-y-3">
            {/* FILTRO ESTADO */}
            {(vistaPanel === 'envios' || vistaPanel === 'pedidos') && (
              <div className="form-control">
                <div className="btn-group w-full flex">
                  <button
                    className={`btn btn-xs flex-1 rounded-none first:rounded-l-md ${filtroEstado === 'enproceso' ? 'btn-active btn-primary' : ''}`}
                    onClick={() => setFiltroEstado('enproceso')}
                  >
                    En proceso
                  </button>
                  <button
                    className={`btn btn-xs flex-1 rounded-none ${filtroEstado === 'planificados' ? 'btn-active btn-primary' : ''}`}
                    onClick={() => setFiltroEstado('planificados')}
                  >
                    Planif.
                  </button>
                  <button
                    className={`btn btn-xs flex-1 rounded-none last:rounded-r-md ${filtroEstado === 'entregados' ? 'btn-active btn-primary' : ''}`}
                    onClick={() => setFiltroEstado('entregados')}
                  >
                    Entregados
                  </button>
                </div>
              </div>
            )}
            {/* FILTRO TIPO DE VUELO */}
            {vistaPanel === 'vuelos' && tipoVuelo && setTipoVuelo && (
                <div className="form-control">
                    <div className="btn-group w-full flex">
                        <button
                            className={`btn btn-xs flex-1 rounded-none first:rounded-l-md ${tipoVuelo === 'ocupados' ? 'btn-active btn-primary' : ''}`}
                            onClick={() => setTipoVuelo('ocupados')}
                        >
                            Con Carga
                        </button>
                        <button
                            className={`btn btn-xs flex-1 rounded-none last:rounded-r-md ${tipoVuelo === 'vacios' ? 'btn-active btn-primary' : ''}`}
                            onClick={() => setTipoVuelo('vacios')}
                        >
                            Vacíos
                        </button>
                    </div>
                </div>
            )}

            {/* FILTRO HUB */}
            <div>
              <label className="block uppercase tracking-wide text-[10px] text-base-content/70 mb-2">
                Hub de Origen
              </label>
              <select
                className="select select-sm w-full"
                value={filtroHub}
                onChange={(e) => setFiltroHub(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="SPIM">Lima (SPIM)</option>
                <option value="EBCI">Bruselas (EBCI)</option>
                <option value="UBBB">Baku (UBBB)</option>
              </select>
              {selectedOrderIds && (
                <button
                  className="btn btn-ghost btn-xs mt-2 w-full"
                  onClick={clearSelectedOrders}
                >
                  Limpiar selección de avión
                </button>
              )}
            </div>

          </div>
        )}
      </div>
    </>
  );
}