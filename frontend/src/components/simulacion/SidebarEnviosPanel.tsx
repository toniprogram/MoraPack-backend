import { useEffect, useMemo, useState } from 'react';
import type { EnvioInfo } from '../../types/simulacionUI';
import { Plane } from 'lucide-react';

interface SidebarEnviosPanelProps {
  enviosFiltrados: EnvioInfo[];
  ordenesParaSimular: unknown[];
  selectedOrders: string[] | null;
  onSelectOrders: (orderIds: string[] | null) => void;
  scrollParent?: HTMLDivElement | null;
}

export function SidebarEnviosPanel({
  enviosFiltrados,
  ordenesParaSimular,
  selectedOrders,
  onSelectOrders,
  scrollParent,
}: SidebarEnviosPanelProps) {
  const ordered = useMemo(() => {
    if (!selectedOrders || selectedOrders.length === 0) return enviosFiltrados;
    const set = new Set(selectedOrders);
    const selected = enviosFiltrados.filter(e => set.has(e.plan.orderId));
    const rest = enviosFiltrados.filter(e => !set.has(e.plan.orderId));
    return [...selected, ...rest];
  }, [enviosFiltrados, selectedOrders]);

  const ITEM_HEIGHT = 200;
  const BUFFER = 8;
  const [windowStart, setWindowStart] = useState(0);
  const [windowEnd, setWindowEnd] = useState(Math.min(ordered.length, 20));

  useEffect(() => {
    setWindowStart(0);
    setWindowEnd(Math.min(ordered.length, 20));
  }, [ordered.length, selectedOrders]);

  useEffect(() => {
    if (!scrollParent) return;
    let ticking = false;
    const handler = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const top = scrollParent.scrollTop;
        const h = scrollParent.clientHeight || 600;
        const startIdx = Math.max(0, Math.floor(top / ITEM_HEIGHT) - BUFFER);
        const visible = Math.ceil(h / ITEM_HEIGHT) + BUFFER * 2;
        setWindowStart(startIdx);
        setWindowEnd(Math.min(ordered.length, startIdx + visible));
        ticking = false;
      });
    };
    handler();
    scrollParent.addEventListener('scroll', handler);
    return () => scrollParent.removeEventListener('scroll', handler);
  }, [scrollParent, ordered.length]);

  useEffect(() => {
    if (selectedOrders && selectedOrders.length > 0 && scrollParent) {
      scrollParent.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [selectedOrders, scrollParent]);

  const visible = ordered.slice(windowStart, windowEnd);

  return (
    <>
      {enviosFiltrados.length === 0 && (
        <div className="text-center text-base-content/60 py-8">
          {ordenesParaSimular.length > 0
            ? 'Sincroniza y presiona "Iniciar" para comenzar la simulación'
            : 'Carga pedidos proyectados o usa los ya guardados para iniciar.'}
        </div>
      )}

      {visible.map(({ plan, estado, creationMs }, idx) => {
        const segmentos = plan.routes?.flatMap(r => r.segments ?? []) ?? [];
        const primerSegmento = segmentos[0];
        const ultimoSegmento = segmentos[segmentos.length - 1];
        const cantidadTotal = plan.routes?.reduce((acc, r) => acc + (r.quantity ?? 0), 0) ?? 0;
        const rutaCount = segmentos.length;

        const estadoClase =
          estado === 'En tránsito'
            ? 'badge-info'
            : estado === 'Entregado'
              ? 'badge-success'
              : estado === 'Planificado'
                ? 'badge-warning'
                : 'badge-neutral';

        const fechaRegistro = Number.isFinite(creationMs) && creationMs > 0
          ? new Date(creationMs).toLocaleDateString('es-PE', {
              day: '2-digit',
              month: 'short',
              year: 'numeric'
            })
          : 'N/A';
        const horaRegistro = Number.isFinite(creationMs) && creationMs > 0
          ? new Date(creationMs).toLocaleTimeString('es-PE', {
              hour: '2-digit',
              minute: '2-digit'
            })
          : 'N/A';
        const isSelected = selectedOrders?.includes(plan.orderId) ?? false;
        const dimmed = !!(selectedOrders && selectedOrders.length > 0 && !isSelected);

        return (
          <div
            key={`${plan.orderId}-${windowStart + idx}`}
            style={{ minHeight: ITEM_HEIGHT }}
            className={`card bg-base-200 border-l-4 shadow-sm hover:shadow-md transition-shadow ${dimmed ? 'opacity-40' : ''} ${isSelected ? 'ring-2 ring-primary' : ''} ${
              estado === 'En tránsito'
                ? 'border-info'
                : estado === 'Entregado'
                  ? 'border-success'
                  : estado === 'Planificado'
                    ? 'border-warning'
                    : 'border-base-300'
            }`}
            onClick={() => onSelectOrders(isSelected ? null : [plan.orderId])}
          >
            <div className="card-body p-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-sm text-primary">
                    Pedido {plan.orderId}
                  </h3>
                  <p className="text-xs text-base-content/70">
                    Cantidad: {cantidadTotal || 'N/A'}
                  </p>
                </div>
                <span className={`badge badge-sm ${estadoClase}`}>
                  {estado}
                </span>
              </div>

              <div className="mt-2 pt-2 border-t border-base-300">
                <p className="text-[10px] text-base-content/60 mb-1">Fecha de Registro:</p>
                <div className="flex gap-3 text-xs">
                  <div>
                    <span className="text-base-content/70">📅</span> {fechaRegistro}
                  </div>
                  <div>
                    <span className="text-base-content/70">🕒</span> {horaRegistro}
                  </div>
                </div>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-base-content/70">Vuelo asignado:</span>
                <div className="text-right">
                  {segmentos.length > 0 ? (
                    <div className="flex flex-col gap-0.5">
                      {segmentos.map((seg, i) => (
                        <span key={i} className="font-bold text-secondary flex items-center justify-end gap-1">
                          {seg.flightId}
                          <Plane size={12} className="rotate-45" />
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="opacity-50 italic">--</span>
                  )}
                </div>
              </div>

              <div className="text-xs mt-2 space-y-1">
                <div className="flex justify-between items-start">
                  <span className="text-base-content/70">Origen:</span>
                  <span className="font-semibold">{primerSegmento?.origin || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-base-content/70">Destino:</span>
                  <span className="font-semibold">
                    {ultimoSegmento?.destination || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-base-content/70">Holgura:</span>
                  <span className={`font-semibold ${
                    estado === 'Entregado'
                      ? 'text-success'
                      : estado === 'En tránsito'
                        ? 'text-info'
                        : 'text-warning'
                  }`}>
                    {plan.slackMinutes} min
                  </span>
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-base-300">
                <p className="text-xs font-semibold text-base-content/70 mb-1">
                  Ruta ({rutaCount} tramos):
                </p>
                {segmentos.map((seg, idx) => (
                  <div key={idx} className="text-xs text-base-content/70 ml-2 mb-1">
                    • {seg.origin} → {seg.destination}
                    {seg.departureUtc && seg.arrivalUtc && (
                      <span className="text-[10px] text-base-content/60 ml-2">
                        ({new Date(seg.departureUtc).toLocaleTimeString('es-PE', {
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'UTC'
                        })} - {new Date(seg.arrivalUtc).toLocaleTimeString('es-PE', {
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'UTC'
                        })})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
