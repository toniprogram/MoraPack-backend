package com.morapack.skyroute.simulation.dto;

import java.time.Instant;

public record DeliveredOrderDto(
        String orderId,
        int deliveredQty,
        String location,
        Instant deliveredAt,
        Instant simTime
) {}
