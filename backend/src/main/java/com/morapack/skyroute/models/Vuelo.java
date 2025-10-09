package com.morapack.skyroute.models;

import jakarta.persistence.*;
import lombok.Data;

@Data
@Entity
@Table(name = "vuelo")
public class Vuelo {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String origen;        
    private String destino;       
    private int salidaLocalMin;  
    private int llegadaLocalMin; 
    private int capacidad;     

    public Vuelo() {}

    public Vuelo(String origen, String destino, int salidaLocalMin, int llegadaLocalMin, int capacidad) {
        this.origen = origen;
        this.destino = destino;
        this.salidaLocalMin = salidaLocalMin;
        this.llegadaLocalMin = llegadaLocalMin;
        this.capacidad = capacidad;
    }
}