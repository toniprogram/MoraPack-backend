package com.morapack.skyroute.services;

import com.morapack.skyroute.models.Flight;
import com.morapack.skyroute.repositories.FlightRepository;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class FlightService {
    private final FlightRepository repo;

    public FlightService(FlightRepository repo) {
        this.repo = repo;
    }

    public List<Flight> getAll() {
        return repo.findAll();
    }

    public Flight create(Flight vuelo) {
        return repo.save(vuelo);
    }
}