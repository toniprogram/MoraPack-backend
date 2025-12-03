package com.morapack.skyroute.simulation.live;

import java.time.Instant;

public record OrderEvent(
        Instant time,
        String type,
        String location,
        String flightId,
        int quantity
) {}
