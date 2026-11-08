package com.opesware.maintain;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class OpesMaintainApplication {
    public static void main(String[] args) {
        SpringApplication.run(OpesMaintainApplication.class, args);
    }
}
