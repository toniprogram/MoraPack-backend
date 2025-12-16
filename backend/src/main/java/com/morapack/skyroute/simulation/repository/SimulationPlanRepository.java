package com.morapack.skyroute.simulation.repository;

import com.morapack.skyroute.simulation.model.SimulationPlan;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SimulationPlanRepository extends JpaRepository<SimulationPlan, Long> {
    Optional<SimulationPlan> findBySimulationId(String simulationId);
    void deleteBySimulationId(String simulationId);
}
