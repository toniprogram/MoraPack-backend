package com.morapack.skyroute.simulation.controller;

import com.morapack.skyroute.simulation.dto.PrewarmResponse;
import com.morapack.skyroute.simulation.dto.SimulationStartRequest;
import com.morapack.skyroute.simulation.dto.SimulationStartResponse;
import com.morapack.skyroute.simulation.dto.SimulationStatus;
import com.morapack.skyroute.simulation.live.SimulationFinalReport;
import com.morapack.skyroute.simulation.service.SimulationService;
import com.morapack.skyroute.simulation.dto.DeliveredPage;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/simulations")
public class SimulationController {

    private final SimulationService simulationService;

    public SimulationController(SimulationService simulationService) {
        this.simulationService = simulationService;
    }

    @PostMapping
    public ResponseEntity<SimulationStartResponse> start(@RequestBody SimulationStartRequest request) {
        SimulationStartResponse response = simulationService.startSimulation(request);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(response);
    }

    @PostMapping("/prewarm")
    public PrewarmResponse prewarm() {
        return simulationService.prewarmWorld();
    }

    @GetMapping("/{simulationId}/status")
    public SimulationStatus status(@PathVariable UUID simulationId) {
        return simulationService.getStatus(simulationId);
    }

    @PostMapping("/{simulationId}/pause")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void pause(@PathVariable UUID simulationId) {
        simulationService.pause(simulationId);
    }

    @PostMapping("/{simulationId}/resume")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resume(@PathVariable UUID simulationId) {
        simulationService.resume(simulationId);
    }

    @PostMapping("/{simulationId}/touch")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void touch(@PathVariable UUID simulationId) {
        simulationService.touch(simulationId);
    }

    @DeleteMapping("/{simulationId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@PathVariable UUID simulationId) {
        simulationService.cancel(simulationId);
    }

    @GetMapping("/{simulationId}/report")
    public SimulationFinalReport report(@PathVariable UUID simulationId) {
        return simulationService.getReport(simulationId);
    }

    @GetMapping("/{simulationId}/deliveries")
    public DeliveredPage delivered(@PathVariable UUID simulationId,
                                   @RequestParam(defaultValue = "0") int page,
                                   @RequestParam(defaultValue = "20") int size,
                                   @RequestParam(required = false) String search) {
        return simulationService.getDelivered(simulationId, page, size, search);
    }
}
