package com.morapack.skyroute.models;

import jakarta.persistence.*;
import lombok.Data;

@Data
@Entity
@Table(name = "packages")
public class Package {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String code;
    private String origin;
    private String destination;
}
