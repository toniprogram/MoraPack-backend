package com.morapack.skyroute.services;

import com.morapack.skyroute.models.Airport;
import com.morapack.skyroute.repositories.AirportRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class AirportService {
    
    @Autowired
    private AirportRepository aeropuertoRepository;
    
    public List<Airport> getAll() {
        return aeropuertoRepository.findAll();
    }
    
    public Optional<Airport> findById(String code) {
        return aeropuertoRepository.findById(code);
    }
    
    public Airport create(Airport aeropuerto) {
        return aeropuertoRepository.save(aeropuerto);
    }
    
    public void deleteById(String code) {
        aeropuertoRepository.deleteById(code);
    }
}