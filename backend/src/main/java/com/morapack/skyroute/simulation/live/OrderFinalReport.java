package com.morapack.skyroute.simulation.live;

import java.time.Instant;
import java.util.List;

public record OrderFinalReport(
        String orderId,
        int totalQuantity,
        int deliveredQuantity,
        String finalStatus,
        String destination,
        Instant creationUtc,
        Instant dueUtc,
        Instant firstPickupTime,
        Instant deliveryTime,
        long totalTransitMinutes,
        Long slackMinutes,
        List<OrderFlightLeg> routeTaken,
        List<OrderEvent> history
) {}
