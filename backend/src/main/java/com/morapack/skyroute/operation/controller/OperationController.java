package com.morapack.skyroute.operation.controller;

import com.morapack.skyroute.operation.service.OperationSimulationService;
import lombok.Data;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import com.morapack.skyroute.operation.dto.OperationOrderPage;
import com.morapack.skyroute.operation.dto.OperationOrderDto;
import com.morapack.skyroute.operation.dto.OperationRouteDto;
import com.morapack.skyroute.operation.dto.OperationSegmentDto;
import com.morapack.skyroute.models.CurrentPlan;
import com.morapack.skyroute.models.OrderPlan;
import com.morapack.skyroute.models.Route;
import com.morapack.skyroute.models.RouteSegment;
import com.morapack.skyroute.plan.service.PlanningService;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/operation")
public class OperationController {

    private final OperationSimulationService simulationService;
    private final PlanningService planningService;

    public OperationController(OperationSimulationService simulationService,
                               PlanningService planningService) {
        this.simulationService = simulationService;
        this.planningService = planningService;
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

    /**
     * Devuelve pedidos del plan vigente con estado calculado para la hora solicitada.
     */
    @GetMapping("/orders")
    public OperationOrderPage listOrders(@RequestParam(required = false) String simTime,
                                         @RequestParam(defaultValue = "0") int page,
                                         @RequestParam(defaultValue = "10") int size) {
        CurrentPlan plan = planningService.getCurrentPlan()
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.NOT_FOUND, "No hay plan vigente"));
        Instant clock = simTime != null && !simTime.isBlank() ? parseString(simTime) : Instant.now();

        List<OperationOrderDto> all = new ArrayList<>();
        for (OrderPlan op : plan.getOrderPlans()) {
            var routes = op.getRoutes() == null ? List.<Route>of() : op.getRoutes();
            int qtyTotal = routes.stream().mapToInt(Route::getQuantity).sum();
            var segments = routes.stream()
                    .flatMap(r -> (r.getSegments() == null ? List.<RouteSegment>of().stream() : r.getSegments().stream()))
                    .sorted(Comparator.comparing(seg -> seg.getExactDepDateTime().toInstant(ZoneOffset.UTC)))
                    .toList();
            if (segments.isEmpty()) continue;
            Instant firstDep = segments.get(0).getFlight().getDepartureInstant(segments.get(0).getDate());
            Instant lastArr = segments.get(segments.size() - 1).getFlight().getArrivalInstant(segments.get(segments.size() - 1).getDate());
            String status;
            if (clock.isBefore(firstDep)) status = "PLANNED";
            else if (clock.isAfter(lastArr)) status = "DELIVERED";
            else status = "IN_TRANSIT";

            String origin = segments.get(0).getFlight().getOriginCode();
            String destination = segments.get(segments.size() - 1).getFlight().getDestinationCode();
            Long slackMin = op.getSlack() != null ? op.getSlack().toMinutes() : null;

            var routeDtos = routes.stream().map(r -> {
                var dto = new OperationRouteDto();
                dto.setQuantity(r.getQuantity());
                var segDtos = (r.getSegments() == null ? List.<RouteSegment>of() : r.getSegments()).stream().map(seg -> {
                    var sdto = new OperationSegmentDto();
                    sdto.setFlightId(seg.getFlight() != null ? seg.getFlight().getId() : null);
                    sdto.setOrigin(seg.getFlight() != null ? seg.getFlight().getOriginCode() : null);
                    sdto.setDestination(seg.getFlight() != null ? seg.getFlight().getDestinationCode() : null);
                    sdto.setDepartureUtc(seg.getFlight() != null ? seg.getFlight().getDepartureInstant(seg.getDate()) : null);
                    sdto.setArrivalUtc(seg.getFlight() != null ? seg.getFlight().getArrivalInstant(seg.getDate()) : null);
                    // MODIFICADO: Usamos r.getQuantity() (cantidad de la ruta padre)
                    // en lugar de seg.getRouteQuantity() para visualización coherente.
                    sdto.setQuantity(r.getQuantity());
                    return sdto;
                }).collect(Collectors.toList());
                dto.setSegments(segDtos);
                return dto;
            }).collect(Collectors.toList());

            all.add(new OperationOrderDto(
                    op.getOrderId(),
                    qtyTotal,
                    null,
                    origin,
                    destination,
                    slackMin,
                    status,
                    routeDtos
            ));
        }

        int from = Math.max(0, page * size);
        int to = Math.min(all.size(), from + size);
        List<OperationOrderDto> items = from >= all.size() ? List.of() : all.subList(from, to);
        return new OperationOrderPage(all.size(), page, size, items);
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

    private Instant parseString(String simTime) {
        try {
            return Instant.parse(simTime);
        } catch (Exception ex) {
            return Instant.now();
        }
    }

    @Data
    public static class OperationTimeRequest {
        private String simTime;
    }
}