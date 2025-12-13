import { useMemo, useState } from 'react';
import { useOperacion, type OrderStatusDetail } from '../hooks/useOperacion';
import { MapaVuelos } from '../components/mapas/MapaVuelos';
import {
    Radio, Server, ArrowRight,
    Plane, Package, CheckCircle,
    Activity, Calendar, RefreshCw, Box,
    ChevronLeft, ChevronRight
} from 'lucide-react';
import type { ActiveAirportTick } from '../types/simulation';

export default function OperacionPage() {
    const {
        aeropuertos,
        activeSegments,
        vuelosEnMovimiento,
        orderStatusList,
        metrics,
        airportStocks,
        status,
        simClock,
        actions,
        isReplanning,
        isClearingPlan,
        lastUpdated
    } = useOperacion();

    const activeAirports: ActiveAirportTick[] = useMemo(() => {
        return aeropuertos.map(a => {
            const code = a.id || a.code || '';
            return {
                airportCode: code,
                currentLoad: airportStocks[code] || 0,
                maxThroughputPerHour: a.storageCapacity || 0
            };
        });
    }, [aeropuertos, airportStocks]);

    // Estado local para el input de fecha
    const [manualDateStr, setManualDateStr] = useState('');
    const [collapsed, setCollapsed] = useState(false);

    const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setManualDateStr(val);
        if (val) {
            const utcDate = new Date(`${val}:00Z`);
            actions.setManualTime(utcDate);
        }
    };

    const handleResetTime = () => {
        setManualDateStr('');
        actions.resetTime();
    };

    const formatTime = (date: Date) =>
        date.toLocaleTimeString('es-PE', { timeZone: 'UTC', hour12: false });

    const formatShortTime = (isoDate: string) => {
        if(!isoDate) return '--:--';
        const d = new Date(isoDate);
        return d.toLocaleTimeString('es-PE', { timeZone: 'UTC', hour12: false, hour: '2-digit', minute: '2-digit' });
    };

    const formatDateTime = (isoDate: string) => {
        if(!isoDate) return '--/-- --:--';
        const d = new Date(isoDate);
        return d.toLocaleString('es-PE', {
            timeZone: 'UTC',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    };


    const getInputValue = () => {
        if (manualDateStr) return manualDateStr;
        return simClock.toISOString().slice(0, 16);
    };

    const isRealtime = Math.abs(simClock.getTime() - Date.now()) < 60_000; // permitir 1 min de desvío

    return (
        <div className="flex h-[calc(100vh-4rem)] w-full bg-base-200 text-base-content overflow-hidden font-sans">

            {/* SIDEBAR */}
            <div className={`max-w-full flex flex-col bg-base-100 z-20 h-full shrink-0 border-r border-base-300 shadow-lg transition-all ${collapsed ? 'w-9' : 'w-80'}`}>
                <div className="flex items-center justify-between px-3 py-2 border-b border-base-300 bg-base-100">
                    {!collapsed && (
                        <div className="flex items-center gap-2">
                            <Radio className={status === 'running' ? 'text-success animate-pulse' : 'text-base-content/70'} size={18} />
                            <div>
                                <div className="text-sm font-semibold text-base-content/90">Estado {status.toUpperCase()}</div>
                            </div>
                        </div>
                    )}
                    <button
                        className="btn btn-ghost btn-xs btn-square"
                        onClick={() => setCollapsed(v => !v)}
                        aria-label={collapsed ? 'Expandir panel' : 'Colapsar panel'}
                    >
                        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                    </button>
                </div>

                {/* Acciones cuando está colapsado */}
                {collapsed && (
                    <div className="flex flex-col items-center gap-2 py-3 bg-base-100">
                        <div className="tooltip tooltip-right" data-tip="Ejecutar planificador">
                            <button
                                onClick={() => actions.planificar()}
                                disabled={status === 'buffering' || isReplanning}
                                className="btn btn-primary btn-xs btn-circle"
                            >
                                {isReplanning ? <span className="loading loading-spinner loading-2xs" /> : <Server size={14} />}
                            </button>
                        </div>
                        <div className="text-[10px] font-mono text-base-content/70 text-center px-1">
                            {lastUpdated ? formatShortTime(lastUpdated.toISOString()) : '--:--'}
                        </div>
                    </div>
                )}

                {!collapsed && (
                <div className="p-5 bg-base-100 border-b border-base-300 shrink-0">

                    {/* RELOJ COMPACTO: solo selector UTC */}
                    <div className="bg-base-200 rounded-lg border border-base-300 p-2 text-center">
                        <div className="flex items-center justify-between text-[11px] text-base-content/70 mb-2">
                            <span className="uppercase font-semibold">Hora (UTC)</span>
                            <span className="badge badge-ghost badge-xs font-mono">UTC</span>
                        </div>
                        <div className="flex gap-2 items-center">
                            <div className="flex-1">
                                <input
                                    type="datetime-local"
                                    className="input input-xs input-bordered w-full font-mono h-8"
                                    value={getInputValue()}
                                    onChange={handleTimeChange}
                                />
                            </div>
                            <button
                                onClick={handleResetTime}
                                className="btn btn-xs btn-square btn-ghost"
                                title="Volver al presente"
                            >
                                <RefreshCw size={12} />
                            </button>
                        </div>
                    </div>
                </div>
                )}

                {!collapsed && (
                <>
                    {/* 3. REPORTE DE PEDIDOS */}
                    <div className="px-4 py-3 bg-base-200 text-[11px] font-bold text-base-content/70 uppercase border-b border-base-300 flex justify-between items-center shrink-0">
                        <span className="flex items-center gap-2"><Box size={14}/> Reporte de Pedidos</span>
                        <span className="badge badge-xs badge-neutral border-gray-600 font-mono">{orderStatusList.length}</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-base-200 scrollbar-thin scrollbar-thumb-base-300">
                        {orderStatusList.length === 0 ? (
                            <div className="text-center text-base-content/60 mt-12 text-sm px-6 flex flex-col items-center">
                                <div className="w-16 h-16 bg-base-100 rounded-full flex items-center justify-center mb-3">
                                    <Package size={32} className="opacity-20" />
                                </div>
                                <p className="font-medium">Sin pedidos operativos</p>
                                <p className="text-xs mt-2 opacity-60">Registra pedidos como "REAL" y ejecuta el planificador.</p>
                            </div>
                        ) : (
                            orderStatusList.map((order) => (
                                <OrderCardDetail key={order.orderId} order={order} formatDateTime={formatDateTime}/>
                            ))
                        )}
                    </div>

                    {/* Botón Planificar */}
                    <div className="p-4 bg-base-100 border-t border-base-300 shrink-0">
                        <div className="flex justify-between text-[10px] text-base-content/60 mb-2 font-mono">
                            <span>Last Sync: {lastUpdated ? formatShortTime(lastUpdated.toISOString()) : '--:--'}</span>
                            {!isRealtime && <span className="text-warning">Modo histórico</span>}
                        </div>
                        <div className="space-y-2">
                            <button
                                onClick={() => actions.planificar()}
                                disabled={status === 'buffering' || isReplanning || !isRealtime}
                                className="btn btn-primary w-full gap-2 font-bold shadow-lg hover:shadow-primary/20 transition-all"
                                >
                                {isReplanning ? <span className="loading loading-spinner loading-xs"></span> : <Server size={16} />}
                                {isReplanning ? 'OPTIMIZANDO...' : 'EJECUTAR PLANIFICADOR'}
                            </button>
                            <button
                                onClick={() => {
                                    if (window.confirm('¿Eliminar toda la planificación actual?')) {
                                        actions.clearPlan();
                                    }
                                }}
                                disabled={isClearingPlan || isReplanning || status === 'buffering'}
                                className="btn btn-error btn-outline w-full gap-2 font-semibold"
                            >
                                {isClearingPlan ? <span className="loading loading-spinner loading-xs"></span> : <RefreshCw size={14} />}
                                Borrar planificación
                            </button>
                        </div>
                        {!isRealtime && (
                          <p className="text-[11px] text-warning mt-2">
                            Ajusta el reloj al presente para ejecutar el planificador.
                          </p>
                        )}
                    </div>
                </>
                )}
            </div>

            {/* MAPA */}
            <div className="flex-1 relative z-0 bg-base-200 h-full">
                {/* Barra superior de métricas (similar a simulación) */}
                <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none">
                    <div className="flex gap-3 px-4 py-2 text-xs text-base-content pointer-events-none">
                        <div className="bg-base-100/80 backdrop-blur rounded-md px-3 py-2 shadow-sm flex items-center gap-2">
                            <Package size={14} className="text-sky-400" />
                            <div className="flex flex-col leading-tight">
                                <span className="uppercase tracking-wide text-[10px] text-base-content/70">Pedidos Totales</span>
                                <span className="font-bold text-base">{metrics.totalOrders}</span>
                            </div>
                        </div>
                        <div className="bg-base-100/80 backdrop-blur rounded-md px-3 py-2 shadow-sm flex items-center gap-2">
                            <Activity size={14} className="text-indigo-400" />
                            <div className="flex flex-col leading-tight">
                                <span className="uppercase tracking-wide text-[10px] text-base-content/70">En Tránsito</span>
                                <span className="font-bold text-base">{metrics.ordersInTransit}</span>
                            </div>
                        </div>
                        <div className="bg-base-100/80 backdrop-blur rounded-md px-3 py-2 shadow-sm flex items-center gap-2">
                            <Plane size={14} className="text-cyan-400" />
                            <div className="flex flex-col leading-tight">
                                <span className="uppercase tracking-wide text-[10px] text-base-content/70">Vuelos</span>
                                <span className="font-bold text-base">
                                    {metrics.activeFlights} / {metrics.totalFlights}
                                </span>
                            </div>
                        </div>
                        <div className="bg-base-100/80 backdrop-blur rounded-md px-3 py-2 shadow-sm flex items-center gap-2">
                            <CheckCircle size={14} className="text-blue-400" />
                            <div className="flex flex-col leading-tight">
                                <span className="uppercase tracking-wide text-[10px] text-base-content/70">On-Time</span>
                                <span className="font-bold text-base">{metrics.slaPercentage.toFixed(1)}%</span>
                            </div>
                        </div>
                    </div>
                </div>

                <MapaVuelos
                    aeropuertos={aeropuertos}
                    activeSegments={activeSegments}
                    vuelosEnMovimiento={vuelosEnMovimiento}
                    activeAirports={activeAirports}
                    isLoading={status === 'buffering'}
                    filtroHubActivo=""
                />
                 {isReplanning && (
                    <div className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-300">
                        <div className="bg-neutral-800 p-8 rounded-2xl shadow-2xl border border-gray-700 text-center max-w-md">
                            <span className="loading loading-infinity loading-lg text-primary mb-4"></span>
                            <h3 className="text-xl font-bold text-white">Replanificando Logística</h3>
                            <p className="text-sm text-gray-400 mt-2">El algoritmo genético está recalculando rutas óptimas para la nueva demanda...</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function OrderCardDetail({ order, formatDateTime }: { order: OrderStatusDetail, formatDateTime: (s: string) => string }) {
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
            {/* Header: ID y Cantidad */}
            <div className="flex justify-between items-start mb-2 pb-2 border-b border-gray-700/50">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white text-sm">#{order.orderId}</span>
                        {order.isDelayed && <span className="badge badge-xs badge-error text-[9px]">DELAY</span>}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                        Cantidad: <span className="text-gray-200 font-bold">{order.quantity} un.</span>
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

            {/* Ruta: Origen -> Destino */}
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

            {/* Detalle de Vuelo Actual / Próximo */}
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
