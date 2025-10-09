package com.morapack.skyroute.services;
import com.morapack.skyroute.models.Shipment;
import com.morapack.skyroute.repositories.ShipmentRepository;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class ShipmentService {
    private final ShipmentRepository repo;

    public ShipmentService(ShipmentRepository repo) {
        this.repo = repo;
    }

    public List<Shipment> getAll() {
        return repo.findAll();
    }

    public Shipment create(Shipment shipment) {
        return repo.save(shipment);
    }
}
