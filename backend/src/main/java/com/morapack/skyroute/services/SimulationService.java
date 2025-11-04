package com.morapack.skyroute.services;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.morapack.skyroute.algorithm.GeneticAlgorithm;
import com.morapack.skyroute.algorithm.Individual;
import com.morapack.skyroute.config.World;
import com.morapack.skyroute.models.Order;
import com.morapack.skyroute.state.ActivePlan;

@Service
public class SimulationService {
    @Autowired GeneticAlgorithm ga;
    @Autowired ActivePlan activePlan;

    public void simulate(List<Order> projectedOrders) {
        World world = new World();
        world.loadBaseData(); // airports + flights
        for (Order o : projectedOrders) {
            world.addOrder(o);
            Individual best = ga.run(world);
            activePlan.update(world, best);
        }
    }
}