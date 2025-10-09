package com.morapack.skyroute.services;
import com.morapack.skyroute.models.Paquete;
import com.morapack.skyroute.repositories.PaqueteRepository;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class PaqueteService {
    private final PaqueteRepository repo;

    public PaqueteService(PaqueteRepository repo) {
        this.repo = repo;
    }

    public List<Paquete> getAll() {
        return repo.findAll();
    }

    public Paquete create(Paquete shipment) {
        return repo.save(shipment);
    }
}
