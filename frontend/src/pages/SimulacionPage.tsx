import { useState, useMemo, useRef, useEffect } from 'react';
import { useSimulacion } from '../hooks/useSimulacion';
import { MapaVuelos } from '../components/mapas/MapaVuelos';
import type { OrderRequest } from '../types/orderRequest';
import type { SimulationSnapshot } from '../types/simulation';
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
      snapshotFinal,
      snapshotVisible,
      snapshotProgreso,
      vuelosEnMovimiento,
      hasSnapshots,
      tiempoSimulado,
      simSpeed,
      setSimSpeed,
      status,
  } = useSimulacion();

  const [ordenesParaSimular] = useState<OrderRequestExtended[]>([]);
  const [vistaPanel, setVistaPanel] = useState<'envios' | 'vuelos' | 'aeropuertos'>('envios');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [estaSincronizando] = useState(false);

  const [filtroHub, setFiltroHub] = useState<string>('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[] | null>(null);
  const [dialogInfo, setDialogInfo] = useState<{ titulo: string; mensaje: string } | null>(null);
  const startSimRef = useRef<number | null>(null);
  const startRealRef = useRef<number | null>(null);
  const [startRealMs, setStartRealMs] = useState<number | null>(null);
  const [elapsedRealMs, setElapsedRealMs] = useState(0);

  const ensureSeconds = (value?: string) => {
    if (!value) return undefined;
    return value.length === 16 ? `${value}:00` : value;
  };

  const fechasOriginalesPorOrden = useMemo(() => {
    const mapa = new Map<string, { fecha: Date; fechaStr: string }>();
    ordenesParaSimular.forEach(orden => {
      mapa.set(orden.id, {
        fecha: new Date(orden.fechaOriginal),
        fechaStr: orden.fechaOriginal
      });
    });
    return mapa;
  }, [ordenesParaSimular]);

  const panelSnapshot: SimulationSnapshot | null =
    snapshotVisible ?? snapshotProgreso ?? snapshotFinal ?? null;
  const enviosHistoricos = useRef<Map<string, EnvioInfo>>(new Map());
  const ordersEnTransito = useMemo(() => {
    const set = new Set<string>();
    activeSegments.forEach(seg => seg.orderIds?.forEach(id => set.add(id)));
    return set;
  }, [activeSegments]);

  const vuelosPorFlightId = useMemo<Map<string, FlightGroup>>(() => {
    if (!panelSnapshot) return new Map();
    const mapa = new Map<string, FlightGroup>();

    panelSnapshot.orderPlans.forEach(plan => {
      plan.routes.forEach(ruta => {
        ruta.segments.forEach(segmento => {
          if (!segmento.departureUtc || !segmento.arrivalUtc) {
            return;
          }

          const uniqueFlightId = segmento.departureUtc;
          const diaVuelo = new Date(segmento.departureUtc).toLocaleDateString('es-PE', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                timeZone: 'UTC'
              });
          const horaSalida = new Date(segmento.departureUtc).toLocaleTimeString('es-PE', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'UTC'
              });
          const horaLlegada = new Date(segmento.arrivalUtc).toLocaleTimeString('es-PE', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'UTC'
              });
          if (!mapa.has(uniqueFlightId)) {
            mapa.set(uniqueFlightId, {
              flightId: segmento.flightId,
              origen: segmento.origin,
              destino: segmento.destination,
              pedidos: [],
              hora: horaSalida,
              fecha: diaVuelo,
              departureUtc: segmento.departureUtc,
              arrivalUtc: segmento.arrivalUtc,
              horaLlegada: horaLlegada
            });
          }
          const vueloData = mapa.get(uniqueFlightId)!;
          if (!vueloData.pedidos.includes(plan.orderId)) {
            vueloData.pedidos.push(plan.orderId);
          }
        });
      });
    });
    return mapa;
  }, [panelSnapshot]);

  // --- LÓGICA DE FILTRADO Y ORDEN PARA LOS PANELES ---
  const enviosCalc = useMemo(() => {
    if (!panelSnapshot) return { lista: [], stats: { entregas: 0, retrasados: 0 } };
    const term = '';
    const currentMs = tiempoSimulado
      ? tiempoSimulado.getTime()
      : panelSnapshot?.generatedAt
        ? Date.parse(panelSnapshot.generatedAt)
        : 0;

    const prev = enviosHistoricos.current;
    const next = new Map(prev);
    const vistos = new Set<string>();

    panelSnapshot.orderPlans.forEach(plan => {
      const matchSearch = term === '' || plan.orderId.toLowerCase().includes(term);
      const matchHub = filtroHub === '' || plan.routes.some(ruta =>
        ruta.segments.some(seg => seg.origin === filtroHub)
      );
      if (!matchSearch || !matchHub) return;

      const segmentos = plan.routes?.flatMap(r => r.segments ?? []) ?? [];
      const earliestDepartureMs = segmentos.reduce((min, seg) => {
        const dep = seg?.departureUtc ? Date.parse(seg.departureUtc) : NaN;
        if (Number.isNaN(dep)) return min;
        return Math.min(min, dep);
      }, Number.POSITIVE_INFINITY);
      const idBase = plan.orderId.split('_')[0];
      const fechaOriginalData = fechasOriginalesPorOrden.get(plan.orderId) || fechasOriginalesPorOrden.get(idBase);
      const creationMs = fechaOriginalData?.fecha.getTime()
        ?? (Number.isFinite(earliestDepartureMs) ? earliestDepartureMs : 0);
      const arrivalMs = segmentos.reduce((max, seg) => {
        const arr = seg?.arrivalUtc ? Date.parse(seg.arrivalUtc) : NaN;
        return Number.isNaN(arr) ? max : Math.max(max, arr);
      }, 0);
      const enTransitoPorSegmento = ordersEnTransito.has(plan.orderId);

      // Estado detallado según línea de tiempo
      let estado: EnvioInfo['estado'] = 'Recibido';
      if (creationMs && currentMs && creationMs > currentMs) {
        // aún no "existe" en la simulación
        return;
      }
      if (arrivalMs && currentMs >= arrivalMs) {
        estado = 'Entregado';
      } else if (Number.isFinite(earliestDepartureMs) && earliestDepartureMs < Infinity) {
        if (currentMs < earliestDepartureMs && !enTransitoPorSegmento) {
          estado = 'Planificado';
        } else {
          // ¿está en tránsito?
          const enTransito = segmentos.some(seg => {
            const dep = seg?.departureUtc ? Date.parse(seg.departureUtc) : NaN;
            const arr = seg?.arrivalUtc ? Date.parse(seg.arrivalUtc) : NaN;
            return !Number.isNaN(dep) && !Number.isNaN(arr) && dep <= currentMs && currentMs < arr;
          });
          estado = (enTransito || enTransitoPorSegmento) ? 'En tránsito' : 'Planificado';
        }
      } else if (enTransitoPorSegmento) {
        estado = 'En tránsito';
      }

      // Si hay avión seleccionado, filtrar pedidos que vayan en él
      if (selectedOrderIds && !selectedOrderIds.includes(plan.orderId)) {
        return;
      }
      next.set(plan.orderId, { plan, estado, creationMs, arrivalMs });
      vistos.add(plan.orderId);
    });

    // Mantener los pedidos que ya no llegan en el snapshot (posiblemente completados)
    prev.forEach((info, id) => {
      if (vistos.has(id)) return;
      if (selectedOrderIds && !selectedOrderIds.includes(id)) return;
      let estado: EnvioInfo['estado'] = info.estado;
      if (info.arrivalMs && currentMs >= info.arrivalMs) {
        estado = 'Entregado';
      } else if (ordersEnTransito.has(id)) {
        estado = 'En tránsito';
      }
      next.set(id, { ...info, estado });
    });

    // Asegurar que los pedidos detectados en activeSegments aparezcan aunque no estén en el snapshot visible
    ordersEnTransito.forEach(orderId => {
      if (selectedOrderIds && !selectedOrderIds.includes(orderId)) {
        return;
      }
      const existing = next.get(orderId);
      if (existing) {
        if (existing.estado !== 'Entregado') {
          next.set(orderId, { ...existing, estado: 'En tránsito' });
        }
      } else {
        // si no tenemos plan en este snapshot, pero estaba en históricos lo reutilizamos
        const historico = prev.get(orderId);
        if (historico) {
          next.set(orderId, { ...historico, estado: 'En tránsito' });
        }
      }
    });

    enviosHistoricos.current = next;

    // Ventana: solo pedidos en tránsito o recién entregados/planificados cercanos.
    const retentionMs = 5 * 60 * 1000; // 5 minutos simulados
    const lista: EnvioInfo[] = [];
    next.forEach(info => {
      const estado = info.estado;
      const inTransit = estado === 'En tránsito' || ordersEnTransito.has(info.plan.orderId);
      const deliveredRecently = estado === 'Entregado' && info.arrivalMs > 0 && currentMs - info.arrivalMs <= retentionMs;
      const plannedSoon = estado === 'Planificado';
      if (inTransit || deliveredRecently || plannedSoon) {
        lista.push(info);
      } else {
        // podar entradas viejas para no crecer sin límite
        if (estado === 'Entregado' && info.arrivalMs > 0 && currentMs - info.arrivalMs > retentionMs) {
          next.delete(info.plan.orderId);
        }
      }
    });

    lista.sort((a, b) => b.creationMs - a.creationMs);

    const stats = { entregas: 0, retrasados: 0 };
    lista.forEach(info => {
      if (info.estado === 'Entregado') stats.entregas += 1;
      if (info.estado === 'En tránsito' || ordersEnTransito.has(info.plan.orderId)) stats.retrasados += 1;
    });

    return { lista, stats };
  }, [panelSnapshot, filtroHub, fechasOriginalesPorOrden, tiempoSimulado, selectedOrderIds, ordersEnTransito]);

  // KPIs basados en lo que se muestra actualmente
  const enviosFiltrados = enviosCalc.lista;
  const kpisVista = enviosCalc.stats;

  useEffect(() => {
    // Logs para depurar por qué el panel puede estar vacío
    const sampleOrder = panelSnapshot?.orderPlans?.[0];
    console.info('[SIM DEBUG] snapshot orders:', panelSnapshot?.orderPlans?.length ?? 0,
      'activeSegments:', activeSegments.length,
      'ordersEnTransito:', ordersEnTransito.size,
      'enviosFiltrados:', enviosFiltrados.length,
      'currentSim:', tiempoSimulado?.toISOString() ?? panelSnapshot?.generatedAt ?? 'n/a');
    if (enviosFiltrados.length === 0 && sampleOrder) {
      const segs = sampleOrder.routes?.flatMap(r => r.segments ?? []) ?? [];
      console.info('[SIM DEBUG] sample order',
        sampleOrder.orderId,
        'segments:',
        segs.map(s => ({
          o: s.origin,
          d: s.destination,
          dep: s.departureUtc,
          arr: s.arrivalUtc,
        }))
      );
    }
  }, [panelSnapshot, enviosFiltrados, ordersEnTransito, activeSegments, tiempoSimulado]);

  const vuelosFiltrados = useMemo<FlightGroup[]>(() => {
    const term = '';

    return Array.from(vuelosPorFlightId.values())
      .filter(vuelo => {
        // Filtro por término de búsqueda (ID de pedido en el vuelo)
        const matchSearch = term === '' || vuelo.pedidos.some(pedidoId => pedidoId.toLowerCase().includes(term));

        // Filtro por Hub de origen
        const matchHub = filtroHub === '' || vuelo.origen === filtroHub;

        return matchSearch && matchHub;
      })
      .sort((a, b) => {
        const dateA = a.departureUtc ? new Date(a.departureUtc).getTime() : 0;
        const dateB = b.departureUtc ? new Date(b.departureUtc).getTime() : 0;
        return dateA - dateB;
      });
  }, [vuelosPorFlightId, filtroHub]);

  const handleIniciarSimulacion = () => {
    const startUtc = ensureSeconds(startDate);
    const endUtc = ensureSeconds(endDate);
    startSimRef.current = startUtc ? Date.parse(startUtc) : null;
    startRealRef.current = Date.now();
    setStartRealMs(startRealRef.current);
    setElapsedRealMs(0);
    enviosHistoricos.current = new Map();
    setSelectedOrderIds(null);
    const payload = {
      startDate: startUtc,
      endDate: endUtc,
      windowMinutes: 180,
    };
    iniciar(payload, { start: startUtc, end: endUtc });
  };

  const handleTerminarSimulacion = async () => {
    await terminar();
    startSimRef.current = null;
    startRealRef.current = null;
    setStartRealMs(null);
    setElapsedRealMs(0);
    enviosHistoricos.current = new Map();
    setSelectedOrderIds(null);
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
  const clearSelectedOrders = () => setSelectedOrderIds(null);

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
        panelSnapshot={panelSnapshot}
        enviosFiltrados={enviosFiltrados}
        vuelosFiltrados={vuelosFiltrados}
        vuelosTotal={vuelosPorFlightId.size}
        aeropuertos={aeropuertos}
        filtroHub={filtroHub}
        setFiltroHub={setFiltroHub}
        selectedOrderIds={selectedOrderIds}
        clearSelectedOrders={clearSelectedOrders}
        vuelosEnMovimiento={vuelosEnMovimiento}
      />

      {/* ========== ÁREA DEL MAPA ========== */}
      <div className="flex-1 flex flex-col">

          {/* Barra superior con KPIs y Reloj */}
          <SimTopBar
            kpisVista={kpisVista}
            reloj={reloj}
            tiempoSimulado={tiempoSimulado}
            estaActivo={estaActivo}
            simSpeed={simSpeed}
            setSimSpeed={setSimSpeed}
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
            onSelectOrders={setSelectedOrderIds}
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
