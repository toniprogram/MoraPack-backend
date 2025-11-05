package com.morapack.skyroute.orders.dto;

import java.time.Instant;

public record OrderRequest(
        String id,
        String customerReference,
        String destinationAirportCode,
        Integer quantity,
        Instant creationUtc,
        Instant dueUtc
) {}
