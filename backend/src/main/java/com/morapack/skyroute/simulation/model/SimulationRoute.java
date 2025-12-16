package com.morapack.skyroute.simulation.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Duration;
import java.util.List;

@Data
@NoArgsConstructor
@Entity
@Table(name = "simulation_route")
public class SimulationRoute {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private int quantity;

    @Column(nullable = false)
    private Duration slack = Duration.ZERO;

    @ManyToOne(optional = false)
    @JoinColumn(name = "order_plan_id")
    private SimulationOrderPlan orderPlan;

    @OneToMany(mappedBy = "route", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<SimulationRouteSegment> segments;
}
