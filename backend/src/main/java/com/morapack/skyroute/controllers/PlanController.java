package com.morapack.skyroute.controllers;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.morapack.skyroute.models.CurrentPlan;
import com.morapack.skyroute.repositories.CurrentPlanRepository;
import com.morapack.skyroute.services.PlanningService;

@RestController
@RequestMapping("/plan")
public class PlanController {
    @Autowired PlanningService planningService;
    @Autowired CurrentPlanRepository repo;

    @PostMapping("plan/run")
    public ResponseEntity<?> runAlgorithm() {
        planningService.run();
        return ResponseEntity.ok("Plan actualizado");
    }

    @GetMapping("/current")
    public CurrentPlan getCurrentPlan() {
        return repo.findById(1L).orElseThrow();
    }
}
