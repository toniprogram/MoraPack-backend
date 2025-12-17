package com.morapack.skyroute.simulation.dto;

public record SimulationOrderPlanItem(
        String orderId,
        String status,
        long slackMinutes,
        java.util.List<SimulationRoute> routes,
        java.time.Instant creationUtc
) {}
