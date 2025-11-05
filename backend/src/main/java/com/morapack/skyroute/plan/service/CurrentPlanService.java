package com.morapack.skyroute.plan.service;

import com.morapack.skyroute.models.CurrentPlan;
import com.morapack.skyroute.plan.repository.CurrentPlanRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Optional;

@Service
public class CurrentPlanService {

    private final CurrentPlanRepository currentPlanRepository;

    public CurrentPlanService(CurrentPlanRepository currentPlanRepository) {
        this.currentPlanRepository = currentPlanRepository;
    }

    public CurrentPlan getCurrentPlan() {
        return currentPlanRepository.findById(1L).orElse(null);
    }

    public CurrentPlan createOrUpdate(CurrentPlan plan) {
        plan.setId(1L); // asegurar singleton
        plan.setGeneratedAt(LocalDateTime.now());
        return currentPlanRepository.save(plan);
    }

    public void deleteCurrentPlan() {
        currentPlanRepository.deleteById(1L);
    }

    public Optional<CurrentPlan> findById(Long id) {
        return currentPlanRepository.findById(id);
    }
}
