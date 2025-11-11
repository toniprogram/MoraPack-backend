 import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Client } from '@stomp/stompjs';
import { aeropuertoService } from '../services/aeropuertoService';
import { simulacionService } from '../services/simulacionService';
import type { Airport } from '../types/airport';
import type { SimulationSnapshot, SimulationMessage, SimulationStartRequest } from '../types/simulacion';

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

 // URL de WebSocket nativo
 const BROKER_URL = 'ws://localhost:8080/ws';
 const TOPIC_PREFIX = '/topic/simulations/';
 const VELOCIDAD_SIMULACION = 60; // 60x velocidad real

 export const useSimulacion = () => {
   const [simulationId, setSimulationId] = useState<string | null>(null);
   const [stompClient, setStompClient] = useState<Client | null>(null);
   const [latestProgress, setLatestProgress] = useState<SimulationSnapshot | null>(null);
   const [finalSnapshot, setFinalSnapshot] = useState<SimulationSnapshot | null>(null);
   const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
   const [tiempoMovimiento, setTiempoMovimiento] = useState(0);
   const [tiempoSimulado, setTiempoSimulado] = useState<Date | null>(null);

   const { data: aeropuertos = [], isLoading: isLoadingAeropuertos } = useQuery({
     queryKey: ['aeropuertos'],
     queryFn: aeropuertoService.getAll,
   });

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

           if (simMessage.type === 'PROGRESS' && simMessage.snapshot) {
             // Actualiza el progreso
             setLatestProgress(simMessage.snapshot);
           } else if (simMessage.type === 'COMPLETED') {
             console.log('✅✅✅ SIMULACIÓN DE BACKEND COMPLETADA. Iniciando visualización.');
             console.log('⬇️⬇️⬇️ SOLUCIÓN FINAL (snapshotFinal) RECIBIDA ⬇️⬇️⬇️');
             console.log(JSON.stringify(simMessage.snapshot, null, 2));
             console.log('⬆️⬆️⬆️ ========================================== ⬆️⬆️⬆️');
             // Guarda la solución final y cambia el estado para animar
             setFinalSnapshot(simMessage.snapshot);
             setStatus('completed');
           } else if (simMessage.type === 'ERROR') {
             console.error("❌ Error en simulación:", simMessage.error);
             setStatus('error');
             client.deactivate();
           }
         });
       },
       onDisconnect: () => {
         // Solo cambia a 'idle' si no está 'completed' (para no parar la animación)
         setStatus(prev => prev === 'completed' ? 'completed' : 'idle');
       },
       onError: (error) => {
         console.error('❌ WebSocket error:', error);
         setStatus('error');
       }
     });
     setStompClient(client);
     client.activate();
     return () => {
       client.deactivate();
       setStompClient(null);
     };
   }, [simulationId]);

   // ===== INCREMENTO DE TIEMPO SIMULADO (ANIMACIÓN) =====
   useEffect(() => {
     // El intervalo solo debe correr si el estado es 'completed'
     if (status !== 'completed') return;

     const interval = setInterval(() => {
       setTiempoMovimiento(prev => prev + 0.05);
     }, 50);

     return () => clearInterval(interval);
   }, [status]);

   // ===== CÁLCULO DE TIEMPO SIMULADO =====
   useEffect(() => {
     const snapshot = finalSnapshot;
     if (!snapshot?.orderPlans || snapshot.orderPlans.length === 0) {
       setTiempoSimulado(null);
       return;
     }
     let primerTiempoMs: number | null = null;
     snapshot.orderPlans.forEach(plan =>
       plan.routes.forEach(ruta =>
         ruta.segments.forEach(segmento => {
           if (segmento.departureUtc) {
             const departureMs = new Date(segmento.departureUtc).getTime();
             if (primerTiempoMs === null || departureMs < primerTiempoMs) {
               primerTiempoMs = departureMs;
             }
           }
         })
       )
     );
     if (primerTiempoMs !== null) {
       const minutosSimulados = tiempoMovimiento * VELOCIDAD_SIMULACION;
       const tiempoActual = new Date(primerTiempoMs + minutosSimulados * 60000);
       setTiempoSimulado(tiempoActual);
     } else {
       setTiempoSimulado(null);
     }
   }, [finalSnapshot, tiempoMovimiento]);

   // ===== CÁLCULO DE VUELOS EN MOVIMIENTO =====
   const vuelosEnMovimiento: VueloEnMovimiento[] = useMemo(() => {
     const snapshot = finalSnapshot;
     if (!snapshot?.orderPlans || snapshot.orderPlans.length === 0 || !tiempoSimulado) {
       return [];
     }

     const coordsAeropuertos = new Map<string, [number, number]>();
     aeropuertos.forEach(a => {
         if (a.id && typeof a.latitude === 'number' && typeof a.longitude === 'number') {
              coordsAeropuertos.set(a.id, [a.latitude, a.longitude]);
         }
     });

     const vuelosMap = new Map<string, {
       flightId: string;
       origen: string;
       destino: string;
       departureTime: string;
       arrivalTime: string;
       pedidos: string[];
       hayRetrasado: boolean;
     }>();

     snapshot.orderPlans.forEach(plan => {
       plan.routes.forEach(ruta => {
         ruta.segments.forEach(segmento => {
           if (!segmento.departureUtc || !segmento.arrivalUtc) return;
           const uniqueFlightId = segmento.departureUtc;

           if (!vuelosMap.has(uniqueFlightId)) {
             vuelosMap.set(uniqueFlightId, {
               flightId: segmento.flightId,
               origen: segmento.origin,
               destino: segmento.destination,
               departureTime: segmento.departureUtc,
               arrivalTime: segmento.arrivalUtc,
               pedidos: [],
               hayRetrasado: false
             });
           }

           const vuelo = vuelosMap.get(uniqueFlightId)!;
           if (!vuelo.pedidos.includes(plan.orderId)) vuelo.pedidos.push(plan.orderId);
           if (plan.slackMinutes <= 0) vuelo.hayRetrasado = true;
         });
       });
     });

     const vuelosEnCurso: VueloEnMovimiento[] = [];
     const tiempoActualMs = tiempoSimulado.getTime();

     Array.from(vuelosMap.values()).forEach((vuelo, vueloIndex) => {
       const origen = coordsAeropuertos.get(vuelo.origen);
       const destino = coordsAeropuertos.get(vuelo.destino);
       if (!origen || !destino) return;

       const horaSalida = new Date(vuelo.departureTime).getTime();
       const horaLlegada = new Date(vuelo.arrivalTime).getTime();
       const duracionVuelo = horaLlegada - horaSalida;
       if (duracionVuelo <= 0) return;

       let progreso = 0;
       let estadoVisual: 'en curso' | 'retrasado' | 'completado' = 'en curso';

       if (tiempoActualMs < horaSalida) {
         return; // Aún no ha despegado
       } else if (tiempoActualMs >= horaLlegada) {
         progreso = 100;
         estadoVisual = 'completado';
       } else {
         const tiempoTranscurrido = tiempoActualMs - horaSalida;
         progreso = (tiempoTranscurrido / duracionVuelo) * 100;
         estadoVisual = vuelo.hayRetrasado ? 'retrasado' : 'en curso';
       }

       const ratio = Math.min(progreso / 100, 1);
       const offsetLat = ((vueloIndex % 5) - 2) * 0.15;
       const offsetLon = ((Math.floor(vueloIndex / 5) % 5) - 2) * 0.15;

       const latActual = origen[0] + (destino[0] - origen[0]) * ratio + offsetLat;
       const lonActual = origen[1] + (destino[1] - origen[1]) * ratio + offsetLon;

       vuelosEnCurso.push({
         id: vuelo.departureTime,
         orderId: vuelo.pedidos.join(','),
         flightId: vuelo.flightId,
         latActual,
         lonActual,
         progreso,
         estadoVisual,
         origen: vuelo.origen,
         destino: vuelo.destino,
         departureTime: vuelo.departureTime,
         arrivalTime: vuelo.arrivalTime,
       });
     });

     return vuelosEnCurso;
   }, [finalSnapshot, tiempoSimulado, aeropuertos]);

   // ===== MUTACIÓN PARA INICIAR SIMULACIÓN =====
  const { mutate: iniciar, isPending: estaIniciando } = useMutation({
    mutationFn: (payload: SimulationStartRequest) => simulacionService.startSimulation(payload),
     onSuccess: (response) => {
       console.log('Simulación iniciada:', response.simulationId);
       setLatestProgress(null);
       setFinalSnapshot(null);
       setSimulationId(response.simulationId);
       setTiempoMovimiento(0);
       setTiempoSimulado(null);
       setStatus('running');
     },
     onError: (error) => {
       console.error("Error al iniciar simulación:", error);
       setStatus('error');
     }
   });

   const pausar = useCallback(() => {
     // Pausa/Reanuda la animación del frontend
     setStatus(prev => (prev === 'completed' ? 'idle' : 'completed'));
   }, []);

   const terminar = useCallback(() => {
     stompClient?.deactivate();
     setSimulationId(null);
     setLatestProgress(null);
     setFinalSnapshot(null);
     setStatus('idle');
     setTiempoMovimiento(0);
     setTiempoSimulado(null);
   }, [stompClient]);

   // ===== KPIs =====
   const kpis = useMemo(() => {
     const snapshot = finalSnapshot;
     if (!snapshot?.orderPlans) return { entregas: 0, retrasados: 0 };
     return {
       entregas: snapshot.orderPlans.filter(p => p.slackMinutes > 0).length,
       retrasados: snapshot.orderPlans.filter(p => p.slackMinutes <= 0).length,
     };
   }, [finalSnapshot]);

   // ===== RELOJ DE PROGRESO =====
   const reloj = `${latestProgress?.processedOrders ?? 0} / ${latestProgress?.totalOrders ?? 0} Órdenes`;

   return {
     aeropuertos,
     vuelosEnMovimiento,
     isLoading: isLoadingAeropuertos,
     isStarting: estaIniciando,
     isError: status === 'error',
     estaActivo: status === 'running',
     estaVisualizando: status === 'completed',
     snapshotFinal: finalSnapshot,
     snapshotProgreso: latestProgress,
     tiempoSimulado,
     iniciar,
     pausar,
     terminar,
     kpis,
     reloj,
   };
 };
