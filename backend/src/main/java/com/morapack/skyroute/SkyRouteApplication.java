package com.morapack.skyroute;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class SkyRouteApplication {

	public static void main(String[] args) {
		SpringApplication.run(SkyRouteApplication.class, args);
	}

}

