package com.morapack.skyroute.operation.service;

import com.morapack.skyroute.config.Config;
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

        // -----------------------------------------------------------
        // 1. CALCULAR INICIO GLOBAL (Earliest Departure)
        // -----------------------------------------------------------
        Instant earliestDep = null;
        for (OrderPlan op : plan.getOrderPlans()) {
            if (op.getRoutes() == null) continue;
            for (Route route : op.getRoutes()) {
                if (route.getSegments() == null) continue;
                for (RouteSegment seg : route.getSegments()) {
                    Flight flight = seg.getFlight();
                    if (flight != null && seg.getDate() != null) {
                        Instant dep = flight.getDepartureInstant(seg.getDate());
                        if (dep != null && (earliestDep == null || dep.isBefore(earliestDep))) {
                            earliestDep = dep;
                        }
                    }
                }
            }
        }
        Instant startInstant = earliestDep != null ? earliestDep : Instant.now();

        // -----------------------------------------------------------
        // 2. SETUP DE AEROPUERTOS
        // -----------------------------------------------------------
        Map<String, LiveAirport> liveAirports = new HashMap<>();
        Map<String, String> airportContinents = new HashMap<>();

        airportRepository.findAll().forEach(a -> {
            liveAirports.put(a.getCode(), new LiveAirport(
                    a.getCode(), a.getStorageCapacity(), a.getLatitude(), a.getLongitude()
            ));
            airportContinents.put(a.getCode(), a.getContinent() != null ? a.getContinent().toUpperCase() : "UNKNOWN");
        });

        LiveOperationWorld liveWorld = new LiveOperationWorld("ops-current", startInstant, liveAirports);
        Map<String, LiveFlight> uniqueFlightsMap = new HashMap<>();

        // -----------------------------------------------------------
        // 3. PROCESAR PEDIDOS
        // -----------------------------------------------------------
        for (OrderPlan op : plan.getOrderPlans()) {
            int totalQty = op.getRoutes() == null ? 0 : op.getRoutes().stream().mapToInt(Route::getQuantity).sum();
            if (totalQty <= 0) continue;

            String destCode = null;
            boolean isIntercontinental = false;
            Instant maxPlannedArrival = startInstant;

            if (op.getRoutes() != null) {
                for (Route route : op.getRoutes()) {
                    if (route.getSegments() != null && !route.getSegments().isEmpty()) {

                        // A) Identificar Destino
                        RouteSegment lastSegList = route.getSegments().get(route.getSegments().size() - 1);
                        if (lastSegList.getFlight() != null && lastSegList.getFlight().getDestination() != null) {
                            destCode = lastSegList.getFlight().getDestination().getCode();
                        }

                        // B) Identificar Intercontinentalidad
                        RouteSegment firstSeg = route.getSegments().get(0);
                        if (destCode != null && firstSeg.getFlight() != null && firstSeg.getFlight().getOrigin() != null) {
                            String originCont = airportContinents.getOrDefault(firstSeg.getFlight().getOrigin().getCode(), "A");
                            String destCont = airportContinents.getOrDefault(destCode, "B");
                            if (!originCont.equals(destCont)) isIntercontinental = true;
                        }

                        // C) Barrido de Tiempos para el Deadline
                        for (RouteSegment seg : route.getSegments()) {
                            if (seg.getFlight() != null && seg.getDate() != null) {
                                Instant arr = seg.getFlight().getArrivalInstant(seg.getDate());
                                Instant completion = arr.plus(Config.WAREHOUSE_DWELL);
                                if (completion.isAfter(maxPlannedArrival)) {
                                    maxPlannedArrival = completion;
                                }
                            }
                        }
                    }
                }
            }

            // --- CÁLCULO DE DEADLINE (LOGICA MEJORADA) ---
            long slaHours = isIntercontinental ? 72 : 48;
            Instant standardDeadline = startInstant.plus(Duration.ofHours(slaHours));
            Instant plannedDeadline = maxPlannedArrival.plus(Duration.ofMinutes(60));

            // Elegimos el mayor para evitar holgura negativa
            Instant finalDueUtc = standardDeadline.isAfter(plannedDeadline) ? standardDeadline : plannedDeadline;

            liveWorld.registerOrderBasic(op.getOrderId(), totalQty, destCode, startInstant, finalDueUtc);
            liveWorld.registerPlanned(new OrderStatusTick(op.getOrderId(), "PLANNED", destCode != null ? destCode : "", totalQty));

            // -----------------------------------------------------------
            // 4. AGENDAR VUELOS (AQUÍ ESTÁ EL FIX DE CANTIDAD)
            // -----------------------------------------------------------
            if (op.getRoutes() != null) {
                for (Route route : op.getRoutes()) {
                    if (route.getSegments() == null) continue;

                    // [FIX IMPORTANTE]
                    // Capturamos la cantidad TOTAL de la ruta UNA SOLA VEZ.
                    // Esto ignora cualquier error de cantidad parcial en los segmentos intermedios.
                    int fixedRouteQty = route.getQuantity();

                    for (RouteSegment seg : route.getSegments()) {
                        Flight flightData = seg.getFlight();
                        if (flightData == null || seg.getDate() == null) continue;

                        String uniqueKey = flightData.getId() + "_" + seg.getDate().toString();

                        LiveFlight liveFlight = uniqueFlightsMap.computeIfAbsent(uniqueKey, k -> {
                            Instant dep = flightData.getDepartureInstant(seg.getDate());
                            Instant arr = flightData.getArrivalInstant(seg.getDate());
                            return new LiveFlight(
                                    flightData.getId(),
                                    flightData.getOrigin().getCode(),
                                    flightData.getDestination().getCode(),
                                    dep, arr, flightData.getDailyCapacity()
                            );
                        });

                        // Usamos la variable fija 'fixedRouteQty', NO 'seg.getRouteQuantity()'
                        liveWorld.scheduleFutureFlight(liveFlight, op.getOrderId(), fixedRouteQty);
                    }
                }
            }
        }

        // 5. FAST FORWARD
        if (requestedStart != null && requestedStart.isAfter(startInstant)) {
            long seconds = Duration.between(startInstant, requestedStart).getSeconds();
            if (seconds > 0) {
                log.info("[OPS] Fast Forwarding world by {} seconds", seconds);
                liveWorld.tick(seconds);
            }
        }

        return liveWorld;
    }
}