package com.morapack.skyroute.simulation.model;

import com.morapack.skyroute.models.Flight;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Duration;
import java.time.LocalDate;

@Data
@NoArgsConstructor
@Entity
@Table(name = "simulation_route_segment")
public class SimulationRouteSegment {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "flight_id", referencedColumnName = "id")
    private Flight flight;

    @Column(nullable = false)
    private LocalDate date;

    @Column(nullable = false)
    private int routeQuantity;

    @Column(nullable = false)
    private boolean departed;

    @Column(nullable = false)
    private boolean arrived;

    @Column(nullable = false)
    private boolean receivedByNext;

    @Column(nullable = false)
    private boolean finalLeg;

    @Column(nullable = false)
    private Duration slack = Duration.ZERO;

    @ManyToOne(optional = false)
    @JoinColumn(name = "route_id")
    private SimulationRoute route;
}
