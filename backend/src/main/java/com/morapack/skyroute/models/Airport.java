package com.morapack.skyroute.models;

import java.time.ZoneOffset;
import java.util.Objects;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor 
@Entity
@Table(name = "airport")
public class Airport {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)

    public final String code;
    public final String name;
    public final int gmtOffsetHours;
    private final int storageCapacity;
    private final String continent;
    private final String latitude;
    private final String longitude;

        public Airport(String code,
                   String name,
                   int gmtOffsetHours,
                   int storageCapacity,
                   String continent,
                   String latitude,
                   String longitude) {
        this.code = Objects.requireNonNull(code, "code");
        this.name = Objects.requireNonNull(name, "name");
        this.gmtOffsetHours = gmtOffsetHours;
        this.storageCapacity = storageCapacity;
        this.continent = continent;
        this.latitude = latitude;
        this.longitude = longitude;
    }

    // Obtener el ZoneOffset real
    public ZoneOffset getZoneOffset() {
        return ZoneOffset.ofHours(gmtOffsetHours);
    }

}