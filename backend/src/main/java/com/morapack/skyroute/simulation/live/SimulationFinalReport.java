package com.morapack.skyroute.simulation.live;

import java.time.Instant;
import java.util.List;

public record SimulationFinalReport(
        String simulationId,
        Instant startTime,
        Instant endTime,
        List<OrderFinalReport> orders,
        double avgDeliveryMinutes,
        double avgFlightUtilization,
        int totalOrders,
        int deliveredOrders,
        int totalQuantity,
        int deliveredQuantity,
        List<FlightUsageReport> flights,
        List<AirportUsageReport> airports
) {}
