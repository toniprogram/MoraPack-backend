package com.morapack.skyroute.operation.dto;

public record GhostFlightTick(
        String id,
        double lat,
        double lon,
        double angle,
        String origin,
        String destination,
        String departureTime, // ISO String
        String arrivalTime    // ISO String
) {}