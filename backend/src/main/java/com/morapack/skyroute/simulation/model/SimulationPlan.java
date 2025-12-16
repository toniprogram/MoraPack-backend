package com.morapack.skyroute.simulation.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@NoArgsConstructor
@Entity
@Table(name = "simulation_plan")
public class SimulationPlan {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String simulationId;

    @Column(name = "generated_at", nullable = false)
    private LocalDateTime generatedAt;

    @Column(nullable = false)
    private double fitness;

    @Column(nullable = false)
    private boolean slaCompliant;

    @Column(nullable = false)
    private int slaViolations;

    @OneToMany(mappedBy = "plan", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<SimulationOrderPlan> orderPlans;
}
