import { useMemo } from 'react';
import { Check, Plane, Box } from 'lucide-react';

interface SimTopBarProps {
  entregados: number;
  enTransito: number;
  vuelosActivos: number;
  reloj: string;
  tiempoSimulado: Date | null;
  estaActivo: boolean;
  engineSpeed: number;
  startRealMs: number | null;
  elapsedRealMs: number;
  formatElapsed: (ms: number) => string;
  capacidadUsadaFlota?: number;
  capacidadTotalFlota?: number;
}

export function SimTopBar({
  entregados,
  enTransito,
  vuelosActivos,
  reloj,
  tiempoSimulado,
  estaActivo,
  engineSpeed,
  startRealMs,
  elapsedRealMs,
  formatElapsed,
  capacidadUsadaFlota = 0,
  capacidadTotalFlota = 0,
}: SimTopBarProps) {
  const badgesTiempo = useMemo(() => {
    if (!tiempoSimulado) return null;
    return (
      <>
        <div className="badge badge-neutral text-base-content">
          📅 {tiempoSimulado.toLocaleDateString('es-PE', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC'
          })}
        </div>
        <div className="badge badge-neutral text-base-content">
          🕒 {tiempoSimulado.toLocaleTimeString('es-PE', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'UTC'
          })}
        </div>
      </>
    );
  }, [tiempoSimulado]);

  const capacidadFlotaPct = useMemo(() => {
    if (capacidadTotalFlota === 0) return 0;
    return Math.round((capacidadUsadaFlota / capacidadTotalFlota) * 100);
  }, [capacidadUsadaFlota, capacidadTotalFlota]);

  return (
    <div className="bg-transparent shadow-none border-none px-3 py-2 flex justify-between items-start z-20">
      <div className="flex gap-4 text-xs flex-col">
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5 tooltip tooltip-bottom" data-tip="Entregados">
            <Check size={16} className="text-success" />
            <span className="font-mono font-semibold">{entregados}</span>
          </div>
          <div className="flex items-center gap-1.5 tooltip tooltip-bottom" data-tip="En tránsito">
            <Box size={16} className="text-info" />
            <span className="font-mono font-semibold">{enTransito}</span>
          </div>
          <div className="flex items-center gap-1.5 tooltip tooltip-bottom" data-tip="Vuelos en uso">
            <Plane size={16} className="text-warning" />
            <span className="font-mono font-semibold">{vuelosActivos}</span>
          </div>
        </div>
        <div className="bg-base-300/80 px-2 py-1 rounded text-[10px] w-fit">
          <div className="text-base-content/70 font-semibold uppercase tracking-wide">Capacidad Total Flota</div>
          <div className="font-mono font-bold text-success text-sm">{capacidadFlotaPct}%</div>
        </div>
      </div>
      <div className="flex items-start gap-3">
        <div className="text-xs tooltip tooltip-bottom" data-tip="Pedidos procesados por el backend">
          <span className="font-mono font-semibold">{reloj}</span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <label className="text-base-content/70 text-[10px] uppercase tracking-wide">Velocidad</label>
          <span className="badge badge-outline font-mono">{engineSpeed}x</span>
        </div>

        <div className="flex gap-2 items-center">
          {badgesTiempo}
          {estaActivo && startRealMs !== null && (
            <div className="tooltip tooltip-bottom" data-tip="Tiempo real desde inicio">
              <div className="badge badge-warning badge-outline text-[11px]">
                ⏱️ {formatElapsed(elapsedRealMs)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
