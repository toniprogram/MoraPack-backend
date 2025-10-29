package com.morapack.skyroute.models;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.Objects;

@Entity
@Table(name = "orders")
@Getter @Setter
@NoArgsConstructor
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private String id;

    private String customerReference;

    @ManyToOne
    @JoinColumn(name = "destination_airport_code", referencedColumnName = "code")
    private Airport destinationAirport;

    private int quantity;

    private Instant creationUtc;
    private Instant dueUtc;

     public Order(String id,
                 String customerReference,
                 Airport destination,
                 int quantity,
                 Instant creationUtc,
                 Instant dueUtc) {
        if (destination == null) {
            throw new IllegalArgumentException("Destination airport is required");
        }
        if (quantity <= 0) {
            throw new IllegalArgumentException("Quantity must be positive");
        }
        this.id = Objects.requireNonNull(id, "id");
        this.customerReference = Objects.requireNonNull(customerReference, "customerReference");
        this.destinationAirport = destination;
        this.quantity = quantity;
        this.creationUtc = Objects.requireNonNull(creationUtc, "creationUtc");
        this.dueUtc = Objects.requireNonNull(dueUtc, "dueUtc");
    }

    public String getDestinationCode() {
        return destinationAirport.code;
    }
}
