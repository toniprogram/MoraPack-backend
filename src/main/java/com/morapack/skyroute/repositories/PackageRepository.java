package com.morapack.skyroute.repositories;

import com.morapack.skyroute.models.Package;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PackageRepository extends JpaRepository<Package, Long> {}
