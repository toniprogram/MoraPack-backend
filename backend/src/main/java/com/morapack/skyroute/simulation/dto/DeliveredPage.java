package com.morapack.skyroute.simulation.dto;

import java.util.List;

public record DeliveredPage(
        long total,
        int page,
        int size,
        List<DeliveredOrderDto> items
) {}
