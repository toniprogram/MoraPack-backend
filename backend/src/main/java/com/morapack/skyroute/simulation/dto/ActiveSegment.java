package com.morapack.skyroute.simulation.dto;

public record ActiveSegment(
        String id,
        String flightId,
        String origin,
        String destination,
        String departureUtc,
        String arrivalUtc,
        java.util.List<String> orderIds,
        int capacityUsed,
        int capacityTotal,
        java.util.List<OrderLoadTick> orderLoads
) {}
