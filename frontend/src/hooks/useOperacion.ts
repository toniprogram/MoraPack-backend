import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Client } from '@stomp/stompjs';
import { planService } from '../services/planService';
import { operationService } from '../services/operationService';
import { aeropuertoService } from '../services/aeropuertoService';
import type { Airport } from '../types/airport';
import type { CurrentPlanResponse } from '../types/plan';

// --- TIPOS ---
export interface GhostFlight {
    id: string;
    lat: number;
    lon: number;
    angle: number;
    origin: string;
    destination: string;
    departureTime: string;
    arrivalTime: string;
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
}
export interface VueloEnMovimiento {
    id: string;
    orderId: string;
    flightId: string;
    latActual: number;
    lonActual: number;
    progreso: number;
    estadoVisual: 'en curso' | 'completado';
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
export interface OperationMetrics {
    totalOrders: number;
    deliveredOrders: number;
    ordersInTransit: number;
    totalFlights: number;
    activeFlights: number;
    slaPercentage: number;
    delayedOrders: number;
}
export interface OrderStatusDetail {
    currentFlightId: string;
    orderId: string;
    status: 'WAITING' | 'IN_FLIGHT' | 'LAYOVER' | 'COMPLETED';
    finalDestination: string;
    originAirport: string;
    quantity: number;
    slackMinutes?: number;
    progress: number;
    isDelayed: boolean;
    departureTime: string;
    arrivalTime: string;
    routesDetail: Array<{
        routeIndex: number;
        segments: Array<{
            flightId: string;
            origin: string;
            destination: string;
            departureUtc: string;
            arrivalUtc: string;
            quantity: number;
        }>;
    }>;
}
interface AirportLiveStatus {
    currentLoad: number;
    maxThroughputPerHour: number;
    orderLoads: { orderId: string; quantity: number }[];
}
export const useOperacion = () => {
    const [status, setStatus] = useState<'idle' | 'buffering' | 'running' | 'error'>('idle');
    const [isReplanning, setIsReplanning] = useState(false);
    const [isClearingPlan, setIsClearingPlan] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [, setPlanCache] = useState<Record<string, { quantity: number; routesDetail: OrderStatusDetail['routesDetail']; slackMinutes?: number }>>({});
    const [, setOrdersPage] = useState<{ total: number; page: number; size: number; items: OrderStatusDetail[] }>({
        total: 0,
        page: 0,
        size: 10,
        items: [],
    });
    const ordersPageRef = useRef(0);
    const visibleOrderIdsRef = useRef<Set<string>>(new Set());
    const { data: aeropuertos = [] } = useQuery<Airport[]>({
        queryKey: ['aeropuertos'],
        queryFn: aeropuertoService.getAll,
        staleTime: 1000 * 60 * 60,
    });
    // --- Mapa de Coordenadas ---
    const coordsMap = useMemo(() => {
        const map = new Map<string, [number, number]>();
        aeropuertos.forEach(a => {
            if (a.id && a.latitude != null && a.longitude != null) {
                map.set(a.id, [a.latitude, a.longitude]);
                if (a.code) map.set(a.code, [a.latitude, a.longitude]);
            }
        });
        return map;
    }, [aeropuertos]);
    // --- CONTROL DE TIEMPO ---
    const [simClock, setSimClock] = useState<Date>(new Date());
    const [timeOffset, setTimeOffset] = useState<number>(0);
    const simClockRef = useRef<Date>(new Date());
    const setManualTime = (newDate: Date) => {
        const offset = newDate.getTime() - Date.now();
        setTimeOffset(offset);
        setSimClock(newDate);
        simClockRef.current = newDate;
        operationService.setTime(newDate.toISOString()).catch(() => {/* ignore */});
        loadOrders(newDate, 0);
    };
    const resetTime = () => {
        setTimeOffset(0);
        setSimClock(new Date());
    };
    // --- ESTADOS DE OPERACIÓN ---
    const [activeSegments, setActiveSegments] = useState<SegmentoVuelo[]>([]);
    const [ghostFlights, setGhostFlights] = useState<GhostFlight[]>([]);
    const [orderStatusList, setOrderStatusList] = useState<OrderStatusDetail[]>([]);
    const [airportStocks, setAirportStocks] = useState<Record<string, AirportLiveStatus>>({});
    const stompClientRef = useRef<Client | null>(null);
    const [metrics, setMetrics] = useState<OperationMetrics>({
        totalOrders: 0,
        deliveredOrders: 0,
        ordersInTransit: 0,
        totalFlights: 0,
        activeFlights: 0,
        slaPercentage: 100,
        delayedOrders: 0
    });
    // 1. Fetch Plan Base
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
                        origin: s.from,
                        destination: s.to,
                        departureUtc: s.departure,
                        arrivalUtc: s.arrival,
                        quantity: r.quantity ?? 0,
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

    // 2. Load Orders
    const loadOrders = async (targetDate: Date, page = 0) => {
        try {
            const res = await operationService.getOrders(targetDate.toISOString(), page, 50);
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
            ordersPageRef.current = res.page ?? page ?? 0;
            setOrderStatusList(items);
        } catch (e) {
            console.warn('No se pudo cargar pedidos paginados', e);
        }
    };

    // 3. Inicialización
    useEffect(() => {
        operationService.initWorld(simClockRef.current.toISOString()).catch(() => {});
        fetchPlanBase();
        loadOrders(simClockRef.current, 0);
    }, []);

    // 4. Reloj
    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date(Date.now() + timeOffset);
            simClockRef.current = now;
            setSimClock(now);
        }, 1000);
        return () => clearInterval(interval);
    }, [timeOffset]);

    // 5. Cálculo de Posiciones
    const calculatePositions = (segments: SegmentoVuelo[], clock: Date): VueloEnMovimiento[] => {
        if (!segments.length || coordsMap.size === 0) return [];

        const nowMs = clock.getTime();

        return segments
            .map((seg, index) => {
                const origen = coordsMap.get(seg.origin);
                const destino = coordsMap.get(seg.destination);
                if (!origen || !destino) return null;

                const horaSalida = Date.parse(seg.departureUtc);
                const horaLlegada = Date.parse(seg.arrivalUtc);
                const duracion = horaLlegada - horaSalida;

                if (nowMs < horaSalida) return null;

                let progreso = 0;
                let lat = origen[0];
                let lon = origen[1];
                let estado: 'en curso' | 'completado' = 'en curso';

                if (nowMs >= horaLlegada) {
                    progreso = 100;
                    estado = 'completado';
                    lat = destino[0];
                    lon = destino[1];
                } else if (duracion > 0) {
                    progreso = ((nowMs - horaSalida) / duracion) * 100;
                    const ratio = progreso / 100;
                    const offsetLat = ((index % 5) - 2) * 0.15;
                    lat = origen[0] + (destino[0] - origen[0]) * ratio + offsetLat;
                    lon = origen[1] + (destino[1] - origen[1]) * ratio;
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
            })
            .filter((v): v is VueloEnMovimiento => v !== null);
    };
    const vuelosEnMovimiento = useMemo(
        () => calculatePositions(activeSegments, simClock),
        [activeSegments, simClock, coordsMap]
    );
    // 6. Mutaciones
    const runPlanningMutation = useMutation({
        mutationFn: () => planService.runPlanning(true),
        onMutate: () => {
            setIsReplanning(true);
            setStatus('buffering');
        },
        onSuccess: async () => {
            try { await operationService.initWorld(simClockRef.current.toISOString()); } catch { /* ignore */ }
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
        onMutate: () => setIsClearingPlan(true),
        onSuccess: () => {
            setActiveSegments([]);
            setGhostFlights([]);
            setOrderStatusList([]);
            setAirportStocks({});
            setPlanCache({});
            setMetrics({
                totalOrders: 0, deliveredOrders: 0, ordersInTransit: 0,
                totalFlights: 0, activeFlights: 0, slaPercentage: 0, delayedOrders: 0
            });
            setStatus('idle');
            setLastUpdated(new Date());
        },
        onSettled: () => setIsClearingPlan(false)
    });
    // 7. Actualización periódica
    useEffect(() => {
        visibleOrderIdsRef.current = new Set(orderStatusList.map(o => o.orderId));
    }, [orderStatusList]);

    useEffect(() => {
        const interval = setInterval(() => {
            fetchPlanBase();
            loadOrders(simClockRef.current, ordersPageRef.current);
        }, 60000);
        return () => clearInterval(interval);
    }, []);
    // 8. Métricas
    useEffect(() => {
        if (!activeSegments.length && !orderStatusList.length) return;
        const nowMs = simClock.getTime();
        const vuelosActivos = activeSegments.filter(s => {
            const dep = Date.parse(s.departureUtc);
            const arr = Date.parse(s.arrivalUtc);
            return nowMs >= dep && nowMs < arr;
        });
        const pedidosEnVuelo = vuelosActivos.reduce((acc, v) => acc + (v.capacityUsed || 0), 0);
        const pedidosEntregados = orderStatusList.filter(o => {
            if (o.status === 'COMPLETED') return true;
            if (o.arrivalTime) {
                const arr = Date.parse(o.arrivalTime);
                return arr <= nowMs;
            }
            return false;
        }).length;
        setMetrics(prev => ({
            ...prev,
            totalOrders: orderStatusList.length,
            deliveredOrders: pedidosEntregados,
            activeFlights: vuelosActivos.length,
            ordersInTransit: pedidosEnVuelo,
        }));
    }, [simClock, activeSegments, orderStatusList]);
    // Helper para mapear
    const mapSegments = (rawList: any[]): SegmentoVuelo[] => {
        return rawList.map((s: any) => ({
            id: s.id,
            flightId: s.flightId,
            origin: s.origin,
            destination: s.destination,
            departureUtc: s.departureUtc,
            arrivalUtc: s.arrivalUtc,
            orderIds: s.orderIds ?? [],
            retrasado: false,
            routeQuantity: s.capacityUsed,
            capacityUsed: s.capacityUsed,
            capacityTotal: s.capacityTotal,
            orderLoads: s.orderLoads ?? []
        }));
    };
    // 9. WebSocket
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
                        const parsed = JSON.parse(message.body);
                        const tickData = parsed.operationTick || parsed.tick;

                        if (tickData) {
                            if (tickData.activeSegments) {
                                setActiveSegments(mapSegments(tickData.activeSegments));
                            }
                            if (tickData.ghostFlights) {
                                setGhostFlights(tickData.ghostFlights);
                            } else {
                                if (parsed.operationTick) setGhostFlights([]);
                            }
                            if (tickData.activeAirports) {
                                const stockMap: Record<string, AirportLiveStatus> = {};
                                tickData.activeAirports.forEach((a: any) => {
                                    stockMap[a.airportCode] = {
                                        currentLoad: a.currentLoad,
                                        maxThroughputPerHour: a.maxThroughputPerHour,
                                        orderLoads: a.orderLoads ?? []
                                    };
                                });
                                setAirportStocks(stockMap);
                            }
                        }

                        const changedIds = parsed.changedOrderIds || (parsed.tick as any)?.changedOrderIds;
                        if (changedIds?.length) {
                            const hasVisibleChange = changedIds.some((id: string) => visibleOrderIdsRef.current.has(id));
                            if (hasVisibleChange) {
                                loadOrders(simClockRef.current, ordersPageRef.current);
                            }
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
        ghostFlights,
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