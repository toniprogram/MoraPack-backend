// @ts-nocheck
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Client } from '@stomp/stompjs';
import { aeropuertoService } from '../services/aeropuertoService';
import { simulacionService } from '../services/simulacionService';
import { API } from '../api/api';
import type { Airport } from '../types/airport';
import type { Flight } from '../types/flight';
import type {
  SimulationSnapshot,
  SimulationMessage,
  SimulationStartRequest,
  SimulationTick,
  ActiveSegmentTick,
  ActiveAirportTick,
  SimulationOrderPlanItem,
  DeliveredPage,
} from '../types/simulation';

// Tipos para visualización
export interface VueloEnMovimiento {
  id: string;
  orderId: string;
  flightId: string;
  latActual: number;
  lonActual: number;
  progreso: number;
  heading: number; // Ángulo de rotación
  estadoVisual: 'en curso' | 'retrasado' | 'completado';
  origen?: string;
  destino?: string;
  destinoActual?: string;
  departureTime?: string;
  arrivalTime?: string;
  origenCode: string;
  destinoCode: string;
  salidaProgramada: string;
  llegadaProgramada: string;
  capacidadTotal: number;
  capacidadUsada: number;
  pedidos: {
      orderId: string;
      cliente: string;
      fechaCreacion: string;
      cantidad: number;
  }[];
}

export interface SegmentoVuelo {
  id: string;
  flightId: string;
  origin: string;
  destination: string;
  departureUtc: string;
  arrivalUtc: string;
  orderIds: string[];
  retrasado: boolean;
  routeQuantity?: number;
  capacityUsed?: number;
  capacityTotal?: number;
  orderLoads?: { orderId: string; quantity: number }[];
  // Coordenadas directas del backend
  lat?: number;
  lon?: number;
  progressPct?: number;
}

const BROKER_URL =
  import.meta.env.PROD
    ? 'ws://200.16.7.179/ws'
    : 'ws://localhost:8080/ws';
const TOPIC_PREFIX = '/topic/simulations/';
const DEFAULT_SPEED = 500;

