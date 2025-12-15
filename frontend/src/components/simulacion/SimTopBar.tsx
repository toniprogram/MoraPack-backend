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
  startDateString?: string;
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
  startDateString = '',
}: SimTopBarProps) {

  // Badges de Fecha y Hora (Con etiqueta "Simulación:")
  const badgesTiempo = useMemo(() => {
      if (!tiempoSimulado) return null;
      return (
        <>
          {/* ETIQUETA AÑADIDA A LA IZQUIERDA */}
          <span className="text-[10px] font-bold text-base-content/70 uppercase tracking-wide mr-1">
            Simulación:
          </span>

          <div className="tooltip tooltip-bottom pointer-events-auto" data-tip="Fecha de la simulación">
            <div className="badge badge-neutral text-base-content text-[11px] font-mono shadow-sm border-base-content/10 whitespace-nowrap">
              📅 {tiempoSimulado.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}
            </div>
          </div>
          <div className="tooltip tooltip-bottom pointer-events-auto" data-tip="Hora de la simulación">
            <div className="badge badge-neutral text-base-content text-[11px] font-mono shadow-sm border-base-content/10 whitespace-nowrap">
               🕒 {tiempoSimulado.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}
            </div>
          </div>
        </>
      );
  }, [tiempoSimulado]);

  const capacidadFlotaPct = useMemo(() => {
    if (capacidadTotalFlota === 0) return 0;
    return Math.round((capacidadUsadaFlota / capacidadTotalFlota) * 100);
  }, [capacidadUsadaFlota, capacidadTotalFlota]);

  const tiempoEjecucionSim = useMemo(() => {
    if (!tiempoSimulado || !startDateString) return null;
    try {
      const startStr = startDateString.length === 16 ? `${startDateString}:00` : startDateString;
      const startDate = new Date(startStr + 'Z');
      const simDate = new Date(tiempoSimulado.toISOString());
      const diffMs = simDate.getTime() - startDate.getTime();
      if (diffMs < 0) return null;
      const days = Math.floor(diffMs / 86_400_000);
      const hours = Math.floor((diffMs % 86_400_000) / 3_600_000);
      const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${pad(days)}d ${pad(hours)}h ${pad(minutes)}m`;
    } catch {
      return null;
    }
  }, [tiempoSimulado, startDateString]);

  return (
    // CONTENEDOR PRINCIPAL: Cubre toda la parte superior, pero deja pasar clicks (pointer-events-none)
    // Z-Index alto para asegurar que los tooltips se vean sobre el mapa
    <div className="absolute top-0 left-0 w-full p-2 z-[1000] pointer-events-none flex justify-between items-start">

      {/* === IZQUIERDA: KPIs (Entregados, Tránsito, Capacidad) === */}
      <div className="flex flex-col gap-2 pointer-events-auto">
        {/* Fila de KPIs */}
        <div className="flex gap-3 bg-base-100/90 backdrop-blur px-3 py-1.5 rounded-lg shadow-sm border border-base-content/10 w-fit">
          <div className="flex items-center gap-1.5 tooltip tooltip-bottom" data-tip="Pedidos Entregados">
            <Check size={14} className="text-success" />
            <span className="font-mono font-bold text-xs">{entregados}</span>
          </div>
          <div className="flex items-center gap-1.5 tooltip tooltip-bottom" data-tip="Pedidos En Tránsito">
            <Box size={14} className="text-info" />
            <span className="font-mono font-bold text-xs">{enTransito}</span>
          </div>
          <div className="flex items-center gap-1.5 tooltip tooltip-bottom" data-tip="Vuelos Activos">
            <Plane size={14} className="text-warning" />
            <span className="font-mono font-bold text-xs">{vuelosActivos}</span>
          </div>
        </div>

        {/* Capacidad */}
        <div className="bg-base-300/90 px-2 py-1 rounded-lg text-[10px] shadow-sm backdrop-blur flex items-center gap-2 w-fit border border-base-content/5">
          <span className="text-base-content/70 font-semibold uppercase">Capacidad Flota Total</span>
          <span className="font-mono font-bold text-success text-xs">{capacidadFlotaPct}%</span>
        </div>
      </div>

      {/* === CENTRO: TIEMPOS (POSICIÓN ATLÁNTICO) === */}
        {/* CAMBIOS:
            1. 'left-[40%]' -> Mueve el bloque hacia la izquierda (antes era 50%).
            2. Quitamos 'flex-col' -> Ahora los hijos (Fecha/Hora y Cronómetros) se alinean horizontalmente.
        */}
        <div className="absolute left-[40%] -translate-x-1/2 top-2 flex items-center gap-2 pointer-events-auto">

          {/* Bloque 1: Fecha y Hora (Con fondo) */}
          <div className="flex items-center gap-2 bg-base-100/40 backdrop-blur-md px-2 py-1 rounded-xl border border-base-content/5 shadow-sm">
             {badgesTiempo}
          </div>

          {/* Bloque 2: Cronómetros (Ahora aparecerán a la derecha del bloque 1) */}
          <div className="flex items-center gap-2">
              {tiempoEjecucionSim && (
                <div className="tooltip tooltip-bottom pointer-events-auto" data-tip="Tiempo transcurrido simulado">
                  <div className="badge badge-ghost bg-base-100/60 backdrop-blur-sm text-[10px] font-mono whitespace-nowrap border-base-content/10">
                    ⏳ Simulado: {tiempoEjecucionSim}
                  </div>
                </div>
              )}

              {estaActivo && startRealMs !== null && (
                <div className="tooltip tooltip-bottom pointer-events-auto" data-tip="Tiempo real transcurrido">
                  <div className="badge badge-warning badge-outline bg-base-100/90 text-[10px] font-mono whitespace-nowrap shadow-sm">
                    ⏱️ Real: {formatElapsed(elapsedRealMs)}
                  </div>
                </div>
              )}
          </div>
        </div>

      {/* === DERECHA:Velocidad y Backend Reloj === */}
      <div className="flex items-center gap-2 pointer-events-auto">
        <div className="flex items-center gap-2 text-xs bg-base-100/90 backdrop-blur px-2 py-1.5 rounded-lg shadow-sm border border-base-content/10">
          <span className="text-base-content/70 text-[10px] uppercase font-bold">Velocidad</span>
          <span className="badge badge-sm badge-outline font-mono">{engineSpeed}x</span>
        </div>

        <div className="text-[10px] bg-base-100/50 px-2 py-1 rounded text-base-content/40 font-mono tooltip tooltip-left" data-tip="Pedidos procesados por el Backend">
          {reloj}
        </div>
      </div>

    </div>
  );
}