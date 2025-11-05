package com.morapack.skyroute.plan.controller;

import com.morapack.skyroute.models.CurrentPlan;
import com.morapack.skyroute.plan.service.CurrentPlanService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/current-plan")
public class CurrentPlanController {

    private final CurrentPlanService currentPlanService;

    public CurrentPlanController(CurrentPlanService currentPlanService) {
        this.currentPlanService = currentPlanService;
    }

    @GetMapping
    public ResponseEntity<CurrentPlan> getCurrentPlan() {
        CurrentPlan plan = currentPlanService.getCurrentPlan();
        return (plan != null)
                ? ResponseEntity.ok(plan)
                : ResponseEntity.notFound().build();
    }

    @PostMapping
    public ResponseEntity<CurrentPlan> createOrUpdate(@RequestBody CurrentPlan plan) {
        CurrentPlan saved = currentPlanService.createOrUpdate(plan);
        return ResponseEntity.ok(saved);
    }

    @DeleteMapping
    public ResponseEntity<Void> delete() {
        currentPlanService.deleteCurrentPlan();
        return ResponseEntity.noContent().build();
    }
}
