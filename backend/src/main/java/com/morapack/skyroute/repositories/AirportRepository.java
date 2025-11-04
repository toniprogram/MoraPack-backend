package com.morapack.skyroute.repositories;

import com.morapack.skyroute.models.Airport;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AirportRepository extends JpaRepository<Airport, String> {
}
