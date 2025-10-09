package com.morapack.skyroute.services;
import com.morapack.skyroute.models.Package;
import com.morapack.skyroute.models.Package;
import com.morapack.skyroute.repositories.PackageRepository;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class PackageService {
    private final PackageRepository repo;

    public PackageService(PackageRepository repo) {
        this.repo = repo;
    }

    public List<Package> getAll() {
        return repo.findAll();
    }

    public Package create(Package pkg) {
        return repo.save(pkg);
    }
}
