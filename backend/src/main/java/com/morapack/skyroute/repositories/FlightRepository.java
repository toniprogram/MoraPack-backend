package com.morapack.skyroute.repositories;

import com.morapack.skyroute.models.Flight;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FlightRepository extends JpaRepository<Flight, String> {}