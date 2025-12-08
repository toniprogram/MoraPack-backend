package com.morapack.skyroute.simulation.live;

import java.time.Instant;
import java.util.List;
import com.morapack.skyroute.simulation.dto.OrderLoadTick;

public record FlightUsageReport(
        String flightId,
        String origin,
        String destination,
        Instant departureTime,
        Instant arrivalTime,
        int capacityTotal,
        int capacityUsed,
        double utilization,
        List<OrderLoadTick> ordersCarried
) {}
