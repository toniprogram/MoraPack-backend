import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useSimulacion } from '../hooks/useSimulacion';
import { MapaVuelos } from '../components/mapas/MapaVuelos';
import type { OrderRequest } from '../types/orderRequest';
import { SimTopBar } from '../components/simulacion/SimTopBar';
import { SimSidebar } from '../components/simulacion/SimSidebar';
import type { EnvioInfo, FlightGroup } from '../types/simulacionUI';
import { useLocation } from 'react-router-dom';
import { simulacionService } from '../services/simulacionService';

export default function SimulacionPage() {
  const {
      aeropuertos,
      activeSegments,
      reloj, isLoading, isStarting, isError, estaActivo, estaVisualizando,
      iniciar, pausar, terminar, vuelosEnMovimiento, hasSnapshots, tiempoSimulado, engineSpeed, status,
      resetVisual, activeAirports, deliveredOrders, inTransitOrders, orderPlansDb,
      orderPlansTotal, orderPlansPage, orderPlansPageSize, setOrderPlansPage, setOrderPlansStatuses,
      simulationId, startRealMs, elapsedRealMs, conectarSimulacion, notificacion, setNotificacion,
      deliveredPage, fetchDeliveries,
      getOrderDetails, fetchMissingOrder,
  } = useSimulacion();
  const location = useLocation();

  const [ordenesParaSimular] = useState<OrderRequest[]>([]);
  const [vistaPanel, setVistaPanel] = useState<'envios' | 'vuelos' | 'aeropuertos'>('envios');
  const [startDate, setStartDate] = useState<string>('2025-01-02T12:00');
  const [endDate, setEndDate] = useState<string>('2025-01-09T12:00');
  const [hastaColapso, setHastaColapso] = useState(false);
  const [estaSincronizando] = useState(false);
  const startedHereRef = useRef(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastError, setToastError] = useState(false);
  const [filtroHub, setFiltroHub] = useState<string>('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[] | null>(null);
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [selectedAirportIds, setSelectedAirportIds] = useState<string[] | null>(null);
  const [dialogInfo, setDialogInfo] = useState<{ titulo: string; mensaje: string } | null>(null);
  const [overlayCountdown, setOverlayCountdown] = useState(60);
  const statusRef = useRef(status);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const lastSimulationIdRef = useRef<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<'enproceso' | 'planificados' | 'entregados'>('enproceso');
  const [filtroTexto, setFiltroTexto] = useState<string>('');
  const [deliveredPageIndex, setDeliveredPageIndex] = useState(0);
  const mostrandoOverlay = estaActivo && !hasSnapshots;

  const [activeSegmentsSlow, setActiveSegmentsSlow] = useState(activeSegments);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    const now = Date.now();
    if (now - lastUpdateRef.current > 1000 || Math.abs(activeSegments.length - activeSegmentsSlow.length) > 2) {
        setActiveSegmentsSlow(activeSegments);
        lastUpdateRef.current = now;
    }
  }, [activeSegments, activeSegmentsSlow.length]);

  useEffect(() => {
    setOrderPlansPage(0);
    if (filtroEstado === 'planificados') setOrderPlansStatuses(['WAITING']);
    else if (filtroEstado === 'entregados') setOrderPlansStatuses(['DELIVERED']);
    else setOrderPlansStatuses(['IN_TRANSIT']);
  }, [filtroEstado, setOrderPlansPage, setOrderPlansStatuses]);

  useEffect(() => { statusRef.current = status; }, [status]);

  useEffect(() => {
    if (!mostrandoOverlay) return undefined;
    setOverlayCountdown(60);
    const id = setInterval(() => setOverlayCountdown(prev => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [mostrandoOverlay]);

  const ensureSeconds = (value?: string) => (!value ? undefined : value.length === 16 ? `${value}:00` : value);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const simIdParam = params.get('simId');
    if (simIdParam && !simulationId) {
      simulacionService.getStatus(simIdParam).then(statusResp => {
        if (statusResp.cancelled || statusResp.completed) {
          setToastMsg('La simulación especificada ya finalizó o fue cancelada.');
          const url = new URL(window.location.href);
          url.searchParams.delete('simId');
          window.history.replaceState({}, '', url.toString());
        } else {
          conectarSimulacion(simIdParam);
        }
      }).catch(() => {
        setToastMsg('No se pudo cargar la simulación indicada.');
        const url = new URL(window.location.href);
        url.searchParams.delete('simId');
        window.history.replaceState({}, '', url.toString());
      });
    }
  }, [location.search, simulationId, conectarSimulacion]);

  useEffect(() => {
    if (selectedOrderIds && selectedOrderIds.length > 0) {
      selectedOrderIds.forEach(id => {
        const details = getOrderDetails(id);
        if (!details) {
          fetchMissingOrder(id);
        }
      });
    }
  }, [selectedOrderIds, getOrderDetails, fetchMissingOrder]);

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

  const enviosCalc = useMemo(() => {
    const term = (filtroTexto || '').toLowerCase();
    const next = new Map<string, EnvioInfo>();

    const processAndAdd = (p: any, forced: boolean) => {
        const statusRaw = (p.status || 'PLANNED').toUpperCase();
        // 2. Lógica de Filtrado
        if (!forced) {
            let includeEstado = false;
            if (filtroEstado === 'planificados') {
                includeEstado = statusRaw === 'WAITING';
            } else if (filtroEstado === 'entregados') {
                includeEstado = statusRaw === 'DELIVERED';
            } else {
                includeEstado = statusRaw === 'IN_TRANSIT';
            }
            if (!includeEstado) return;
            const matchSearch = term === '' || p.orderId.toLowerCase().includes(term);
            if (!matchSearch) return;
        }
        // 3. Etiqueta Visual
        let estado: EnvioInfo['estado'] = 'Planificado';
        if (statusRaw === 'DELIVERED') {
          estado = 'Entregado';
        } else if (statusRaw === 'IN_TRANSIT') {
          estado = 'En tránsito';
        } else {
          estado = 'Planificado';
        }
        next.set(p.orderId, {
          plan: {
            orderId: p.orderId,
            creationUtc: p.creationUtc ?? new Date().toISOString(),
            slackMinutes: p.slackMinutes ?? 0,
            routes: p.routes ?? [],
          },
          estado,
          creationMs: p.creationUtc ? Date.parse(p.creationUtc) : 0,
          arrivalMs: 0,
        });
    };

    const plans = orderPlansDb ?? [];
    plans.forEach(p => {
      const isSelected = selectedOrderIds?.includes(p.orderId) ?? false;
      if (selectedOrderIds && selectedOrderIds.length > 0 && !isSelected) return;
      processAndAdd(p, isSelected);
    });

    if (selectedOrderIds && selectedOrderIds.length > 0) {
        selectedOrderIds.forEach(id => {
            if (next.has(id)) return;
            const details = getOrderDetails(id);
            if (details) {
                processAndAdd(details, true);
            }
        });
    }

    let lista: EnvioInfo[] = Array.from(next.values());
    const stats = { entregas: 0, retrasados: 0 };
    lista.forEach(info => {
      if (info.estado === 'En tránsito') stats.retrasados += 1;
    });
    return { lista, stats };
  }, [selectedOrderIds, orderPlansDb, filtroTexto, filtroEstado, deliveredPage, getOrderDetails]);

  const enviosFiltrados = enviosCalc.lista;

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

  const vuelosLive: FlightGroup[] = useMemo(() => {
    return activeSegmentsSlow.map(seg => {
      const dep = new Date(seg.departureUtc);
      const arr = new Date(seg.arrivalUtc);
      const fecha = dep.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
      const hora = dep.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
      const horaLlegada = arr.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
      return {
        uniqueKey: seg.id, segmentId: seg.id, flightId: seg.flightId, origen: seg.origin,
        destino: seg.destination, pedidos: seg.orderIds ?? [], hora, fecha,
        departureUtc: seg.departureUtc, arrivalUtc: seg.arrivalUtc, horaLlegada,
      };
    }).filter(vuelo => filtroHub === '' || vuelo.origen === filtroHub);
  }, [activeSegmentsSlow, filtroHub]);

  const vuelosFiltrados = useMemo<FlightGroup[]>(() => {
        const term = filtroTexto.toLowerCase();
        return vuelosLive.filter(v => {
          if (!term) return true;
          return (
            v.flightId.toLowerCase().includes(term) ||
            v.origen.toLowerCase().includes(term) ||
            v.destino.toLowerCase().includes(term) ||
            v.pedidos.some(p => p.toLowerCase().includes(term))
          );
        });
    }, [vuelosLive, filtroTexto]);

  const { capacidadUsadaFlota, capacidadTotalFlota } = useMemo(() => {
    let totalUsed = 0;
    let totalCapacity = 0;
    activeSegmentsSlow.forEach(seg => {
      totalUsed += seg.capacityUsed ?? 0;
      totalCapacity += seg.capacityTotal ?? 0;
    });
    return { capacidadUsadaFlota: totalUsed, capacidadTotalFlota: totalCapacity };
  }, [activeSegmentsSlow]);

  const aeropuertosFiltrados = useMemo(() => {
        const term = filtroTexto.toLowerCase();
        return aeropuertos.filter(a => {
          if (!term) return true;
          const nameMatch = a.name?.toLowerCase().includes(term);
          const cityMatch = (a as any).city?.toLowerCase().includes(term);
          const codeMatch = (a.code || a.id)?.toLowerCase().includes(term);
          return nameMatch || cityMatch || codeMatch;
        });
    }, [aeropuertos, filtroTexto]);

  const handleIniciarSimulacion = () => {
    const startUtc = ensureSeconds(startDate);
    const endUtc = hastaColapso ? undefined : ensureSeconds(endDate);
    setSelectedOrderIds(null);
    setSelectedFlightId(null);
    setSelectedAirportIds(null);
    setFiltroTexto('');
    const payload = { startDate: startUtc, endDate: endUtc, windowMinutes: 180 };
    startedHereRef.current = true;
    iniciar(payload);
  };

  const handleTerminarSimulacion = async () => {
    const simIdActual = simulationId ?? lastSimulationIdRef.current;
    if (simIdActual) lastSimulationIdRef.current = simIdActual;
    await terminar();
    setSelectedOrderIds(null);
    setSelectedFlightId(null);
    setSelectedAirportIds(null);
    resetVisual();
    setFiltroTexto('');
    setDialogInfo({ titulo: 'Simulación terminada', mensaje: 'Se detuvo la simulación actual.' });
    const url = new URL(window.location.href);
    url.searchParams.delete('simId');
    window.history.replaceState({}, '', url.toString());
  };

  const handleCerrarDialogo = () => setDialogInfo(null);

  useEffect(() => {
    if (status === 'completed' && inTransitOrders === 0 && activeSegments.length === 0) {
      setDialogInfo({ titulo: 'Simulación terminada', mensaje: 'La simulación finalizó correctamente.' });
    }
  }, [status, inTransitOrders, activeSegments.length]);

  useEffect(() => {
    if (!simulationId) return;
    lastSimulationIdRef.current = simulationId;
    const url = new URL(window.location.href);
    url.searchParams.set('simId', simulationId);
    window.history.replaceState({}, '', url.toString());
    if (startedHereRef.current) {
      setToastMsg('Puedes compartir esta simulación copiando la URL');
      startedHereRef.current = false;
    }
  }, [simulationId]);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 5000);
    return () => clearTimeout(t);
  }, [toastMsg]);

  useEffect(() => {
    if (!notificacion) return;
    setToastError(notificacion.toLowerCase().includes('colapso'));
    setToastMsg(notificacion);
    setNotificacion(null);
  }, [notificacion, setNotificacion]);

  useEffect(() => {
    if (filtroEstado !== 'entregados') return;
    if (!simulationId) return;
    fetchDeliveries({ page: deliveredPageIndex, size: 20, search: filtroTexto || undefined });
  }, [filtroEstado, simulationId, filtroTexto, deliveredPageIndex, fetchDeliveries]);

  useEffect(() => setDeliveredPageIndex(0), [filtroEstado]);

  const handleDescargarReporte = useCallback(async () => {
    const targetId = simulationId ?? lastSimulationIdRef.current;
    if (!targetId) return;
    try {
      setDownloadingReport(true);
      const report = await simulacionService.getReport(targetId);
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte-simulacion-${targetId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setToastError(false);
      setToastMsg('Reporte descargado');
    } catch (err) {
      setToastError(true);
      setToastMsg('No se pudo descargar el reporte');
    } finally {
      setDownloadingReport(false);
    }
  }, [simulationId]);

  const formatElapsed = (elapsedMs: number) => {
    if (elapsedMs < 0 || !Number.isFinite(elapsedMs)) return '--:--:--';
    const hours = Math.floor(elapsedMs / 3_600_000);
    const minutes = Math.floor((elapsedMs % 3_600_000) / 60_000);
    const seconds = Math.floor((elapsedMs % 60_000) / 1000);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  if (isLoading) return <div className="p-6 text-center">Cargando datos base...</div>;
  if (isError) return <div className="p-6 text-center text-red-500">Error al cargar datos.</div>;
  const clearSelectedOrders = () => { setSelectedOrderIds(null); setSelectedFlightId(null); setSelectedAirportIds(null); };

  return (
    <>
    {toastMsg && (
      <div className="toast toast-end z-[1500]">
        <div className={`alert ${toastError ? 'alert-error' : 'alert-info'}`}>
          <span>{toastMsg}</span>
        </div>
      </div>
    )}
    <div className="flex h-[calc(100vh-3rem)] min-h-[calc(100vh-3rem)] w-full bg-base-200 text-base-content">
      <SimSidebar
          ordenesParaSimular={ordenesParaSimular} startDate={startDate} endDate={endDate} setStartDate={setStartDate} setEndDate={setEndDate}
          hastaColapso={hastaColapso} setHastaColapso={setHastaColapso} estaActivo={estaActivo} estaVisualizando={estaVisualizando}
          status={status} isStarting={isStarting} estaSincronizando={estaSincronizando} onIniciar={handleIniciarSimulacion} onTerminar={handleTerminarSimulacion}
          onPausar={pausar} vistaPanel={vistaPanel} setVistaPanel={setVistaPanel} filtroEstado={filtroEstado} setFiltroEstado={setFiltroEstado}
          filtroTexto={filtroTexto} setFiltroTexto={setFiltroTexto} enviosFiltrados={enviosFiltrados} currentTime={tiempoSimulado}

          vuelosFiltrados={vuelosFiltrados}
          vuelosTotal={vuelosLive.length}

          aeropuertos={aeropuertosFiltrados}
          activeAirports={activeAirports} activeSegments={activeSegmentsSlow}
          filtroHub={filtroHub} setFiltroHub={setFiltroHub} ordersTotal={orderPlansTotal} ordersPage={orderPlansPage} ordersPageSize={orderPlansPageSize}
          onOrdersPageChange={(page) => setOrderPlansPage(page)} selectedOrderIds={selectedOrderIds} onSelectOrders={handleSelectOrders}
          clearSelectedOrders={clearSelectedOrders}
          vuelosEnMovimiento={vuelosEnMovimiento}
          selectedFlightId={selectedFlightId} onSelectFlight={handleSelectFlight}
          selectedAirportIds={selectedAirportIds} onSelectAirport={handleSelectAirport} animPaused={false}
      />
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 relative min-h-0">
          <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none">
            <div className="pointer-events-none">
              <SimTopBar
                entregados={deliveredOrders} enTransito={inTransitOrders}
                vuelosActivos={activeSegments.length}
                reloj={reloj} tiempoSimulado={tiempoSimulado}
                estaActivo={estaActivo} engineSpeed={engineSpeed} startRealMs={startRealMs} elapsedRealMs={elapsedRealMs} formatElapsed={formatElapsed}
                capacidadUsadaFlota={capacidadUsadaFlota} capacidadTotalFlota={capacidadTotalFlota} startDateString={startDate}
              />
            </div>
          </div>
          {mostrandoOverlay && (
            <div className="absolute top-0 left-0 w-full h-full bg-base-300/80 z-[1000] flex items-center justify-center text-base-content p-8">
              <div className="text-center space-y-4">
                <div className="animate-spin rounded-full h-24 w-24 border-8 border-primary border-t-transparent mx-auto"></div>
                <h2 className="text-2xl font-semibold">Iniciando simulación</h2>
                <p className="text-lg text-base-content/90">Arrancando en {overlayCountdown}s</p>
              </div>
            </div>
          )}
          <MapaVuelos
            aeropuertos={aeropuertos}
            activeSegments={activeSegments}
            isLoading={isLoading || isStarting}
            vuelosEnMovimiento={vuelosEnMovimiento}
            filtroHubActivo={filtroHub} activeAirports={activeAirports} onSelectOrders={handleSelectOrders} selectedFlightId={selectedFlightId}
            onSelectFlight={handleSelectFlight} selectedAirportIds={selectedAirportIds} onSelectAirport={handleSelectAirport} selectedOrders={selectedOrderIds}
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
            {(simulationId || lastSimulationIdRef.current) && (
              <button className="btn btn-primary" onClick={handleDescargarReporte} disabled={downloadingReport}>
                {downloadingReport ? 'Generando...' : 'Descargar reporte'}
              </button>
            )}
            <button className="btn" onClick={handleCerrarDialogo}>Aceptar</button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop"><button onClick={handleCerrarDialogo}>close</button></form>
      </dialog>
    )}
    </>
  );
}
