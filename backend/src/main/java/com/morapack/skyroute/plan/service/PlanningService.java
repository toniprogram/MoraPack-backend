package com.morapack.skyroute.plan.service;

import com.morapack.skyroute.algorithm.GeneticAlgorithm;
import com.morapack.skyroute.algorithm.Individual;
import com.morapack.skyroute.config.Config;
import com.morapack.skyroute.models.CurrentPlan;
import com.morapack.skyroute.plan.repository.CurrentPlanRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PlanningService {

    private final WorldBuilder worldBuilder;
    private final Mapper mapper;
    private final CurrentPlanRepository planRepository;

    public PlanningService(WorldBuilder worldBuilder,
                           Mapper mapper,
                           CurrentPlanRepository planRepository) {
        this.worldBuilder = worldBuilder;
        this.mapper = mapper;
        this.planRepository = planRepository;
    }

    @Transactional
    public CurrentPlan run() {
        WorldBuilder.Snapshot snapshot = worldBuilder.buildOperationalSnapshot();
        if (snapshot.demand().isEmpty()) {
            throw new IllegalStateException("No orders available to run the genetic algorithm.");
        }

        GeneticAlgorithm geneticAlgorithm = new GeneticAlgorithm(snapshot.world(), snapshot.demand());
        Individual best = geneticAlgorithm.run(Config.POP_SIZE, Config.MAX_GEN);
        CurrentPlan entity = mapper.toEntity(best);
        planRepository.save(entity);
        return entity;
    }
}
