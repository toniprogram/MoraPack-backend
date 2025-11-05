package com.morapack.skyroute.base.service;

import com.morapack.skyroute.models.Client;
import com.morapack.skyroute.base.repository.ClientRepository;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class ClientService {

    private final ClientRepository repository;

    public ClientService(ClientRepository repository) {
        this.repository = repository;
    }

    public List<Client> getAll() {
        return repository.findAll();
    }

    public Client create(Client client) {
        return repository.save(client);
    }
}
