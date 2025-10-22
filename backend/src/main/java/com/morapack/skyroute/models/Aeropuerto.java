package com.morapack.skyroute.models;

import jakarta.persistence.*;
import lombok.Data;

@Data
@Entity
@Table(name = "aeropuerto")
public class Aeropuerto {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String codigo;
    private int gmt;
    private int alamcenCapacidad;
    private double latitud;
    private double longitud;
    private String continente;
    private boolean esExportador;
}