/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react';
import { Client } from '@stomp/stompjs';
import { useMutation, useQuery } from '@tanstack/react-query';
import { planService } from '../services/planService';
import { operationService } from '../services/operationService';
import { aeropuertoService } from '../services/aeropuertoService';
import type { Airport } from '../types/airport';
import type { CurrentPlanResponse } from '../types/plan';
import type { ActiveAirportTick, SimulationMessage, SimulationTick, OrderStatusTick, ActiveSegment } from '../types/simulation';

// --- TIPOS ---
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
}

export interface VueloEnMovimiento {
    id: string;
    orderId: string;
    flightId: string;
    latActual: number;
    lonActual: number;
    progreso: number;
    estadoVisual: 'en curso' | 'retrasado' | 'completado';

    // Campos detallados
    origenCode: string;
    destinoCode: string;
    salidaProgramada: string;
    llegadaProgramada: string;
    capacidadTotal: number;
    capacidadUsada: number;
    origen?: string;
    destino?: string;
    pedidos: {
        orderId: string;
        cliente: string;
        fechaCreacion: string;
        cantidad: number;
    }[];
}

export interface OrderStatusDetail {
    orderId: string;
    status: 'WAITING' | 'IN_FLIGHT' | 'LAYOVER' | 'COMPLETED';
    currentFlightId?: string;
    nextAirport?: string;
    finalDestination: string;
    departureTime: string;
    arrivalTime: string;
    progress: number;
    isDelayed: boolean;
    originAirport: string;
    quantity: number;
    currentSegDeparture?: string;
    currentSegArrival?: string;
    flights?: string[];
    slackMinutes?: number;
    routesDetail?: {
        routeIndex: number;
        segments: {
            flightId: string;
            origin: string;
            destination: string;
            departureUtc: string;
            arrivalUtc: string;
            quantity: number;
        }[];
    }[];
}

export interface OperationMetrics {
    totalOrders: number;
    ordersInTransit: number;
    totalFlights: number;
    activeFlights: number;
    slaPercentage: number;
    delayedOrders: number;
}

