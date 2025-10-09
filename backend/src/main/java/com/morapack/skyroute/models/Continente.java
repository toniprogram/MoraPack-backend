package com.morapack.skyroute.models;

import jakarta.persistence.*;
import lombok.Data;

@Data
@Entity
@Table(name = "continente")
public class Continente {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String nombre;
}