package com.morapack.skyroute.models;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@Entity
@Table(name = "client")
public class Client {

    @Id
    @Column(name = "client_id", nullable = false, updatable = false)
    private String clientId;

    public Client(String clientId) {
        this.clientId = clientId;
    }
}
