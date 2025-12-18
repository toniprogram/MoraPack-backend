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
        ghostFlights,
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
    // --- ESTADOS DE UI ---
    // 1. Toggle general de visualización
    const [showEmptyFlights, setShowEmptyFlights] = useState(false);
    // 2. Selección compartida
    const [selectedAirportIds, setSelectedAirportIds] = useState<string[] | null>(null);
    const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
    const [selectedOrders, setSelectedOrders] = useState<string[] | null>(null);
    // --- LOGICA DE FILTRADO PARA EL MAPA ---
    // A. Filtrado Inteligente de Vuelos Fantasma
    const displayedGhostFlights = useMemo(() => {
        if (!showEmptyFlights) return [];
        // CASO 1: Si hay aeropuertos seleccionados, mostramos solo los que conectan
        if (selectedAirportIds && selectedAirportIds.length > 0) {
            return ghostFlights.filter(g =>
                selectedAirportIds.includes(g.origin) || selectedAirportIds.includes(g.destination)
            );
        }
        // CASO 2: Si hay un vuelo seleccionado, ocultamos el ruido de fondo para enfocar
        if (selectedFlightId) {
            return [];
        }
        // CASO 3: Vista General (Sin selección) -> Mostramos todos
        return ghostFlights;
    }, [ghostFlights, showEmptyFlights, selectedAirportIds, selectedFlightId]);
    // B. Preparación de datos de aeropuertos
    const activeAirports: ActiveAirportTick[] = useMemo(() => {
        return aeropuertos.map(a => {
            const code = a.code || a.id || '';
            const liveData = airportStocks[code];
            return {
                airportCode: code,
                currentLoad: liveData?.currentLoad || 0,
                maxThroughputPerHour: liveData?.maxThroughputPerHour || a.storageCapacity || 0,
                orderLoads: liveData?.orderLoads || []
            };
        });
    }, [aeropuertos, airportStocks]);
    // C. Filtrado de objetos visuales ACTIVOS por tiempo
    const { mapSegments, mapVuelos } = useMemo(() => {
        const nowMs = simClock.getTime();
        // Rutas: Solo pintamos las de vuelos con carga
        const segs = activeSegments.filter(s => {
            const dep = Date.parse(s.departureUtc);
            return dep <= nowMs;
        });
        // Aviones: Solo los aviones con carga
        const vuelos = vuelosEnMovimiento.filter(v => {
            const dep = Date.parse(v.salidaProgramada);
            return dep <= nowMs;
        });
        return { mapSegments: segs, mapVuelos: vuelos };
    }, [activeSegments, vuelosEnMovimiento, simClock]);

    // --- MANEJO DE TIEMPO MANUAL ---
    const [manualDateStr, setManualDateStr] = useState('');
    const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setManualDateStr(e.target.value);
    };
    const getInputValue = () => {
        if (manualDateStr) return manualDateStr;
        return simClock.toISOString().slice(0, 16);
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
            timeZone: 'UTC', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
        });
    };
    const isRealtime = Math.abs(simClock.getTime() - Date.now()) < 60_000;
    return (
        <div className="flex h-[calc(100vh-3rem)] min-h-[calc(100vh-3rem)] w-full bg-base-200 text-base-content">
            {/* SIDEBAR */}
            <OperacionSidebar
                aeropuertos={aeropuertos}
                activeSegments={activeSegments}
                ghostFlights={ghostFlights}
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
                selectedAirportIds={selectedAirportIds}
                onSelectAirport={setSelectedAirportIds}
                selectedFlightId={selectedFlightId}
                onSelectFlight={setSelectedFlightId}
                actions={{
                    planificar: () => actions.planificar(),
                    clearPlan: () => actions.clearPlan(),
                    setManualTime: (d) => actions.setManualTime(d),
                    resetTime: () => {
                        setManualDateStr('');
                        actions.setManualTime(new Date());
                        actions.resetTime();
                    },
                }}
                formatDateTime={formatDateTime}
                formatShortTime={formatShortTime}
                getInputValue={getInputValue}
                handleTimeChange={handleTimeChange}
            />
            {/* AREA PRINCIPAL */}
            <div className="flex-1 relative z-0 bg-base-200 h-full max-h-full flex flex-col overflow-hidden">
                {/* TOPBAR*/}
                <OperacionTopBar
                    metrics={metrics}
                    simClock={simClock}
                    status={status}
                    activeSegments={activeSegments}
                    lastUpdated={lastUpdated}
                    showGhostFlights={showEmptyFlights}
                    onToggleGhostFlights={() => setShowEmptyFlights(prev => !prev)}
                />
                <div className="flex-1 relative w-full h-full">
                    <MapaVuelos
                        aeropuertos={aeropuertos}
                        activeSegments={mapSegments}
                        vuelosEnMovimiento={mapVuelos}
                        ghostFlights={displayedGhostFlights}
                        activeAirports={activeAirports}
                        selectedAirportIds={selectedAirportIds}
                        onSelectAirport={(airportId) => setSelectedAirportIds(airportId ? [airportId] : null)}
                        selectedFlightId={selectedFlightId}
                        onSelectFlight={setSelectedFlightId}
                        selectedOrders={selectedOrders}
                        onSelectOrders={setSelectedOrders}
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
        </div>
    );
}