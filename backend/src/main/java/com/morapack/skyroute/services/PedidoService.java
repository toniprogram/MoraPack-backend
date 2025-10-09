package com.morapack.skyroute.services;

import com.morapack.skyroute.models.Pedido;
import com.morapack.skyroute.repositories.PedidoRepository;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class PedidoService {
    private final PedidoRepository repo;

    public PedidoService(PedidoRepository repo) {
        this.repo = repo;
    }

    public List<Pedido> getAll() {
        return repo.findAll();
    }

    public Pedido create(Pedido pedido) {
        return repo.save(pedido);
    }

    public Pedido update(Long id, Pedido nuevo) {
        Pedido existente = repo.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Pedido no encontrado"));
        existente.setEstado(nuevo.getEstado());
        existente.setDestino(nuevo.getDestino());
        existente.setCantidad(nuevo.getCantidad());
        return repo.save(existente);
    }
}
