package com.morapack.skyroute.operation.controller;

import com.morapack.skyroute.operation.service.OperationSimulationService;
import lombok.Data;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;

@RestController
@RequestMapping("/api/operation")
public class OperationController {

    private final OperationSimulationService simulationService;

    public OperationController(OperationSimulationService simulationService) {
        this.simulationService = simulationService;
    }

    /**
     * Inicializa o rehidrata el mundo de operación en la hora solicitada.
     * Si no se envía simTime, se usa el instante actual (UTC).
     */
    @PostMapping("/world")
    public ResponseEntity<Void> initialize(@RequestBody(required = false) OperationTimeRequest request) {
        Instant simTime = parse(request);
        simulationService.initialize(simTime);
        return ResponseEntity.status(HttpStatus.ACCEPTED).build();
    }

    /**
     * Reposiciona el mundo de operación a la hora indicada. Equivale a recrear el mundo.
     */
    @PostMapping("/world/time")
    public ResponseEntity<Void> setTime(@RequestBody OperationTimeRequest request) {
        Instant simTime = parse(request);
        simulationService.setSimTime(simTime);
        return ResponseEntity.status(HttpStatus.ACCEPTED).build();
    }

    private Instant parse(OperationTimeRequest req) {
        if (req == null || req.getSimTime() == null || req.getSimTime().isBlank()) {
            return Instant.now();
        }
        try {
            return Instant.parse(req.getSimTime());
        } catch (Exception ex) {
            return Instant.now();
        }
    }

    @Data
    public static class OperationTimeRequest {
        private String simTime;
    }
}
