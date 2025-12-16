import { useMemo } from 'react';
import { Plane, Box, Check, Wifi, WifiOff } from 'lucide-react';
import type { OperationMetrics, SegmentoVuelo } from '../../hooks/useOperacion';

interface OperacionTopBarProps {
  metrics: OperationMetrics;
  simClock: Date;
  status: 'idle' | 'buffering' | 'running' | 'error';
  activeSegments: SegmentoVuelo[];
  lastUpdated: Date | null;
}

export function OperacionTopBar({
  metrics,
  simClock,
  status,
  activeSegments,
  lastUpdated
}: OperacionTopBarProps) {

  // Lógica de porcentaje de carga de flota
  const { capacidadUsada, capacidadTotal, capacidadPct } = useMemo(() => {
      let used = 0;
      let total = 0;

      const nowMs = simClock.getTime();

      activeSegments.forEach(seg => {
        // 1. Validamos fechas
        if (!seg.departureUtc || !seg.arrivalUtc) return;
        const dep = Date.parse(seg.departureUtc);
        const arr = Date.parse(seg.arrivalUtc);
        // 2. Solo contamos si el avión está volando AHORA
        const isFlying = nowMs >= dep && nowMs < arr;
        if (isFlying) {
          used += seg.capacityUsed || (seg.routeQuantity || 0);
          total += seg.capacityTotal || 0;
        }
      });
      // Si no hay vuelos activos, el porcentaje es 0 (no 100 ni NaN)
      const pct = total > 0 ? Math.round((used / total) * 100) : 0;
      return { capacidadUsada: used, capacidadTotal: total, capacidadPct: pct };
    }, [activeSegments, simClock]);

  const capacidadColorClass = useMemo(() => {
    if (capacidadPct > 70) return 'text-error';
    if (capacidadPct > 40) return 'text-warning';
    return 'text-success';
  }, [capacidadPct]);

  return (
    <div className="absolute top-0 left-0 w-full p-2 z-[1000] pointer-events-none flex justify-between items-start">

      {/* === IZQUIERDA: LOS 3 INDICADORES IDÉNTICOS A SIMULACIÓN === */}
      <div className="flex flex-col gap-2 pointer-events-auto">
        <div className="flex gap-3 bg-base-100/90 backdrop-blur px-3 py-1.5 rounded-lg shadow-sm border border-base-content/10 w-fit">

          {/* 1. ENTREGADOS (Check - Verde) */}
          <div className="flex items-center gap-1.5 tooltip tooltip-right" data-tip="Pedidos Entregados">
            <Check size={14} className="text-success" />
            <span className="font-mono font-bold text-xs">{metrics.deliveredOrders}</span>
          </div>

          {/* 2. EN TRÁNSITO (Box - Azul Info) */}
          <div className="flex items-center gap-1.5 tooltip tooltip-right" data-tip="Pedidos En Tránsito">
            <Box size={14} className="text-info" />
            <span className="font-mono font-bold text-xs">{metrics.ordersInTransit}</span>
          </div>

          {/* 3. VUELOS ACTIVOS (Plane - Azul cielo) */}
          <div className="flex items-center gap-1.5 tooltip tooltip-right" data-tip="Vuelos Activos">
            <Plane size={14} className="text-blue-400" />
            <span className="font-mono font-bold text-xs">{metrics.activeFlights}</span>
          </div>
        </div>

        {/* Barra de Capacidad (Igual que simulación) */}
        <div className="bg-base-300/90 px-2 py-1 rounded-lg text-[10px] shadow-sm backdrop-blur flex items-center gap-2 w-fit border border-base-content/5">
          <span className="text-base-content/70 font-semibold uppercase">Capacidad Flota</span>
          <span className={`font-mono font-bold ${capacidadColorClass} text-sm`}>
            {capacidadPct}%
          </span>
        </div>
      </div>

      {/* === CENTRO: RELOJ === */}
      <div className="absolute right-[-12%] -translate-x-1/2 top-2 flex items-center gap-2 pointer-events-auto">
        <div className="flex items-center gap-2 bg-base-100/40 backdrop-blur-md px-2 py-1 rounded-xl border border-base-content/5 shadow-sm">
            <span className="text-[10px] font-bold text-base-content/70 uppercase tracking-wide mr-1">
             Operación:
            </span>
            <div className="tooltip tooltip-bottom" data-tip="Fecha de Operación">
                <div className="badge badge-neutral text-base-content text-[11px] font-mono shadow-sm border-base-content/10 whitespace-nowrap">
                    📅 {simClock.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}
                </div>
            </div>
            <div className="tooltip tooltip-bottom" data-tip="Hora de Operación">
                <div className="badge badge-neutral text-base-content text-[11px] font-mono shadow-sm border-base-content/10 whitespace-nowrap">
                    🕒 {simClock.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' })}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}