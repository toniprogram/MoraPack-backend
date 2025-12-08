package com.morapack.skyroute.simulation.dto;

import java.time.Instant;
import java.util.List;

public record OrderPlansDiff(
        Instant simTime,
        List<SimulationOrderPlan> added,
        List<SimulationOrderPlan> updated,
        List<String> removed
) {}
