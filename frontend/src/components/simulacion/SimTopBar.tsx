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

  // --- LÓGICA DE BADGES Y FORMATO ---

  const badgesTiempo = useMemo(() => {
    if (!tiempoSimulado) return null;
    return (
      <>
        {/* Etiqueta descriptiva */}
        <span className="text-[10px] font-bold text-base-content/70 uppercase tracking-wide mr-1">
          Simulación:
        </span>

        {/* Badge Fecha */}
        <div className="tooltip tooltip-bottom pointer-events-auto" data-tip="Fecha de la simulación">
          <div className="badge badge-neutral text-base-content text-[11px] font-mono shadow-sm border-base-content/10 whitespace-nowrap">
            📅 {tiempoSimulado.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}
          </div>
        </div>

        {/* Badge Hora */}
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

  // Color dinámico según el porcentaje de uso (Nuevo feature del merge)
  const capacidadColorClass = useMemo(() => {
    if (capacidadFlotaPct > 90) return 'text-error';
    if (capacidadFlotaPct > 70) return 'text-warning';
    return 'text-success';
  }, [capacidadFlotaPct]);

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

      // Formato compacto: 00d 00h 00m
      return `${pad(days)}d ${pad(hours)}h ${pad(minutes)}m`;
    } catch {
      return null;
    }
  }, [tiempoSimulado, startDateString]);

  // --- RENDERIZADO ---

  return (
    // CONTENEDOR PRINCIPAL: Absolute + pointer-events-none para que no bloquee clicks en el mapa debajo
    <div className="absolute top-0 left-0 w-full p-2 z-[1000] pointer-events-none flex justify-between items-start">

      {/* === IZQUIERDA: KPIs (Entregados, Tránsito, Vuelos, Capacidad) === */}
      <div className="flex flex-col gap-2 pointer-events-auto">
        {/* Fila de Iconos */}
        <div className="flex gap-3 bg-base-100/90 backdrop-blur px-3 py-1.5 rounded-lg shadow-sm border border-base-content/10 w-fit">
          <div className="flex items-center gap-1.5 tooltip tooltip-right" data-tip="Pedidos Entregados">
            <Check size={14} className="text-success" />
            <span className="font-mono font-bold text-xs">{entregados}</span>
          </div>
          <div className="flex items-center gap-1.5 tooltip tooltip-right" data-tip="Pedidos En Tránsito">
            <Box size={14} className="text-info" />
            <span className="font-mono font-bold text-xs">{enTransito}</span>
          </div>
          <div className="flex items-center gap-1.5 tooltip tooltip-right" data-tip="Vuelos Activos">
            {/* Corregido: 'blue text-300' a 'text-blue-400' */}
            <Plane size={14} className="text-blue-400" />
            <span className="font-mono font-bold text-xs">{vuelosActivos}</span>
          </div>
        </div>

        {/* Barra de Capacidad */}
        <div className="bg-base-300/90 px-2 py-1 rounded-lg text-[10px] shadow-sm backdrop-blur flex items-center gap-2 w-fit border border-base-content/5">
          <span className="text-base-content/70 font-semibold uppercase">Capacidad Flota</span>
          <span className={`font-mono font-bold ${capacidadColorClass} text-sm`}>
            {capacidadFlotaPct}%
          </span>
        </div>
      </div>

      {/* === CENTRO: TIEMPOS (Posicionado absolutamente al 40%) === */}
      <div className="absolute left-[40%] -translate-x-1/2 top-2 flex items-center gap-2 pointer-events-auto">

        {/* Fecha y Hora */}
        <div className="flex items-center gap-2 bg-base-100/40 backdrop-blur-md px-2 py-1 rounded-xl border border-base-content/5 shadow-sm">
           {badgesTiempo}
        </div>

        {/* Cronómetros adicionales */}
        <div className="flex items-center gap-2">
           {tiempoEjecucionSim && (
             <div className="tooltip tooltip-bottom pointer-events-auto" data-tip="Tiempo transcurrido simulado">
               <div className="badge badge-ghost bg-base-100/60 backdrop-blur-sm text-[10px] font-mono whitespace-nowrap border-base-content/10">
                 ⏳ Sim: {tiempoEjecucionSim}
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

      {/* === DERECHA: Velocidad y Debug Backend === */}
      <div className="flex items-center gap-2 pointer-events-auto">
        <div className="flex items-center gap-2 text-xs bg-base-100/90 backdrop-blur px-2 py-1.5 rounded-lg shadow-sm border border-base-content/10">
          <span className="text-base-content/70 text-[10px] uppercase font-bold">Velocidad</span>
          <span className="badge badge-sm badge-outline font-mono">{engineSpeed}x</span>
        </div>

        <div className="text-[10px] bg-base-100/50 px-2 py-1 rounded text-base-content/40 font-mono tooltip tooltip-left cursor-help" data-tip="Pedidos procesados por el Backend">
          {reloj}
        </div>
      </div>

    </div>
  );
}