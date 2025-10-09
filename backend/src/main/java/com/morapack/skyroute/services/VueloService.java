package com.morapack.skyroute.services;

import com.morapack.skyroute.models.Vuelo;
import com.morapack.skyroute.repositories.VueloRepository;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class VueloService {
    private final VueloRepository repo;

    public VueloService(VueloRepository repo) {
        this.repo = repo;
    }

    public List<Vuelo> getAll() {
        return repo.findAll();
    }

    public Vuelo create(Vuelo vuelo) {
        return repo.save(vuelo);
    }
}