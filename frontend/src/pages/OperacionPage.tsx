import { useMemo, useState } from 'react';
import { useOperacion } from '../hooks/useOperacion';
import { MapaVuelos } from '../components/mapas/MapaVuelos';
import {
    Plane, Package, CheckCircle,
    Activity
} from 'lucide-react';
import type { ActiveAirportTick } from '../types/simulation';
import { OperacionSidebar } from '../components/operacion/OperacionSidebar';

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

    const [manualDateStr, setManualDateStr] = useState('');

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

            <OperacionSidebar
                aeropuertos={aeropuertos}
                activeSegments={activeSegments}
                activeAirports={activeAirports}
                vuelosEnMovimiento={vuelosEnMovimiento}
                orderStatusList={orderStatusList}
                metrics={metrics}
                status={status}
                simClock={simClock}
                isRealtime={isRealtime}
                isReplanning={isReplanning}
                isClearingPlan={isClearingPlan}
                lastUpdated={lastUpdated}
                actions={{
                    planificar: () => actions.planificar(),
                    clearPlan: () => actions.clearPlan(),
                    setManualTime: (d) => actions.setManualTime(d),
                    resetTime: () => actions.resetTime(),
                }}
                formatDateTime={formatDateTime}
                formatShortTime={formatShortTime}
                getInputValue={getInputValue}
                handleTimeChange={handleTimeChange}
            />

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
