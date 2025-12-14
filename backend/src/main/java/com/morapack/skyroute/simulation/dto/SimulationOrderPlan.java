package com.morapack.skyroute.simulation.dto;

import java.util.List;

public record SimulationOrderPlan(
        String orderId,
        java.time.Instant creationUtc,
        long slackMinutes,
        List<SimulationRoute> routes
) {}
