package com.morapack.skyroute.simulation.dto;

public record OrderStatusTick(
        String orderId,
        String status,   // PLANNED, IN_TRANSIT, READY_PICKUP
        String location, // airport code (current)
        int quantity
) {}
