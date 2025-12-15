package com.morapack.skyroute.simulation.service;

import com.morapack.skyroute.algorithm.Individual;
import com.morapack.skyroute.base.repository.FlightRepository;
import com.morapack.skyroute.models.Flight;
import com.morapack.skyroute.models.Route;
import com.morapack.skyroute.models.RouteSegment;
import com.morapack.skyroute.simulation.model.*;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Component
public class SimulationPlanMapper {
    private final FlightRepository flightRepository;

    public SimulationPlanMapper(FlightRepository flightRepository) {
        this.flightRepository = flightRepository;
    }

    public SimulationPlan toEntity(String simulationId, Individual individual) {
        SimulationPlan plan = new SimulationPlan();
        plan.setSimulationId(simulationId);
        plan.setGeneratedAt(LocalDateTime.now());
        plan.setFitness(individual.getFitness());
        plan.setSlaCompliant(individual.isSlaCompliant());
        plan.setSlaViolations(individual.getSlaViolations());

        List<SimulationOrderPlan> mappedPlans = individual.getPlans().stream()
                .map(original -> mapOrderPlan(simulationId, original, plan))
                .collect(Collectors.toCollection(ArrayList::new));
        plan.setOrderPlans(mappedPlans);
        return plan;
    }

    private SimulationOrderPlan mapOrderPlan(String simulationId,
                                             com.morapack.skyroute.models.OrderPlan original,
                                             SimulationPlan parentPlan) {
        SimulationOrderPlan copy = new SimulationOrderPlan();
        copy.setOrderId(original.getOrderId());
        copy.setSlack(original.getSlack());
        copy.setStatus("WAITING");
        copy.setPlan(parentPlan);

        List<SimulationRoute> routes = original.getRoutes() == null
                ? new ArrayList<>()
                : original.getRoutes().stream()
                .map(this::mapRoute)
                .collect(Collectors.toCollection(ArrayList::new));
        copy.setRoutes(routes);
        return copy;
    }

    public SimulationRoute mapRoute(Route original) {
        SimulationRoute copy = new SimulationRoute();
        copy.setQuantity(original.getQuantity());
        copy.setSlack(original.getSlack());

        List<SimulationRouteSegment> segments = original.getSegments() == null
                ? new ArrayList<>()
                : original.getSegments().stream()
                .map(this::mapRouteSegment)
                .collect(Collectors.toCollection(ArrayList::new));
        copy.setSegments(segments);
        segments.forEach(seg -> seg.setRoute(copy));
        return copy;
    }

    private SimulationRouteSegment mapRouteSegment(RouteSegment original) {
        SimulationRouteSegment copy = new SimulationRouteSegment();
        String flightId = original.getFlight().getId();
        Flight persistedFlight = flightRepository.findById(flightId)
                .orElseThrow(() -> new IllegalStateException("Flight not found for segment: " + flightId));
        copy.setFlight(persistedFlight);
        copy.setDate(original.getDate());
        copy.setRouteQuantity(original.getRouteQuantity());
        copy.setDeparted(original.isDeparted());
        copy.setArrived(original.isArrived());
        copy.setReceivedByNext(original.isReceivedByNext());
        copy.setFinalLeg(original.isFinalLeg());
        copy.setSlack(original.getSlack());
        return copy;
    }
}