export const useOperacion = () => {
    const [status, setStatus] = useState<'idle' | 'buffering' | 'running' | 'error'>('idle');
    const [isReplanning, setIsReplanning] = useState(false);
    const [isClearingPlan, setIsClearingPlan] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [planCache, setPlanCache] = useState<Record<string, { quantity: number; routesDetail: OrderStatusDetail['routesDetail']; slackMinutes?: number }>>({});
    const [ordersPage, setOrdersPage] = useState<{ total: number; page: number; size: number; items: OrderStatusDetail[] }>({
        total: 0,
        page: 0,
        size: 10,
        items: [],
    });

    const { data: aeropuertos = [] } = useQuery<Airport[]>({
        queryKey: ['aeropuertos'],
        queryFn: aeropuertoService.getAll,
        staleTime: 1000 * 60 * 60,
    });

    useEffect(() => {
        if (aeropuertos.length) {
            // Depuración: ver capacidades recibidas del backend
            // eslint-disable-next-line no-console
            console.log('Aeropuertos recibidos (capacidad):', aeropuertos.map(a => ({
                id: a.id,
                code: a.code,
                storageCapacity: a.storageCapacity,
            })));
        }
    }, [aeropuertos]);

    // --- CONTROL DE TIEMPO ---
    const [simClock, setSimClock] = useState<Date>(new Date());
    const [timeOffset, setTimeOffset] = useState<number>(0);

    const setManualTime = (newDate: Date) => {
        const offset = newDate.getTime() - Date.now();
        setTimeOffset(offset);
        setSimClock(newDate);
        simClockRef.current = newDate;
        // Notificamos al backend para reposicionar el mundo
        operationService.setTime(newDate.toISOString()).catch(() => {/* ignore */});
        loadOrders(newDate, 0);
    };
    const simClockRef = useRef<Date>(new Date());

    const resetTime = () => {
        setTimeOffset(0);
        setSimClock(new Date());
    };

    const [activeSegments, setActiveSegments] = useState<SegmentoVuelo[]>([]);
    const [vuelosEnMovimiento, setVuelosEnMovimiento] = useState<VueloEnMovimiento[]>([]);
    const [orderStatusList, setOrderStatusList] = useState<OrderStatusDetail[]>([]);
    const [airportStocks, setAirportStocks] = useState<Record<string, number>>({});
    const stompClientRef = useRef<Client | null>(null);

    const [metrics, setMetrics] = useState<OperationMetrics>({
        totalOrders: 0,
        ordersInTransit: 0,
        totalFlights: 0,
        activeFlights: 0,
        slaPercentage: 100,
        delayedOrders: 0
    });

    // Normaliza tiempos y cachea el plan base (rutas/segmentos) para no depender del tick
    const fetchPlanBase = async () => {
        try {
            const plan: CurrentPlanResponse = await planService.getCurrentPlan();
            const map: Record<string, { quantity: number; routesDetail: OrderStatusDetail['routesDetail']; slackMinutes?: number }> = {};
            plan.orderPlans.forEach(op => {
                const qty = (op.routes ?? []).reduce((sum, r) => sum + (r.quantity ?? 0), 0);
                const routesDetail = (op.routes ?? []).map((r, idx) => ({
                    routeIndex: idx + 1,
                    segments: (r.segments ?? []).map(s => ({
                        flightId: s.flightId,
                        origin: s.origin,
                        destination: s.destination,
                        departureUtc: s.departureUtc,
                        arrivalUtc: s.arrivalUtc,
                        quantity: s.quantity,
                    })),
                })).filter(r => r.segments.length > 0);
                map[op.orderId] = { quantity: qty, routesDetail, slackMinutes: op.slackMinutes };
            });
            setPlanCache(map);
            setLastUpdated(new Date());
        } catch (e) {
            console.warn('No se pudo obtener plan base', e);
        }
    };

    const loadOrders = async (targetDate: Date, page = 0) => {
        try {
            const res = await operationService.getOrders(targetDate.toISOString(), page);
            // eslint-disable-next-line no-console
            console.log('[OPS] Orders page response:', res);
            const items: OrderStatusDetail[] = (res.items ?? []).map((o: any) => ({
                orderId: o.orderId,
                status: (o.status === 'DELIVERED' ? 'COMPLETED' : o.status === 'IN_TRANSIT' ? 'IN_FLIGHT' : 'WAITING'),
                finalDestination: o.destination ?? '',
                originAirport: o.origin ?? '',
                quantity: o.quantity ?? 0,
                slackMinutes: o.slackMinutes ?? undefined,
                progress: 0,
                isDelayed: false,
                departureTime: '',
                arrivalTime: '',
                routesDetail: (o.routes ?? []).map((r: any, idx: number) => ({
                    routeIndex: idx + 1,
                    segments: (r.segments ?? []).map((s: any) => ({
                        flightId: s.flightId,
                        origin: s.origin,
                        destination: s.destination,
                        departureUtc: s.departureUtc,
                        arrivalUtc: s.arrivalUtc,
                        quantity: s.quantity,
                    })),
                })),
            }));
            setOrdersPage({
                total: res.total ?? items.length,
                page: res.page ?? page,
                size: res.size ?? 10,
                items,
            });
            setOrderStatusList(items);
        } catch (e) {
            console.warn('No se pudo cargar pedidos paginados', e);
        }
    };

    // Inicializa el mundo de operación en backend (sincroniza hora actual) y carga plan base
    useEffect(() => {
        operationService.initWorld(simClockRef.current.toISOString()).catch(() => {});
        fetchPlanBase();
        loadOrders(simClockRef.current, 0);
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date(Date.now() + timeOffset);
            simClockRef.current = now;
            setSimClock(now);
        }, 1000);
        return () => clearInterval(interval);
    }, [timeOffset]);

    useEffect(() => {
        // 1. Verificamos si tenemos datos básicos
        if (!aeropuertos.length) return;

        // Si no hay segmentos, avisamos en consola una sola vez (para no saturar)
        if (!activeSegments.length) {
            // Descomenta esta línea si quieres confirmar que está vacío siempre
            // console.log('[DEBUG] activeSegments está vacío. Esperando datos del WebSocket...');
            setVuelosEnMovimiento([]);
            return;
        }

        const nowMs = simClock.getTime();
        // console.log(`[DEBUG] Calculando posiciones para ${activeSegments.length} vuelos. Hora Reloj: ${simClock.toISOString()}`);

        // Mapa de coordenadas
        const coordsMap = new Map<string, [number, number]>();
        aeropuertos.forEach(a => {
            if (a.id && a.latitude != null && a.longitude != null) {
                coordsMap.set(a.id, [a.latitude, a.longitude]);
                if (a.code) coordsMap.set(a.code, [a.latitude, a.longitude]);
            }
        });

        const calculated = activeSegments.map((seg, index) => {
            const origen = coordsMap.get(seg.origin);
            const destino = coordsMap.get(seg.destination);

            // --- LOG CRÍTICO FRONTEND ---
            if (!origen || !destino) {
                console.error(`[MAPA ERROR] Vuelo ${seg.flightId} recibido pero ignorado. Falta coord aeropuerto.`, {
                    flightId: seg.flightId,
                    orgCode: seg.origin,
                    destCode: seg.destination,
                    tieneOrigen: !!origen,
                    tieneDestino: !!destino
                });
                return null;
            }

            const horaSalida = Date.parse(seg.departureUtc);
            const horaLlegada = Date.parse(seg.arrivalUtc);
            const duracion = horaLlegada - horaSalida;

            let progreso = 0;
            let lat = origen[0];
            let lon = origen[1];
            let estado: 'en curso' | 'retrasado' | 'completado' = 'en curso';

            // Lógica de posición
            if (nowMs >= horaLlegada) {
                progreso = 100;
                estado = 'completado';
                lat = destino[0];
                lon = destino[1];
            } else if (nowMs > horaSalida && duracion > 0) {
                progreso = ((nowMs - horaSalida) / duracion) * 100;
                const ratio = progreso / 100;
                // Offset visual para evitar superposición
                const offsetLat = ((index % 5) - 2) * 0.15;
                lat = origen[0] + (destino[0] - origen[0]) * ratio + offsetLat;
                lon = origen[1] + (destino[1] - origen[1]) * ratio;
            } else {
                // Aún no sale
                progreso = 0;
            }

            // Solo mostramos logs de vuelos que deberían estar activos según tu descripción
            if (estado === 'en curso') {
                // console.log(`[DEBUG] Vuelo ACTIVO: ${seg.flightId} | Progreso: ${progreso.toFixed(1)}%`);
            }

            return {
                id: seg.id,
                orderId: seg.orderIds.join(','),
                flightId: seg.flightId,
                latActual: lat,
                lonActual: lon,
                progreso: Math.max(0, Math.min(100, progreso)),
                estadoVisual: estado,
                origenCode: seg.origin,
                destinoCode: seg.destination,
                salidaProgramada: seg.departureUtc,
                llegadaProgramada: seg.arrivalUtc,
                capacidadTotal: seg.capacityTotal || 0,
                capacidadUsada: seg.capacityUsed || 0,
                pedidos: (seg.orderLoads || []).map(ol => ({
                    orderId: ol.orderId,
                    cantidad: ol.quantity,
                    cliente: "---",
                    fechaCreacion: "---"
                }))
            };
        }).filter((v): v is VueloEnMovimiento => v !== null);

        setVuelosEnMovimiento(calculated);

    }, [activeSegments, simClock, aeropuertos]);

    const runPlanningMutation = useMutation({
        mutationFn: () => planService.runPlanning(true),
        onMutate: () => {
            setIsReplanning(true);
            setStatus('buffering');
        },
        onSuccess: async () => {
            // Rehidrata el mundo en backend con la hora actual para empezar a recibir ticks
            try {
                await operationService.initWorld(simClockRef.current.toISOString());
            } catch {
                // ignore
            }
            loadOrders(simClockRef.current, 0);
            setIsReplanning(false);
            setStatus('running');
        },
        onError: () => {
            setIsReplanning(false);
            setStatus('error');
        }
    });

    const clearPlanMutation = useMutation({
        mutationFn: () => planService.resetAllPlans(),
        onMutate: () => {
            setIsClearingPlan(true);
        },
        onSuccess: () => {
            setDayPlan(null);
            setActiveSegments([]);
            setVuelosEnMovimiento([]);
            setOrderStatusList([]);
            setMetrics({
                totalOrders: 0,
                ordersInTransit: 0,
                totalFlights: 0,
                activeFlights: 0,
                slaPercentage: 0,
                delayedOrders: 0
            });
            setStatus('idle');
            setLastUpdated(new Date());
        },
        onSettled: () => {
            setIsClearingPlan(false);
        }
    });

    // Suscribirse al tópico de operación y consumir ticks desde el backend
    useEffect(() => {
        const resolveWsUrl = () => {
            const envWs = import.meta.env.VITE_WS_URL as string | undefined;
            if (envWs) return envWs;
            const apiBase = import.meta.env.VITE_API_URL as string | undefined;
            const base = apiBase ?? 'http://localhost:8080/api';
            const wsBase = base.replace(/^http/, 'ws').replace(/\/api\/?$/, '');
            return `${wsBase}/ws`;
        };

        const client = new Client({
            brokerURL: resolveWsUrl(),
            reconnectDelay: 5000,
            onConnect: () => {
                client.subscribe('/topic/ops/current', (message) => {
                    try {
                        const parsed: SimulationMessage = JSON.parse(message.body);

                        // LOG CRÍTICO: Ver qué llega realmente
                        // console.log('[OPS WS] Tick recibido:', parsed);

                        if (parsed.tick && parsed.tick.activeSegments) {
                            // console.log(`[OPS WS] Recibidos ${parsed.tick.activeSegments.length} segmentos activos`);

                            const mapped: SegmentoVuelo[] = parsed.tick.activeSegments.map((s: any) => ({
                                id: s.id,
                                flightId: s.flightId,
                                origin: s.origin,
                                destination: s.destination,
                                departureUtc: s.departureUtc,
                                arrivalUtc: s.arrivalUtc,
                                orderIds: s.orderIds ?? [],
                                retrasado: false,
                                progressPct: 0,
                                latitude: null,
                                longitude: null,
                                routeQuantity: s.capacityUsed,
                                capacityUsed: s.capacityUsed,
                                capacityTotal: s.capacityTotal,
                                orderLoads: s.orderLoads ?? []
                            }));
                            setActiveSegments(mapped); // <--- ¡ASEGÚRATE DE QUE ESTA LÍNEA ESTÉ!
                        } else {
                             // Si activeSegments es null o vacío, el backend no está enviando vuelos
                             // console.warn('[OPS WS] El tick no tiene activeSegments o está vacío');
                        }
                    } catch (err) {
                        console.warn('No se pudo parsear tick de operación', err);
                    }
                });
            },
            onStompError: (frame) => console.warn('WS OPS error', frame),
        });
        client.activate();
        stompClientRef.current = client;
        return () => {
            client.deactivate();
            stompClientRef.current = null;
        };
    }, []);

    return {
        aeropuertos,
        activeSegments,
        vuelosEnMovimiento,
        orderStatusList,
        airportStocks,
        metrics,
        status,
        simClock,
        isClearingPlan,
        actions: {
            planificar: runPlanningMutation.mutate,
            clearPlan: clearPlanMutation.mutate,
            setManualTime,
            resetTime
        },
        isReplanning,
        lastUpdated,
    };
};
