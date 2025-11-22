import { useState } from 'react';
import { useOperacion, type OrderStatusDetail } from '../hooks/useOperacion';
import { MapaVuelos } from '../components/mapas/MapaVuelos';
import {
    Radio, Server, ArrowRight,
    Plane, Package, CheckCircle,
    Activity, Calendar, RefreshCw, Box} from 'lucide-react';

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
        lastUpdated
    } = useOperacion();

    // Estado local para el input de fecha
    const [manualDateStr, setManualDateStr] = useState('');

    const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setManualDateStr(val);
        if (val) {
            actions.setManualTime(new Date(val));
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
        const tzOffset = simClock.getTimezoneOffset() * 60000;
        return (new Date(simClock.getTime() - tzOffset)).toISOString().slice(0, 16);
    };

    return (
        <div className="flex -m-8 h-[calc(100vh-4rem)] w-[calc(100%+4rem)] bg-base-200 text-base-content overflow-hidden font-sans">

            {/* SIDEBAR */}
            <div className="w-[400px] flex flex-col border-r border-base-300 bg-base-200 shadow-2xl z-20 h-full shrink-0">

                {/* 1. HEADER & RELOJ */}
                <div className="p-5 bg-base-100 border-b border-base-300 shadow-lg shrink-0">
                    <div className="flex justify-between items-center mb-4">
                        <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
                            <Radio className={status === 'running' ? 'text-success animate-pulse' : 'text-base-content/50'} size={20} />
                            OPERACION DÍA A DÍA
                        </h1>
                        <span className="badge badge-outline text-xs font-mono opacity-50">UTC ZONE</span>
                    </div>

                    {/* RELOJ */}
                    <div className="bg-base-200 rounded-xl border border-base-300 p-4 text-center relative overflow-hidden group">
                        <div className="text-5xl font-black font-mono tracking-widest text-primary tabular-nums">
                            {formatTime(simClock)}
                        </div>
                        <div className="text-sm text-base-content/70 font-medium mt-1 uppercase tracking-widest">
                            {simClock.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })}
                        </div>

                        {/* Control Manual de Tiempo */}
                        <div className="mt-4 flex gap-2 items-center">
                            <div className="relative flex-1">
                                <input
                                    type="datetime-local"
                                    className="input input-xs input-bordered w-full font-mono"
                                    value={getInputValue()}
                                    onChange={handleTimeChange}
                                />
                                <Calendar className="absolute right-2 top-1 text-base-content/60 pointer-events-none" size={14}/>
                            </div>
                            <button
                                onClick={handleResetTime}
                                className="btn btn-xs btn-square btn-ghost"
                                title="Volver al presente"
                            >
                                <RefreshCw size={14} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* KPIs */}
                <div className="p-4 bg-base-200 border-b border-base-300 shrink-0 grid grid-cols-2 gap-3">

                    {/* Pedidos Totales */}
                    <div className="bg-base-100 p-3 rounded-lg border border-base-300">
                        <div className="flex items-center gap-2 text-base-content/70 text-[10px] uppercase font-bold mb-1">
                            <Package size={12} className="text-primary"/> Pedidos Totales
                        </div>
                        <div className="text-2xl font-bold">{metrics.totalOrders}</div>
                    </div>

                    {/* Pedidos en Tránsito */}
                    <div className="bg-base-100 p-3 rounded-lg border border-base-300">
                        <div className="flex items-center gap-2 text-base-content/70 text-[10px] uppercase font-bold mb-1">
                            <Activity size={12} className="text-warning"/> En Tránsito
                        </div>
                        <div className="text-2xl font-bold text-warning">{metrics.ordersInTransit}</div>
                    </div>

                    {/* Vuelos Totales vs Activos */}
                    <div className="bg-base-100 p-3 rounded-lg border border-base-300 col-span-2 flex justify-between items-center">
                        <div>
                            <div className="flex items-center gap-2 text-base-content/70 text-[10px] uppercase font-bold mb-1">
                                <Plane size={12} className="text-primary"/> Vuelos (Activos / Total)
                            </div>
                            <div className="text-xl font-bold flex items-baseline gap-1">
                                <span className="text-primary">{metrics.activeFlights}</span>
                                <span className="text-sm text-base-content/60 font-normal">/ {metrics.totalFlights}</span>
                            </div>
                        </div>
                        {/* SLA Mini Chart */}
                        <div className="text-right">
                            <div className="flex items-center gap-1 text-base-content/70 text-[10px] uppercase font-bold justify-end mb-1">
                                <CheckCircle size={12} className={metrics.slaPercentage >= 90 ? "text-success" : "text-error"}/> SLA On-Time
                            </div>
                            <div className={`text-xl font-bold ${metrics.slaPercentage >= 90 ? "text-success" : "text-error"}`}>
                                {metrics.slaPercentage.toFixed(1)}%
                            </div>
                        </div>
                    </div>
                </div>

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
                            <OrderCardDetail key={order.orderId} order={order} formatTime={formatShortTime} formatDateTime={formatDateTime}/>
                        ))
                    )}
                </div>

                {/* Botón Planificar */}
                <div className="p-4 bg-base-100 border-t border-base-300 shrink-0">
                    <div className="flex justify-between text-[10px] text-base-content/60 mb-2 font-mono">
                        <span>Last Sync: {lastUpdated ? formatShortTime(lastUpdated.toISOString()) : '--:--'}</span>
                    </div>
                    <button
                        onClick={() => actions.planificar()}
                        disabled={status === 'buffering' || isReplanning}
                        className="btn btn-primary w-full gap-2 font-bold shadow-lg hover:shadow-primary/20 transition-all"
                    >
                        {isReplanning ? <span className="loading loading-spinner loading-xs"></span> : <Server size={16} />}
                        {isReplanning ? 'OPTIMIZANDO...' : 'EJECUTAR PLANIFICADOR'}
                    </button>
                </div>
            </div>

            {/* MAPA */}
            <div className="flex-1 relative z-0 bg-base-200 h-full border-l border-base-300">
                <MapaVuelos
                    aeropuertos={aeropuertos}
                    activeSegments={activeSegments}
                    vuelosEnMovimiento={vuelosEnMovimiento}
                    airportStocks={airportStocks}
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

function OrderCardDetail({ order, formatDateTime }: { order: OrderStatusDetail, formatTime: (s: string) => string, formatDateTime: (s: string) => string }) {
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
                        Capacidad: <span className="text-gray-200 font-bold">{order.quantity} un.</span>
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
                    <div className="text-[9px] font-mono text-gray-500 mt-1">{Math.round(order.progress)}%</div>
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
        </div>
    );
}
