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
    public String code;
    public String name;
    public int gmtOffsetHours;
    private int storageCapacity;
    private String continent;
    private String latitude;
    private String longitude;

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