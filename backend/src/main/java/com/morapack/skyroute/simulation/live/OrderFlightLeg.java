package com.morapack.skyroute.simulation.live;

import java.time.Instant;

public record OrderFlightLeg(
        String flightId,
        String origin,
        String destination,
        Instant departureTime,
        Instant arrivalTime,
        int quantity
) {}
