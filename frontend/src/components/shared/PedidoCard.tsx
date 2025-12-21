import { memo } from 'react';
import { Plane, CheckCircle, Clock, ArrowRight } from 'lucide-react';

interface RouteSegmentView {
  flightId: string;
  origin: string;
  destination: string;
  departureUtc?: string;
  arrivalUtc?: string;
  quantity?: number;
}

interface RouteDetailView {
  routeIndex: number;
  segments: RouteSegmentView[];
}

export interface PedidoCardData {
  orderId: string;
  estado: string;
  cantidad: number;
  slackMinutes?: number;
  creationMs?: number;
  arrivalMs?: number;
  origen?: string;
  destino?: string;
  currentFlightId?: string;
  progressPct?: number;
  rutas?: RouteDetailView[];
}

interface PedidoCardProps {
  data: PedidoCardData;
  isSelected: boolean;
  hasSelection: boolean;
  onSelect: (orderIds: string[] | null) => void;
  currentTime?: Date;
}

const estadoBadgeClass = (estado: string) => {
  const e = estado.toLowerCase();
  if (e.includes('en tránsito') || e.includes('transit')) return 'badge-info';
  if (e.includes('entregado') || e.includes('delivered')) return 'badge-success';
  // Planificado / En espera -> Warning (Naranja/Amarillo)
  if (e.includes('planificado') || e.includes('planned') || e.includes('espera')) return 'badge-warning';
  return 'badge-neutral';
};

// --- FUNCIONES DE FORMATO ---
const formatDate = (ms?: number) => {
  if (!ms || Number.isNaN(ms)) return 'N/A';
  return new Date(ms).toLocaleDateString('es-PE', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });
};

const formatTime = (ms?: number) => {
  if (!ms || Number.isNaN(ms)) return 'N/A';
  return new Date(ms).toLocaleTimeString('es-PE', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });
};

