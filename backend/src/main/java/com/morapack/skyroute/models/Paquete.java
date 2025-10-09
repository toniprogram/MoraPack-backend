package com.morapack.skyroute.models;

import jakarta.persistence.*;
import lombok.Data;

@Data
@Entity
@Table(name = "paquete")
public class Paquete {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String code;
    private String origin;
    private String destination;
}
