package com.morapack.skyroute.simulation.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Duration;
import java.util.List;

@Data
@NoArgsConstructor
@Entity
@Table(name = "simulation_order_plan")
public class SimulationOrderPlan {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String orderId;

    @Column(nullable = false)
    private String status = "WAITING"; // WAITING/IN_TRANSIT/DELIVERED

    @Column(nullable = false)
    private Duration slack;

    @ManyToOne(optional = false)
    @JoinColumn(name = "plan_id")
    private SimulationPlan plan;

    @OneToMany(mappedBy = "orderPlan", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<SimulationRoute> routes;
}
