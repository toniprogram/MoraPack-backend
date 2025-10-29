package com.morapack.skyroute.models;

import java.time.*;
import java.util.Map;
import java.util.Objects;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor // Requerido por JPA
@Entity
@Table(name = "flight")
public class Flight {

    private static final int CANCELLED_SENTINEL = -1;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private String id;

    @ManyToOne
    @JoinColumn(name = "origin_code", referencedColumnName = "code")
    private Airport origin;

    @ManyToOne
    @JoinColumn(name = "destination_code", referencedColumnName = "code")
    private Airport destination;

    private LocalTime depLocal;
    private LocalTime arrLocal;
    private int dailyCapacity;

    //Este campo no se persiste en la base de datos
    @Transient
    private Map<LocalDate, Integer> delays;

    public Flight( String id,
                Airport origin,
                  Airport destination,
                  LocalTime depLocal,
                  LocalTime arrLocal,
                  int dailyCapacity,
                  Map<LocalDate, Integer> delays) {

        if (origin == null || destination == null) {
            throw new IllegalArgumentException("Origin and destination airports are required");
        }
        this.id = Objects.requireNonNull(id, "id");
        this.origin = origin;
        this.destination = destination;
        this.depLocal = Objects.requireNonNull(depLocal, "depLocal");
        this.arrLocal = Objects.requireNonNull(arrLocal, "arrLocal");
        this.dailyCapacity = dailyCapacity;
        this.delays = delays == null ? Map.of() : Map.copyOf(delays);
    }

    public static String buildId(Airport origin, Airport destination, LocalTime depLocal) {
        return origin.code + "-" + destination.code + "-" + depLocal;
    }

    public String getOriginCode() {
        return origin.code;
    }

    public String getDestinationCode() {
        return destination.code;
    }

    // Métodos lógicos que usan delays (solo en memoria)
    public boolean isCancelled(LocalDate date) {
        Integer value = delays.get(date);
        return value != null && value == CANCELLED_SENTINEL;
    }

    public int getDelayMinutes(LocalDate date) {
        Integer value = delays.get(date);
        if (value == null || value < 0) {
            return 0;
        }
        return value;
    }

    public Instant getDepartureInstant(LocalDate date) {
        if (isCancelled(date)) {
            throw new IllegalStateException("Flight is cancelled on " + date);
        }
        int delay = getDelayMinutes(date);
        LocalDateTime local = LocalDateTime.of(date, depLocal).plusMinutes(delay);
        ZoneOffset offset = origin.getZoneOffset();
        return local.toInstant(offset);
    }

    public Instant getArrivalInstant(LocalDate date) {
        if (isCancelled(date)) {
            throw new IllegalStateException("Flight is cancelled on " + date);
        }
        int delay = getDelayMinutes(date);
        LocalDateTime departureLocal = LocalDateTime.of(date, depLocal).plusMinutes(delay);
        LocalDateTime arrivalLocalDateTime = LocalDateTime.of(date, arrLocal).plusMinutes(delay);
        if (!arrivalLocalDateTime.isAfter(departureLocal)) {
            arrivalLocalDateTime = arrivalLocalDateTime.plusDays(1);
        }
        ZoneOffset offset = destination.getZoneOffset();;
        return arrivalLocalDateTime.toInstant(offset);
    }
}
