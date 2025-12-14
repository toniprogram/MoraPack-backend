package com.morapack.skyroute.simulation.dto;

import java.util.List;

/**
 * Resumen ligero de plan por pedido para consumo en cada tick.
 * Incluye solo lo necesario para dibujar (holgura + segmentos).
 */
public record SimulationPlanSummary(
        String orderId,
        long slackMinutes,
        List<SimulationSegment> segments
) {}
