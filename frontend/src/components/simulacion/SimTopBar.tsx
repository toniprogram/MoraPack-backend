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
}: SimTopBarProps) {
  const badgesTiempo = useMemo(() => {
    if (!tiempoSimulado) return null;
    return (
      <>
        <div className="badge badge-info">
          📅 {tiempoSimulado.toLocaleDateString('es-PE', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC'
          })}
        </div>
        <div className="badge badge-success">
          🕒 {tiempoSimulado.toLocaleTimeString('es-PE', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'UTC'
          })}
        </div>
      </>
    );
  }, [tiempoSimulado]);

  return (
    <div className="bg-base-100 shadow-md p-3 flex justify-between items-center z-10">
      <div className="flex gap-6 text-sm">
        <div className="flex items-center gap-2 tooltip" data-tip="Entregados">
          <Check size={18} className="text-success" />
          <span className="font-mono font-semibold">{entregados}</span>
        </div>
        <div className="flex items-center gap-2 tooltip" data-tip="En tránsito">
          <Box size={18} className="text-info" />
          <span className="font-mono font-semibold">{enTransito}</span>
        </div>
        <div className="flex items-center gap-2 tooltip" data-tip="Vuelos en uso">
          <Plane size={18} className="text-warning" />
          <span className="font-mono font-semibold">{vuelosActivos}</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-sm tooltip" data-tip="Pedidos procesados por el backend">
          <span className="font-mono font-semibold">{reloj}</span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <label className="text-base-content/70 text-xs uppercase tracking-wide">Velocidad</label>
          <span className="badge badge-outline font-mono">{engineSpeed}x</span>
        </div>

        <div className="flex gap-2 items-center">
          {badgesTiempo}
          {estaActivo && startRealMs !== null && (
            <div className="tooltip" data-tip="Tiempo real desde inicio">
              <div className="badge badge-warning badge-outline">
                ⏱️ {formatElapsed(elapsedRealMs)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
