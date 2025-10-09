package com.morapack.skyroute.models;

import jakarta.persistence.*;
import lombok.Data;

@Data
@Entity
@Table(name = "airports")
public class Airport {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String code;
    private int gmt;
    private int storageCap;
    private double lat;
    private double lon;
    private String continent;
    private boolean isExporter;
}