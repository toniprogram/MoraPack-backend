package com.morapack.skyroute.simulation.service;

import java.util.List;

import org.springframework.stereotype.Service;

import com.morapack.skyroute.models.Order;

/**
 * Placeholder for the simulation flow described in the integration guide.
 * The concrete implementation is pending the definition of the simulation
 * pipeline (world snapshot, GA execution loop, transient storage, etc.).
 */
@Service
public class SimulationService {

    public void simulate(List<Order> projectedOrders) {
        throw new UnsupportedOperationException("Simulation mode not implemented yet.");
    }
}
