package com.morapack.skyroute.plan.service;

import com.morapack.skyroute.algorithm.GeneticAlgorithm;
import com.morapack.skyroute.algorithm.Individual;
import com.morapack.skyroute.config.Config;
import com.morapack.skyroute.models.CurrentPlan;
import com.morapack.skyroute.models.Flight;
import com.morapack.skyroute.models.FlightCapacity;
import com.morapack.skyroute.models.Route;
import com.morapack.skyroute.models.RouteSegment;
import com.morapack.skyroute.plan.repository.CurrentPlanRepository;
import com.morapack.skyroute.capacity.repository.FlightCapacityRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.morapack.skyroute.models.OrderPlan;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class PlanningService {

    private final WorldBuilder worldBuilder;
    private final Mapper mapper;
    private final CurrentPlanRepository planRepository;
    private final FlightCapacityRepository flightCapacityRepository;

    public PlanningService(WorldBuilder worldBuilder,
                           Mapper mapper,
                           CurrentPlanRepository planRepository,
                           FlightCapacityRepository flightCapacityRepository) {
        this.worldBuilder = worldBuilder;
        this.mapper = mapper;
        this.planRepository = planRepository;
        this.flightCapacityRepository = flightCapacityRepository;
    }

    @Transactional
    public CurrentPlan run() {
        // 1. Obtener datos del mundo
        WorldBuilder.Snapshot snapshot = worldBuilder.buildOperationalSnapshot();
        if (snapshot.demand().isEmpty()) {
            throw new IllegalStateException("No orders available to run the genetic algorithm.");
        }
        // 2. Ejecutar Algoritmo Genético
        GeneticAlgorithm geneticAlgorithm = new GeneticAlgorithm(snapshot.world(), snapshot.demand());
        Individual best = geneticAlgorithm.run(Config.POP_SIZE, Config.OPERATION_MAX_GEN);
        CurrentPlan newResult = mapper.toEntity(best);
        // 3. Obtener el plan actual con BLOQUEO (para seguridad en concurrencia)
        Optional<CurrentPlan> dbPlanOpt = planRepository.findByIdWithLock(1L);
        CurrentPlan planToSave;
        if (dbPlanOpt.isPresent()) {
            CurrentPlan dbPlan = dbPlanOpt.get();
            // Inicializar lista si es nula
            if (dbPlan.getOrderPlans() == null) {
                dbPlan.setOrderPlans(new ArrayList<>());
            }
            // A. Recolectar IDs existentes
            Set<String> existingOrderIds = dbPlan.getOrderPlans().stream()
                    .map(OrderPlan::getOrderId)
                    .collect(Collectors.toSet());
            // B. Filtrar los nuevos (evitar duplicados)
            List<OrderPlan> reallyNewPlans = newResult.getOrderPlans().stream()
                    .filter(op -> !existingOrderIds.contains(op.getOrderId()))
                    .collect(Collectors.toList());
            // C. Asignar el padre (Usamos setPlan porque así se llama en tu modelo)
            reallyNewPlans.forEach(op -> op.setPlan(dbPlan));
            // D. Agregar a la lista existente
            dbPlan.getOrderPlans().addAll(reallyNewPlans);
            // Actualizar metadatos
            dbPlan.setFitness(newResult.getFitness());
            dbPlan.setGeneratedAt(newResult.getGeneratedAt());
            planToSave = dbPlan;
        } else {
            // Caso: Primera ejecución histórica (DB vacía)
            newResult.setId(1L);
            if (newResult.getOrderPlans() != null) {
                newResult.getOrderPlans().forEach(op -> op.setPlan(newResult));
            }
            planToSave = newResult;
        }
        // 4. Guardar capacidades y el plan final
        persistFlightCapacities(planToSave);
        return planRepository.save(planToSave);
    }

    private String getOrderId(Object orderPlan) {
        // Usar reflexión para obtener el orderId de forma segura
        try {
            var method = orderPlan.getClass().getMethod("getOrderId");
            return (String) method.invoke(orderPlan);
        } catch (Exception e) {
            return null;
        }
    }

    private void persistFlightCapacities(CurrentPlan plan) {
        var capacities = aggregateFlightCapacities(plan);
        flightCapacityRepository.deleteAll();
        flightCapacityRepository.saveAll(capacities);
    }

    private List<FlightCapacity> aggregateFlightCapacities(CurrentPlan plan) {
        Map<FlightCapacity.FlightCapacityKey, Integer> totals = new HashMap<>();
        Map<FlightCapacity.FlightCapacityKey, Flight> flights = new HashMap<>();

        if (plan.getOrderPlans() != null) {
            plan.getOrderPlans().forEach(orderPlan -> {
                if (orderPlan.getRoutes() == null) {
                    return;
                }
                for (Route route : orderPlan.getRoutes()) {
                    if (route.getSegments() == null) {
                        continue;
                    }
                    for (RouteSegment segment : route.getSegments()) {
                        Flight flight = segment.getFlight();
                        LocalDate date = segment.getDate();
                        int quantity = segment.getRouteQuantity();
                        if (flight == null || date == null || quantity <= 0) {
                            continue;
                        }
                        FlightCapacity.FlightCapacityKey key = new FlightCapacity.FlightCapacityKey(flight.getId(), date);
                        totals.merge(key, quantity, Integer::sum);
                        flights.putIfAbsent(key, flight);
                    }
                }
            });
        }

        List<FlightCapacity> capacities = new ArrayList<>(totals.size());
        totals.forEach((key, used) -> {
            Flight flight = flights.get(key);
            if (flight != null) {
                capacities.add(new FlightCapacity(flight, key.getDate(), used));
            }
        });
        return capacities;
    }

    @Transactional(readOnly = true)
    public Optional<CurrentPlan> getCurrentPlan() {
        return planRepository.findById(1L);
    }

    @Transactional
    public void clearCurrentPlan() {
        flightCapacityRepository.deleteAll();
        planRepository.deleteById(1L);
    }

    /**
     * Elimina cualquier plan guardado y las capacidades agregadas.
     */
    @Transactional
    public void clearAllPlans() {
        flightCapacityRepository.deleteAll();
        planRepository.deleteAll();
    }
}
