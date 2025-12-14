/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react';
import { Client } from '@stomp/stompjs';
import { useMutation, useQuery } from '@tanstack/react-query';
import { planService } from '../services/planService';
import { operationService } from '../services/operationService';
import { aeropuertoService } from '../services/aeropuertoService';
import type { Airport } from '../types/airport';
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

    // Inicializa el mundo de operación en backend (sincroniza hora actual)
    useEffect(() => {
        operationService.initWorld(simClockRef.current.toISOString()).catch(() => {});
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date(Date.now() + timeOffset);
            simClockRef.current = now;
            setSimClock(now);
        }, 1000);
        return () => clearInterval(interval);
    }, [timeOffset]);

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
                        // Depuración: ver payload de tick recibido
                        // eslint-disable-next-line no-console
                        console.log('[OPS] Tick recibido:', parsed);
                        const tick: SimulationTick | null = parsed.tick ?? null;
                        if (!tick) return;
                        const simTime = tick.simTime ? new Date(tick.simTime) : new Date();
                        setSimClock(simTime);
                        simClockRef.current = simTime;

                        const actives: ActiveSegment[] = tick.activeSegments ?? [];
                        setActiveSegments(actives.map(seg => ({
                            id: seg.id,
                            flightId: seg.flightId,
                            origin: seg.origin,
                            destination: seg.destination,
                            departureUtc: seg.departureUtc ?? '',
                            arrivalUtc: seg.arrivalUtc ?? '',
                            orderIds: seg.orderIds ?? [],
                            retrasado: false,
                            routeQuantity: seg.capacityUsed ?? seg.capacityTotal ?? 0,
                        })));

                        const airportTicks: ActiveAirportTick[] = tick.activeAirports ?? [];
                        setAirportStocks(
                            airportTicks.reduce((acc, a) => {
                                acc[a.airportCode] = a.currentLoad ?? 0;
                                return acc;
                            }, {} as Record<string, number>)
                        );
                        const combinedStatuses: Record<string, OrderStatusDetail> = {};
                        // plannedStatuses se consideran WAITING
                        (tick.plannedStatuses ?? []).forEach((os: OrderStatusTick) => {
                            combinedStatuses[os.orderId] = {
                                orderId: os.orderId,
                                status: 'WAITING',
                                finalDestination: os.location ?? '',
                                originAirport: '',
                                quantity: os.quantity ?? 0,
                                progress: 0,
                                isDelayed: false,
                                departureTime: '',
                                arrivalTime: '',
                            };
                        });
                        (tick.orderStatuses ?? []).forEach((os: OrderStatusTick) => {
                            const stRaw = (os.status ?? '').toUpperCase();
                            const st: OrderStatusDetail['status'] =
                                stRaw === 'COMPLETED' ? 'COMPLETED'
                                : stRaw === 'IN_FLIGHT' ? 'IN_FLIGHT'
                                : stRaw === 'LAYOVER' ? 'LAYOVER'
                                : 'WAITING';
                            combinedStatuses[os.orderId] = {
                                orderId: os.orderId,
                                status: st,
                                finalDestination: os.location ?? '',
                                originAirport: '',
                                quantity: os.quantity ?? 0,
                                progress: 0,
                                isDelayed: false,
                                departureTime: '',
                                arrivalTime: '',
                            };
                        });
                        setOrderStatusList(Object.values(combinedStatuses));
                        setMetrics((prev) => ({
                            ...prev,
                            totalOrders: tick.orderStatuses?.length ?? prev.totalOrders,
                            ordersInTransit: tick.inTransitOrders ?? prev.ordersInTransit,
                            activeFlights: tick.activeSegments?.length ?? prev.activeFlights,
                            totalFlights: tick.activeSegments?.length ?? prev.totalFlights,
                        }));
                        setStatus('running');
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
