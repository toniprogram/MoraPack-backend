package com.morapack.skyroute.simulation.dto;

import java.time.Instant;
import java.util.List;

public record SimulationTick(
        String simulationId,
        Instant simTime,
        double speed,
        String status,
        List<SimulationOrderPlan> orderPlans,
        OrderPlansDiff orderPlansDiff,
        List<ActiveSegment> activeSegments,
        List<ActiveAirportTick> activeAirports,
        int deliveredOrders,
        int inTransitOrders,
        java.util.List<OrderStatusTick> orderStatuses
) {}
