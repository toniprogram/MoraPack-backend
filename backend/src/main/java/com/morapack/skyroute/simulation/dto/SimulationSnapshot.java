package com.morapack.skyroute.simulation.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record SimulationSnapshot(
        String simulationId,
        int processedOrders,
        int totalOrders,
        double fitness,
        Instant generatedAt,
        List<SimulationOrderPlan> orderPlans
) {}

public record SimulationOrderPlan(
        String orderId,
        long slackMinutes,
        List<SimulationRoute> routes
) {}

public record SimulationRoute(
        int quantity,
        long slackMinutes,
        List<SimulationSegment> segments
) {}

public record SimulationSegment(
        String flightId,
        String origin,
        String destination,
        LocalDate date,
        int quantity,
        Instant departureUtc,
        Instant arrivalUtc
) {}
