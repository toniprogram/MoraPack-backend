package com.morapack.skyroute.algorithm;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Random;

import com.morapack.skyroute.config.*;
import com.morapack.skyroute.models.*;
import com.morapack.skyroute.io.*;

public class GeneticAlgorithm {
    private final World world;
    private final List<Order> demand;
    private final Random rnd = new Random();
    private final List<Individual> population = new ArrayList<>();
    private static final int TOURNAMENT_K = 3;
    private static final double MIN_IMPROVEMENT = 1e-6;
    private static final int EARLY_STOP_PATIENCE = 3;

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
        if (population.isEmpty()) {
            throw new IllegalStateException("Population is empty");
        }
        Individual best = null;
        for (int i = 0; i < TOURNAMENT_K; i++) {
            Individual candidate = population.get(rnd.nextInt(population.size()));
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
        System.out.println("[GA] Population reuse: " + reusedCount + "/" + population.size() + " carried over");

        Individual best = bestIndividual(population);
        double previousBestFitness = best.getFitness();

        int stagnant = 0;
        for (int gen = 0; gen < generations; gen++) {
            List<Individual> nextGen = new ArrayList<>();
            // Elitismo: conservar el mejor de la generación previa
            nextGen.add(best);

            while (nextGen.size() < populationSize) {
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

                nextGen.add(child);
            }

            population.clear();
            population.addAll(nextGen);
            best = bestIndividual(population);
            System.out.println("Generación " + (gen + 1) + " mejor fitness=" + best.getFitness());

            double improvement = best.getFitness() - previousBestFitness;
            previousBestFitness = best.getFitness();
            if (improvement > MIN_IMPROVEMENT) {
                stagnant = 0;
            } else {
                stagnant++;
            }
            if (stagnant >= EARLY_STOP_PATIENCE) {
                System.out.println("Early stop en generación " + (gen + 1) + " (sin mejora significativa por " + EARLY_STOP_PATIENCE + " generaciones)");
                break;
            }
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
            if (candidate != null) {
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
        if (base != null) {
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
        return individuals.stream().max(Comparator.comparingDouble(Individual::getFitness)).orElseThrow();
    }

    private void applyToWorld(Individual best) {
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
