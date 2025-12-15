package com.morapack.skyroute.operation.service;

import com.morapack.skyroute.models.CurrentPlan;
import com.morapack.skyroute.models.Flight;
import com.morapack.skyroute.models.OrderPlan;
import com.morapack.skyroute.models.Route;
import com.morapack.skyroute.models.RouteSegment;
import com.morapack.skyroute.base.repository.AirportRepository;
import com.morapack.skyroute.base.repository.FlightRepository;
import com.morapack.skyroute.plan.service.WorldBuilder;
import com.morapack.skyroute.simulation.live.LiveAirport;
import com.morapack.skyroute.simulation.live.LiveFlight;
import com.morapack.skyroute.simulation.live.LiveOperationWorld;
import com.morapack.skyroute.simulation.dto.OrderStatusTick;
import org.springframework.stereotype.Service;
import lombok.extern.slf4j.Slf4j;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class OperationService {

    private final WorldBuilder worldBuilder;
    private final AirportRepository airportRepository;
    private final FlightRepository flightRepository;

    public OperationService(WorldBuilder worldBuilder,
                            AirportRepository airportRepository,
                            FlightRepository flightRepository) {
        this.worldBuilder = worldBuilder;
        this.airportRepository = airportRepository;
        this.flightRepository = flightRepository;
    }

    public LiveOperationWorld buildWorldFromCurrentPlan(CurrentPlan plan, Instant requestedStart) {
        if (plan == null || plan.getOrderPlans() == null) {
            return null;
        }

        log.info("[OPS] Construyendo MUNDO OPERATIVO desde plan con {} pedidos", plan.getOrderPlans().size());
        // 1. Calcular inicio
        Instant earliestDep = null;
        for (OrderPlan op : plan.getOrderPlans()) {
            if (op.getRoutes() == null) continue;
            for (Route route : op.getRoutes()) {
                if (route.getSegments() == null) continue;
                for (RouteSegment seg : route.getSegments()) {
                    Flight flight = seg.getFlight();
                    if (flight == null || seg.getDate() == null) continue;
                    Instant dep = flight.getDepartureInstant(seg.getDate());
                    if (dep != null && (earliestDep == null || dep.isBefore(earliestDep))) {
                        earliestDep = dep;
                    }
                }
            }
        }
        Instant startInstant = earliestDep != null ? earliestDep : Instant.now();
        // 2. Cargar Aeropuertos
        Map<String, LiveAirport> liveAirports = new HashMap<>();
        airportRepository.findAll().forEach(a -> {
            liveAirports.put(a.getCode(), new LiveAirport(
                    a.getCode(), a.getStorageCapacity(), a.getLatitude(), a.getLongitude()
            ));
        });
        LiveOperationWorld liveWorld = new LiveOperationWorld("ops-current", startInstant, liveAirports);
        // 3. Mapa vuelos
        Map<String, LiveFlight> uniqueFlightsMap = new HashMap<>();
        // 4. Procesar Pedidos
        for (OrderPlan op : plan.getOrderPlans()) {
            int totalQty = op.getRoutes() == null ? 0 : op.getRoutes().stream().mapToInt(Route::getQuantity).sum();
            if (totalQty <= 0) continue;

            String destCode = null;
            if (op.getRoutes() != null) {
                for (Route route : op.getRoutes()) {
                    if (route.getSegments() != null) {
                        for (RouteSegment seg : route.getSegments()) {
                            Flight f = seg.getFlight();
                            if (f != null && f.getDestination() != null) destCode = f.getDestination().getCode();
                        }
                    }
                }
            }
            liveWorld.registerOrderBasic(op.getOrderId(), totalQty, destCode, startInstant, startInstant.plus(Duration.ofHours(48)));
            liveWorld.registerPlanned(new OrderStatusTick(op.getOrderId(), "PLANNED", destCode != null ? destCode : "", totalQty));
            if (op.getRoutes() == null) continue;
            for (Route route : op.getRoutes()) {
                if (route.getSegments() == null) continue;
                for (RouteSegment seg : route.getSegments()) {
                    Flight flightData = seg.getFlight();
                    if (flightData == null || seg.getDate() == null) continue;

                    String uniqueKey = flightData.getId() + "_" + seg.getDate().toString();
                    LiveFlight liveFlight = uniqueFlightsMap.get(uniqueKey);

                    if (liveFlight == null) {
                        Instant dep = flightData.getDepartureInstant(seg.getDate());
                        Instant arr = flightData.getArrivalInstant(seg.getDate());
                        liveFlight = new LiveFlight(
                                flightData.getId(),
                                flightData.getOrigin().getCode(),
                                flightData.getDestination().getCode(),
                                dep, arr, flightData.getDailyCapacity()
                        );
                        uniqueFlightsMap.put(uniqueKey, liveFlight);
                    }
                    liveWorld.scheduleFutureFlight(liveFlight, op.getOrderId(), seg.getRouteQuantity());
                }
            }
        }
        // 5. Fast Forward
        if (requestedStart != null && requestedStart.isAfter(startInstant)) {
            long seconds = java.time.Duration.between(startInstant, requestedStart).getSeconds();
            if (seconds > 0) {
                log.info("[OPS] Fast Forwarding world by {} seconds", seconds);
                liveWorld.tick(seconds);
            }
        }

        return liveWorld;
    }
}