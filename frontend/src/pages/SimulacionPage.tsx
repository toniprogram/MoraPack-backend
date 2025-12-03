import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useSimulacion } from '../hooks/useSimulacion';
import { MapaVuelos } from '../components/mapas/MapaVuelos';
import type { OrderRequest } from '../types/orderRequest';
import type { OrderStatusTick, SimulationOrderPlan } from '../types/simulation';
import { SimTopBar } from '../components/simulacion/SimTopBar';
import { SimSidebar } from '../components/simulacion/SimSidebar';
import type { EnvioInfo, FlightGroup } from '../types/simulacionUI';

// Interfaz extendida para mantener fechas originales del archivo TXT
interface OrderRequestExtended extends OrderRequest {
  fechaOriginal: string;
}

export default function SimulacionPage() {
  const {
      aeropuertos,
      activeSegments,
      reloj,
      isLoading,
      isStarting,
      isError,
      estaActivo,
      estaVisualizando,
      iniciar,
      pausar,
      terminar,
      vuelosEnMovimiento,
      hasSnapshots,
      tiempoSimulado,
      engineSpeed,
      status,
      resetVisual,
      activeAirports,
      deliveredOrders,
      inTransitOrders,
      orderStatuses,
      orderPlans,
  } = useSimulacion();

  const [ordenesParaSimular] = useState<OrderRequestExtended[]>([]);
  const [vistaPanel, setVistaPanel] = useState<'envios' | 'vuelos' | 'aeropuertos'>('envios');
  const [startDate, setStartDate] = useState<string>('2025-01-02T12:00');
  const [endDate, setEndDate] = useState<string>('2025-01-09T12:00');
  const [estaSincronizando] = useState(false);

  const [filtroHub, setFiltroHub] = useState<string>('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[] | null>(null);
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [selectedAirportIds, setSelectedAirportIds] = useState<string[] | null>(null);
  const [dialogInfo, setDialogInfo] = useState<{ titulo: string; mensaje: string } | null>(null);
  const startSimRef = useRef<number | null>(null);
  const startRealRef = useRef<number | null>(null);
  const [startRealMs, setStartRealMs] = useState<number | null>(null);
  const [elapsedRealMs, setElapsedRealMs] = useState(0);

  const ensureSeconds = (value?: string) => {
    if (!value) return undefined;
    return value.length === 16 ? `${value}:00` : value;
  };

  const enviosHistoricos = useRef<Map<string, EnvioInfo>>(new Map());

  // Mapas auxiliares para selección cruzada
  const flightById = useMemo(() => {
    const map = new Map<string, typeof activeSegments[number]>();
    activeSegments.forEach(seg => map.set(seg.id, seg));
    return map;
  }, [activeSegments]);

  const orderToFlights = useMemo(() => {
    const map = new Map<string, Set<string>>();
    activeSegments.forEach(seg => {
      const orders = seg.orderLoads?.map(o => o.orderId) ?? seg.orderIds ?? [];
      orders.forEach(id => {
        if (!map.has(id)) map.set(id, new Set());
        map.get(id)!.add(seg.id);
      });
    });
    return map;
  }, [activeSegments]);

  const airportToOrders = useMemo(() => {
    const map = new Map<string, Set<string>>();
    activeAirports.forEach(a => {
      const orders = a.orderLoads ?? [];
      orders.forEach(ol => {
        if (!map.has(a.airportCode)) map.set(a.airportCode, new Set());
        map.get(a.airportCode)!.add(ol.orderId);
      });
    });
    return map;
  }, [activeAirports]);

  const orderToAirports = useMemo(() => {
    const map = new Map<string, Set<string>>();
    airportToOrders.forEach((orders, airport) => {
      orders.forEach(orderId => {
        if (!map.has(orderId)) map.set(orderId, new Set());
        map.get(orderId)!.add(airport);
      });
    });
    return map;
  }, [airportToOrders]);

  // --- LÓGICA DE FILTRADO Y ORDEN PARA LOS PANELES ---
  const enviosCalc = useMemo(() => {
    const term = '';
    const prev = enviosHistoricos.current;
    const next = new Map(prev);
    const vistos = new Set<string>();
    const planMap = new Map<string, SimulationOrderPlan>();
    (orderPlans ?? []).forEach(p => planMap.set(p.orderId, p));

    (orderStatuses ?? []).forEach((os: OrderStatusTick) => {
      if (!os || os.status === 'PLANNED') return; // ignoramos planificados para no poblar el panel
      const matchSearch = term === '' || os.orderId.toLowerCase().includes(term);
      if (!matchSearch) return;
      if (selectedOrderIds && !selectedOrderIds.includes(os.orderId)) return;

      const estado: EnvioInfo['estado'] =
        os.status === 'READY_PICKUP' ? 'En tránsito'
        : os.status === 'IN_TRANSIT' ? 'En tránsito'
        : 'Planificado';

      const plan = planMap.get(os.orderId);
      next.set(os.orderId, {
        plan: plan ?? { orderId: os.orderId, slackMinutes: 0, routes: [] } as SimulationOrderPlan,
        estado,
        creationMs: 0,
        arrivalMs: 0
      });
      vistos.add(os.orderId);
    });

    // limpiar antiguos entregados
    Array.from(next.keys()).forEach(id => {
      if (!vistos.has(id)) {
        next.delete(id);
      }
    });

    enviosHistoricos.current = next;

    const lista: EnvioInfo[] = Array.from(next.values());
    const stats = { entregas: 0, retrasados: 0 };
    lista.forEach(info => {
      if (info.estado === 'En tránsito') stats.retrasados += 1;
    });
    return { lista, stats };
  }, [orderStatuses, selectedOrderIds, orderPlans]);

  // KPIs basados en lo que se muestra actualmente
  const enviosFiltrados = enviosCalc.lista;

  // ----- SELECCIÓN CRUZADA -----
  const handleSelectFlight = useCallback((flightId: string | null) => {
    if (!flightId) {
      setSelectedFlightId(null);
      setSelectedOrderIds(null);
      setSelectedAirportIds(null);
      return;
    }
    const seg = flightById.get(flightId);
    const orders = seg ? (seg.orderLoads?.map(o => o.orderId) ?? seg.orderIds ?? []) : [];
    const airports = seg ? [seg.origin, seg.destination].filter(Boolean) as string[] : [];
    setSelectedFlightId(flightId);
    setSelectedOrderIds(orders.length ? orders : null);
    setSelectedAirportIds(airports.length ? airports : null);
  }, [flightById]);

  const handleSelectAirport = useCallback((airportId: string | null) => {
    if (!airportId) {
      setSelectedAirportIds(null);
      return;
    }
    const orders = Array.from(airportToOrders.get(airportId)?.values() ?? []);
    setSelectedAirportIds([airportId]);
    setSelectedOrderIds(orders.length ? orders : null);
    setSelectedFlightId(null);
  }, [airportToOrders]);

  const handleSelectOrders = useCallback((orderIds: string[] | null) => {
    if (!orderIds || orderIds.length === 0) {
      setSelectedOrderIds(null);
      setSelectedFlightId(null);
      setSelectedAirportIds(null);
      return;
    }
    const unique = Array.from(new Set(orderIds));
    setSelectedOrderIds(unique);

    const airports = new Set<string>();
    unique.forEach(id => {
      orderToAirports.get(id)?.forEach(a => airports.add(a));
    });
    setSelectedAirportIds(airports.size ? Array.from(airports) : null);

    let firstFlight: string | null = null;
    unique.some(id => {
      const flights = orderToFlights.get(id);
      if (flights && flights.size > 0) {
        firstFlight = Array.from(flights)[0];
        return true;
      }
      return false;
    });
    setSelectedFlightId(firstFlight);
  }, [orderToAirports, orderToFlights]);

  // Vuelos en vivo desde los ticks (preferidos)
  const vuelosLive: FlightGroup[] = useMemo(() => {
    return activeSegments.map(seg => {
      const dep = new Date(seg.departureUtc);
      const arr = new Date(seg.arrivalUtc);
      const fecha = dep.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
      const hora = dep.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
      const horaLlegada = arr.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
      return {
        segmentId: seg.id,
        flightId: seg.flightId,
        origen: seg.origin,
        destino: seg.destination,
        pedidos: seg.orderIds ?? [],
        hora,
        fecha,
        departureUtc: seg.departureUtc,
        arrivalUtc: seg.arrivalUtc,
        horaLlegada,
      };
    }).filter(vuelo => filtroHub === '' || vuelo.origen === filtroHub);
  }, [activeSegments, filtroHub]);

  const vuelosFiltrados = useMemo<FlightGroup[]>(() => {
    return vuelosLive;
  }, [vuelosLive]);

  const handleIniciarSimulacion = () => {
    const startUtc = ensureSeconds(startDate);
    const endUtc = ensureSeconds(endDate);
    startSimRef.current = startUtc ? Date.parse(startUtc) : null;
    startRealRef.current = Date.now();
    setStartRealMs(startRealRef.current);
    setElapsedRealMs(0);
    enviosHistoricos.current = new Map();
    setSelectedOrderIds(null);
    setSelectedFlightId(null);
    setSelectedAirportIds(null);
    const payload = {
      startDate: startUtc,
      endDate: endUtc,
      windowMinutes: 180,
    };
    iniciar(payload);
  };

  const handleTerminarSimulacion = async () => {
    await terminar();
    startSimRef.current = null;
    startRealRef.current = null;
    setStartRealMs(null);
    setElapsedRealMs(0);
    enviosHistoricos.current = new Map();
    setSelectedOrderIds(null);
    setSelectedFlightId(null);
    setSelectedAirportIds(null);
    resetVisual();
    setDialogInfo({
      titulo: 'Simulación terminada',
      mensaje: 'Se detuvo la simulación actual. Ahora puedes modificar los datos o iniciar una nueva corrida.',
    });
  };

  const handleCerrarDialogo = () => setDialogInfo(null);

  useEffect(() => {
    if (status === 'completed') {
      setDialogInfo({
        titulo: 'Simulación terminada',
        mensaje: 'La simulación finalizó correctamente. Puedes ajustar parámetros o comenzar otra simulación.',
      });
    }
  }, [status]);

  useEffect(() => {
    if (!estaActivo || startRealMs === null) {
      return;
    }
    const interval = setInterval(() => {
      setElapsedRealMs(Date.now() - startRealMs);
    }, 1000);
    return () => clearInterval(interval);
  }, [estaActivo, startRealMs]);

  const formatElapsed = (elapsedMs: number) => {
    if (elapsedMs < 0 || !Number.isFinite(elapsedMs)) return '--:--:--';
    const hours = Math.floor(elapsedMs / 3_600_000);
    const minutes = Math.floor((elapsedMs % 3_600_000) / 60_000);
    const seconds = Math.floor((elapsedMs % 60_000) / 1000);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  if (isLoading) {
    return <div className="p-6 text-center">Cargando datos base...</div>;
  }
  if (isError) {
    return <div className="p-6 text-center text-red-500">Error al cargar datos.</div>;
  }
  const mostrandoOverlay = estaActivo && !hasSnapshots;
  const clearSelectedOrders = () => {
    setSelectedOrderIds(null);
    setSelectedFlightId(null);
    setSelectedAirportIds(null);
  };

  return (
    <>
    <div className="flex h-screen w-full bg-base-200 text-base-content">

      <SimSidebar
        ordenesParaSimular={ordenesParaSimular}
        startDate={startDate}
        endDate={endDate}
        setStartDate={setStartDate}
        setEndDate={setEndDate}
        estaActivo={estaActivo}
        estaVisualizando={estaVisualizando}
        isStarting={isStarting}
        estaSincronizando={estaSincronizando}
        onIniciar={handleIniciarSimulacion}
        onTerminar={handleTerminarSimulacion}
        onPausar={pausar}
        vistaPanel={vistaPanel}
        setVistaPanel={setVistaPanel}
        enviosFiltrados={enviosFiltrados}
        vuelosFiltrados={vuelosFiltrados}
        vuelosTotal={vuelosLive.length}
        aeropuertos={aeropuertos}
        activeAirports={activeAirports}
        filtroHub={filtroHub}
        setFiltroHub={setFiltroHub}
        selectedOrderIds={selectedOrderIds}
        onSelectOrders={handleSelectOrders}
        clearSelectedOrders={clearSelectedOrders}
        vuelosEnMovimiento={vuelosEnMovimiento}
        selectedFlightId={selectedFlightId}
        onSelectFlight={handleSelectFlight}
        selectedAirportIds={selectedAirportIds}
        onSelectAirport={handleSelectAirport}
      />

      {/* ========== ÁREA DEL MAPA ========== */}
      <div className="flex-1 flex flex-col">

          {/* Barra superior con KPIs y Reloj */}
          <SimTopBar
            entregados={deliveredOrders}
            enTransito={inTransitOrders}
            vuelosActivos={activeSegments.length}
            reloj={reloj}
            tiempoSimulado={tiempoSimulado}
            estaActivo={estaActivo}
            engineSpeed={engineSpeed}
            startRealMs={startRealMs}
            elapsedRealMs={elapsedRealMs}
            formatElapsed={formatElapsed}
          />

        {/* Mapa */}
        <div className="flex-1 relative">

          {/* Mostramos overlay de carga si el GA está corriendo */}
          {mostrandoOverlay && (
            <div className="absolute top-0 left-0 w-full h-full bg-base-300/80 z-[1000] flex items-center justify-center text-base-content p-8">
              <div className="text-center space-y-4">
                <div
                  className="animate-spin rounded-full h-24 w-24 border-8 border-primary border-t-transparent mx-auto"
                ></div>
                <h2 className="text-2xl font-semibold">Planificando Rutas...</h2>
                <p className="text-lg text-base-content/70">
                  El Sistema está procesando los pedidos.
                </p>
                <div className="stats bg-base-200 shadow-xl">
                  <div className="stat">
                    <div className="stat-title">Pedidos Procesados</div>
                    <div className="stat-value text-primary">
                      {reloj}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <MapaVuelos
            aeropuertos={aeropuertos}
            activeSegments={activeSegments}
            isLoading={isLoading || isStarting}
            vuelosEnMovimiento={vuelosEnMovimiento}
            filtroHubActivo={filtroHub}
            activeAirports={activeAirports}
            onSelectOrders={handleSelectOrders}
            selectedFlightId={selectedFlightId}
            onSelectFlight={handleSelectFlight}
            selectedAirportIds={selectedAirportIds}
            onSelectAirport={handleSelectAirport}
            selectedOrders={selectedOrderIds}
          />
        </div>
      </div>
    </div>
    {dialogInfo && (
      <dialog className="modal" open>
        <div className="modal-box">
          <h3 className="font-bold text-lg mb-2">{dialogInfo.titulo}</h3>
          <p className="text-base-content/80">{dialogInfo.mensaje}</p>
          <div className="modal-action">
            <button className="btn btn-primary" onClick={handleCerrarDialogo}>Entendido</button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={handleCerrarDialogo}>close</button>
        </form>
      </dialog>
    )}
    </>
  );
}
