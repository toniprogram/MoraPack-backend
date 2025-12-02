import { useMemo } from 'react';
import { Check, Plane } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';

interface SimTopBarProps {
  kpisVista: { entregas: number; retrasados: number };
  reloj: string;
  tiempoSimulado: Date | null;
  estaActivo: boolean;
  simSpeed: number;
  setSimSpeed: Dispatch<SetStateAction<number>>;
  startRealMs: number | null;
  elapsedRealMs: number;
  formatElapsed: (ms: number) => string;
}

export function SimTopBar({
  kpisVista,
  reloj,
  tiempoSimulado,
  estaActivo,
  simSpeed,
  setSimSpeed,
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
          <span className="font-mono font-semibold">{kpisVista.entregas}</span>
        </div>
        <div className="flex items-center gap-2 tooltip" data-tip="En tránsito">
          <Plane size={18} className="text-info" />
          <span className="font-mono font-semibold">{kpisVista.retrasados}</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-sm tooltip" data-tip="Pedidos procesados por el backend">
          <span className="font-mono font-semibold">{reloj}</span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <label className="text-base-content/70 text-xs uppercase tracking-wide">Velocidad</label>
          {estaActivo ? (
            <span className="badge badge-outline font-mono">{simSpeed}x</span>
          ) : (
            <>
              <input
                type="number"
                className="input input-xs w-20"
                min={50}
                max={500}
                step={50}
                value={simSpeed}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (isNaN(value)) return;
                  const clamped = Math.min(500, Math.max(50, value));
                  const snapped = Math.round(clamped / 50) * 50;
                  setSimSpeed(Math.min(500, Math.max(50, snapped)));
                }}
              />
              <span className="text-xs text-base-content/60">x</span>
            </>
          )}
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
