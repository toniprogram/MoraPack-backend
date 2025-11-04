package com.morapack.skyroute.models;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.time.LocalDate;
import java.util.Objects;

@Data
@NoArgsConstructor
@Entity
@Table(name = "flight_capacity")
public class FlightCapacity {

    @EmbeddedId
    private FlightCapacityKey id; // (flight_id, date)



    @Column(name = "used_capacity", nullable = false)
    private int usedCapacity;

    public FlightCapacity(FlightCapacityKey id, int usedCapacity) {
        this.id = Objects.requireNonNull(id, "id");
        this.usedCapacity = usedCapacity;
    }

    @Embeddable
    public class FlightCapacityKey implements Serializable {
    private String flightId;
    private LocalDate date; // día de ejecución
    public void setFlightId(String flightId2) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'setFlightId'");
    }
    public void setDate(LocalDate localDate) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'setDate'");
    }
    }
}



