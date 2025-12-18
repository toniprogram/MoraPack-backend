import { useMemo } from 'react';
import { Plane, Box, Check } from 'lucide-react';
import type { OperationMetrics, SegmentoVuelo } from '../../hooks/useOperacion';
interface OperacionTopBarProps {
  metrics: OperationMetrics;
  simClock: Date;
  status: 'idle' | 'buffering' | 'running' | 'error';
  activeSegments: SegmentoVuelo[];
  lastUpdated: Date | null;
  showGhostFlights: boolean;
  onToggleGhostFlights: () => void;
}
export function OperacionTopBar({
  metrics,
  simClock,
  //status,
  activeSegments,
  //lastUpdated,
  showGhostFlights,
  onToggleGhostFlights
}: OperacionTopBarProps) {
  // Lógica de porcentaje de carga de flota
  const { capacidadPct } = useMemo(() => {
      let used = 0;
      let total = 0;
      const nowMs = simClock.getTime();
      activeSegments.forEach(seg => {
        if (!seg.departureUtc || !seg.arrivalUtc) return;
        const dep = Date.parse(seg.departureUtc);
        const arr = Date.parse(seg.arrivalUtc);
        const isFlying = nowMs >= dep && nowMs < arr;
        if (isFlying) {
          used += seg.capacityUsed || (seg.routeQuantity || 0);
          total += seg.capacityTotal || 0;
        }
      });
      const pct = total > 0 ? Math.round((used / total) * 100) : 0;
      return { capacidadUsada: used, capacidadTotal: total, capacidadPct: pct };
    }, [activeSegments, simClock]);
  const capacidadColorClass = useMemo(() => {
    if (capacidadPct >= 70) return 'text-error';
    if (capacidadPct >= 40) return 'text-warning';
    return 'text-success';
  }, [capacidadPct]);
  return (
    <div className="absolute top-0 left-0 w-full p-2 z-[1000] pointer-events-none flex justify-between items-start">
      {/* === IZQUIERDA: CONTROLES E INDICADORES === */}
      <div className="flex flex-col gap-2 pointer-events-auto">
        {/* --- TOGGLE DE AVIONES VACÍOS  --- */}
        <div className="bg-base-100/90 backdrop-blur px-3 py-1.5 rounded-lg shadow-sm border border-base-content/10 w-fit form-control">
            <label className="label cursor-pointer gap-3 p-0">
                <span className="label-text text-[11px] font-bold text-base-content/80 uppercase tracking-wide">
                    Mostrar Vuelos Vacíos
                </span>
                <input
                    type="checkbox"
                    className="toggle toggle-xs toggle-primary"
                    checked={showGhostFlights}
                    onChange={onToggleGhostFlights}
                />
            </label>
        </div>
        {/* 1. MÉTRICAS (Entregados, Tránsito, Activos) */}
        <div className="flex gap-3 bg-base-100/90 backdrop-blur px-3 py-1.5 rounded-lg shadow-sm border border-base-content/10 w-fit">
          {/* Entregados */}
          <div className="flex items-center gap-1.5 tooltip tooltip-right" data-tip="Pedidos Entregados">
            <Check size={14} className="text-success" />
            <span className="font-mono font-bold text-xs">{metrics.deliveredOrders}</span>
          </div>
          {/* En Tránsito */}
          <div className="flex items-center gap-1.5 tooltip tooltip-right" data-tip="Productos En Tránsito">
            <Box size={14} className="text-info" />
            <span className="font-mono font-bold text-xs">{metrics.ordersInTransit}</span>
          </div>
          {/* Vuelos Activos */}
          <div className="flex items-center gap-1.5 tooltip tooltip-right" data-tip="Vuelos Activos">
            <Plane size={14} className="text-blue-400" />
            <span className="font-mono font-bold text-xs">{metrics.activeFlights}</span>
          </div>
        </div>
        {/* 2. BARRA DE CAPACIDAD */}
        <div className="bg-base-300/90 px-2 py-1 rounded-lg text-[10px] shadow-sm backdrop-blur flex items-center gap-2 w-fit border border-base-content/5">
          <span className="text-base-content/70 font-semibold uppercase">Capacidad Flota Total</span>
          <span className={`font-mono font-bold ${capacidadColorClass} text-sm`}>
            {capacidadPct}%
          </span>
        </div>
      </div>
      {/* === CENTRO/DERECHA: RELOJ === */}
      <div className="absolute right-[-5%] -translate-x-1/2 top-2 flex items-center gap-2 pointer-events-auto">
        <div className="flex items-center gap-2 bg-base-100/40 backdrop-blur-md px-2 py-1 rounded-xl border border-base-content/5 shadow-sm">
            <span className="text-[10px] font-bold text-base-content/70 uppercase tracking-wide mr-1">
             Operación:
            </span>
            <div className="tooltip tooltip-bottom" data-tip="Fecha de Operación">
                <div className="badge badge-neutral text-white text-[11px] font-mono shadow-sm border-base-content/10 whitespace-nowrap">
                    📅 {simClock.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}
                </div>
            </div>
            <div className="tooltip tooltip-bottom" data-tip="Hora de Operación">
                <div className="badge badge-neutral text-white text-[11px] font-mono shadow-sm border-base-content/10 whitespace-nowrap">
                    🕒 {simClock.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' })}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}