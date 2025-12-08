package com.morapack.skyroute.simulation.dto;

public record ActiveAirportTick(
        String airportCode,
        int currentLoad,
        int maxThroughputPerHour,
        java.util.List<OrderLoadTick> orderLoads
) {}
