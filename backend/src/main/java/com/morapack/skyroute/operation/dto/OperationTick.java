package com.morapack.skyroute.operation.dto;

import com.morapack.skyroute.simulation.dto.*;
import java.time.Instant;
import java.util.List;

public record OperationTick(
        String operationId,
        Instant simTime,
        long realElapsedMs,
        double speed,
        String status,
        List<SimulationOrderPlan> orderPlans,
        OrderPlansDiff orderPlansDiff,

        List<ActiveSegment> activeSegments, // Vuelos CON carga (Pesados)
        List<GhostFlightTick> ghostFlights, // Vuelos VACÍOS (Ligeros) <--- CAMBIO AQUÍ

        List<ActiveAirportTick> activeAirports,
        int deliveredOrders,
        int inTransitOrders,
        List<OrderStatusTick> orderStatuses,
        List<OrderStatusTick> deliveredStatuses,
        List<OrderStatusTick> plannedStatuses,
        List<String> nowInTransitIds,
        List<SimulationPlanSummary> planSummaries,
        List<String> changedOrderIds
) {}