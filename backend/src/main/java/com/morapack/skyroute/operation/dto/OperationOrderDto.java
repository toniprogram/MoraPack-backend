package com.morapack.skyroute.operation.dto;

import java.time.Instant;
import java.util.List;

public record OperationOrderDto(
        String orderId,
        int quantity,
        Instant creationUtc,
        String origin,
        String destination,
        Long slackMinutes,
        String status,
        List<OperationRouteDto> routes
) {}