export const useSimulacion = () => {
  // --- ESTADOS GENERALES ---
  const [simulationId, setSimulationId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error' | 'paused'>('idle');
  const [notificacion, setNotificacion] = useState<string | null>(null);
  const [stompClient, setStompClient] = useState<Client | null>(null);

  // --- ESTADOS DE TIEMPO Y VELOCIDAD ---
  const [tiempoSimulado, setTiempoSimulado] = useState<Date | null>(null);
  const [engineSpeed, setEngineSpeed] = useState(DEFAULT_SPEED);
  const [renderSpeed, setRenderSpeed] = useState(1);
  const [animPaused, setAnimPaused] = useState(false);
  const engineSpeedRef = useRef(DEFAULT_SPEED);

  // --- ESTADOS DE VISUALIZACIÓN (WEBSOCKET) ---
  const [latestProgress, setLatestProgress] = useState<SimulationSnapshot | null>(null);
  const [segmentosTick, setSegmentosTick] = useState<SegmentoVuelo[]>([]);
  const [activeAirports, setActiveAirports] = useState<ActiveAirportTick[]>([]);
  const [deliveredOrders, setDeliveredOrders] = useState(0);
  const [inTransitOrders, setInTransitOrders] = useState(0);
  const [hasSnapshots, setHasSnapshots] = useState(false);

  // Buffer para suavizar movimiento
  const [tickBuffer, setTickBuffer] = useState<SimulationTick[]>([]);
  const [tickPlaybackReady, setTickPlaybackReady] = useState(false);
  const tickReadyRef = useRef(false);

  // --- ESTADOS DE DATOS DE PEDIDOS (API / DB) ---
  const [orderPlansDb, setOrderPlansDb] = useState<SimulationOrderPlanItem[]>([]);
  const [orderPlansTotal, setOrderPlansTotal] = useState(0);
  const [orderPlansPage, setOrderPlansPage] = useState(0);
  const [orderPlansStatuses, setOrderPlansStatuses] = useState<string[] | undefined>(undefined);
  const ORDER_PLANS_PAGE_SIZE = 10;

  // CACHÉ EXTRA & CONTROL DE FETCH
  const extraOrdersRef = useRef<Map<string, any>>(new Map());
  const fetchingIdsRef = useRef<Set<string>>(new Set());
  const [extraOrdersVersion, setExtraOrdersVersion] = useState(0);

  // --- OTROS ---
  const [deliveredPage, setDeliveredPage] = useState<DeliveredPage | null>(null);
  const [deliveredLoading, setDeliveredLoading] = useState(false);
  const firstSimTickMsRef = useRef<number | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [startRealMs, setStartRealMs] = useState<number | null>(null);
  const [elapsedRealMs, setElapsedRealMs] = useState(0);
  const prewarmStorageKey = 'sim_prewarm_token';
  const [prewarmToken, setPrewarmToken] = useState<string | null>(() => {
    try { return localStorage.getItem(prewarmStorageKey); } catch { return null; }
  });
  const prewarmRequested = useRef(false);

  // --- QUERIES DE DATOS ESTÁTICOS ---
  const { data: aeropuertos = [], isLoading: isLoadingAeropuertos } = useQuery<Airport[]>({
    queryKey: ['aeropuertos'],
    queryFn: aeropuertoService.getAll,
  });
  const { data: baseFlights = [] } = useQuery<Flight[]>({
    queryKey: ['sim-base-flights'],
    queryFn: async () => {
      const res = await API.get<Flight[]>('/base/flights');
      return res.data;
    },
    staleTime: 1000 * 60 * 5,
  });

  const flightCapacities = useMemo(() => {
    const map = new Map<string, number>();
    baseFlights.forEach(flight => {
      const fallback = flight as Partial<Flight> & { capacity?: number; capacidad?: number };
      const cap = flight.dailyCapacity ?? fallback.capacity ?? fallback.capacidad ?? 0;
      map.set(flight.id, cap);
    });
    return map;
  }, [baseFlights]);

  useEffect(() => {
    if (prewarmRequested.current) return;
    prewarmRequested.current = true;
    simulacionService.prewarmWorld()
      .then(token => setPrewarmToken(token))
      .catch(err => {
        console.warn('[SIM] No se pudo precalentar mundo:', err);
        setPrewarmToken(null);
        prewarmRequested.current = false;
      });
  }, []);

  useEffect(() => {
    try {
      if (prewarmToken) localStorage.setItem(prewarmStorageKey, prewarmToken);
      else localStorage.removeItem(prewarmStorageKey);
    } catch {}
  }, [prewarmToken, prewarmStorageKey]);

  useEffect(() => {
    engineSpeedRef.current = engineSpeed;
  }, [engineSpeed]);

  // ===== LÓGICA DE WEBSOCKET =====
  useEffect(() => {
    if (!simulationId) return;
    setStatus(prev => prev === 'idle' ? 'running' : prev);
    const client = new Client({
      brokerURL: BROKER_URL,
      reconnectDelay: 5000,
      onConnect: () => {
        setStatus('running');
        client.subscribe(TOPIC_PREFIX + simulationId, (message) => {
          const simMessage: SimulationMessage = JSON.parse(message.body);
          if (simMessage.snapshot) {
              console.log("SNAPSHOT RECIBIDO:", simMessage.snapshot);
              // Busca en la consola del navegador qué propiedades tiene.
              // Deberías ver: { totalOrders: 150, processedOrders: 150, ... }
          }
          const tick: SimulationTick | null | undefined = simMessage.tick;
          if (tick?.simTime) {
            setHasSnapshots(true);
            // Logs de diagnóstico para ver si llegan aviones
            const nSegments = tick.activeSegments?.length ?? 0;
            const nInTransit = tick.inTransitOrders ?? 0;
            if (nInTransit > 0 && nSegments === 0) {
               // console.warn(`[WS] ${nInTransit} en tránsito, 0 aviones. (Posiblemente en tierra)`);
            }

            const simMs = Date.parse(tick.simTime);
            if (Number.isFinite(simMs)) {
              if (firstSimTickMsRef.current === null) firstSimTickMsRef.current = simMs;
              if (typeof tick.realElapsedMs === 'number' && Number.isFinite(tick.realElapsedMs)) {
                setElapsedRealMs(tick.realElapsedMs);
                setStartRealMs(Date.now() - tick.realElapsedMs);
              }
            }

            setTickBuffer(prev => {
              const next = [...prev, tick].slice(-6);
              if (!tickReadyRef.current && next.length >= 3) {
                tickReadyRef.current = true;
                setTickPlaybackReady(true);
              }
              return next;
            });

            if (typeof tick.speed === 'number' && Number.isFinite(tick.speed) && tick.speed > 0) {
              setEngineSpeed(tick.speed);
            }

            const tickStatus = (tick.status || '').toLowerCase();
            if (tickStatus === 'completed') {
              setStatus('completed');
              setNotificacion('Hora de fin alcanzada, despachando pendientes');
            } else if (tickStatus === 'paused') {
              setStatus('paused');
              setAnimPaused(true);
            } else if (tickStatus === 'collapsed') {
              setStatus('running');
              if (tick.collapseMessage) setNotificacion(tick.collapseMessage);
              else setNotificacion('Colapso logístico detectado; despachando pendientes');
            } else {
              setStatus('running');
            }
          }

          if (simMessage.type === 'COMPLETED' && simMessage.snapshot) {
            setLatestProgress(simMessage.snapshot);
            setHasSnapshots(true);
            setStatus('completed');
          } else if (simMessage.snapshot) {
            setLatestProgress(simMessage.snapshot);
            const snap = simMessage.snapshot;
            if (snap.processedOrders === snap.totalOrders && snap.totalOrders > 0) {
              setNotificacion('Pedidos terminados de pre-procesar');
            }
          } else if (simMessage.type === 'ERROR') {
            console.error("❌ Error en simulación:", simMessage.error);
            setStatus('error');
            client.deactivate();
          }
        });
      },
      onDisconnect: () => {
        setStatus(prev => prev === 'completed' ? 'completed' : 'idle');
      }
    });
    client.onStompError = (frame) => {
      console.error('❌ WebSocket error:', frame);
      setStatus('error');
    };
    setStompClient(client);
    client.activate();
    return () => {
      client.deactivate();
      setStompClient(null);
    };
  }, [simulationId]);

  useEffect(() => {
    if (!simulationId) return;
    heartbeatRef.current = setInterval(() => {
      simulacionService.touchSimulation(simulationId).catch(() => {});
    }, 30_000);
    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [simulationId]);

  // ===== POLLING DE API (SIDEBAR) =====
  useEffect(() => {
    if (!simulationId) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const fetchPlans = async (pageToLoad: number) => {
      try {
        const statusesParam = orderPlansStatuses?.join(',');
        const page = await simulacionService.getOrderPlans(
          simulationId,
          pageToLoad,
          ORDER_PLANS_PAGE_SIZE,
          undefined,
          statusesParam
        );
        if (cancelled) return;

        const effectiveSize = page.size ?? ORDER_PLANS_PAGE_SIZE;
        const total = page.total ?? page.items.length;
        const lastPage = Math.max(0, Math.ceil(total / effectiveSize) - 1);
        const currentPage = Math.min(page.page ?? pageToLoad, lastPage);

        setOrderPlansDb(page.items);
        setOrderPlansTotal(total);
        setOrderPlansPage(currentPage);
      } catch (err) {
        if (!cancelled) console.warn('[SIM] No se pudieron obtener planes desde BD:', err);
      }
    };

    fetchPlans(orderPlansPage);
    interval = setInterval(() => fetchPlans(orderPlansPage), 5000);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [simulationId, orderPlansPage, orderPlansStatuses]);

  // ===== LOOP VISUAL (BUFFER DE TICKS) =====
  useEffect(() => {
    if (!tickPlaybackReady) return;
    if (tickBuffer.length < 2) return;
    if (animPaused) return;

    const renderTick = tickBuffer[0];
    const nextTick = tickBuffer[1] ?? renderTick;
    if (!renderTick?.simTime) return;

    const currentMs = Date.parse(renderTick.simTime);
    if (Number.isNaN(currentMs)) return;

    const nextMs = nextTick.simTime ? Date.parse(nextTick.simTime) : currentMs + 1000;
    const deltaMs = Math.max(1, nextMs - currentMs);
    const interpSpeed = deltaMs / 1000;

    setRenderSpeed(interpSpeed);
    setTiempoSimulado(new Date(currentMs));

    const rawSegments = renderTick.activeSegments || [];

    // Mapeo de segmentos (Incluyendo datos optimizados del backend)
    const mapped: SegmentoVuelo[] = rawSegments.map((seg: ActiveSegmentTick) => ({
      id: seg.id,
      flightId: seg.flightId,
      origin: seg.origin,
      destination: seg.destination,
      departureUtc: seg.departureUtc,
      arrivalUtc: seg.arrivalUtc,
      orderIds: seg.orderIds ?? [],
      retrasado: false,
      routeQuantity: seg.capacityUsed,
      capacityUsed: seg.capacityUsed,
      capacityTotal: seg.capacityTotal,
      orderLoads: seg.orderLoads ?? seg.orderIds?.map(id => ({ orderId: id, quantity: seg.capacityUsed })) ?? [],
      // Datos del backend para optimización
      lat: seg.lat,
      lon: seg.lon,
      progressPct: seg.progressPct
    }));
    setSegmentosTick(mapped);

    if (renderTick.activeAirports) setActiveAirports(renderTick.activeAirports);
    if (typeof renderTick.deliveredOrders === 'number') setDeliveredOrders(renderTick.deliveredOrders);
    if (typeof renderTick.inTransitOrders === 'number') setInTransitOrders(renderTick.inTransitOrders);

    setTickBuffer(prev => prev.slice(1));
  }, [tickBuffer, tickPlaybackReady, animPaused, engineSpeed]);

  const vuelosEnMovimiento: VueloEnMovimiento[] = useMemo(() => {
    if (!tiempoSimulado || segmentosTick.length === 0) return [];

    const coordsAeropuertos = new Map<string, [number, number]>();
    aeropuertos.forEach(a => {
      if (a.id && typeof a.latitude === 'number' && typeof a.longitude === 'number') {
        coordsAeropuertos.set(a.id, [a.latitude, a.longitude]);
      }
    });

    if (coordsAeropuertos.size === 0) return [];

    const tiempoActualMs = tiempoSimulado.getTime();
    const vuelosEnCurso: VueloEnMovimiento[] = [];

    segmentosTick.forEach((segmento) => {
      const origen = coordsAeropuertos.get(segmento.origin);
      const destino = coordsAeropuertos.get(segmento.destination);
      if (!origen || !destino) return;

      // 1. Usar coordenadas del backend si existen (OPTIMIZACIÓN)
      let latActual = segmento.lat;
      let lonActual = segmento.lon;
      let progreso = segmento.progressPct ?? 0;
      let estadoVisual: VueloEnMovimiento['estadoVisual'] = segmento.retrasado ? 'retrasado' : 'en curso';

      // 2. Si no, calcular (Fallback para compatibilidad)
      if (latActual === undefined || lonActual === undefined) {
          const horaSalida = Date.parse(segmento.departureUtc);
          const horaLlegada = Date.parse(segmento.arrivalUtc);

          if (tiempoActualMs >= horaLlegada) {
            progreso = 100;
            estadoVisual = 'completado';
          } else {
            const tiempoTranscurrido = Math.max(0, tiempoActualMs - horaSalida);
            const duracionVuelo = horaLlegada - horaSalida;
            progreso = Math.min(100, (tiempoTranscurrido / duracionVuelo) * 100);
          }
          const ratio = Math.min((progreso) / 100, 1);
          latActual = origen[0] + (destino[0] - origen[0]) * ratio;
          lonActual = origen[1] + (destino[1] - origen[1]) * ratio;
      }

      // Cálculo de rotación (Heading)
      const dy = destino[0] - origen[0];
      const dx = destino[1] - origen[1];
      const heading = (Math.atan2(dx, dy) * 180 / Math.PI);

      const capacidadTotal = segmento.capacityTotal ?? flightCapacities.get(segmento.flightId) ?? 0;

      vuelosEnCurso.push({
        id: segmento.id,
        orderId: segmento.orderIds.join(', '),
        flightId: segmento.flightId,
        latActual: latActual!,
        lonActual: lonActual!,
        progreso: progreso,
        heading: heading,
        estadoVisual,
        origen: segmento.origin,
        destino: segmento.destination,
        destinoActual: segmento.destination,
        departureTime: segmento.departureUtc,
        arrivalTime: segmento.arrivalUtc,
        origenCode: segmento.origin,
        destinoCode: segmento.destination,
        salidaProgramada: segmento.departureUtc,
        llegadaProgramada: segmento.arrivalUtc,
        capacidadTotal,
        capacidadUsada: segmento.capacityUsed ?? 0,
        pedidos: (segmento.orderLoads ?? segmento.orderIds.map(id => ({ orderId: id, quantity: 1 }))).map(load => ({
            orderId: load.orderId,
            cliente: "---",
            fechaCreacion: "---",
            cantidad: load.quantity
        }))
      });
    });
    return vuelosEnCurso;
  }, [segmentosTick, tiempoSimulado, aeropuertos, flightCapacities]);

  const simulationMutation = useMutation({
    mutationFn: (payload: SimulationStartRequest) => simulacionService.startSimulation(payload),
    onSuccess: (response) => {
      console.log('Simulación iniciada:', response.simulationId);
      setLatestProgress(null);
      setHasSnapshots(false);
      setSimulationId(response.simulationId);
      setStatus('running');
    },
    onError: (error) => {
      console.error("Error al iniciar simulación:", error);
      setStatus('error');
    }
  });

  const iniciar = useCallback((payload: SimulationStartRequest) => {
    setHasSnapshots(false);
    setAnimPaused(false);
    setTiempoSimulado(null);
    setTickBuffer([]);
    setTickPlaybackReady(false);
    tickReadyRef.current = false;
    setDeliveredPage(null);
    extraOrdersRef.current.clear();
    setExtraOrdersVersion(0);
    fetchingIdsRef.current.clear(); // Limpiar semáforo
    const enriched: SimulationStartRequest = { ...payload, prewarmToken: prewarmToken || undefined };
    simulationMutation.mutate(enriched, { onSuccess: () => { setPrewarmToken(null); prewarmRequested.current = false; } });
  }, [simulationMutation, prewarmToken]);

  const pausar = useCallback(async () => {
    if (!simulationId) {
      setAnimPaused(prev => !prev);
      setStatus(prev => (prev === 'paused' ? 'running' : 'paused'));
      return;
    }
    try {
      if (animPaused) {
        await simulacionService.resumeSimulation(simulationId);
        setStatus('running');
        setAnimPaused(false);
      } else {
        await simulacionService.pauseSimulation(simulationId);
        setStatus('paused');
        setAnimPaused(true);
      }
    } catch (error) { console.error("Error al pausar/reanudar:", error); }
  }, [simulationId, animPaused]);

  const terminar = useCallback(async () => {
    if (simulationId) {
      try { await simulacionService.cancelSimulation(simulationId); } catch (error) { console.error("Error cancelar:", error); }
    }
    stompClient?.deactivate();
    setSimulationId(null);
    setLatestProgress(null);
    setStatus('idle');
    setTiempoSimulado(null);
    setHasSnapshots(false);
    setAnimPaused(false);
    setEngineSpeed(DEFAULT_SPEED);
    setRenderSpeed(1);
    setTickBuffer([]);
    setTickPlaybackReady(false);
    tickReadyRef.current = false;
    setStartRealMs(null);
    setElapsedRealMs(0);
    setSegmentosTick([]);
    setActiveAirports([]);
    setDeliveredOrders(0);
    setInTransitOrders(0);
    extraOrdersRef.current.clear();
    setExtraOrdersVersion(0);
    fetchingIdsRef.current.clear();
    setDeliveredPage(null);
    setPrewarmToken(null);
    prewarmRequested.current = false;
    setOrderPlansDb([]);
    setOrderPlansTotal(0);
    setOrderPlansPage(0);
    setOrderPlansStatuses(undefined);
  }, [stompClient, simulationId]);

  const conectarSimulacion = useCallback((simId: string) => {
    if (!simId) return;
    setSimulationId(simId);
    setStatus('running');
  }, []);

  const fetchDeliveries = useCallback(async (opts: { page?: number; size?: number; search?: string }) => {
    if (!simulationId) return;
    const { page = 0, size = 20, search } = opts;
    try {
      setDeliveredLoading(true);
      const res = await simulacionService.getDeliveries(simulationId, page, size, search);
      setDeliveredPage(res);
    } catch (err) { console.error('[SIM] Error getDeliveries:', err); } finally { setDeliveredLoading(false); }
  }, [simulationId]);

  const resetVisual = () => { /* Cubierto en terminar */ };

  // ===== ESTRATEGIA DE DATOS: FETCH ON DEMAND (PROTEGIDO) =====
  const fetchMissingOrder = useCallback(async (orderId: string) => {
    if (!simulationId) return;
    // Chequeos de seguridad: ¿Ya lo tengo? ¿Ya lo estoy buscando?
    if (extraOrdersRef.current.has(orderId)) return;
    if (fetchingIdsRef.current.has(orderId)) return;

    // Bloquear ID
    fetchingIdsRef.current.add(orderId);

    try {
      console.log(`[FETCH] Buscando pedido ${orderId} en API`);
      const page = await simulacionService.getOrderPlans(
        simulationId,
        0,
        1,
        orderId
      );

      if (page.items && page.items.length > 0) {
        const found = page.items.find(p => p.orderId === orderId);
        if (found) {
          console.log(`[FETCH] ✅ Pedido encontrado: ${orderId}`);
          extraOrdersRef.current.set(orderId, { ...found, source: 'api_fetch' });
          setExtraOrdersVersion(v => v + 1);
        }
      }
    } catch (error) {
      console.error(`[FETCH] Error al buscar pedido ${orderId}`, error);
    } finally {
        // Desbloquear ID
        fetchingIdsRef.current.delete(orderId);
    }
  }, [simulationId]);

  const getOrderDetails = useCallback((orderId: string) => {
    const dbItem = orderPlansDb.find(p => p.orderId === orderId);
    if (dbItem) return { ...dbItem, source: 'db' };

    const extra = extraOrdersRef.current.get(orderId);
    if (extra) return extra;

    return null;
  }, [orderPlansDb, extraOrdersVersion]);

  return {
    aeropuertos,
    vuelosEnMovimiento,
    activeSegments: segmentosTick, // ✅ Variable correcta
    isLoading: isLoadingAeropuertos,
    isStarting: simulationMutation.isPending,
    isError: status === 'error',
    estaActivo: status === 'running',
    estaVisualizando: hasSnapshots,
    tiempoSimulado,
    engineSpeed,
    renderSpeed,
    animPaused,
    activeAirports,
    iniciar, pausar, terminar, resetVisual,
    simulationId, hasSnapshots, status, deliveredOrders, inTransitOrders,
    startRealMs, elapsedRealMs, conectarSimulacion, notificacion, setNotificacion,
    deliveredPage, deliveredLoading, fetchDeliveries,
    orderPlansDb, orderPlansTotal, orderPlansPage, orderPlansPageSize: ORDER_PLANS_PAGE_SIZE,
    setOrderPlansPage, setOrderPlansStatuses,
    getOrderDetails, fetchMissingOrder,
    reloj: `${latestProgress?.processedOrders ?? 0}`
  };
};