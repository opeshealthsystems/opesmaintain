package com.opesware.maintain;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;

/** Hexagonal layering rules (spec §4): domain models stay free of application, API and web code. */
class ArchitectureTest {
    private static final JavaClasses CLASSES = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS).importPackages("com.opesware.maintain");

    @Test
    void domainDoesNotDependOnOuterLayers() {
        noClasses().that().resideInAPackage("..domain..")
                .should().dependOnClassesThat().resideInAnyPackage("..api..", "..application..", "..infrastructure..", "org.springframework.web..")
                .check(CLASSES);
    }

    @Test
    void applicationDoesNotDependOnApiControllers() {
        noClasses().that().resideInAPackage("..application..")
                .should().dependOnClassesThat().resideInAPackage("..api..")
                .check(CLASSES);
    }

    @Test
    void repositoriesAreNotUsedByControllersDirectlyExceptPlatform() {
        noClasses().that().resideInAPackage("com.opesware.maintain.(maintenance|asset|inventory|safety|calibration|commercial|procurement|reliability|documents|integration).api..")
                .should().dependOnClassesThat().resideInAPackage("..infrastructure..")
                .check(CLASSES);
    }
}
