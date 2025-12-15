import { useMemo, useState } from 'react';
import { useOperacion } from '../hooks/useOperacion';
import { MapaVuelos } from '../components/mapas/MapaVuelos';
import type { ActiveAirportTick } from '../types/simulation';
import { OperacionSidebar } from '../components/operacion/OperacionSidebar';
import { OperacionTopBar } from '../components/operacion/OperacionTopBar';

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
        const result = aeropuertos.map(a => {
            const code = a.code || a.id || '';
            const stock = airportStocks[code];
            const capacity = a.storageCapacity;

            return {
                airportCode: code,
                currentLoad: stock || 0,
                maxThroughputPerHour: capacity || 0
            };
        });
        return result;
    }, [aeropuertos, airportStocks]);

    const [manualDateStr, setManualDateStr] = useState('');

    const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setManualDateStr(val);
    };

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

    const isRealtime = Math.abs(simClock.getTime() - Date.now()) < 60_000;

    return (
        <div className="flex h-[calc(100vh-3rem)] min-h-[calc(100vh-3rem)] w-full bg-base-200 text-base-content">

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
            <div className="flex-1 relative z-0 bg-base-200 h-full max-h-full overflow-hidden">

                <OperacionTopBar
                    metrics={metrics}
                    simClock={simClock}
                    status={status}
                    activeSegments={activeSegments}
                    lastUpdated={lastUpdated}
                />

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