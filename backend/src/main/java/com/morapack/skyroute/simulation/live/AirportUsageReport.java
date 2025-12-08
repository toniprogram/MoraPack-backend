package com.morapack.skyroute.simulation.live;

public record AirportUsageReport(
        String airportCode,
        int maxThroughputPerHour,
        int finalLoad,
        int maxObservedLoad
) {}
