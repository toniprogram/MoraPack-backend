package com.morapack.skyroute.simulation.dto;

import com.morapack.skyroute.orders.dto.OrderRequest;

import java.util.List;

public record SimulationStartRequest(List<OrderRequest> orders) {}
