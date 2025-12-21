import { useMemo } from 'react';
import type { EnvioInfo } from '../../types/simulacionUI';
import { PedidoCard, type PedidoCardData } from '../shared/PedidoCard';

interface SidebarEnviosPanelProps {
  enviosFiltrados: EnvioInfo[];
  ordenesParaSimular: unknown[];
  ordersTotal: number;
  ordersPage: number;
  ordersPageSize: number;
  onOrdersPageChange: (page: number) => void;
  selectedOrders: string[] | null;
  onSelectOrders: (orderIds: string[] | null) => void;
  currentTime?: Date | null;
}

export function SidebarEnviosPanel({
  enviosFiltrados,
  ordenesParaSimular,
  ordersTotal,
  ordersPage,
  ordersPageSize,
  onOrdersPageChange,
  selectedOrders,
  onSelectOrders,
  currentTime,
}: SidebarEnviosPanelProps) {

  // Ordenar por fecha de creación
  const sorted = useMemo(() => {
    return [...enviosFiltrados].sort((a, b) => (a.creationMs ?? 0) - (b.creationMs ?? 0));
  }, [enviosFiltrados]);

  const pageSize = ordersPageSize || 10;
  const page = Math.max(1, ordersPage + 1);
  const totalPages = Math.max(1, Math.ceil((ordersTotal || sorted.length) / pageSize));

  const visible = useMemo(() => {
    if (sorted.length <= pageSize) return sorted;
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  return (
    <>
      {enviosFiltrados.length === 0 && (
        <div className="text-center text-base-content/60 py-8">
          {ordenesParaSimular.length > 0
            ? 'Sincroniza y presiona "Iniciar" para comenzar la simulación'
            : 'Aun sin datos de pedidos'}
        </div>
      )}

      {visible.map((envio, idx) => {
        const { plan, estado, creationMs, arrivalMs } = envio;

        // 1. Mapear rutas
        const rutas = (plan.routes ?? []).map((r, i) => ({
          routeIndex: i + 1,
          segments: (r.segments ?? []).map(s => ({
            flightId: s.flightId,
            origin: s.origin,
            destination: s.destination,
            departureUtc: s.departureUtc,
            arrivalUtc: s.arrivalUtc,
            quantity: s.quantity ?? 0
          }))
        })).filter(r => r.segments.length > 0);

        const flatSegments = plan.routes?.flatMap(r => r.segments ?? []) ?? [];
        const primer = flatSegments[0];
        const ultimo = flatSegments[flatSegments.length - 1];
        const cantidadTotal = plan.routes?.reduce((acc, r) => acc + (r.quantity ?? 0), 0) ?? 0;

        let activeFlightId: string | undefined = undefined;
        if (currentTime) {
            const nowMs = currentTime.getTime();
            const activeSeg = flatSegments.find(s => {
                const dep = Date.parse(s.departureUtc);
                const arr = Date.parse(s.arrivalUtc);
                return nowMs >= dep && nowMs <= arr;
            });
            if (activeSeg) activeFlightId = activeSeg.flightId;
        }

        // B. Si no está volando
        if (!activeFlightId && flatSegments.length > 0) {
            if (currentTime) {
                const nowMs = currentTime.getTime();
                const nextSeg = flatSegments.find(s => Date.parse(s.arrivalUtc) > nowMs);

                if (nextSeg) {
                    activeFlightId = nextSeg.flightId;
                } else {
                    activeFlightId = flatSegments[flatSegments.length - 1].flightId;
                }
            } else {
                activeFlightId = flatSegments[0].flightId;
            }
        }

        const cardData: PedidoCardData = {
          orderId: plan.orderId,
          estado: estado,
          cantidad: cantidadTotal,
          slackMinutes: plan.slackMinutes,
          creationMs: creationMs,
          arrivalMs: arrivalMs,
          origen: primer?.origin,
          destino: ultimo?.destination,
          rutas: rutas,
          currentFlightId: activeFlightId,
          progressPct: undefined
        };

        return (
          <PedidoCard
            key={`${plan.orderId}-${page}-${idx}`}
            data={cardData}
            isSelected={selectedOrders?.includes(plan.orderId) ?? false}
            hasSelection={!!(selectedOrders && selectedOrders.length > 0)}
            onSelect={() => onSelectOrders(selectedOrders?.includes(plan.orderId) ? null : [plan.orderId])}
            currentTime={currentTime || undefined}
          />
        );
      })}

      {/* Paginación */}
      {(ordersTotal > pageSize || enviosFiltrados.length > pageSize) && (
        <div className="mt-3 flex items-center justify-between">
          <button
            className="btn btn-xs"
            onClick={() => onOrdersPageChange(Math.max(0, page - 2))}
            disabled={page === 1}
          >
            « Anterior
          </button>
          <span className="text-xs text-base-content/70">
            Página {page} de {totalPages}
          </span>
          <button
            className="btn btn-xs"
            onClick={() => onOrdersPageChange(Math.min(totalPages - 1, page))}
            disabled={page === totalPages}
          >
            Siguiente »
          </button>
        </div>
      )}
    </>
  );
}