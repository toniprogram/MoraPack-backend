import { ArrowRight, Plane } from 'lucide-react';
import type { OrderStatusDetail } from '../../hooks/useOperacion';

export function OrderCardDetail({ order, formatDateTime }: { order: OrderStatusDetail, formatDateTime: (s: string) => string }) {
    const getStatusColor = (s: string, delayed: boolean) => {
        if (delayed) return 'border-l-4 border-l-red-500 bg-neutral-800';
        switch(s) {
            case 'IN_FLIGHT': return 'border-l-4 border-l-blue-500 bg-blue-950/20';
            case 'WAITING': return 'border-l-4 border-l-gray-500 bg-neutral-800';
            case 'LAYOVER': return 'border-l-4 border-l-yellow-500 bg-yellow-950/20';
            case 'COMPLETED': return 'border-l-4 border-l-green-500 bg-green-950/20 opacity-70';
            default: return 'bg-neutral-800';
        }
    };

    return (
        <div className={`p-3 rounded-md border border-gray-700/50 text-xs shadow-sm transition-all hover:border-gray-500 ${getStatusColor(order.status, order.isDelayed)}`}>
            <div className="flex justify-between items-start mb-2 pb-2 border-b border-gray-700/50">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white text-sm">#{order.orderId}</span>
                        {order.isDelayed && <span className="badge badge-xs badge-error text-[9px]">DELAY</span>}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5 flex flex-col gap-0.5">
                        <span>
                            Cantidad: <span className="text-gray-200 font-bold">{order.quantity} un.</span>
                        </span>
                        <span>
                            Holgura: <span className={`font-bold ${order.isDelayed ? 'text-error' : 'text-success'}`}>
                                {typeof order.slackMinutes === 'number' ? `${order.slackMinutes} min` : '--'}
                            </span>
                        </span>
                    </div>
                </div>
                <div className="text-right">
                    <span className={`badge badge-xs font-bold ${
                        order.status === 'IN_FLIGHT' ? 'badge-primary' :
                        order.status === 'COMPLETED' ? 'badge-success' : 'badge-ghost'
                    }`}>
                        {order.status === 'IN_FLIGHT' ? 'EN VUELO' :
                         order.status === 'WAITING' ? 'EN COLA' :
                         order.status === 'LAYOVER' ? 'ESCALA' : 'LLEGÓ'}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-3 text-gray-300">
                <div>
                    <div className="text-[9px] text-gray-500 uppercase font-bold">Origen</div>
                    <div className="font-mono font-bold text-lg leading-none">{order.originAirport}</div>
                    <div className="text-[10px] opacity-70">{formatDateTime(order.departureTime)}</div>
                </div>

                <div className="flex flex-col items-center justify-center px-2">
                    {order.status === 'IN_FLIGHT' ? <Plane size={14} className="text-blue-400"/> : <ArrowRight size={14} className="opacity-30"/>}
                    <div className="text-[9px] font-mono text-gray-500 mt-1">
                        {order.status === 'IN_FLIGHT' ? `${Math.round(order.progress)}%` : '--'}
                    </div>
                </div>

                <div className="text-right">
                    <div className="text-[9px] text-gray-500 uppercase font-bold">Destino Final</div>
                    <div className="font-mono font-bold text-lg leading-none">{order.finalDestination}</div>
                    <div className="text-[10px] opacity-70">{formatDateTime(order.arrivalTime)}</div>
                </div>
            </div>

            {order.status !== 'COMPLETED' && (
                <div className="bg-black/30 rounded p-2 flex justify-between items-center border border-white/5">
                    <div className="flex items-center gap-2">
                        <Plane size={12} className="text-gray-400"/>
                        <span className="font-mono font-bold text-blue-300">
                            {order.currentFlightId || "---"}
                        </span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-gray-400">
                        <span>Próx. Escala:</span>
                        <span className="font-mono text-white">{order.nextAirport}</span>
                    </div>
                </div>
            )}
            {order.routesDetail && order.routesDetail.length > 0 && (
                <div className="mt-2 text-[10px] text-base-content bg-base-200 border border-base-300 rounded p-2 space-y-1.5">
                    <div className="uppercase font-semibold text-base-content/80">Rutas y vuelos</div>
                    {order.routesDetail.map(route => (
                        <div key={`route-${route.routeIndex}`} className="border border-base-300 rounded bg-base-100/70 p-2 space-y-1">
                            <div className="text-[10px] font-semibold text-base-content/70">Ruta {route.routeIndex}</div>
                            {route.segments.map((seg, idx) => (
                                <div key={`${seg.flightId}-${idx}`} className="flex flex-col border border-base-300 rounded px-2 py-1 bg-base-100">
                                    <div className="flex items-center justify-between">
                                        <span className="badge badge-neutral badge-outline badge-xs font-mono">{seg.flightId}</span>
                                        <span className="text-[9px] text-base-content/70">Qty: {seg.quantity}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px]">
                                        <div>
                                            <div className="font-bold">{seg.origin}</div>
                                            <div className="opacity-70">{formatDateTime(seg.departureUtc)}</div>
                                        </div>
                                        <div className="text-center text-base-content/70">➔</div>
                                        <div className="text-right">
                                            <div className="font-bold">{seg.destination}</div>
                                            <div className="opacity-70">{formatDateTime(seg.arrivalUtc)}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
