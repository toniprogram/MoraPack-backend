package com.morapack.skyroute.simulation.dto;

import java.util.List;

public record SimulationOrderPlanPage(
        long total,
        int page,
        int size,
        List<SimulationOrderPlanItem> items
) {}
