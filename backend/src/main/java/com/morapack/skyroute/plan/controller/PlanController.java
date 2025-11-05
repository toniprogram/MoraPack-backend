package com.morapack.skyroute.plan.controller;

import com.morapack.skyroute.models.CurrentPlan;
import com.morapack.skyroute.plan.repository.CurrentPlanRepository;
import com.morapack.skyroute.plan.service.PlanningService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/plan")
public class PlanController {

    private final PlanningService planningService;
    private final CurrentPlanRepository currentPlanRepository;

    public PlanController(PlanningService planningService,
                          CurrentPlanRepository currentPlanRepository) {
        this.planningService = planningService;
        this.currentPlanRepository = currentPlanRepository;
    }

    @PostMapping("/run")
    public ResponseEntity<CurrentPlan> runAlgorithm() {
        CurrentPlan plan = planningService.run();
        return ResponseEntity.ok(plan);
    }

    @GetMapping("/current")
    public CurrentPlan getCurrentPlan() {
        return currentPlanRepository.findById(1L).orElseThrow();
    }
}
