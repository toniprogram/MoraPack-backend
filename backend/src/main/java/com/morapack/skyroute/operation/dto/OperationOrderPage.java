package com.morapack.skyroute.operation.dto;

import java.util.List;

public record OperationOrderPage(
        long total,
        int page,
        int size,
        List<OperationOrderDto> items
) {}
