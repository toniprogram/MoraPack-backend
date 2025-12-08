/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { planService } from '../services/planService';
import { aeropuertoService } from '../services/aeropuertoService';
import type { Airport } from '../types/airport';
import type { CurrentPlanResponse } from '../types/plan';

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
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const [dayPlan, setDayPlan] = useState<CurrentPlanResponse | null>(null);

    const { data: aeropuertos = [] } = useQuery<Airport[]>({
        queryKey: ['aeropuertos'],
        queryFn: aeropuertoService.getAll,
        staleTime: 1000 * 60 * 60,
    });

    // --- CONTROL DE TIEMPO ---
    const [simClock, setSimClock] = useState<Date>(new Date());
    const [timeOffset, setTimeOffset] = useState<number>(0);

    const setManualTime = (newDate: Date) => {
        const offset = newDate.getTime() - Date.now();
        setTimeOffset(offset);
        setSimClock(newDate);
    };

    const resetTime = () => {
        setTimeOffset(0);
        setSimClock(new Date());
    };

    const [activeSegments, setActiveSegments] = useState<SegmentoVuelo[]>([]);
    const [vuelosEnMovimiento, setVuelosEnMovimiento] = useState<VueloEnMovimiento[]>([]);
    const [orderStatusList, setOrderStatusList] = useState<OrderStatusDetail[]>([]);
    const [airportStocks, setAirportStocks] = useState<Record<string, number>>({});

    const [metrics, setMetrics] = useState<OperationMetrics>({
        totalOrders: 0,
        ordersInTransit: 0,
        totalFlights: 0,
        activeFlights: 0,
        slaPercentage: 100,
        delayedOrders: 0
    });

    const fetchRealTimePlan = useCallback(async () => {
        try {
            const rawResponse: unknown = await planService.getCurrentPlan();
            let parsedPlan: unknown = rawResponse;

            if (typeof rawResponse === 'string') {
                try {
                    parsedPlan = JSON.parse(rawResponse);
                } catch {
                    console.warn("⚠️ JSON roto, intentando reparar...");
                    try {
                        const sanitized = (rawResponse as string).replace(/,"plan":\{.*?(?=}\]|},)/g, '');
                        parsedPlan = JSON.parse(sanitized);
                    } catch (e2) {
                        console.error("❌ Imposible reparar JSON:", e2);
                    }
                }
            }

            if (parsedPlan && typeof parsedPlan === 'object') {
                const planObj = parsedPlan as { generatedAt?: string; fitness?: number; orderPlans?: unknown };
                const cleanPlan: CurrentPlanResponse = {
                    generatedAt: planObj.generatedAt ?? new Date().toISOString(),
                    fitness: planObj.fitness ?? 0,
                    orderPlans: Array.isArray(planObj.orderPlans) ? planObj.orderPlans : []
                };
                setDayPlan(cleanPlan);
                setLastUpdated(new Date());
                setStatus('running');
            } else {
                setDayPlan({ generatedAt: new Date().toISOString(), fitness: 0, orderPlans: [] });
                setStatus('idle');
            }
        } catch (error) {
            console.error("Error fetch plan:", error);
            setDayPlan(null);
            setStatus('idle');
        }
    }, []);

    useEffect(() => {
        fetchRealTimePlan();
        const interval = setInterval(fetchRealTimePlan, 30000);
        return () => clearInterval(interval);
    }, [fetchRealTimePlan]);

    useEffect(() => {
        const interval = setInterval(() => {
            setSimClock(new Date(Date.now() + timeOffset));
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
            await fetchRealTimePlan();
            setIsReplanning(false);
            setStatus('running');
        },
        onError: () => {
            setIsReplanning(false);
            setStatus('error');
        }
    });

    // --- CORE ---
    useEffect(() => {
        if (!dayPlan) return;

        const orders = dayPlan.orderPlans || [];
        const currentMs = simClock.getTime();
        const airportMap = new Map((aeropuertos || []).map(a => [a.id, [a.latitude, a.longitude]]));

        const mapSegmentos = new Map<string, SegmentoVuelo>();
        const mapVuelos = new Map<string, VueloEnMovimiento>();
        const processedOrders: OrderStatusDetail[] = [];
        const uniqueFlightsTotal = new Set<string>();

        const tempStocks: Record<string, number> = {};

        let countDelayed = 0;
        let countInTransit = 0;

        orders.forEach((plan: { routes?: any[]; slack?: unknown; slackMinutes?: number; orderId?: string; customerReference?: string; creationUtc?: string }) => {
            let orderStatus: OrderStatusDetail['status'] = 'WAITING';
            let currentFlightId = undefined;
            let nextAirport = undefined;
            let currentSegDep = undefined;
            let currentSegArr = undefined;

            const quantity = (plan.routes || []).reduce((sum: number, r: { quantity?: number }) => sum + (r.quantity || 0), 0);

            let slackVal = 10;
            if (typeof plan.slack === 'string') slackVal = 10;
            else if (typeof plan.slackMinutes === 'number') slackVal = plan.slackMinutes;

            const isDelayed = slackVal <= 0;
            if (isDelayed) countDelayed++;

            const routes = plan.routes || [];

            const allSegments = routes.flatMap((r: { segments?: any[]; quantity?: number }) => r.segments || []).map((s: any) => {
                const fixDate = (d: string) => {
                    if (!d) return new Date().toISOString();
                    if (d.includes('T') && !d.endsWith('Z') && !d.includes('+') && !d.includes('-')) return d + 'Z';
                    return d;
                };

                const flightId = s.flight?.id || s.flightId || "FL-UNK";
                uniqueFlightsTotal.add(flightId);

                return {
                    flightId: flightId,
                    origin: s.flight?.origin?.code || s.flight?.originCode || s.from || s.origin,
                    destination: s.flight?.destination?.code || s.flight?.destinationCode || s.to || s.destination,
                    departure: fixDate(s.exactDepDateTime || s.departureUtc || s.departure),
                    arrival: fixDate(s.exactArrDateTime || s.arrivalUtc || s.arrival),
                    capacity: s.flight?.dailyCapacity || s.flight?.capacity || 300,
                    routeQuantity: s.routeQuantity || quantity
                };
            }).filter((s: any) => s.origin && s.destination);

            if (allSegments.length === 0) return;

            const firstDep = new Date(allSegments[0].departure).getTime();
            const lastArr = new Date(allSegments[allSegments.length - 1].arrival).getTime();

            const totalDuration = lastArr - firstDep;
            const elapsedTotal = currentMs - firstDep;
            const totalProgress = totalDuration > 0
                ? Math.min(100, Math.max(0, (elapsedTotal / totalDuration) * 100))
                : 0;

            if (currentMs < firstDep) {
                orderStatus = 'WAITING';
                currentFlightId = allSegments[0].flightId;
                nextAirport = allSegments[0].destination;
                currentSegDep = allSegments[0].departure;
                currentSegArr = allSegments[0].arrival;

                const code = allSegments[0].origin;
                tempStocks[code] = (tempStocks[code] || 0) + quantity;

            } else if (currentMs > lastArr) {
                orderStatus = 'COMPLETED';
                const code = allSegments[allSegments.length - 1].destination;
                tempStocks[code] = (tempStocks[code] || 0) + quantity;

            } else {
                countInTransit++;
                let inAir = false;

                for (const seg of allSegments) {
                    const depMs = new Date(seg.departure).getTime();
                    const arrMs = new Date(seg.arrival).getTime();
                    const uniqueId = `${seg.flightId}-${seg.departure}`;

                    if (currentMs >= depMs && currentMs <= arrMs) {
                        inAir = true;
                        orderStatus = 'IN_FLIGHT';
                        currentFlightId = seg.flightId;
                        nextAirport = seg.destination;

                        currentSegDep = seg.departure;
                        currentSegArr = seg.arrival;

                        const origin = airportMap.get(seg.origin);
                        const dest = airportMap.get(seg.destination);

                        if (origin && dest) {
                            if (!mapSegmentos.has(uniqueId)) {
                                mapSegmentos.set(uniqueId, {
                                    id: uniqueId,
                                    flightId: seg.flightId ?? 'FL-UNK',
                                    origin: seg.origin ?? 'UNK',
                                    destination: seg.destination ?? 'UNK',
                                    departureUtc: seg.departure ?? '',
                                    arrivalUtc: seg.arrival ?? '',
                                    orderIds: [plan.orderId ?? 'UNK'],
                                    retrasado: isDelayed,
                                    routeQuantity: seg.routeQuantity ?? quantity
                                });
                            } else {
                                mapSegmentos.get(uniqueId)?.orderIds.push(plan.orderId ?? 'UNK');
                            }

                            const pct = ((currentMs - depMs) / (arrMs - depMs)) * 100;

                            if (!mapVuelos.has(uniqueId)) {
                                mapVuelos.set(uniqueId, {
                                    id: uniqueId,
                                    orderId: plan.orderId ?? 'UNK',
                                    flightId: seg.flightId ?? 'FL-UNK',
                                    latActual: origin[0] + (dest[0] - origin[0]) * (pct / 100),
                                    lonActual: origin[1] + (dest[1] - origin[1]) * (pct / 100),
                                    progreso: pct,
                                    estadoVisual: isDelayed ? 'retrasado' : 'en curso',
                                    origenCode: seg.origin ?? 'UNK',
                                    destinoCode: seg.destination ?? 'UNK',
                                    salidaProgramada: seg.departure ?? '',
                                    llegadaProgramada: seg.arrival ?? '',
                                    capacidadTotal: seg.capacity ?? 0,
                                    capacidadUsada: seg.routeQuantity ?? 0,
                                    pedidos: [{
                                        orderId: plan.orderId ?? 'UNK',
                                        cliente: plan.customerReference || "N/A",
                                        fechaCreacion: plan.creationUtc || "---",
                                        cantidad: seg.routeQuantity ?? 0
                                    }]
                                        cantidad: seg.routeQuantity
                                    }],
                                    orderId: ''
                                });
                            } else {
                                const v = mapVuelos.get(uniqueId);
                                if(v) {
                                    if (!v.pedidos.some(p => p.orderId === (plan.orderId ?? 'UNK'))) {
                                        v.capacidadUsada += seg.routeQuantity ?? 0;
                                        v.pedidos.push({
                                            orderId: plan.orderId ?? 'UNK',
                                            cliente: plan.customerReference || "N/A",
                                            fechaCreacion: plan.creationUtc || "---",
                                            cantidad: seg.routeQuantity ?? 0
                                        });
                                        if (isDelayed) v.estadoVisual = 'retrasado';
                                    }
                                }
                            }
                        }
                        break;
                    }
                }

                if (!inAir && currentMs <= lastArr) {
                    orderStatus = 'LAYOVER';

                    for (let i = 0; i < allSegments.length - 1; i++) {
                        const arrCurrent = new Date(allSegments[i].arrival).getTime();
                        const depNext = new Date(allSegments[i+1].departure).getTime();

                        if (currentMs >= arrCurrent && currentMs <= depNext) {
                            const code = allSegments[i].destination;
                            tempStocks[code] = (tempStocks[code] || 0) + quantity;
                            break;
                        }
                    }
                }
            }

            processedOrders.push({
                orderId: plan.orderId ?? 'UNK',
                status: orderStatus,
                currentFlightId: currentFlightId,
                nextAirport: nextAirport,
                finalDestination: allSegments[allSegments.length - 1].destination ?? 'UNK',
                departureTime: allSegments[0].departure ?? '',
                arrivalTime: allSegments[allSegments.length - 1].arrival ?? '',
                currentSegDeparture: currentSegDep ?? '',
                currentSegArrival: currentSegArr ?? '',
                progress: totalProgress,
                isDelayed: isDelayed,
                originAirport: allSegments[0].origin ?? 'UNK',
                quantity: quantity
            });
        });

        const total = processedOrders.length;
        const sla = total > 0 ? ((total - countDelayed) / total) * 100 : 100;

        setMetrics({
            totalOrders: total,
            ordersInTransit: countInTransit,
            totalFlights: uniqueFlightsTotal.size,
            activeFlights: mapVuelos.size,
            slaPercentage: sla,
            delayedOrders: countDelayed
        });

        setActiveSegments(Array.from(mapSegmentos.values()));
        setVuelosEnMovimiento(Array.from(mapVuelos.values()));
        setOrderStatusList(processedOrders);
        setAirportStocks(tempStocks);

    }, [simClock, dayPlan, aeropuertos]);

    return {
        aeropuertos,
        activeSegments,
        vuelosEnMovimiento,
        orderStatusList,
        airportStocks,
        metrics,
        status,
        simClock,
        actions: {
            planificar: runPlanningMutation.mutate,
            setManualTime,
            resetTime
        },
        isReplanning,
        lastUpdated,
    };
};