const formatDateTimeUTC = (isoStr?: string) => {
  if (!isoStr) return '--';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('es-PE', { timeZone: 'UTC', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  } catch (e) { return '--'; }
};

/**
 * Determina el estado visual de un segmento (tramo) específico.
 * CORRECCIÓN: Se eliminó el bloqueo de "Planificado". Ahora se basa en el tiempo.
 */
const getSegmentStatus = (departure: string | undefined, arrival: string | undefined, now?: Date, orderStatus: string = '') => {
  const st = orderStatus.toUpperCase();

  // 1. Si el pedido ya se entregó por completo, todo tramo es DONE.
  if (st.includes('ENTREGADO') || st.includes('DELIVERED') || st.includes('COMPLETADO')) {
      return 'DONE';
  }

  // 2. Si faltan datos, asumimos pendiente.
  if (!departure || !arrival || !now) return 'PENDING';

  const dep = new Date(departure).getTime();
  const arr = new Date(arrival).getTime();
  const current = now.getTime();

  // 3. Lógica Temporal (La fuente de la verdad visual):

  // Si la hora actual es mayor a la llegada, el vuelo YA ATERRIZÓ -> DONE (Verde)
  if (current > arr) {
      return 'DONE';
  }

  // Si estamos entre la salida y la llegada -> FLYING (Azul palpitante)
  if (current >= dep && current <= arr) {
      return 'FLYING';
  }

  // Si aún no ha salido -> PENDING (Gris)
  return 'PENDING';
};

export const PedidoCard = memo(({ data, isSelected, hasSelection, onSelect, currentTime }: PedidoCardProps) => {
  const {
    orderId,
    estado,
    cantidad,
    slackMinutes,
    creationMs,
    arrivalMs,
    origen,
    destino,
    currentFlightId,
    progressPct,
    rutas = [],
  } = data;

  const dimmed = hasSelection && !isSelected;
  const handleClick = () => onSelect(isSelected ? null : [orderId]);

  // CORRECCIÓN: Si no hay vuelo actual (está en espera), mostramos "--"
  // para evitar mostrar datos viejos del primer tramo.
  const displayFlightId = currentFlightId ? currentFlightId : "--";

  return (
    <div
      className={`card bg-base-200 border-l-4 shadow-sm cursor-pointer hover:bg-base-300/50 transition-colors ${dimmed ? 'opacity-40' : ''} ${
        // Borde Azul: En tránsito / Volando
        estado.toLowerCase().includes('transit') || estado.toLowerCase().includes('vuelo')
          ? 'border-primary'
          :
        // Borde Verde: Entregado
        estado.toLowerCase().includes('entregado') || estado.toLowerCase().includes('completado')
            ? 'border-success'
            :
        // Borde Naranja: Planificado / En espera
            'border-warning'
      }`}
      onClick={handleClick}
    >
      <div className="card-body p-3">
        {/* HEADER */}
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-bold text-sm text-primary">Pedido {orderId}</h3>
            <p className="text-xs text-base-content/70">Cantidad: {cantidad || 'N/D'}</p>
            {typeof slackMinutes === 'number' && (
              <p className="text-[10px] mt-0.5">
                Holgura:{' '}
                <span className={`font-bold ${slackMinutes < 0 ? 'text-error' : 'text-success'}`}>
                  {slackMinutes} min
                </span>
              </p>
            )}
          </div>
          <span className={`badge badge-sm ${estadoBadgeClass(estado)}`}>{estado}</span>
        </div>

        {/* INFO FECHA DE REGISTRO */}
        {creationMs && creationMs > 0 ? (
            <div className="mt-2 pt-2 border-t border-base-300">
            <p className="text-[10px] text-base-content/60 mb-1">Fecha de Registro (UTC):</p>
            <div className="flex gap-3 text-xs">
                <div><span className="text-base-content/70">📅</span> {formatDate(creationMs)}</div>
                <div><span className="text-base-content/70">🕒</span> {formatTime(creationMs)}</div>
            </div>
            </div>
        ) : null}

        {/* VUELO ACTUAL */}
        <div className="flex justify-between items-start mt-2">
          <span className="text-base-content/70">Vuelo actual:</span>
          <div className="text-right">
            {displayFlightId !== "--" ? (
              <div className="flex flex-col gap-0.5 items-end">
                <span className="font-bold text-secondary flex items-center gap-1">
                  {displayFlightId}
                  <Plane size={12} className="rotate-45" />
                </span>
                {typeof progressPct === 'number' && progressPct > 0 && (
                  <span className="text-[10px] text-base-content/60">{Math.round(progressPct)}%</span>
                )}
              </div>
            ) : (
              <span className="opacity-50 italic text-xs">
                {estado.toUpperCase().includes('ENTREGADO') ? 'Finalizado' : 'En espera / Escala'}
              </span>
            )}
          </div>
        </div>

        {/* ORIGEN / DESTINO / ETA */}
        <div className="text-xs mt-2 space-y-1">
          <div className="flex justify-between items-start">
            <span className="text-base-content/70">Origen:</span><span className="font-semibold">{origen || 'N/A'}</span>
          </div>
          <div className="flex justify-between items-start">
            <span className="text-base-content/70">Destino:</span><span className="font-semibold">{destino || 'N/A'}</span>
          </div>
          {arrivalMs !== undefined && arrivalMs > 0 && (
            <div className="flex justify-between items-start">
              <span className="text-base-content/70">ETA (UTC):</span>
              <span className="font-semibold">{formatDateTimeUTC(new Date(arrivalMs).toISOString())}</span>
            </div>
          )}
        </div>

        {/* RUTAS Y ESTADOS (LISTA DE TRAMOS) */}
        {rutas.length > 0 && (
          <div className="mt-2 pt-2 border-t border-base-300">
            <p className="text-xs font-semibold text-base-content/70 mb-1">Rutas y vuelos</p>
            {rutas.map((ruta) => (
              <div key={ruta.routeIndex} className="border border-base-300 rounded bg-base-100/70 p-2 space-y-1 mb-1 last:mb-0">
                <div className="text-[10px] font-semibold text-base-content/70">Ruta {ruta.routeIndex}</div>
                {ruta.segments.map((seg, idx) => {
                  // Calculamos estado del tramo basado en el reloj
                  const status = getSegmentStatus(seg.departureUtc, seg.arrivalUtc, currentTime, estado);

                  let statusIcon = <Clock size={10} className="text-base-content/40"/>;
                  let rowClass = "opacity-60 grayscale";

                  if (status === 'FLYING') {
                    statusIcon = <Plane size={10} className="text-info animate-pulse"/>;
                    rowClass = "bg-info/10 border-info/30 ring-1 ring-info/20";
                  } else if (status === 'DONE') {
                    statusIcon = <CheckCircle size={10} className="text-success"/>;
                    rowClass = "opacity-70 bg-base-200/50";
                  }

                  return (
                    <div key={`${seg.flightId}-${idx}`} className={`flex flex-col border border-base-300 rounded px-2 py-1.5 transition-all ${rowClass}`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                            {statusIcon}
                            <span className="badge badge-neutral badge-outline badge-xs font-mono">{seg.flightId}</span>
                        </div>
                        <span className="text-[9px] font-bold opacity-70">
                            {status === 'FLYING' ? 'VOLANDO' : status === 'DONE' ? 'LLEGÓ' : 'ESPERA'}
                        </span>
                      </div>

                      <div className="flex justify-between text-[10px]">
                        <div>
                          <div className="font-bold">{seg.origin}</div>
                          <div className="opacity-70">{formatDateTimeUTC(seg.departureUtc)}</div>
                        </div>
                        <div className="flex flex-col items-center justify-center w-8">
                            <ArrowRight size={10} className="opacity-30" />
                            {seg.quantity !== undefined && <span className="text-[8px] opacity-60">{seg.quantity} un.</span>}
                        </div>
                        <div className="text-right">
                          <div className="font-bold">{seg.destination}</div>
                          <div className="opacity-70">{formatDateTimeUTC(seg.arrivalUtc)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});