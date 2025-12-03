package com.morapack.skyroute.simulation.live;

import java.time.Instant;
import java.util.List;

public record OrderFinalReport(
        String orderId,
        int totalQuantity,
        int deliveredQuantity,
        String finalStatus,
        Instant firstPickupTime,
        Instant deliveryTime,
        long totalTransitMinutes,
        List<OrderFlightLeg> routeTaken,
        List<OrderEvent> history
) {}
