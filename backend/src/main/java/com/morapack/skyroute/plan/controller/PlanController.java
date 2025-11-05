package com.morapack.skyroute.plan.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.morapack.skyroute.models.CurrentPlan;
import com.morapack.skyroute.plan.repository.CurrentPlanRepository;
import com.morapack.skyroute.plan.service.PlanningService;

@RestController
@RequestMapping("/api/plan")
public class PlanController {
    @Autowired PlanningService planningService;
    @Autowired CurrentPlanRepository repo;

    @PostMapping("/run")
    public ResponseEntity<?> runAlgorithm() {
        planningService.run();
        return ResponseEntity.ok("Plan actualizado");
    }

    @GetMapping("/current")
    public CurrentPlan getCurrentPlan() {
        return repo.findById(1L).orElseThrow();
    }
}
