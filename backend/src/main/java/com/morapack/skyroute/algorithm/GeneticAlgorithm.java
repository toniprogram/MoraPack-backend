package com.morapack.skyroute.algorithm;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Random;

import com.morapack.skyroute.config.*;
import com.morapack.skyroute.models.*;
import com.morapack.skyroute.io.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class GeneticAlgorithm {
    private static final Logger log = LoggerFactory.getLogger(GeneticAlgorithm.class);
    private final World world;
    private final List<Order> demand;
    private final Random rnd = new Random();
    private final List<Individual> population = new ArrayList<>();
    private static final int TOURNAMENT_K = 2; // menor presión, más diversidad
    // private static final double MIN_IMPROVEMENT = 1e-6;
    // private static final int EARLY_STOP_PATIENCE = 3;

    public GeneticAlgorithm(World world, List<Order> demand) {
        this.world = world;
        this.demand = demand;
    }

    public void initializePopulation(int size) {
        initializePopulation(size, null);
    }

    public void initializePopulation(int size, Individual seed) {
        population.clear();
        if (seed != null) {
            try {
                population.add(seed.copy());
            } catch (Exception ex) {
                // ignore copy failure
            }
            if (population.size() < size) {
                try {
                    population.add(Individual.mutate(world, demand, seed, rnd));
                } catch (Exception ex) {
                    // ignore mutation failure
                }
            }
        }
        while (population.size() < size) {
            population.add(Individual.randomIndividual(world, demand, rnd));
        }
    }

    public Individual crossover(Individual parentA, Individual parentB) {
        return Individual.crossover(world, demand, parentA, parentB, rnd);
    }

    public Individual mutate(Individual parent) {
        return Individual.mutate(world, demand, parent, rnd);
    }

    public List<Individual> getPopulation() {
        return population;
    }

    public void printPopulation() {
        int idx = 1;
        for (Individual individual : population) {
            System.out.println("Individual " + (idx++) + " fitness=" + individual.getFitness());
            individual.prettyPrint();
        }
    }

    public Individual tournamentSelect() {
        List<Individual> valids = population.stream()
                .filter(Individual::isValid)
                .toList();
        if (valids.isEmpty()) {
            throw new IllegalStateException("No valid individuals available for selection");
        }
        Individual best = null;
        for (int i = 0; i < TOURNAMENT_K; i++) {
            Individual candidate = valids.get(rnd.nextInt(valids.size()));
            if (best == null || candidate.getFitness() > best.getFitness()) {
                best = candidate;
            }
        }
        return best;
    }

    public List<Individual> tournamentSelection(int count) {
        List<Individual> selected = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            selected.add(tournamentSelect());
        }
        return selected;
    }

    public Individual run(int populationSize, int generations) {
        return run(populationSize, generations, null, null, List.of());
    }

    public Individual run(int populationSize, int generations, Individual seed) {
        return run(populationSize, generations, seed, null, List.of());
    }

    public Individual run(int populationSize, int generations, Individual seed, List<Individual> carryOver, List<Order> newOrders) {
        return runTimed(populationSize, generations, 0L, seed, carryOver, newOrders);
    }

    /**
     * Ejecuta el GA con tope de generaciones y, opcionalmente, un presupuesto de tiempo (ms).
     * Si durationMillis <= 0, solo usa el límite de generaciones.
     */
    public Individual runTimed(int populationSize, int generations, long durationMillis, Individual seed, List<Individual> carryOver, List<Order> newOrders) {
        if (demand.isEmpty()) {
            throw new IllegalStateException("No orders available for GA");
        }

        initializePopulationWithCarryOver(populationSize, seed, carryOver, newOrders);
        int reusedCount = population.size();
        if (population.isEmpty()) {
            initializePopulation(populationSize, seed);
        } else {
            fillPopulation(populationSize, seed);
        }
        evaluatePopulation(0);
        long valids = population.stream().filter(Individual::isValid).count();
        log.info("[GA] Population reuse: {}/{} carried over (valids={})", reusedCount, population.size(), valids);

        Individual best = bestIndividual(population);
        if (best == null) {
            log.warn("[GA] No valid individuals after initialization; populationSize={} demand={}", population.size(), demand.size());
            throw new IllegalStateException("Escenario no factible: no hay individuos completos válidos");
        }
        long deadlineNanos = durationMillis > 0 ? System.nanoTime() + durationMillis * 1_000_000L : Long.MAX_VALUE;
        log.info("[GA] runTimed start: budgetMs={} popSize={} demand={}", durationMillis, populationSize, demand.size());
        for (int gen = 0; gen < generations; gen++) {
            evaluatePopulation(gen);
            best = bestIndividual(population);
            if (best == null) {
                long validCount = population.stream().filter(Individual::isValid).count();
                log.warn("[GA] Generation {} has zero valid individuals (validCount={})", gen + 1, validCount);
                throw new IllegalStateException("Escenario no factible: todos los individuos fallaron en generación " + (gen + 1));
            }
            if (System.nanoTime() >= deadlineNanos) {
                log.info("[GA] Deadline reached before starting generation {}", gen + 1);
                if (best == null || !best.isValid()) {
                    throw new IllegalStateException("Escenario no factible: no hay individuos válidos al alcanzar el deadline");
                }
                applyToWorld(best);
                return best;
            }
            List<Individual> nextGen = new ArrayList<>();
            // Elitismo: conservar el mejor de la generación previa
            if (best.isValid()) {
                nextGen.add(best.copy());
            }

            while (nextGen.size() < populationSize) {
                if (System.nanoTime() >= deadlineNanos) {
                    log.info("[GA] Deadline reached mid-generation {} after {} individuals", gen + 1, nextGen.size());
                    if (best == null || !best.isValid()) {
                        throw new IllegalStateException("Escenario no factible: sin individuos válidos al alcanzar el deadline");
                    }
                    applyToWorld(best);
                    return best;
                }
                Individual parentA = tournamentSelect();
                Individual child;
                if (rnd.nextDouble() < Config.P_CROSS) {
                    Individual parentB = tournamentSelect();
                    child = crossover(parentA, parentB);
                } else {
                    child = mutate(parentA);
                }

                if (rnd.nextDouble() < Config.P_MUT) {
                    child = mutate(child);
                }
                child.evaluate(world, demand, gen);
                nextGen.add(child);
            }

            population.clear();
            population.addAll(nextGen);
            best = bestIndividual(population);
            if (best == null) {
                throw new IllegalStateException("Escenario no factible: todos los individuos fallaron en generación " + (gen + 1));
            }
            long validCount = population.stream().filter(Individual::isValid).count();
            log.info("[GA] Generación {} mejor fitness={} población={} valids={}", gen + 1, best.getFitness(), population.size(), validCount);

            // Early stop desactivado temporalmente
            if (System.nanoTime() >= deadlineNanos) {
                log.info("[GA] detenido por presupuesto de tiempo en generación {} (deadline alcanzado)", gen + 1);
                if (best == null || !best.isValid()) {
                    throw new IllegalStateException("Escenario no factible: sin individuos válidos al alcanzar el deadline");
                }
                applyToWorld(best);
                return best;
            }
        }
        if (best == null || !best.isValid()) {
            throw new IllegalStateException("Escenario no factible: el GA no generó individuos válidos");
        }
        applyToWorld(best);
        return best;
    }

    private void initializePopulationWithCarryOver(int desiredSize, Individual seed, List<Individual> carryOver, List<Order> newOrders) {
        population.clear();
        if (carryOver == null || carryOver.isEmpty()) {
            return;
        }
        for (Individual individual : carryOver) {
            Individual candidate = applyNewOrders(individual, newOrders);
            if (candidate != null && candidate.isValid()) {
                population.add(candidate);
            }
            if (population.size() >= desiredSize) {
                break;
            }
        }
    }

    private Individual applyNewOrders(Individual base, List<Order> newOrders) {
        try {
            return base.tryInsertOrders(world, newOrders, rnd);
        } catch (Exception ex) {
            return null;
        }
    }

    private void fillPopulation(int desiredSize, Individual seed) {
        Individual base = seed;
        if (base == null && !population.isEmpty()) {
            base = bestIndividual(population);
        }
        if (base != null && base.isValid()) {
            try {
                population.add(base.copy());
            } catch (Exception ignored) {}
            if (population.size() < desiredSize) {
                try {
                    population.add(Individual.mutate(world, demand, base, rnd));
                } catch (Exception ignored) {}
            }
        }
        while (population.size() < desiredSize) {
            population.add(Individual.randomIndividual(world, demand, rnd));
        }
    }

    public List<Individual> snapshotPopulation() {
        return population.stream()
                .map(ind -> {
                    try {
                        return ind.copy();
                    } catch (Exception ex) {
                        return null;
                    }
                })
                .filter(ind -> ind != null)
                .toList();
    }

    private Individual bestIndividual(List<Individual> individuals) {
        return individuals.stream()
                .filter(Individual::isValid)
                .max(Comparator.comparingDouble(Individual::getFitness))
                .orElse(null);
    }

    private void evaluatePopulation(int generation) {
        for (Individual individual : population) {
            try {
                individual.evaluate(world, demand, generation);
            } catch (Exception ex) {
                log.debug("Skipping evaluation for individual due to error: {}", ex.getMessage());
            }
        }
    }

    private void applyToWorld(Individual best) {
        if (best == null || !best.isValid()) {
            throw new IllegalStateException("Escenario no factible: no hay solución válida para aplicar al mundo");
        }
        world.getFlights().getSchedule().applyFrom(best.getFlightSchedule());
        world.getAirportSchedule().applyFrom(best.getAirportSchedule());
    }

    public static void main(String[] args) {
        World world = World.getInstance();
        List<Order> orders = loadInitialOrders(world, 10);
        GeneticAlgorithm ga = new GeneticAlgorithm(world, orders);
        Individual best = ga.run(Config.POP_SIZE, Config.MAX_GEN);

        System.out.println("\nMejor individuo final (fitness=" + best.getFitness() + "):");
        best.prettyPrint();
    }

    public static List<Order> loadInitialOrders(World world, int count) {
        List<Order> orders = new ArrayList<>();
        Orders source = world.getOrders();
        try {
            for (int i = 0; i < count; i++) {
                Order order = source.next();
                if (order == null) {
                    break;
                }
                orders.add(order);
            }
        } catch (IOException ex) {
            throw new RuntimeException("Unable to load seed orders", ex);
        }
        return orders;
    }
}
