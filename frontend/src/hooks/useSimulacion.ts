import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Client } from '@stomp/stompjs';
import { aeropuertoService } from '../services/aeropuertoService';
import { simulacionService } from '../services/simulacionService';
import type { Airport } from '../types/airport';
import type { SimulationSnapshot, SimulationMessage, SimulationStartRequest, SimulationOrderPlan, SimulationRoute, SimulationSegment } from '../types/simulation';

export interface VueloEnMovimiento {
  id: string;
  orderId: string;
   flightId: string;
   latActual: number;
   lonActual: number;
   progreso: number;
   estadoVisual: 'en curso' | 'retrasado' | 'completado';
   origen: string;
   destino: string;
   departureTime?: string;
  arrivalTime?: string;
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
}

// URL de WebSocket nativo
 const BROKER_URL = 'ws://localhost:8080/ws';
 const TOPIC_PREFIX = '/topic/simulations/';

 // 3600x (1 hora sim = 1 seg real)
 const DEFAULT_SPEED = 3600;

 export const useSimulacion = () => {
   const [simulationId, setSimulationId] = useState<string | null>(null);
   const [stompClient, setStompClient] = useState<Client | null>(null);
   const [latestProgress, setLatestProgress] = useState<SimulationSnapshot | null>(null);
  const [finalSnapshot, setFinalSnapshot] = useState<SimulationSnapshot | null>(null);
  const [visibleSnapshot, setVisibleSnapshot] = useState<SimulationSnapshot | null>(null);
  const [hasSnapshots, setHasSnapshots] = useState(false);
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [tiempoMovimiento, setTiempoMovimiento] = useState(0);
  const [tiempoSimulado, setTiempoSimulado] = useState<Date | null>(null);
  const [simBaseSimulado, setSimBaseSimulado] = useState<number | null>(null);
  const [simBaseReal, setSimBaseReal] = useState<number | null>(null);
  const [simSpeed, setSimSpeed] = useState(DEFAULT_SPEED);
  const [timelineEndMs, setTimelineEndMs] = useState<number | null>(null);
  const timelineStartRef = useRef<number | null>(null);
  const firstSnapshotRealRef = useRef<number | null>(null);
  const [segmentosVuelo, setSegmentosVuelo] = useState<Map<string, SegmentoVuelo>>(new Map());

  const { data: aeropuertos = [], isLoading: isLoadingAeropuertos } = useQuery<Airport[]>({
     queryKey: ['aeropuertos'],
     queryFn: aeropuertoService.getAll,
   });

  const parseUtcMillis = (value?: string | null) => {
    if (!value) return null;
    const iso = value.endsWith('Z') ? value : `${value}Z`;
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? null : ms;
  };

  const adjustSnapshotTimestamp = useCallback((snapshot: SimulationSnapshot | null) => {
    if (!snapshot?.generatedAt) {
      return snapshot;
    }
    const realMs = Date.parse(snapshot.generatedAt);
    if (Number.isNaN(realMs)) {
      return snapshot;
    }
    if (timelineStartRef.current === null) {
      return snapshot;
    }
    if (firstSnapshotRealRef.current === null) {
      firstSnapshotRealRef.current = realMs;
    }
    const baseReal = firstSnapshotRealRef.current ?? realMs;
    const virtualMs = timelineStartRef.current + (realMs - baseReal);
    const iso = new Date(virtualMs).toISOString();
    if (iso === snapshot.generatedAt) {
      return snapshot;
    }
    return { ...snapshot, generatedAt: iso };
  }, []);

  const mergeFlightSegments = useCallback((snapshot: SimulationSnapshot | null) => {
    if (!snapshot?.orderPlans) return;
    setSegmentosVuelo(prev => {
      const next = new Map(prev);
      snapshot.orderPlans.forEach((plan: SimulationOrderPlan) => {
        plan.routes.forEach((ruta: SimulationRoute) => {
          ruta.segments.forEach((segmento: SimulationSegment) => {
            if (!segmento.departureUtc || !segmento.arrivalUtc) return;
            const id = `${segmento.flightId}-${segmento.departureUtc}`;
            const existing = next.get(id);
            const existingOrders = existing?.orderIds ?? [];
            const orderIds = existingOrders.includes(plan.orderId)
              ? existingOrders
              : [...existingOrders, plan.orderId];
            next.set(id, {
              id,
              flightId: segmento.flightId,
              origin: segmento.origin,
              destination: segmento.destination,
              departureUtc: segmento.departureUtc,
              arrivalUtc: segmento.arrivalUtc,
              orderIds,
              retrasado: plan.slackMinutes <= 0,
            });
          });
        });
      });
      return next;
    });
  }, []);

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

          if (simMessage.snapshot) {
            const adjusted = adjustSnapshotTimestamp(simMessage.snapshot);
            if (adjusted) {
              setLatestProgress(adjusted);
              setVisibleSnapshot(adjusted);
              mergeFlightSegments(adjusted);
              setHasSnapshots(true);
              const snapshotMs = Date.parse(adjusted.generatedAt);
              if (!Number.isNaN(snapshotMs)) {
                setSimBaseSimulado(prev => prev ?? (timelineStartRef.current ?? snapshotMs));
                setSimBaseReal(prev => prev ?? Date.now());
              }
            }
          }

          if (simMessage.type === 'COMPLETED') {
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
  }, [simulationId, adjustSnapshotTimestamp, mergeFlightSegments]);

   // ===== INCREMENTO DE TIEMPO SIMULADO (ANIMACIÓN) =====
   const shouldAnimate = (status === 'running' || status === 'completed');

   useEffect(() => {
     if (!shouldAnimate || simBaseReal === null || simBaseSimulado === null) return;

   const interval = setInterval(() => {
      setTiempoMovimiento(Date.now() - simBaseReal);
    }, 50);

     return () => clearInterval(interval);
   }, [shouldAnimate, simBaseReal, simBaseSimulado]);

   // ===== CÁLCULO DE TIEMPO SIMULADO =====
  useEffect(() => {
    if (simBaseSimulado === null) {
      setTiempoSimulado(null);
      return;
    }
    const msSimuladosPasados = tiempoMovimiento * simSpeed;
    let targetMs = simBaseSimulado + msSimuladosPasados;
    if (timelineEndMs !== null) {
      targetMs = Math.min(targetMs, timelineEndMs);
    }
    setTiempoSimulado(new Date(targetMs));
  }, [simBaseSimulado, tiempoMovimiento, simSpeed, timelineEndMs]);

   // ===== CÁLCULO DE VUELOS EN MOVIMIENTO =====
  useEffect(() => {
    if (status === 'completed' && finalSnapshot) {
      setVisibleSnapshot(finalSnapshot);
      mergeFlightSegments(finalSnapshot);
    }
  }, [status, finalSnapshot, mergeFlightSegments]);

  const activeSegments = useMemo(() => {
    if (!tiempoSimulado) return [];
    const currentMs = tiempoSimulado.getTime();
    return Array.from(segmentosVuelo.values()).filter(segmento => {
      const depMs = Date.parse(segmento.departureUtc);
      const arrMs = Date.parse(segmento.arrivalUtc);
      if (Number.isNaN(depMs) || Number.isNaN(arrMs)) {
        return false;
      }
      return depMs <= currentMs && currentMs <= arrMs;
    });
  }, [segmentosVuelo, tiempoSimulado]);

  const vuelosEnMovimiento: VueloEnMovimiento[] = useMemo(() => {
    if (!tiempoSimulado || activeSegments.length === 0) {
      return [];
    }

    const coordsAeropuertos = new Map<string, [number, number]>();
    aeropuertos.forEach(a => {
      if (a.id && typeof a.latitude === 'number' && typeof a.longitude === 'number') {
        coordsAeropuertos.set(a.id, [a.latitude, a.longitude]);
      }
    });
    if (coordsAeropuertos.size === 0) {
      return [];
    }

    const tiempoActualMs = tiempoSimulado.getTime();
    const vuelosEnCurso: VueloEnMovimiento[] = [];

    activeSegments.forEach((segmento, index) => {
      const origen = coordsAeropuertos.get(segmento.origin);
      const destino = coordsAeropuertos.get(segmento.destination);
      if (!origen || !destino) {
        return;
      }

      const horaSalida = Date.parse(segmento.departureUtc);
      const horaLlegada = Date.parse(segmento.arrivalUtc);
      const duracionVuelo = horaLlegada - horaSalida;
      if (!Number.isFinite(duracionVuelo) || duracionVuelo <= 0) {
        return;
      }

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
      const offsetLat = ((index % 5) - 2) * 0.15;
      const offsetLon = ((Math.floor(index / 5) % 5) - 2) * 0.15;

      const latActual = origen[0] + (destino[0] - origen[0]) * ratio + offsetLat;
      const lonActual = origen[1] + (destino[1] - origen[1]) * ratio + offsetLon;

      vuelosEnCurso.push({
        id: segmento.id,
        orderId: segmento.orderIds.join(','),
        flightId: segmento.flightId,
        latActual,
        lonActual,
        progreso,
        estadoVisual,
        origen: segmento.origin,
        destino: segmento.destination,
        departureTime: segmento.departureUtc,
        arrivalTime: segmento.arrivalUtc,
      });
    });

    return vuelosEnCurso;
  }, [activeSegments, tiempoSimulado, aeropuertos]);

  // ===== MUTACIÓN PARA INICIAR SIMULACIÓN =====
  const simulationMutation = useMutation({
    mutationFn: (payload: SimulationStartRequest) => simulacionService.startSimulation(payload),
    onSuccess: (response) => {
      console.log('Simulación iniciada:', response.simulationId);
      setLatestProgress(null);
      setFinalSnapshot(null);
      setVisibleSnapshot(null);
      setSimulationId(response.simulationId);
      setTiempoMovimiento(0);
      setStatus('running');
    },
    onError: (error) => {
      console.error("Error al iniciar simulación:", error);
      setStatus('error');
    }
  });

  const iniciar = useCallback((payload: SimulationStartRequest, timeline?: { start?: string; end?: string }) => {
    const startMs = parseUtcMillis(timeline?.start);
    const endMs = parseUtcMillis(timeline?.end);
    setSegmentosVuelo(new Map());
    setTimelineEndMs(endMs);
    timelineStartRef.current = startMs;
    firstSnapshotRealRef.current = null;
    setTiempoMovimiento(0);
    if (startMs !== null) {
      setSimBaseSimulado(startMs);
      setSimBaseReal(Date.now());
      setTiempoSimulado(new Date(startMs));
    } else {
      setSimBaseSimulado(null);
      setSimBaseReal(null);
      setTiempoSimulado(null);
    }
    simulationMutation.mutate(payload);
  }, [simulationMutation]);

   const pausar = useCallback(() => {
     // Pausa/Reanuda la animación del frontend
     setStatus(prev => (prev === 'completed' ? 'idle' : 'completed'));
   }, []);

  const terminar = useCallback(async () => {
    if (simulationId) {
      try {
        console.log(`[Terminar] Solicitando cancelación para simulación: ${simulationId}`);
        await simulacionService.cancelSimulation(simulationId);
        console.log(`[Terminar] Backend confirmó cancelación.`);
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
    setSegmentosVuelo(new Map());
    setSimBaseSimulado(null);
    setSimBaseReal(null);
    setTimelineEndMs(null);
    timelineStartRef.current = null;
    firstSnapshotRealRef.current = null;
    setStatus('idle');
    setTiempoMovimiento(0);
    setTiempoSimulado(null);

  }, [stompClient, simulationId]);

   // ===== KPIs =====
   const kpis = useMemo(() => {
     const snapshot = visibleSnapshot ?? finalSnapshot;
     if (!snapshot?.orderPlans) return { entregas: 0, retrasados: 0 };
     return {
       entregas: snapshot.orderPlans.filter(p => p.slackMinutes > 0).length,
       retrasados: snapshot.orderPlans.filter(p => p.slackMinutes <= 0).length,
     };
   }, [visibleSnapshot, finalSnapshot]);

   // ===== RELOJ DE PROGRESO =====
   const reloj = `${latestProgress?.processedOrders ?? 0} / ${latestProgress?.totalOrders ?? 0} Órdenes`;

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
    simSpeed,
    setSimSpeed,
     iniciar,
     pausar,
     terminar,
     kpis,
     reloj,
     hasSnapshots,
  };
 };
