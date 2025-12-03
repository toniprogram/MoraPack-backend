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
  SimulationSegment,
  SimulationTick,
  ActiveSegmentTick,
  ActiveAirportTick,
  SimulationOrderPlan,
  OrderPlansDiff
} from '../types/simulation';
import type { OrderStatusTick } from '../types/simulation';

export interface VueloEnMovimiento {
  id: string;
  orderId: string;
  flightId: string;
  latActual: number;
  lonActual: number;
  progreso: number;
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
  capacityTotal?: number;
  orderLoads?: { orderId: string; quantity: number }[];
}

// URL de WebSocket nativo
const resolveWsUrl = () => {
  const envWs = import.meta.env.VITE_WS_URL as string | undefined;
  if (envWs) return envWs;
  const apiBase = import.meta.env.VITE_API_URL as string | undefined;
  const base = apiBase ?? 'http://localhost:8080/api';
  const wsBase = base.replace(/^http/, 'ws').replace(/\/api\/?$/, '');
  return `${wsBase}/ws`;
};
const BROKER_URL = resolveWsUrl();
const TOPIC_PREFIX = '/topic/simulations/';

// Velocidad base; se puede ajustar desde el panel
const DEFAULT_SPEED = 500;

export const useSimulacion = () => {
  const [simulationId, setSimulationId] = useState<string | null>(null);
  const [stompClient, setStompClient] = useState<Client | null>(null);
  const [latestProgress, setLatestProgress] = useState<SimulationSnapshot | null>(null);
  const [finalSnapshot, setFinalSnapshot] = useState<SimulationSnapshot | null>(null);
  const [visibleSnapshot, setVisibleSnapshot] = useState<SimulationSnapshot | null>(null);
  const [hasSnapshots, setHasSnapshots] = useState(false);
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [tiempoSimulado, setTiempoSimulado] = useState<Date | null>(null);
  const [engineSpeed, setEngineSpeed] = useState(DEFAULT_SPEED);  // del backend
  const [renderSpeed, setRenderSpeed] = useState(1);              // solo visual
  const [segmentosTick, setSegmentosTick] = useState<SegmentoVuelo[]>([]);
  const [activeAirports, setActiveAirports] = useState<ActiveAirportTick[]>([]);
  const [deliveredOrders, setDeliveredOrders] = useState(0);
  const [inTransitOrders, setInTransitOrders] = useState(0);
  const [orderStatuses, setOrderStatuses] = useState<OrderStatusTick[]>([]);
  const [orderPlansLive, setOrderPlansLive] = useState<SimulationOrderPlan[]>([]);
  const [animPaused, setAnimPaused] = useState(false);
  const [tickBuffer, setTickBuffer] = useState<SimulationTick[]>([]);
  const [tickPlaybackReady, setTickPlaybackReady] = useState(false);
  const tickReadyRef = useRef(false);
  const lastPlansSimTimeRef = useRef<string | null>(null);
  const prewarmStorageKey = 'sim_prewarm_token';
  const [prewarmToken, setPrewarmToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(prewarmStorageKey);
    } catch {
      return null;
    }
  });
  const prewarmRequested = useRef(false);

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

  // Precalienta el mundo al entrar a la página de simulación
  useEffect(() => {
    if (prewarmRequested.current) return;
    prewarmRequested.current = true;
    simulacionService.prewarmWorld()
      .then(token => {
        setPrewarmToken(token);
      })
      .catch(err => {
        console.warn('[SIM] No se pudo precalentar mundo:', err);
        setPrewarmToken(null);
        prewarmRequested.current = false;
      });
  }, []);

  useEffect(() => {
    try {
      if (prewarmToken) {
        localStorage.setItem(prewarmStorageKey, prewarmToken);
      } else {
        localStorage.removeItem(prewarmStorageKey);
      }
    } catch {
      // ignore storage errors
    }
  }, [prewarmToken, prewarmStorageKey]);

  const flightCapacities = useMemo(() => {
    const map = new Map<string, number>();
    baseFlights.forEach(flight => {
      const fallback = flight as Partial<Flight> & { capacity?: number; capacidad?: number };
      const cap = flight.dailyCapacity ?? fallback.capacity ?? fallback.capacidad ?? 0;
      map.set(flight.id, cap);
    });
    return map;
  }, [baseFlights]);

  const snapshotConRutas = visibleSnapshot ?? finalSnapshot ?? latestProgress;
  const planSource: SimulationOrderPlan[] =
    orderPlansLive.length > 0
      ? orderPlansLive
      : (snapshotConRutas?.orderPlans ?? []);

  const segmentosPorOrden = useMemo(() => {
    const mapa = new Map<string, SimulationSegment[]>();
    planSource.forEach(plan => {
      const segmentos = plan.routes?.flatMap(ruta => ruta.segments ?? []) ?? [];
      const ordenados = segmentos
        .filter(seg => seg.departureUtc && seg.arrivalUtc)
        .sort((a, b) => Date.parse(a.departureUtc) - Date.parse(b.departureUtc));
      mapa.set(plan.orderId, ordenados);
    });
    return mapa;
  }, [planSource]);

  const obtenerDestinoActualOrden = useCallback((orderId: string | undefined, currentMs: number) => {
    if (!orderId) return null;
    const segmentos = segmentosPorOrden.get(orderId);
    if (!segmentos || segmentos.length === 0) {
      return null;
    }
    for (const segmento of segmentos) {
      if (!segmento.departureUtc || !segmento.arrivalUtc) continue;
      const dep = Date.parse(segmento.departureUtc);
      const arr = Date.parse(segmento.arrivalUtc);
      if (Number.isNaN(dep) || Number.isNaN(arr)) {
        continue;
      }
      if (currentMs <= dep) {
        return segmento.destination;
      }
      if (dep <= currentMs && currentMs <= arr) {
        return segmento.destination;
      }
    }
    const ultimo = segmentos[segmentos.length - 1];
    return ultimo?.destination ?? null;
  }, [segmentosPorOrden]);

  // ===== WEBSOCKET CONNECTION =====
  useEffect(() => {
    if (!simulationId) return;

    const client = new Client({
      brokerURL: BROKER_URL,
      reconnectDelay: 5000,
      onConnect: () => {
        console.log('✅ WebSocket Conectado (Nativo)');
        setStatus('running');
        client.subscribe(TOPIC_PREFIX + simulationId, (message) => {
          const simMessage: SimulationMessage = JSON.parse(message.body);
          const tick: SimulationTick | null | undefined = simMessage.tick;

          if (tick?.simTime) {
            console.info('[SIM] Recibiendo tick del backend (nueva ruta)');
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
            } else if (tickStatus === 'paused') {
              setStatus('running'); // mantenemos animación pero podrías setear paused si controlas UI
              setAnimPaused(true);
            } else {
              setStatus('running');
            }
          }

          if (simMessage.snapshot) {
            if (!tick?.simTime) {
              console.info('[SIM] Usando snapshot (fallback)');
            }
            setLatestProgress(simMessage.snapshot);
            setVisibleSnapshot(simMessage.snapshot);
            setHasSnapshots(true);
          }

          if (simMessage.type === 'COMPLETED' && simMessage.snapshot) {
            setFinalSnapshot(simMessage.snapshot);
            setVisibleSnapshot(simMessage.snapshot);
            setHasSnapshots(true);
            setStatus('completed');
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

  // Usar buffer de ticks para actualizar el frame actual/objetivo
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
    const deltaMs = Math.max(1, nextMs - currentMs); // evita división por cero
    const interpSpeed = deltaMs / 1000;

    setRenderSpeed(interpSpeed);      // ✅ SOLO visual
    setTiempoSimulado(new Date(currentMs)); // ✅ EL TICK YA DEFINE EL TIEMPO
    if (renderTick.activeSegments) {
      const mapped: SegmentoVuelo[] = renderTick.activeSegments.map((seg: ActiveSegmentTick) => ({
        id: seg.id,
        flightId: seg.flightId,
        origin: seg.origin,
        destination: seg.destination,
        departureUtc: seg.departureUtc,
        arrivalUtc: seg.arrivalUtc,
        orderIds: seg.orderIds ?? [],
        retrasado: false,
        routeQuantity: seg.capacityUsed,
        capacityTotal: seg.capacityTotal,
        orderLoads: seg.orderLoads ?? seg.orderIds?.map(id => ({ orderId: id, quantity: seg.capacityUsed })) ?? [],
      }));
      setSegmentosTick(mapped);
    }
    if (renderTick.activeAirports) {
      setActiveAirports(renderTick.activeAirports);
    }
    if (typeof renderTick.deliveredOrders === 'number') {
      setDeliveredOrders(renderTick.deliveredOrders);
    }
    if (typeof renderTick.inTransitOrders === 'number') {
      setInTransitOrders(renderTick.inTransitOrders);
    }
    if (renderTick.orderStatuses) {
      setOrderStatuses(renderTick.orderStatuses);
    }
    // orderPlans completos (fallback) o diffs
    const simTimeKey = renderTick.simTime ?? '';
    if (renderTick.orderPlansDiff) {
      const diff: OrderPlansDiff = renderTick.orderPlansDiff;
      const currentMap = new Map<string, SimulationOrderPlan>();
      orderPlansLive.forEach(p => currentMap.set(p.orderId, p));
      diff.removed?.forEach(id => currentMap.delete(id));
      diff.updated?.forEach(p => currentMap.set(p.orderId, p));
      diff.added?.forEach(p => currentMap.set(p.orderId, p));
      lastPlansSimTimeRef.current = simTimeKey;
      setOrderPlansLive(Array.from(currentMap.values()));
    } else if (renderTick.orderPlans && renderTick.orderPlans.length > 0) {
      if (lastPlansSimTimeRef.current !== simTimeKey) {
        lastPlansSimTimeRef.current = simTimeKey;
        setOrderPlansLive(renderTick.orderPlans);
      }
    }
    // Avanza el buffer descartando el frame renderizado
    setTickBuffer(prev => prev.slice(1));
  }, [tickBuffer, tickPlaybackReady, animPaused, orderPlansLive]);

  // ===== CÁLCULO DE VUELOS EN MOVIMIENTO =====
  useEffect(() => {
    if (status === 'completed' && finalSnapshot && visibleSnapshot !== finalSnapshot) {
      setVisibleSnapshot(finalSnapshot);
    }
  }, [status, finalSnapshot, visibleSnapshot]);

  const activeSegments = useMemo(() => {
    return segmentosTick;
  }, [segmentosTick]);

  const vuelosEnMovimiento: VueloEnMovimiento[] = useMemo(() => {
    if (!tiempoSimulado || activeSegments.length === 0) {
      return [];
    }

    const coordsAeropuertos = new Map<string, [number, number]>();
    aeropuertos.forEach(a => {
      // Normalizamos a.id para asegurar match
      if (a.id && typeof a.latitude === 'number' && typeof a.longitude === 'number') {
        coordsAeropuertos.set(a.id, [a.latitude, a.longitude]);
      }
    });

    if (coordsAeropuertos.size === 0) return [];

    const tiempoActualMs = tiempoSimulado.getTime();
    const vuelosEnCurso: VueloEnMovimiento[] = [];

    activeSegments.forEach((segmento, index) => {
      const origen = coordsAeropuertos.get(segmento.origin);
      const destino = coordsAeropuertos.get(segmento.destination);

      if (!origen || !destino) return;

      const horaSalida = Date.parse(segmento.departureUtc);
      const horaLlegada = Date.parse(segmento.arrivalUtc);
      const duracionVuelo = horaLlegada - horaSalida;

      if (!Number.isFinite(duracionVuelo) || duracionVuelo <= 0) return;

      let progreso = 0;
      let estadoVisual: VueloEnMovimiento['estadoVisual'] = 'en curso';

      if (tiempoActualMs >= horaLlegada) {
        progreso = 100;
        estadoVisual = 'completado';
      } else {
        const tiempoTranscurrido = Math.max(0, tiempoActualMs - horaSalida);
        progreso = Math.min(100, (tiempoTranscurrido / duracionVuelo) * 100);
        estadoVisual = segmento.retrasado ? 'retrasado' : 'en curso';
      }

      const ratio = Math.min(progreso / 100, 1);

      // Offset para evitar superposición visual exacta de aviones en misma ruta
      const offsetLat = ((index % 5) - 2) * 0.15;
      const offsetLon = ((Math.floor(index / 5) % 5) - 2) * 0.15;

      const latActual = origen[0] + (destino[0] - origen[0]) * ratio + offsetLat;
      const lonActual = origen[1] + (destino[1] - origen[1]) * ratio + offsetLon;

      const orderIdReferencia = segmento.orderIds[0];
      const destinoRuta = obtenerDestinoActualOrden(orderIdReferencia, tiempoActualMs);
      const capacidadTotal = segmento.capacityTotal ?? flightCapacities.get(segmento.flightId) ?? segmento.routeQuantity ?? 0;
      const capacidadUsada = segmento.routeQuantity ?? 0;
      const pedidosConCantidad = (segmento.orderLoads ?? segmento.orderIds.map(id => ({ orderId: id, quantity: 1 })));

      // Construimos el objeto VueloEnMovimiento sin referenciar 'plan' (que no existe aquí)
      vuelosEnCurso.push({
        id: segmento.id,
        orderId: segmento.orderIds.join(', '),
        flightId: segmento.flightId,
        latActual,
        lonActual,
        progreso,
        estadoVisual,
        origen: segmento.origin,
        destino: segmento.destination,
        destinoActual: destinoRuta ?? segmento.destination,
        departureTime: segmento.departureUtc,
        arrivalTime: segmento.arrivalUtc,

        origenCode: segmento.origin,
        destinoCode: segmento.destination,
        salidaProgramada: segmento.departureUtc,
        llegadaProgramada: segmento.arrivalUtc,
        capacidadTotal,
        capacidadUsada,

        pedidos: pedidosConCantidad.map(load => ({
            orderId: load.orderId,
            cliente: "---",
            fechaCreacion: "---",
            cantidad: load.quantity
        }))
      });
    });

    return vuelosEnCurso;
  }, [activeSegments, tiempoSimulado, aeropuertos, obtenerDestinoActualOrden, flightCapacities]);

  // ===== MUTACIÓN PARA INICIAR SIMULACIÓN =====
  const simulationMutation = useMutation({
    mutationFn: (payload: SimulationStartRequest) => simulacionService.startSimulation(payload),
    onSuccess: (response) => {
      console.log('Simulación iniciada:', response.simulationId);
      setLatestProgress(null);
      setFinalSnapshot(null);
      setVisibleSnapshot(null);
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
    const enriched: SimulationStartRequest = {
      ...payload,
      prewarmToken: prewarmToken || undefined,
    };
    simulationMutation.mutate(enriched, {
      onSuccess: () => {
        setPrewarmToken(null);
        prewarmRequested.current = false;
      }
    });
  }, [simulationMutation, prewarmToken]);

  const pausar = useCallback(() => {
    setAnimPaused(prev => !prev);
  }, []);

  const terminar = useCallback(async () => {
    if (simulationId) {
      try {
        console.log(`[Terminar] Solicitando cancelación para simulación: ${simulationId}`);
        await simulacionService.cancelSimulation(simulationId);
      } catch (error) {
        console.error("Error al cancelar la simulación en el backend:", error);
      }
    }

    // Resetea el estado del frontend
    stompClient?.deactivate();
    setSimulationId(null);
    setLatestProgress(null);
    setFinalSnapshot(null);
    setVisibleSnapshot(null);
    setStatus('idle');
    setTiempoSimulado(null);
    setHasSnapshots(false);
    setAnimPaused(false);
    setEngineSpeed(DEFAULT_SPEED);
    setRenderSpeed(1);
    setTickBuffer([]);
    setTickPlaybackReady(false);
    tickReadyRef.current = false;
    setSegmentosTick([]);
    setActiveAirports([]);
    setDeliveredOrders(0);
    setInTransitOrders(0);
    setOrderStatuses([]);
    setPrewarmToken(null);
    prewarmRequested.current = false;
    setOrderPlansLive([]);
  }, [stompClient, simulationId]);

  // ===== KPIs =====
  const kpis = useMemo(() => {
    const plans = planSource;
    if (!plans) return { entregas: 0, retrasados: 0 };
    return {
      entregas: plans.filter(p => p.slackMinutes > 0).length,
      retrasados: plans.filter(p => p.slackMinutes <= 0).length,
    };
  }, [planSource]);

  // ===== RELOJ DE PROGRESO =====
  const reloj = `${latestProgress?.processedOrders ?? 0} / ${latestProgress?.totalOrders ?? 0}`;

  const resetVisual = () => {
    setVisibleSnapshot(null);
    setLatestProgress(null);
    setFinalSnapshot(null);
    setHasSnapshots(false);
    setSegmentosTick([]);
    setTiempoSimulado(null);
    setEngineSpeed(DEFAULT_SPEED);
    setRenderSpeed(1);
    setTickBuffer([]);
    setTickPlaybackReady(false);
    tickReadyRef.current = false;
    setActiveAirports([]);
    setDeliveredOrders(0);
    setInTransitOrders(0);
    setOrderStatuses([]);
    setOrderPlansLive([]);
    setPrewarmToken(null);
    prewarmRequested.current = false;
  };

  return {
    aeropuertos,
    vuelosEnMovimiento,
    activeSegments,
    isLoading: isLoadingAeropuertos,
    isStarting: simulationMutation.isPending,
    isError: status === 'error',
    estaActivo: status === 'running',
    estaVisualizando: hasSnapshots,
    snapshotFinal: finalSnapshot,
    snapshotVisible: visibleSnapshot,
    snapshotProgreso: latestProgress,
    tiempoSimulado,
    engineSpeed,
    renderSpeed,
    activeAirports,
    orderPlans: planSource,
    iniciar,
    pausar,
    terminar,
    resetVisual,
    kpis,
    reloj,
    hasSnapshots,
    status,
    deliveredOrders,
    inTransitOrders,
    orderStatuses,
  };
};
