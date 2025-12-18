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
import com.morapack.skyroute.operation.live.LiveOperationWorld;
import com.morapack.skyroute.simulation.dto.OrderStatusTick;
import org.springframework.stereotype.Service;
import lombok.extern.slf4j.Slf4j;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Stream;

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
        // 3. PROCESAR PEDIDOS (Vuelos con Carga)
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

            // --- CÁLCULO DE DEADLINE ---
            long slaHours = isIntercontinental ? 72 : 48;
            Instant standardDeadline = startInstant.plus(Duration.ofHours(slaHours));
            Instant plannedDeadline = maxPlannedArrival.plus(Duration.ofMinutes(60));

            Instant finalDueUtc = standardDeadline.isAfter(plannedDeadline) ? standardDeadline : plannedDeadline;

            liveWorld.registerOrderBasic(op.getOrderId(), totalQty, destCode, startInstant, finalDueUtc);
            liveWorld.registerPlanned(new OrderStatusTick(op.getOrderId(), "PLANNED", destCode != null ? destCode : "", totalQty));

            // -----------------------------------------------------------
            // 4. AGENDAR VUELOS
            // -----------------------------------------------------------
            if (op.getRoutes() != null) {
                for (Route route : op.getRoutes()) {
                    if (route.getSegments() == null) continue;
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

                        liveWorld.scheduleFutureFlight(liveFlight, op.getOrderId(), fixedRouteQty);
                    }
                }
            }
        }

        // -----------------------------------------------------------
        // 5. NUEVA LÓGICA: AGREGAR VUELOS VACÍOS (BACKGROUND TRAFFIC)
        // -----------------------------------------------------------
        // Esto rellena el cielo con los vuelos que existen en la BD pero no se usaron en el plan.
        LocalDate startDate = startInstant.atZone(ZoneId.of("UTC")).toLocalDate();
        long simulationDays = 3; // Horizonte de simulación

        flightRepository.findAll().forEach(flightData -> {
            Stream.iterate(0, i -> i + 1).limit(simulationDays).forEach(dayOffset -> {
                LocalDate targetDate = startDate.plusDays(dayOffset);
                String uniqueKey = flightData.getId() + "_" + targetDate.toString();

                // Si este vuelo NO fue creado en el paso 4 (porque no tiene carga), lo creamos ahora
                if (!uniqueFlightsMap.containsKey(uniqueKey)) {
                    Instant dep = flightData.getDepartureInstant(targetDate);
                    Instant arr = flightData.getArrivalInstant(targetDate);

                    if (dep != null && arr != null) {
                        LiveFlight emptyFlight = new LiveFlight(
                                flightData.getId(),
                                flightData.getOrigin().getCode(),
                                flightData.getDestination().getCode(),
                                dep,
                                arr,
                                flightData.getDailyCapacity()
                        );

                        // Lo registramos para evitar duplicados
                        uniqueFlightsMap.put(uniqueKey, emptyFlight);

                        // Lo agendamos en el mundo con OrderID dummy y cantidad 0
                        liveWorld.scheduleFutureFlight(emptyFlight, "EMPTY_FLIGHT_DUMMY", 0);
                    }
                }
            });
        });

        // -----------------------------------------------------------
        // 6. FAST FORWARD
        // -----------------------------------------------------------
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