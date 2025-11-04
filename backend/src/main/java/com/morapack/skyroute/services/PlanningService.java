package com.morapack.skyroute.services;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.morapack.skyroute.algorithm.GeneticAlgorithm;
import com.morapack.skyroute.algorithm.Individual;
import com.morapack.skyroute.config.World;
import com.morapack.skyroute.models.CurrentPlan;
import com.morapack.skyroute.repositories.CurrentPlanRepository;

@Service
public class PlanningService {
    @Autowired GeneticAlgorithm ga;
    @Autowired CurrentPlanRepository planRepo;
    @Autowired Mapper mapper;

    public void run() {
        World world = worldBuilder.buildFromDatabase();
        Individual best = ga.run(world);
        CurrentPlan entity = mapper.toEntity(best);
        planRepo.save(entity);
    }
}