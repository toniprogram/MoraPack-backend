package com.morapack.skyroute.services;

import com.morapack.skyroute.models.Aeropuerto;
import com.morapack.skyroute.repositories.AeropuertoRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class AeropuertoService {
    
    @Autowired
    private AeropuertoRepository aeropuertoRepository;
    
    public List<Aeropuerto> getAll() {
        return aeropuertoRepository.findAll();
    }
    
    public Optional<Aeropuerto> findById(Long id) {
        return aeropuertoRepository.findById(id);
    }
    
    public Aeropuerto create(Aeropuerto aeropuerto) {
        return aeropuertoRepository.save(aeropuerto);
    }
    
    public void deleteById(Long id) {
        aeropuertoRepository.deleteById(id);
    }
}