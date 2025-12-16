import { ArrowRight, Plane, CheckCircle, Clock } from 'lucide-react';
import type { OrderStatusDetail } from '../../hooks/useOperacion';

// Helper para saber el estado de un segmento específico
const getSegmentStatus = (departure: string, arrival: string, now: Date) => {
    const dep = new Date(departure).getTime();
    const arr = new Date(arrival).getTime();
    const current = now.getTime();

    if (current < dep) return 'PENDING';
    if (current >= dep && current <= arr) return 'FLYING';
    return 'DONE';
};

interface OrderCardProps {
    order: OrderStatusDetail;
    formatDateTime: (s: string) => string;
    currentTime: Date; // <--- NUEVA PROP
}

export function OrderCardDetail({ order, formatDateTime, currentTime }: OrderCardProps) {

    // Determinar si mostramos un vuelo específico o "Vuelo Dividido"
    /*const displayFlightId = (() => {
        if (order.currentFlightId) return order.currentFlightId;
        if (order.status === 'IN_FLIGHT' && order.routesDetail && order.routesDetail.length > 0) {
            return "VUELO DIVIDIDO";
        }
        return "---";
    })();
*/
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
            {/* ENCABEZADO */}
            <div className="flex justify-between items-start mb-2 pb-2 border-b border-gray-700/50">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white text-sm">#{order.orderId}</span>
                        {order.isDelayed && <span className="badge badge-xs badge-error text-[9px]">DELAY</span>}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5 flex flex-col gap-0.5">
                        <span>Cant: <span className="text-gray-200 font-bold">{order.quantity} un.</span></span>
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

            {/* RUTAS Y VUELOS CON ESTADO EN TIEMPO REAL */}
            {order.routesDetail && order.routesDetail.length > 0 && (
                <div className="mt-2 text-[10px] space-y-2">
                    {order.routesDetail.map((route, rIdx) => (
                        <div key={`route-${rIdx}`} className="bg-base-300/50 rounded p-2 border border-white/5">
                            <div className="flex justify-between items-center mb-1">
                                <span className="font-bold text-gray-400 uppercase tracking-wider">Ruta {route.routeIndex}</span>
                            </div>

                            <div className="space-y-1">
                                {route.segments.map((seg, idx) => {
                                    const status = getSegmentStatus(seg.departureUtc, seg.arrivalUtc, currentTime);

                                    let statusIcon = <Clock size={10} className="text-gray-500"/>;
                                    let rowClass = "opacity-60 grayscale"; // Futuro

                                    if (status === 'FLYING') {
                                        statusIcon = <Plane size={10} className="text-blue-400 animate-pulse"/>;
                                        rowClass = "bg-blue-500/10 border-blue-500/30"; // Activo
                                    } else if (status === 'DONE') {
                                        statusIcon = <CheckCircle size={10} className="text-green-500"/>;
                                        rowClass = "opacity-70"; // Pasado
                                    }

                                    return (
                                        <div key={`${seg.flightId}-${idx}`} className={`flex flex-col border border-white/5 rounded px-2 py-1.5 ${rowClass} transition-all`}>
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex items-center gap-1.5">
                                                    {statusIcon}
                                                    <span className="font-mono font-bold text-white">{seg.flightId}</span>
                                                </div>
                                                <span className="text-[9px] bg-black/20 px-1 rounded text-gray-300">
                                                    {status === 'FLYING' ? 'VOLANDO' : status === 'DONE' ? 'LLEGÓ' : 'ESPERA'}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center gap-2">
                                                <div>
                                                    <div className="font-bold text-gray-300">{seg.origin}</div>
                                                    <div className="text-[9px] opacity-70">{formatDateTime(seg.departureUtc)}</div>
                                                </div>
                                                <ArrowRight size={10} className="opacity-30"/>
                                                <div className="text-right">
                                                    <div className="font-bold text-gray-300">{seg.destination}</div>
                                                    <div className="text-[9px] opacity-70">{formatDateTime(seg.arrivalUtc)}</div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}