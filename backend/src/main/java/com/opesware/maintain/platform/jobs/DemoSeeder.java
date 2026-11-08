package com.opesware.maintain.platform.jobs;

import com.opesware.maintain.asset.application.AssetService;
import com.opesware.maintain.asset.domain.*;
import com.opesware.maintain.calibration.application.CalibrationService;
import com.opesware.maintain.calibration.domain.*;
import com.opesware.maintain.commercial.application.CommercialService;
import com.opesware.maintain.commercial.domain.*;
import com.opesware.maintain.documents.domain.*;
import com.opesware.maintain.identity.domain.*;
import com.opesware.maintain.integration.application.IntegrationService;
import com.opesware.maintain.integration.domain.*;
import com.opesware.maintain.inventory.application.InventoryService;
import com.opesware.maintain.inventory.domain.*;
import com.opesware.maintain.maintenance.application.PmService;
import com.opesware.maintain.maintenance.application.RequestService;
import com.opesware.maintain.maintenance.application.WorkOrderService;
import com.opesware.maintain.maintenance.domain.*;
import com.opesware.maintain.organization.domain.*;
import com.opesware.maintain.platform.application.CrudService;
import com.opesware.maintain.platform.domain.Notification;
import com.opesware.maintain.platform.domain.Setting;
import com.opesware.maintain.platform.domain.Tenant;
import com.opesware.maintain.platform.infrastructure.TenantRepo;
import com.opesware.maintain.platform.security.CurrentUser;
import com.opesware.maintain.platform.security.PasswordHasher;
import com.opesware.maintain.platform.security.Principal;
import com.opesware.maintain.procurement.application.ProcurementService;
import com.opesware.maintain.procurement.domain.*;
import com.opesware.maintain.reliability.application.InsightService;
import com.opesware.maintain.reliability.domain.*;
import com.opesware.maintain.safety.application.SafetyService;
import com.opesware.maintain.safety.domain.*;
import com.opesware.maintain.workforce.domain.*;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Seeds a realistic demo tenant (and an isolation tenant) on first start when opes.seed.demo=true. */
@Component
public class DemoSeeder implements ApplicationRunner {
    public static final String DEMO_PASSWORD = "OpesDemo2026";
    private static final Logger log = LoggerFactory.getLogger(DemoSeeder.class);

    private final boolean enabled;
    private final TenantRepo tenants;
    private final CrudService crud;
    private final WorkOrderService wo;
    private final RequestService requests;
    private final PmService pm;
    private final InventoryService inv;
    private final AssetService assetSvc;
    private final SafetyService safety;
    private final CalibrationService calibration;
    private final CommercialService commercial;
    private final ProcurementService procurement;
    private final IntegrationService integration;
    private final InsightService insights;
    private final TransactionTemplate tx;
    @jakarta.persistence.PersistenceContext
    private jakarta.persistence.EntityManager em;
    private final Map<String, AppUser> users = new HashMap<>();
    private UUID tenantId;

    public DemoSeeder(@Value("${opes.seed.demo:true}") boolean enabled, TenantRepo tenants, CrudService crud, WorkOrderService wo,
                      RequestService requests, PmService pm, InventoryService inv, AssetService assetSvc, SafetyService safety,
                      CalibrationService calibration, CommercialService commercial, ProcurementService procurement,
                      IntegrationService integration, InsightService insights, PlatformTransactionManager tm) {
        this.enabled = enabled;
        this.tenants = tenants;
        this.crud = crud;
        this.wo = wo;
        this.requests = requests;
        this.pm = pm;
        this.inv = inv;
        this.assetSvc = assetSvc;
        this.safety = safety;
        this.calibration = calibration;
        this.commercial = commercial;
        this.procurement = procurement;
        this.integration = integration;
        this.insights = insights;
        this.tx = new TransactionTemplate(tm);
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!enabled || tenants.count() > 0) return;
        log.info("Seeding OPES Maintain demo data…");
        tenantId = tenant("opes-demo", "OPES Health Systems — Engineering Services");
        users.clear();
        tx.executeWithoutResult(s -> as(null, () -> { seedDemo(); return null; }));
        tx.executeWithoutResult(s -> as(null, () -> { seedOperations(); return null; }));
        UUID isolation = tenant("isolation-co", "Isolation Test Company");
        tenantId = isolation;
        tx.executeWithoutResult(s -> as(null, () -> {
            Site site = site("ISO-HQ", "Isolation HQ", "Lagos", "Africa/Lagos", null);
            user("Ida Isolated", "admin@isolation.test", "ADMIN", site.id, null);
            Asset a = new Asset();
            a.tag = "ISO-0001"; a.name = "Isolated chiller"; a.assetType = "HVAC"; a.criticality = "B_HIGH"; a.siteId = site.id;
            crud.persistNew(a);
            return null;
        }));
        log.info("Demo data ready. Sign in as admin@opes.demo / {}", DEMO_PASSWORD);
    }

    private UUID tenant(String code, String name) {
        Tenant t = new Tenant();
        t.id = UUID.randomUUID();
        t.code = code;
        t.legalName = name;
        t.country = "CM";
        t.timeZone = "Africa/Douala";
        t.currency = "XAF";
        t.language = "EN";
        t.plan = "ENTERPRISE";
        t.status = "ACTIVE";
        t.maxUsers = 500;
        t.maxAssets = 20000;
        t.createdAt = Instant.now();
        return tenants.save(t).id;
    }

    private <T> T as(String userKey, Supplier<T> work) {
        Principal prev = CurrentUser.get();
        AppUser u = userKey == null ? null : users.get(userKey);
        CurrentUser.set(u == null ? new Principal(null, tenantId, "seed@opes", "System Seeder", "ADMIN", null)
                : new Principal(u.id, tenantId, u.email, u.fullName, u.role, u.customerId));
        try {
            return work.get();
        } finally {
            if (prev == null) CurrentUser.clear(); else CurrentUser.set(prev);
        }
    }

    // ------------------------------------------------------------------ master data
    private final Map<String, UUID> ids = new HashMap<>();

    private void seedDemo() {
        Organization owner = org("OPES", "OPES Health Systems", "OWNER", "CM");
        Organization client1 = org("LQH", "Laquintinie Hospital", "CLIENT", "CM");
        Organization client2 = org("SPC", "Sanaga Pharma Company", "CLIENT", "CM");
        Organization contractor = org("ELX", "ElectroTech Services SARL", "SERVICE_PROVIDER", "CM");
        Organization oem = org("MDS", "MedDevice Supply Ltd", "VENDOR", "NG");
        ServiceGrant g = new ServiceGrant();
        g.providerOrgId = contractor.id; g.clientOrgId = owner.id; g.scope = "SELECTED_SITES"; g.siteIds = "Douala General Campus";
        g.validFrom = LocalDate.now().minusMonths(6); g.validTo = LocalDate.now().plusMonths(6);
        crud.persistNew(g);
        ServiceGrant g2 = new ServiceGrant();
        g2.providerOrgId = owner.id; g2.clientOrgId = client2.id; g2.scope = "ALL_SITES";
        g2.validFrom = LocalDate.now().minusYears(1); g2.validTo = LocalDate.now().minusDays(10);
        crud.persistNew(g2);

        Site dgh = site("DGH", "Douala General Campus", "Douala", "Africa/Douala", owner.id);
        Site ypp = site("YPP", "Yaoundé Pharma Plant", "Yaoundé", "Africa/Douala", client2.id);
        Site lsd = site("LSD", "Limbe Service Depot", "Limbe", "Africa/Douala", owner.id);
        ids.put("dgh", dgh.id); ids.put("ypp", ypp.id); ids.put("lsd", lsd.id);

        Location bldA = loc("A", "Building A — Clinical", dgh.id, "BUILDING", null);
        Location icu = loc("A-ICU", "Intensive Care Unit", dgh.id, "ZONE", bldA.id);
        Location theatre = loc("A-OT2", "Operating Theatre 2", dgh.id, "ROOM", bldA.id);
        Location lab = loc("A-LAB", "Clinical Laboratory", dgh.id, "ROOM", bldA.id);
        Location plant = loc("U", "Utility Plant Room", dgh.id, "BUILDING", null);
        Location line1 = loc("L1", "Tablet Line 1", ypp.id, "PRODUCTION_LINE", null);
        Location qc = loc("QC", "QC Laboratory", ypp.id, "ROOM", null);
        Location yard = loc("Y", "Vehicle Yard", lsd.id, "ZONE", null);

        // customers + SLA
        Customer c1 = customer("CUS-LQH", "Laquintinie Hospital", "HEALTHCARE", "Dr. Marie Ngo", "facilities@laquintinie.cm", client1.id);
        Customer c2 = customer("CUS-SPC", "Sanaga Pharma Company", "PHARMA", "Paul Essomba", "maintenance@sanagapharma.cm", client2.id);
        Customer c3 = customer("CUS-HTL", "Akwa Palace Hotel", "HOSPITALITY", "Lydie Mbarga", "engineering@akwapalace.cm", null);
        ids.put("c1", c1.id); ids.put("c2", c2.id);
        SlaPolicy slaCrit = sla("Critical — 4h fix", "CRITICAL", "1", "4");
        sla("High — next business day", "HIGH", "4", "24");
        sla("Medium — 3 days", "MEDIUM", "8", "72");
        sla("Low — 10 days", "LOW", "24", "240");
        SlaPolicy slaPlanned = sla("Planned — 30 days", "PLANNED", "72", "720");
        ServiceContract k1 = contract(c2.id, "Full service — tablet line & QC lab", "FULL_SERVICE", slaCrit.id, "48000000", "MONTHLY", "ACTIVE");
        contract(c1.id, "Biomedical preventive maintenance", "PREVENTIVE_ONLY", slaPlanned.id, "18000000", "QUARTERLY", "ACTIVE");
        contract(c3.id, "HVAC on-call support", "ON_CALL", null, "6000000", "PER_JOB", "DRAFT");
        ids.put("k1", k1.id);

        // users
        user("Amina Tchoua", "admin@opes.demo", "ADMIN", dgh.id, null);
        user("Jean-Pierre Kamga", "manager@opes.demo", "MANAGER", dgh.id, null);
        user("Clarisse Ewane", "planner@opes.demo", "PLANNER", dgh.id, null);
        user("Boris Nkeng", "dispatcher@opes.demo", "DISPATCHER", dgh.id, null);
        AppUser t1 = user("Samuel Fotso", "tech@opes.demo", "TECHNICIAN", dgh.id, null);
        AppUser t2 = user("Grace Nyamsi", "tech2@opes.demo", "TECHNICIAN", dgh.id, null);
        AppUser t3 = user("Eric Manga", "tech3@opes.demo", "TECHNICIAN", ypp.id, null);
        user("Rose Abena", "stores@opes.demo", "STOREKEEPER", dgh.id, null);
        user("Victor Ondoa", "safety@opes.demo", "SAFETY_OFFICER", dgh.id, null);
        user("Nadine Ebode", "calibration@opes.demo", "CALIBRATION_OFFICER", ypp.id, null);
        user("Thierry Mvondo", "commercial@opes.demo", "COMMERCIAL", dgh.id, null);
        user("Esther Bella", "procurement@opes.demo", "PROCUREMENT", dgh.id, null);
        user("Hélène Atangana", "auditor@opes.demo", "AUDITOR", dgh.id, null);
        user("Paul Essomba", "customer@opes.demo", "CUSTOMER", ypp.id, c2.id);
        user("Marc Djomo", "tech4@opes.demo", "TECHNICIAN", dgh.id, null);
        AppUser contractorUser = user("Aristide Ngando", "contractor@opes.demo", "TECHNICIAN", dgh.id, null);
        contractorUser.organizationId = contractor.id;
        crud.repo(AppUser.class).save(contractorUser);

        Delegation d = new Delegation();
        d.delegatorId = users.get("manager@opes.demo").id; d.delegateId = users.get("planner@opes.demo").id;
        d.permission = "APPROVE_WORK_ORDERS"; d.validFrom = Instant.now().minus(Duration.ofDays(2)); d.validTo = Instant.now().plus(Duration.ofDays(12));
        d.reason = "Manager on annual leave"; d.reviewerId = users.get("admin@opes.demo").id;
        crud.persistNew(d);
        device(t1.id, "TAB-SF-01", "ANDROID", "TRUSTED");
        device(t2.id, "TAB-GN-02", "ANDROID", "TRUSTED");
        device(t3.id, "PH-EM-07", "IOS", "REVOKED");

        // technicians
        Technician tf = tech(t1.id, "Samuel Fotso", "T-104", "BIOMEDICAL", "4500", dgh.id, "AVAILABLE", "Infusion pumps, ventilators, patient monitors");
        Technician tg = tech(t2.id, "Grace Nyamsi", "T-117", "ELECTRICAL", "4200", dgh.id, "ON_JOB", "LV switchgear, generators, UPS");
        Technician te = tech(t3.id, "Eric Manga", "T-122", "MECHANICAL", "4000", ypp.id, "AVAILABLE", "Tablet presses, compressors, pumps");
        Technician tm = tech(users.get("tech4@opes.demo").id, "Marc Djomo", "T-131", "HVAC", "3900", dgh.id, "AVAILABLE", "Chillers, AHUs, cold rooms");
        Technician tc = tech(contractorUser.id, "Aristide Ngando", "C-009", "ELECTRICAL", "6500", dgh.id, "OFF_SHIFT", "HV switching (contractor)");
        tc.contractor = true; tc.contractorOrgId = contractor.id;
        ids.put("tf", tf.id); ids.put("tg", tg.id); ids.put("te", te.id); ids.put("tm", tm.id);

        // assets
        Asset gen = asset("GEN-001", "Standby generator 500 kVA", "GENERATOR", "Caterpillar", "C15", "CAT0C15X01", "A_CRITICAL", dgh.id, plant.id, null, "185000000", 20);
        Asset ats = asset("ATS-001", "Automatic transfer switch", "ELECTRICAL", "Schneider Electric", "TransferPacT", "SE-ATS-8812", "A_CRITICAL", dgh.id, plant.id, gen.id, "12500000", 15);
        Asset chiller = asset("CHL-002", "Water-cooled chiller 350 kW", "HVAC", "Carrier", "30XW", "CR30XW2219", "B_HIGH", dgh.id, plant.id, null, "96000000", 20);
        Asset ahu = asset("AHU-OT2", "Theatre air handling unit", "HVAC", "Daikin", "D-AHU 12", "DK-AHU-7731", "A_CRITICAL", dgh.id, theatre.id, null, "38000000", 15);
        Asset vent = asset("VEN-ICU-03", "ICU ventilator", "MEDICAL_DEVICE", "Dräger", "Evita V500", "DR-V500-33102", "A_CRITICAL", dgh.id, icu.id, null, "24500000", 10);
        Asset vent2 = asset("VEN-ICU-04", "ICU ventilator", "MEDICAL_DEVICE", "Dräger", "Evita V500", "DR-V500-33117", "A_CRITICAL", dgh.id, icu.id, null, "24500000", 10);
        Asset mon = asset("MON-ICU-11", "Patient monitor", "MEDICAL_DEVICE", "Philips", "IntelliVue MX550", "PH-MX550-9120", "B_HIGH", dgh.id, icu.id, null, "6200000", 8);
        Asset pump = asset("INF-ICU-21", "Infusion pump", "MEDICAL_DEVICE", "B. Braun", "Infusomat Space", "BB-IS-552001", "B_HIGH", dgh.id, icu.id, null, "1900000", 8);
        Asset analyzer = asset("LAB-HEM-01", "Haematology analyzer", "LABORATORY", "Sysmex", "XN-1000", "SY-XN1-44821", "B_HIGH", dgh.id, lab.id, null, "42000000", 10);
        Asset ups = asset("UPS-OT-01", "Theatre UPS 60 kVA", "ELECTRICAL", "Eaton", "93PM", "ET-93PM-1021", "A_CRITICAL", dgh.id, theatre.id, null, "21000000", 12);
        Asset press = asset("TBP-L1-01", "Rotary tablet press", "PRODUCTION", "Fette", "FE35", "FT-FE35-3307", "A_CRITICAL", ypp.id, line1.id, null, "310000000", 20);
        Asset comp = asset("CMP-L1-02", "Oil-free air compressor", "PRODUCTION", "Atlas Copco", "ZR 90", "AC-ZR90-5512", "B_HIGH", ypp.id, line1.id, null, "54000000", 15);
        Asset balance = asset("QC-BAL-01", "Analytical balance", "LABORATORY", "Mettler Toledo", "XPR205", "MT-XPR-88231", "B_HIGH", ypp.id, qc.id, null, "7400000", 10);
        Asset hplc = asset("QC-HPLC-02", "HPLC system", "LABORATORY", "Agilent", "1260 Infinity II", "AG-1260-77310", "B_HIGH", ypp.id, qc.id, null, "68000000", 12);
        Asset thermo = asset("QC-TH-05", "Reference thermometer", "LABORATORY", "Fluke", "1524", "FL-1524-0091", "C_MEDIUM", ypp.id, qc.id, null, "2100000", 10);
        Asset truck = asset("VEH-LSD-01", "Service truck", "VEHICLE", "Toyota", "Hilux", "AHTFR22G2010", "C_MEDIUM", lsd.id, yard.id, null, "28000000", 8);
        Asset van = asset("VEH-LSD-02", "Parts delivery van", "VEHICLE", "Renault", "Master", "VF1MA0001234", "C_MEDIUM", lsd.id, yard.id, null, "22000000", 8);
        Asset cold = asset("CLD-PH-01", "Pharmacy cold room", "HVAC", "Thermo King", "CR-12", "TK-CR12-2204", "A_CRITICAL", dgh.id, bldA.id, null, "15500000", 12);
        press.customerId = c2.id; comp.customerId = c2.id; balance.customerId = c2.id; hplc.customerId = c2.id; thermo.customerId = c2.id;
        ids.put("gen", gen.id); ids.put("chiller", chiller.id); ids.put("ahu", ahu.id); ids.put("vent", vent.id); ids.put("vent2", vent2.id);
        ids.put("mon", mon.id); ids.put("pump", pump.id); ids.put("analyzer", analyzer.id); ids.put("ups", ups.id); ids.put("press", press.id);
        ids.put("comp", comp.id); ids.put("balance", balance.id); ids.put("hplc", hplc.id); ids.put("thermo", thermo.id); ids.put("cold", cold.id);
        ids.put("ats", ats.id); ids.put("truck", truck.id);

        assetSvc.issueToken(gen.id);
        assetSvc.issueToken(vent.id);
        assetSvc.issueToken(press.id);

        // meters
        Meter genHours = meter(gen.id, "Engine run hours", "CUMULATIVE", "h", null);
        Meter pressCycles = meter(press.id, "Compression cycles", "CUMULATIVE", "kcycles", null);
        Meter chlTemp = meter(chiller.id, "Leaving water temperature", "INSTANTANEOUS", "°C", "15");
        Meter truckOdo = meter(truck.id, "Odometer", "CUMULATIVE", "km", null);
        ids.put("genHours", genHours.id); ids.put("pressCycles", pressCycles.id);
        reading(genHours.id, "1180", 40); reading(genHours.id, "1236", 20); reading(genHours.id, "1290", 2);
        reading(pressCycles.id, "8400", 30); reading(pressCycles.id, "9120", 5);
        reading(chlTemp.id, "6.8", 3); reading(chlTemp.id, "7.1", 1);
        reading(truckOdo.id, "84210", 15); reading(truckOdo.id, "85960", 1);

        // fleet
        Vehicle v1 = new Vehicle();
        v1.assetId = truck.id; v1.plateNumber = "LT 482 AB"; v1.make = "Toyota"; v1.model = "Hilux"; v1.year = 2021; v1.fuelType = "DIESEL";
        v1.odometerKm = new BigDecimal("85960"); v1.driverName = "Daniel Ekwalla"; v1.insuranceExpiry = LocalDate.now().plusMonths(4);
        v1.inspectionExpiry = LocalDate.now().plusDays(25); v1.status = "IN_USE"; v1.vin = "AHTFR22G2010";
        crud.persistNew(v1);
        Vehicle v2 = new Vehicle();
        v2.assetId = van.id; v2.plateNumber = "LT 115 CF"; v2.make = "Renault"; v2.model = "Master"; v2.year = 2019; v2.fuelType = "DIESEL";
        v2.odometerKm = new BigDecimal("132400"); v2.driverName = "Ibrahim Moussa"; v2.insuranceExpiry = LocalDate.now().plusDays(18);
        v2.status = "AVAILABLE";
        crud.persistNew(v2);
        for (int i = 0; i < 4; i++) {
            FuelLog f = new FuelLog();
            f.vehicleId = i % 2 == 0 ? v1.id : v2.id; f.filledAt = Instant.now().minus(Duration.ofDays(3 + i * 7L));
            f.liters = new BigDecimal(55 + i * 3); f.cost = new BigDecimal(55 + i * 3).multiply(new BigDecimal("828")); f.odometerKm = new BigDecimal(85960 - i * 420);
            f.station = i % 2 == 0 ? "Total Bonanjo" : "Tradex Limbe"; f.driverName = i % 2 == 0 ? "Daniel Ekwalla" : "Ibrahim Moussa";
            crud.persistNew(f);
        }

        // failure codes
        for (String[] fc : new String[][]{{"P-NOSTART", "Will not start", "PROBLEM", "GENERATOR"}, {"P-OVERHEAT", "Overheating", "PROBLEM", "HVAC"},
                {"P-ALARM", "Device alarm", "PROBLEM", "MEDICAL_DEVICE"}, {"P-LEAK", "Leak", "PROBLEM", "PLUMBING"}, {"P-VIBR", "Excessive vibration", "PROBLEM", "PRODUCTION"},
                {"C-WEAR", "Normal wear", "CAUSE", ""}, {"C-ELEC", "Electrical fault", "CAUSE", ""}, {"C-OPER", "Operator error", "CAUSE", ""}, {"C-CONTAM", "Contamination", "CAUSE", ""},
                {"R-REPLACE", "Replaced component", "REMEDY", ""}, {"R-ADJUST", "Adjusted / calibrated", "REMEDY", ""}, {"R-CLEAN", "Cleaned", "REMEDY", ""}, {"R-REPAIR", "Repaired", "REMEDY", ""}}) {
            FailureCode f = new FailureCode();
            f.code = fc[0]; f.name = fc[1]; f.codeType = fc[2]; f.assetType = fc[3].isEmpty() ? null : fc[3]; f.active = true;
            crud.persistNew(f);
        }

        // vendors + inventory
        Vendor vMed = vendor("V-MDS", "MedDevice Supply Ltd", "OEM", "Chidi Okafor", "orders@meddevice.ng", "NG", 4);
        Vendor vElec = vendor("V-CFAO", "CFAO Equipment Cameroun", "PARTS", "Alain Tchinda", "sales@cfao-equip.cm", "CM", 5);
        Vendor vCal = vendor("V-CALAB", "Cal-Lab Afrique", "CALIBRATION", "Sandrine Owona", "lab@calabafrique.cm", "CM", 4);
        vendor("V-ELX", "ElectroTech Services SARL", "CONTRACTOR", "Aristide Ngando", "ops@electrotech.cm", "CM", 3);
        ids.put("vMed", vMed.id); ids.put("vElec", vElec.id); ids.put("vCal", vCal.id);
        Warehouse main = wh("WH-DGH", "Main store — Douala", dgh.id, "MAIN_STORE", "Rose Abena");
        Warehouse sat = wh("WH-YPP", "Plant store — Yaoundé", ypp.id, "SATELLITE", "Eric Manga");
        Warehouse van1 = wh("VAN-01", "Van stock — Service truck", lsd.id, "VAN", "Daniel Ekwalla");
        wh("WH-QUAR", "Quarantine cage", dgh.id, "QUARANTINE", "Rose Abena");
        ids.put("main", main.id); ids.put("sat", sat.id);
        Part filter = part("P-1001", "Oil filter CAT 1R-0750", "Generator", "pcs", "18500", "4", "10", true, vElec.id);
        Part fuelF = part("P-1002", "Fuel filter CAT 1R-0751", "Generator", "pcs", "16200", "4", "10", false, vElec.id);
        Part belt = part("P-2001", "AHU drive belt B-68", "HVAC", "pcs", "9800", "6", "12", false, vElec.id);
        Part hepa = part("P-2002", "HEPA filter H14 610×610", "HVAC", "pcs", "145000", "4", "8", true, vElec.id);
        Part refr = part("P-2003", "Refrigerant R-134a 13.6 kg", "HVAC", "cyl", "92000", "2", "4", false, vElec.id);
        Part o2 = part("P-3001", "Ventilator O2 sensor", "Biomedical", "pcs", "210000", "3", "6", true, vMed.id);
        Part flow = part("P-3002", "Ventilator flow sensor", "Biomedical", "pcs", "165000", "3", "6", true, vMed.id);
        Part spo2 = part("P-3003", "SpO2 sensor adult", "Biomedical", "pcs", "38000", "10", "20", false, vMed.id);
        Part battery = part("P-4001", "UPS battery 12V 9Ah", "Electrical", "pcs", "24000", "20", "40", true, vElec.id);
        Part punch = part("P-5001", "Tablet press punch set D", "Production", "set", "1250000", "1", "2", true, vMed.id);
        Part bearing = part("P-5002", "Bearing SKF 6205-2RS", "Production", "pcs", "7600", "10", "20", false, vElec.id);
        Part grease = part("P-5003", "Food-grade grease H1 400 g", "Production", "tube", "6900", "12", "24", false, vElec.id);
        ids.put("filter", filter.id); ids.put("o2", o2.id); ids.put("belt", belt.id); ids.put("bearing", bearing.id); ids.put("battery", battery.id); ids.put("hepa", hepa.id);
        Object[][] stock = {{filter, main, "12"}, {fuelF, main, "9"}, {belt, main, "15"}, {hepa, main, "5"}, {refr, main, "3"}, {o2, main, "4"},
                {flow, main, "2"}, {spo2, main, "26"}, {battery, main, "18"}, {punch, sat, "2"}, {bearing, sat, "30"}, {grease, sat, "8"},
                {filter, van1, "2"}, {bearing, main, "6"}};
        for (Object[] s : stock) {
            Part p = (Part) s[0];
            inv.receive(p.id, ((Warehouse) s[1]).id, new BigDecimal((String) s[2]), p.unitCost, "Opening balance", "seed:open:" + p.partNo + ":" + ((Warehouse) s[1]).code);
        }
        CycleCount cc = new CycleCount();
        cc.warehouseId = main.id; cc.partId = spo2.id; cc.countedQty = new BigDecimal("25"); cc.countedAt = Instant.now().minus(Duration.ofDays(1)); cc.countedBy = "Rose Abena"; cc.status = "DRAFT";
        crud.persistNew(cc);
        CycleCount cc2 = new CycleCount();
        cc2.warehouseId = main.id; cc2.partId = belt.id; cc2.countedQty = new BigDecimal("14"); cc2.countedAt = Instant.now().minus(Duration.ofDays(8)); cc2.countedBy = "Rose Abena"; cc2.status = "DRAFT";
        crud.persistNew(cc2);
        inv.postCycleCount(cc2.id);

        // settings, inspection templates, compliance
        setting("workorder.separation_of_duties", "true", "Work orders", "Performer cannot review their own work");
        setting("pm.lead_days_default", "7", "Preventive maintenance", "Days before due date that PM work is generated");
        setting("mobile.max_offline_hours", "72", "Mobile", "Maximum offline period before re-authentication");
        setting("locale.default", "fr-CM", "Localization", "Default locale for new users");
        setting("reports.retention_years", "10", "Records", "Retention for closed maintenance records");
        setting("location.tracking", "enabled", "Privacy", "Allow technician location capture during active jobs");
        InspectionTemplate it1 = template("INS-VENT", "Ventilator safety inspection", "MEDICAL_DEVICE",
                "Visual inspection of casing and cables\nAlarm function test\nO2 sensor calibration check\nLeak test passed\nElectrical safety test (IEC 62353)\nLabel and asset tag present");
        InspectionTemplate it2 = template("INS-GEN", "Generator weekly check", "GENERATOR",
                "Oil level within range\nCoolant level within range\nBattery voltage ≥ 24 V\nNo visible leaks\nTest run 15 min under load\nFuel tank above 50%");
        template("INS-FIRE", "Fire extinguisher monthly check", "BUILDING", "Pressure gauge in green zone\nSafety pin and seal intact\nNo visible damage\nInspection tag updated");
        ids.put("it1", it1.id); ids.put("it2", it2.id);
        compliance("Electrical installation inspection", "Arrêté MINEE 2018", "ELECTRICAL", "ANNUAL", 40, "Grace Nyamsi", "COMPLIANT");
        compliance("Medical device electrical safety", "IEC 62353", "MEDICAL_DEVICE", "ANNUAL", 12, "Samuel Fotso", "DUE");
        compliance("Pressure vessel inspection — compressor receiver", "Décret 2014/2379", "PRODUCTION", "BIENNIAL", -5, "Eric Manga", "OVERDUE");
        compliance("GMP equipment qualification review", "WHO TRS 986 Annex 2", "PRODUCTION", "ANNUAL", 90, "Nadine Ebode", "COMPLIANT");
        compliance("Fire safety system test", "Code de sécurité incendie", "BUILDING", "QUARTERLY", 20, "Victor Ondoa", "COMPLIANT");

        // sensors & integrations
        Sensor s1 = sensor(chiller.id, "Chiller leaving water temp", "TEMPERATURE", "°C", "4", "9", "2", "12");
        Sensor s2 = sensor(press.id, "Press main bearing vibration", "VIBRATION", "mm/s", null, "4.5", null, "7.1");
        Sensor s3 = sensor(cold.id, "Cold room temperature", "TEMPERATURE", "°C", "2", "8", "1", "10");
        sensor(gen.id, "Generator battery voltage", "CURRENT", "V", "24", null, "22.5", null);
        integration.ingest(s1.id, new BigDecimal("7.2"));
        integration.ingest(s2.id, new BigDecimal("5.3"));
        integration.ingest(s3.id, new BigDecimal("10.6"));
        integ("OPES ERP — billing", "ERP", "https://erp.opes.cm/api/v2", "OAUTH2", "ENABLED");
        integ("Keycloak — SSO", "IDENTITY", "https://sso.opes.cm/realms/opes", "OAUTH2", "ENABLED");
        integ("Plant edge gateway (read-only)", "IOT_GATEWAY", "mqtts://edge.ypp.local:8883", "MTLS", "ENABLED");
        integ("Building management system", "BMS", "http://bms.dgh.local", "API_KEY", "DISABLED");
        WebhookSubscription wh = new WebhookSubscription();
        wh.url = "https://erp.opes.cm/hooks/maintenance"; wh.eventTypes = "WorkOrderClosed.v1, QuoteApproved.v1, BillingExportGenerated.v1";
        crud.persistNew(wh);
    }

    private void seedOperations() {
        UUID dgh = ids.get("dgh"), ypp = ids.get("ypp");

        // PM plans
        PmPlan p1 = pmPlan("Generator 250-hour service", ids.get("gen"), "CALENDAR_OR_METER", 3, "MONTH", LocalDate.now().minusMonths(2).withDayOfMonth(5),
                ids.get("genHours"), "250", "4", "Change engine oil and filter\nReplace fuel filter\nInspect belts and hoses\nCheck coolant and battery\nLoad test 30 minutes");
        PmPlan p2 = pmPlan("Ventilator preventive maintenance", ids.get("vent"), "CALENDAR", 6, "MONTH", LocalDate.now().plusDays(5).minusMonths(6),
                null, null, "3", "Replace O2 sensor if > 12 months\nRun self-test\nVerify alarms\nElectrical safety test\nUpdate service label");
        PmPlan p3 = pmPlan("Theatre AHU filter change", ids.get("ahu"), "CALENDAR", 1, "MONTH", LocalDate.now().plusDays(3).minusMonths(1),
                null, null, "2", "Replace pre-filters\nInspect HEPA differential pressure\nCheck belt tension\nClean drain pan");
        PmPlan p4 = pmPlan("Tablet press lubrication", ids.get("press"), "METER", null, null, LocalDate.now().minusMonths(1),
                ids.get("pressCycles"), "1000", "1.5", "Lubricate punches and dies\nInspect cam track\nCheck guards and interlocks");
        PmPlan p5 = pmPlan("Chiller quarterly inspection", ids.get("chiller"), "CALENDAR", 3, "MONTH", LocalDate.now().plusDays(10), null, null, "4",
                "Check refrigerant pressures\nInspect condenser tubes\nVerify safety controls\nRecord approach temperatures");
        pm.command(p1.id, "activate");
        pm.command(p2.id, "activate");
        pm.command(p3.id, "activate");
        pm.command(p4.id, "approve");
        pm.command(p4.id, "activate");
        pm.command(p5.id, "approve");
        pm.generateDue(tenantId);

        // requests
        MaintenanceRequest r1 = request("ICU ventilator VEN-ICU-04 high-pressure alarm", "Repeated high airway pressure alarm during patient use; device swapped out.", ids.get("vent2"), dgh, "CRITICAL", "BREAKDOWN", "Nurse Odile Kom");
        MaintenanceRequest r2 = request("Theatre 2 temperature too high", "Theatre ambient 26 °C during morning list; surgeons report discomfort.", ids.get("ahu"), dgh, "HIGH", "MECHANICAL", "Dr. Fabrice Nguema");
        MaintenanceRequest r3 = request("Water leak under lab sink", "Small leak at trap, bucket placed.", null, dgh, "LOW", "PLUMBING", "Lab tech Carine");
        MaintenanceRequest r4 = request("Tablet press abnormal noise", "Knocking noise at turret speed above 60 rpm.", ids.get("press"), ypp, "HIGH", "MECHANICAL", "Shift lead Albert");
        MaintenanceRequest r5 = request("Corridor lights flickering — Block A level 1", "Fluorescent tubes flickering near pharmacy.", null, dgh, "MEDIUM", "ELECTRICAL", "Security desk");
        MaintenanceRequest r6 = request("Theatre 2 too warm (duplicate)", "Same issue reported by anaesthesia team.", ids.get("ahu"), dgh, "HIGH", "MECHANICAL", "Dr. Anne Biyong");
        r4.customerId = ids.get("c2");
        as("dispatcher@opes.demo", () -> {
            requests.acknowledge(r2.id);
            requests.triage(r2.id, Map.of("note", "Check AHU belt and chilled water valve"));
            requests.acknowledge(r5.id);
            requests.reject(r3.id, Map.of("reason", "Handled by housekeeping plumbing contractor"));
            return null;
        });
        WorkOrder wVent = as("dispatcher@opes.demo", () -> requests.convert(r1.id, Map.of()));
        WorkOrder wAhu = as("dispatcher@opes.demo", () -> requests.convert(r2.id, Map.of()));
        as("dispatcher@opes.demo", () -> requests.linkDuplicate(r6.id, r2.id));
        WorkOrder wPress = as("dispatcher@opes.demo", () -> requests.convert(r4.id, Map.of()));

        // Completed & closed corrective history (for KPIs and reports)
        closedHistory(ids.get("vent2"), dgh, "Ventilator flow sensor failure", "EMERGENCY", "CRITICAL", ids.get("tf"), 40, 3.5, ids.get("o2"));
        closedHistory(ids.get("gen"), dgh, "Generator failed to start on test", "CORRECTIVE", "HIGH", ids.get("tg"), 33, 5, ids.get("filter"));
        closedHistory(ids.get("chiller"), dgh, "Chiller high head pressure trip", "CORRECTIVE", "HIGH", ids.get("tm"), 26, 6, null);
        closedHistory(ids.get("press"), ypp, "Press turret bearing noise", "CORRECTIVE", "HIGH", ids.get("te"), 21, 4, ids.get("bearing"));
        closedHistory(ids.get("press"), ypp, "Press feeder jam", "CORRECTIVE", "MEDIUM", ids.get("te"), 14, 2, null);
        closedHistory(ids.get("press"), ypp, "Press punch breakage", "EMERGENCY", "CRITICAL", ids.get("te"), 9, 7, null);
        closedHistory(ids.get("ups"), dgh, "UPS battery alarm", "CORRECTIVE", "HIGH", ids.get("tg"), 5, 3, ids.get("battery"));
        closedHistory(ids.get("cold"), dgh, "Cold room door seal replacement", "CORRECTIVE", "MEDIUM", ids.get("tm"), 3, 2, null);

        // Active pipeline in various states
        as("planner@opes.demo", () -> {
            task(wVent.id, "Download alarm log"); task(wVent.id, "Replace flow sensor"); task(wVent.id, "Run full self-test"); task(wVent.id, "Electrical safety test");
            task(wAhu.id, "Inspect drive belt"); task(wAhu.id, "Check chilled water valve actuator"); task(wAhu.id, "Verify theatre temperature ≤ 22 °C");
            task(wPress.id, "Vibration measurement"); task(wPress.id, "Inspect upper cam track"); task(wPress.id, "Replace worn bearings");
            return null;
        });
        advance(wVent.id, "APPROVED", 4);
        plan(wVent.id, ids.get("tf"), 4);
        advance(wVent.id, "DISPATCHED", 0);
        as("tech@opes.demo", () -> wo.transition(wVent.id, "IN_PROGRESS", null, ver(wVent.id)));
        as("tech@opes.demo", () -> {
            WorkTask first = ((com.opesware.maintain.maintenance.infrastructure.WorkTaskRepository) crud.repo(WorkTask.class)).findByWorkOrderId(wVent.id).stream().filter(t -> t.sequence == 1).findFirst().orElseThrow();
            return wo.recordTask(wVent.id, first.id, Map.of("status", "DONE", "result", "Log shows flow sensor drift"));
        });
        as("tech@opes.demo", () -> inv.reserve(ids.get("o2"), ids.get("main"), wVent.id, BigDecimal.ONE, "seed:res:vent"));
        advance(wAhu.id, "APPROVED", 3);
        plan(wAhu.id, ids.get("tm"), 3);
        advance(wPress.id, "TRIAGED", 0);
        WorkOrder emergency = new WorkOrder();
        emergency.title = "Pharmacy cold room temperature alarm";
        emergency.description = "Cold room at 10.6 °C; vaccines moved to backup fridge.";
        emergency.workType = "EMERGENCY"; emergency.priority = "CRITICAL"; emergency.assetId = ids.get("cold"); emergency.siteId = dgh;
        WorkOrder em = crud.persistNew(emergency);
        task(em.id, "Check compressor and condenser fan");
        WorkOrder hold = new WorkOrder();
        hold.title = "Replace ATS control module"; hold.workType = "CORRECTIVE"; hold.priority = "HIGH"; hold.assetId = ids.get("ats"); hold.siteId = dgh;
        hold.estimatedHours = new BigDecimal("6"); hold.permitRequired = true;
        WorkOrder holdWo = crud.persistNew(hold);
        task(holdWo.id, "Isolate and lock out ATS");
        task(holdWo.id, "Replace control module");
        task(holdWo.id, "Functional transfer test");
        advance(holdWo.id, "APPROVED", 0);
        as("manager@opes.demo", () -> wo.transition(holdWo.id, "ON_HOLD", null, withVer(holdWo.id, Map.of("reason", "Awaiting control module from OEM"))));
        WorkOrder ins = new WorkOrder();
        ins.title = "Monthly fire extinguisher inspection — Block A"; ins.workType = "INSPECTION"; ins.priority = "PLANNED"; ins.siteId = dgh;
        ins.dueAt = Instant.now().plus(Duration.ofDays(6));
        crud.persistNew(ins);
        WorkOrder awaiting = closedHistoryUntil(ids.get("comp"), ypp, "Compressor air dryer service", "PREVENTIVE", "PLANNED", ids.get("te"), 2, 3, "WORK_COMPLETED");
        awaiting.customerId = ids.get("c2");
        crud.saveDomain(awaiting, "UPDATE", null, Map.of());

        // assignments for dispatch calendar
        for (int i = 0; i < 6; i++) {
            WorkOrder w = new WorkOrder();
            w.title = List.of("Infusion pump PM batch", "Patient monitor calibration check", "Generator weekly test run", "AHU belt inspection", "HPLC pump seal check", "Cold room defrost check").get(i);
            w.workType = i == 4 ? "PREVENTIVE" : "INSPECTION"; w.priority = "PLANNED"; w.siteId = i == 4 ? ypp : dgh;
            w.assetId = List.of(ids.get("pump"), ids.get("mon"), ids.get("gen"), ids.get("ahu"), ids.get("hplc"), ids.get("cold")).get(i);
            w.estimatedHours = new BigDecimal("2");
            WorkOrder saved = crud.persistNew(w);
            task(saved.id, "Perform checklist");
            advance(saved.id, "APPROVED", 0);
            UUID tech = List.of(ids.get("tf"), ids.get("tf"), ids.get("tg"), ids.get("tm"), ids.get("te"), ids.get("tm")).get(i);
            Instant start = java.time.LocalDate.now().plusDays(1 + i % 4).atTime(8 + (i % 3) * 3, 0).atZone(java.time.ZoneId.of("Africa/Douala")).toInstant();
            assign(saved.id, tech, start, start.plus(Duration.ofHours(2)));
            as("planner@opes.demo", () -> wo.transition(saved.id, "PLANNED", null, ver(saved.id)));
            if (i < 3) as("dispatcher@opes.demo", () -> wo.transition(saved.id, "DISPATCHED", null, ver(saved.id)));
        }

        // downtime
        downtime(ids.get("press"), "UNPLANNED", "Punch breakage", "PRODUCTION_STOP", 9, 7);
        downtime(ids.get("press"), "UNPLANNED", "Bearing noise", "DEGRADED", 21, 4);
        downtime(ids.get("gen"), "UNPLANNED", "Failed start", "NONE", 33, 5);
        downtime(ids.get("vent2"), "UNPLANNED", "Flow sensor failure", "PATIENT_IMPACT", 40, 3.5);
        downtime(ids.get("chiller"), "PLANNED", "Quarterly service", "DEGRADED", 26, 6);
        DowntimeEvent open = new DowntimeEvent();
        open.assetId = ids.get("vent2"); open.downtimeType = "UNPLANNED"; open.failureMode = "High-pressure alarm"; open.impact = "PATIENT_IMPACT";
        open.startedAt = Instant.now().minus(Duration.ofHours(30)); open.workOrderId = wVent.id;
        crud.persistNew(open);

        // permits
        WorkPermit pt = new WorkPermit();
        pt.permitType = "ELECTRICAL_ISOLATION"; pt.siteId = dgh; pt.assetId = ids.get("ats"); pt.workOrderId = holdWo.id;
        pt.scope = "Replace ATS control module with generator and mains isolated";
        pt.hazards = "Electric shock, arc flash, unexpected generator start"; pt.controls = "LOTO on mains breaker Q1 and generator start circuit; test for dead; arc-rated PPE";
        pt.isolationPoints = "Q1 main incomer\nGenerator start battery isolator"; pt.validFrom = Instant.now().minus(Duration.ofHours(1)); pt.validTo = Instant.now().plus(Duration.ofHours(10));
        WorkPermit permit = as("tech2@opes.demo", () -> crud.persistNew(pt));
        as("tech2@opes.demo", () -> safety.permit(permit.id, "submit", Map.of()));
        as("safety@opes.demo", () -> safety.permit(permit.id, "verify", Map.of()));
        WorkPermit hw = new WorkPermit();
        hw.permitType = "HOT_WORK"; hw.siteId = ypp; hw.assetId = ids.get("comp");
        hw.scope = "Weld bracket on compressor skid"; hw.hazards = "Fire, fumes"; hw.controls = "Fire watch 60 min, extinguisher, screens";
        hw.validFrom = Instant.now().minus(Duration.ofHours(2)); hw.validTo = Instant.now().plus(Duration.ofHours(6));
        WorkPermit hot = as("tech3@opes.demo", () -> crud.persistNew(hw));
        as("tech3@opes.demo", () -> safety.permit(hot.id, "submit", Map.of()));
        as("safety@opes.demo", () -> safety.permit(hot.id, "verify", Map.of()));
        as("safety@opes.demo", () -> safety.permit(hot.id, "issue", Map.of()));
        as("tech3@opes.demo", () -> safety.permit(hot.id, "activate", Map.of("acceptedBy", "Eric Manga")));
        WorkPermit draft = new WorkPermit();
        draft.permitType = "WORK_AT_HEIGHT"; draft.siteId = dgh; draft.scope = "Replace corridor light fittings Block A L1"; draft.hazards = "Fall from ladder";
        draft.controls = "Podium steps, second person"; draft.validFrom = Instant.now().plus(Duration.ofDays(1)); draft.validTo = Instant.now().plus(Duration.ofDays(1).plusHours(8));
        crud.persistNew(draft);
        SafetyIncident inc = new SafetyIncident();
        inc.title = "Near miss — unguarded press during cleaning"; inc.severity = "NEAR_MISS"; inc.occurredAt = Instant.now().minus(Duration.ofDays(6));
        inc.siteId = ypp; inc.assetId = ids.get("press"); inc.description = "Operator began cleaning while turret was coasting down."; inc.immediateAction = "Toolbox talk; interlock check added to PM";
        inc.status = "ACTIONS_ASSIGNED";
        crud.persistNew(inc);
        SafetyIncident inc2 = new SafetyIncident();
        inc2.title = "Minor cut while replacing filter"; inc2.severity = "MINOR"; inc2.occurredAt = Instant.now().minus(Duration.ofDays(15)); inc2.siteId = dgh;
        inc2.description = "Technician cut finger on AHU frame edge."; inc2.immediateAction = "First aid; edge guards ordered"; inc2.status = "CLOSED";
        crud.persistNew(inc2);

        // inspections
        inspection(ids.get("it1"), ids.get("vent"), "PASS", "Visual inspection of casing and cables: PASS\nAlarm function test: PASS\nO2 sensor calibration check: PASS\nLeak test passed: PASS\nElectrical safety test (IEC 62353): PASS\nLabel and asset tag present: PASS", null);
        inspection(ids.get("it2"), ids.get("gen"), "FAIL", "Oil level within range: PASS\nCoolant level within range: PASS\nBattery voltage ≥ 24 V: FAIL\nNo visible leaks: PASS\nTest run 15 min under load: PASS\nFuel tank above 50%: PASS", "Battery voltage 22.9 V — replace starter batteries");

        // calibration
        CalibrationPlan cp1 = calPlan(ids.get("balance"), "OIML R76 / USP <41>", 12, "± 0.1 mg", "Cal-Lab Afrique", LocalDate.now().plusDays(9));
        CalibrationPlan cp2 = calPlan(ids.get("thermo"), "ISO/IEC 17025 traceable", 12, "± 0.05 °C", "Cal-Lab Afrique", LocalDate.now().plusMonths(7));
        calPlan(ids.get("hplc"), "Agilent OQ/PV protocol", 6, "Flow ± 1 %", "Agilent Service", LocalDate.now().minusDays(4));
        calPlan(ids.get("mon"), "IEC 60601-2-49 NIBP accuracy", 12, "± 3 mmHg", "In-house biomedical", LocalDate.now().plusMonths(3));
        CalibrationEvent ce1 = calEvent(cp2.id, ids.get("thermo"), LocalDate.now().minusDays(20));
        as("calibration@opes.demo", () -> {
            calibration.command(ce1.id, "record-as-found", Map.of("asFound", "+0.03 °C at 0 °C; +0.04 °C at 100 °C", "inTolerance", true));
            calibration.command(ce1.id, "record-as-left", Map.of("asLeft", "No adjustment required", "inTolerance", true, "certificateNo", "CAL-CERT-2026-0412"));
            calibration.command(ce1.id, "review", Map.of());
            return null;
        });
        as("manager@opes.demo", () -> calibration.command(ce1.id, "approve", Map.of()));
        CalibrationEvent ce2 = calEvent(cp1.id, ids.get("balance"), LocalDate.now().minusDays(2));
        as("calibration@opes.demo", () -> calibration.command(ce2.id, "record-as-found", Map.of("asFound", "+0.18 mg at 200 g (limit ± 0.1 mg)", "inTolerance", false)));
        calEvent(cp1.id, ids.get("balance"), LocalDate.now().plusDays(9));

        // commercial
        Quote q1 = new Quote();
        q1.customerId = ids.get("c2"); q1.workOrderId = wPress.id; q1.title = "Tablet press turret overhaul"; q1.laborAmount = new BigDecimal("1850000");
        q1.partsAmount = new BigDecimal("3400000"); q1.taxRate = new BigDecimal("19.25"); q1.currency = "XAF"; q1.validUntil = LocalDate.now().plusDays(21);
        q1.notes = "Includes punch set D and bearing kit. 2-day line stoppage required.";
        Quote quote = crud.persistNew(q1);
        as("commercial@opes.demo", () -> commercial.quote(quote.id, "send"));
        Quote q2 = new Quote();
        q2.customerId = ids.get("c1"); q2.title = "Replacement of 4 infusion pumps"; q2.laborAmount = new BigDecimal("150000"); q2.partsAmount = new BigDecimal("7600000");
        q2.taxRate = new BigDecimal("19.25"); q2.currency = "XAF"; q2.validUntil = LocalDate.now().plusDays(30);
        crud.persistNew(q2);
        BillingExport bx = new BillingExport();
        bx.customerId = ids.get("c2"); bx.contractId = ids.get("k1"); bx.periodStart = LocalDate.now().minusDays(30).withDayOfMonth(1); bx.periodEnd = LocalDate.now();
        bx.currency = "XAF"; bx.targetSystem = "OPES_ERP";
        BillingExport bxs = crud.persistNew(bx);
        as("commercial@opes.demo", () -> commercial.generate(bxs.id));

        // procurement
        PurchaseRequisition pr = new PurchaseRequisition();
        pr.partId = ids.get("o2"); pr.description = "Ventilator O2 sensors — replenish critical spares"; pr.quantity = new BigDecimal("4");
        pr.estimatedCost = new BigDecimal("840000"); pr.neededBy = LocalDate.now().plusDays(14); pr.requestedBy = "Rose Abena"; pr.status = "SUBMITTED";
        PurchaseRequisition prs = crud.persistNew(pr);
        as("procurement@opes.demo", () -> procurement.decide(prs.id, "approve"));
        PurchaseOrder po = as("procurement@opes.demo", () -> procurement.convert(prs.id, ids.get("vMed")));
        po.warehouseId = ids.get("main"); po.expectedDate = LocalDate.now().plusDays(10); po.currency = "XAF";
        crud.saveDomain(po, "UPDATE", null, Map.of());
        as("procurement@opes.demo", () -> procurement.order(po.id, "issue", Map.of()));
        PurchaseRequisition pr2 = new PurchaseRequisition();
        pr2.partId = ids.get("hepa"); pr2.description = "HEPA H14 filters for theatres"; pr2.quantity = new BigDecimal("6"); pr2.estimatedCost = new BigDecimal("870000");
        pr2.neededBy = LocalDate.now().plusDays(30); pr2.requestedBy = "Clarisse Ewane"; pr2.status = "DRAFT";
        crud.persistNew(pr2);
        PurchaseOrder po2 = new PurchaseOrder();
        po2.vendorId = ids.get("vElec"); po2.partId = ids.get("bearing"); po2.quantity = new BigDecimal("20"); po2.unitPrice = new BigDecimal("7400");
        po2.warehouseId = ids.get("sat"); po2.currency = "XAF"; po2.expectedDate = LocalDate.now().minusDays(2);
        PurchaseOrder po2s = crud.persistNew(po2);
        as("procurement@opes.demo", () -> procurement.order(po2s.id, "issue", Map.of()));
        as("stores@opes.demo", () -> procurement.order(po2s.id, "receive", Map.of("quantity", "12")));

        // documents & reports & notifications
        doc("Dräger Evita V500 — service manual", "MANUAL", "Asset", ids.get("vent").toString());
        doc("Generator warranty certificate", "WARRANTY", "Asset", ids.get("gen").toString());
        doc("Thermometer calibration certificate CAL-CERT-2026-0412", "CERTIFICATE", "Asset", ids.get("thermo").toString());
        doc("LOTO standard operating procedure", "SOP", "Site", dgh.toString());
        doc("Utility plant single-line diagram", "DRAWING", "Site", dgh.toString());
        doc("Full service contract — Sanaga Pharma", "CONTRACT", "Customer", ids.get("c2").toString());
        ReportJob rj = new ReportJob();
        rj.reportType = "PM_COMPLIANCE"; rj.parameters = "last 365 days";
        crud.persistNew(rj);
        ReportJob rj2 = new ReportJob();
        rj2.reportType = "INVENTORY_VALUATION";
        crud.persistNew(rj2);
        notify("role:MANAGER", "SLA at risk: " + em.number, "Critical cold room alarm due within 4 hours.", "/m/work-orders/" + em.id);
        notify("role:MANAGER", "Quote awaiting customer approval", quote.number + " sent to Sanaga Pharma.", "/m/quotes/" + quote.id);
        notify("role:STOREKEEPER", "Low stock: Ventilator flow sensor", "Available quantity is at reorder point.", "/m/parts/" + ids.get("o2"));
        notify("role:TECHNICIAN", "New assignment", "You have been dispatched to " + wVent.number + ".", "/technician");
        notify("role:SAFETY_OFFICER", "Permit awaiting issue", "Electrical isolation permit verified and ready to issue.", "/m/work-permits/" + permit.id);
        notify(null, "Welcome to OPES Maintain", "Your demo workspace is ready. Explore modules from the sidebar.", "/");

        insights.refresh(tenantId);
    }

    // ------------------------------------------------------------------ builders
    private Organization org(String code, String name, String kind, String country) {
        Organization o = new Organization();
        o.code = code; o.name = name; o.kind = kind; o.legalName = name; o.country = country; o.timeZone = "Africa/Douala"; o.currency = "XAF";
        o.language = "FR"; o.plan = "ENTERPRISE"; o.status = "ACTIVE"; o.email = "contact@" + code.toLowerCase() + ".cm";
        return crud.persistNew(o);
    }

    private Site site(String code, String name, String city, String tz, UUID orgId) {
        Site s = new Site();
        s.code = code; s.name = name; s.city = city; s.country = "Cameroon"; s.region = city.equals("Yaoundé") ? "Centre" : "Littoral"; s.timeZone = tz;
        s.organizationId = orgId; s.status = "ACTIVE"; s.locationTrackingEnabled = true;
        return crud.persistNew(s);
    }

    private Location loc(String code, String name, UUID site, String kind, UUID parent) {
        Location l = new Location();
        l.code = code; l.name = name; l.siteId = site; l.kind = kind; l.parentId = parent;
        return crud.persistNew(l);
    }

    private Customer customer(String code, String name, String industry, String contact, String email, UUID org) {
        Customer c = new Customer();
        c.code = code; c.name = name; c.industry = industry; c.contactName = contact; c.email = email; c.phone = "+237 6 99 00 00 00";
        c.organizationId = org; c.status = "ACTIVE"; c.paymentTerms = "30 days"; c.billingAddress = "Douala, Cameroon";
        return crud.persistNew(c);
    }

    private SlaPolicy sla(String name, String priority, String resp, String res) {
        SlaPolicy s = new SlaPolicy();
        s.name = name; s.priority = priority; s.responseHours = new BigDecimal(resp); s.resolutionHours = new BigDecimal(res); s.clockStart = "RECEIPT"; s.businessHoursOnly = false;
        return crud.persistNew(s);
    }

    private ServiceContract contract(UUID customer, String title, String type, UUID sla, String value, String cycle, String status) {
        ServiceContract c = new ServiceContract();
        c.customerId = customer; c.title = title; c.contractType = type; c.slaPolicyId = sla; c.startDate = LocalDate.now().minusMonths(4);
        c.endDate = LocalDate.now().plusMonths(8); c.value = new BigDecimal(value); c.currency = "XAF"; c.billingCycle = cycle; c.status = status; c.autoRenew = true;
        return crud.persistNew(c);
    }

    private AppUser user(String name, String email, String role, UUID site, UUID customer) {
        AppUser u = new AppUser();
        u.fullName = name; u.email = email; u.role = role; u.siteId = site; u.customerId = customer; u.status = "ACTIVE"; u.language = "EN";
        u.jobTitle = role.charAt(0) + role.substring(1).toLowerCase().replace('_', ' ');
        u.phone = "+237 6 77 " + (10 + users.size()) + " 00 00";
        AppUser saved = crud.persistNew(u);
        saved.passwordHash = PasswordHasher.hash(DEMO_PASSWORD);
        crud.repo(AppUser.class).save(saved);
        users.put(email, saved);
        return saved;
    }

    private void device(UUID user, String name, String platform, String status) {
        Device d = new Device();
        d.userId = user; d.name = name; d.platform = platform; d.status = status; d.appVersion = "1.0.0"; d.lastSyncAt = Instant.now().minus(Duration.ofHours(3));
        crud.persistNew(d);
    }

    private Technician tech(UUID user, String name, String no, String trade, String rate, UUID site, String availability, String skills) {
        Technician t = new Technician();
        t.userId = user; t.fullName = name; t.employeeNo = no; t.trade = trade; t.hourlyRate = new BigDecimal(rate); t.siteId = site; t.shift = "DAY";
        t.availability = availability; t.skills = skills; t.contractor = false; t.phone = "+237 6 55 00 00 00";
        return crud.persistNew(t);
    }

    private Asset asset(String tag, String name, String type, String mfr, String model, String serial, String crit, UUID site, UUID loc, UUID parent, String cost, int life) {
        Asset a = new Asset();
        a.tag = tag; a.name = name; a.assetType = type; a.manufacturer = mfr; a.model = model; a.serialNumber = serial; a.criticality = crit;
        a.siteId = site; a.locationId = loc; a.parentId = parent; a.purchaseCost = new BigDecimal(cost); a.expectedLifeYears = life;
        a.purchaseDate = LocalDate.now().minusYears(3).minusDays(tag.hashCode() & 0xff); a.commissionedOn = a.purchaseDate.plusDays(14);
        a.warrantyEnd = a.purchaseDate.plusYears(3 + (tag.length() % 3)); a.status = "ACTIVE"; a.safetyState = "CLEAR"; a.custodian = "Biomedical & Facilities Engineering";
        return crud.persistNew(a);
    }

    private Meter meter(UUID asset, String name, String type, String unit, String max) {
        Meter m = new Meter();
        m.assetId = asset; m.name = name; m.meterType = type; m.unit = unit; m.status = "ACTIVE"; m.maxValue = max == null ? null : new BigDecimal(max);
        return crud.persistNew(m);
    }

    private void reading(UUID meter, String value, int daysAgo) {
        MeterReading r = new MeterReading();
        r.meterId = meter; r.value = new BigDecimal(value); r.readingAt = Instant.now().minus(Duration.ofDays(daysAgo)); r.source = daysAgo % 2 == 0 ? "MOBILE" : "MANUAL";
        crud.persistNew(r);
    }

    private Vendor vendor(String code, String name, String cat, String contact, String email, String country, int rating) {
        Vendor v = new Vendor();
        v.code = code; v.name = name; v.category = cat; v.contactName = contact; v.email = email; v.country = country; v.rating = rating; v.approved = true; v.status = "ACTIVE";
        v.phone = "+237 2 33 00 00 00";
        return crud.persistNew(v);
    }

    private Warehouse wh(String code, String name, UUID site, String kind, String keeper) {
        Warehouse w = new Warehouse();
        w.code = code; w.name = name; w.siteId = site; w.kind = kind; w.keeper = keeper; w.status = "ACTIVE";
        return crud.persistNew(w);
    }

    private Part part(String no, String name, String cat, String unit, String cost, String reorder, String reorderQty, boolean critical, UUID vendor) {
        Part p = new Part();
        p.partNo = no; p.name = name; p.category = cat; p.unit = unit; p.unitCost = new BigDecimal(cost); p.reorderPoint = new BigDecimal(reorder);
        p.reorderQty = new BigDecimal(reorderQty); p.criticalSpare = critical; p.preferredVendorId = vendor; p.status = "ACTIVE"; p.barcode = "62" + no.replace("P-", "") + "0001";
        return crud.persistNew(p);
    }

    private void setting(String key, String value, String cat, String desc) {
        Setting s = new Setting();
        s.settingKey = key; s.settingValue = value; s.category = cat; s.description = desc;
        crud.persistNew(s);
    }

    private InspectionTemplate template(String code, String name, String type, String questions) {
        InspectionTemplate t = new InspectionTemplate();
        t.code = code; t.name = name; t.assetType = type; t.questions = questions; t.status = "PUBLISHED"; t.templateVersion = 1; t.passThreshold = 100;
        return crud.persistNew(t);
    }

    private void compliance(String name, String reg, String type, String freq, int dueInDays, String owner, String status) {
        ComplianceItem c = new ComplianceItem();
        c.name = name; c.regulation = reg; c.assetType = type; c.frequency = freq; c.nextDue = LocalDate.now().plusDays(dueInDays); c.owner = owner; c.status = status;
        crud.persistNew(c);
    }

    private Sensor sensor(UUID asset, String name, String type, String unit, String warnLow, String warnHigh, String alarmLow, String alarmHigh) {
        Sensor s = new Sensor();
        s.assetId = asset; s.name = name; s.sensorType = type; s.unit = unit; s.gateway = "edge-gw-01";
        s.warnLow = warnLow == null ? null : new BigDecimal(warnLow); s.warnHigh = warnHigh == null ? null : new BigDecimal(warnHigh);
        s.alarmLow = alarmLow == null ? null : new BigDecimal(alarmLow); s.alarmHigh = alarmHigh == null ? null : new BigDecimal(alarmHigh);
        return crud.persistNew(s);
    }

    private void integ(String name, String kind, String endpoint, String auth, String status) {
        Integration i = new Integration();
        i.name = name; i.kind = kind; i.endpoint = endpoint; i.authType = auth; i.status = status;
        crud.persistNew(i);
    }

    private PmPlan pmPlan(String name, UUID asset, String trigger, Integer interval, String unit, LocalDate anchor, UUID meter, String meterInterval, String hours, String tasks) {
        PmPlan p = new PmPlan();
        p.name = name; p.assetId = asset; p.triggerType = trigger; p.intervalValue = interval; p.intervalUnit = unit; p.anchorDate = anchor;
        p.meterId = meter; p.meterInterval = meterInterval == null ? null : new BigDecimal(meterInterval); p.estimatedHours = new BigDecimal(hours);
        p.taskList = tasks; p.dueWindowDays = 7; p.leadDays = 7;
        return crud.persistNew(p);
    }

    private MaintenanceRequest request(String title, String desc, UUID asset, UUID site, String priority, String cat, String by) {
        MaintenanceRequest r = new MaintenanceRequest();
        r.title = title; r.description = desc; r.assetId = asset; r.siteId = site; r.priority = priority; r.category = cat; r.reportedBy = by;
        r.channel = asset != null && priority.equals("CRITICAL") ? "QR" : "WEB";
        return crud.persistNew(r);
    }

    private void task(UUID wo, String description) {
        WorkTask t = new WorkTask();
        t.workOrderId = wo; t.description = description; t.required = true;
        crud.persistNew(t);
    }

    private Map<String, Object> ver(UUID woId) {
        return withVer(woId, Map.of());
    }

    private Map<String, Object> withVer(UUID woId, Map<String, Object> extra) {
        Map<String, Object> m = new HashMap<>(extra);
        m.put("version", crud.repo(WorkOrder.class).findById(woId).orElseThrow().version);
        return m;
    }

    private void advance(UUID woId, String until, double hours) {
        List<String> chain = List.of("TRIAGED", "APPROVED", "PLANNED", "DISPATCHED");
        WorkOrder w = crud.repo(WorkOrder.class).findById(woId).orElseThrow();
        if (w.estimatedHours == null && hours > 0) { w.estimatedHours = BigDecimal.valueOf(hours); crud.saveDomain(w, "UPDATE", null, Map.of()); }
        for (String s : chain) {
            WorkOrder cur = crud.repo(WorkOrder.class).findById(woId).orElseThrow();
            if (chain.indexOf(s) <= chain.indexOf(cur.status)) continue;
            String actor = switch (s) { case "TRIAGED", "DISPATCHED" -> "dispatcher@opes.demo"; case "APPROVED" -> "manager@opes.demo"; default -> "planner@opes.demo"; };
            as(actor, () -> wo.transition(woId, s, null, ver(woId)));
            if (s.equals(until)) break;
        }
    }

    private void plan(UUID woId, UUID tech, double hours) {
        Instant start = Instant.now().plus(Duration.ofHours(1));
        assign(woId, tech, start, start.plus(Duration.ofMinutes((long) (hours * 60))));
        as("planner@opes.demo", () -> wo.transition(woId, "PLANNED", null, ver(woId)));
    }

    private void assign(UUID woId, UUID tech, Instant start, Instant end) {
        Assignment a = new Assignment();
        a.workOrderId = woId; a.technicianId = tech; a.scheduledStart = start; a.scheduledEnd = end; a.role = "LEAD"; a.status = "PLANNED";
        crud.persistNew(a);
    }

    private void closedHistory(UUID asset, UUID site, String title, String type, String priority, UUID tech, int daysAgo, double hours, UUID partId) {
        closedHistoryUntil(asset, site, title, type, priority, tech, daysAgo, hours, "CLOSED", partId);
    }

    private WorkOrder closedHistoryUntil(UUID asset, UUID site, String title, String type, String priority, UUID tech, int daysAgo, double hours, String until) {
        return closedHistoryUntil(asset, site, title, type, priority, tech, daysAgo, hours, until, null);
    }

    private WorkOrder closedHistoryUntil(UUID asset, UUID site, String title, String type, String priority, UUID tech, int daysAgo, double hours, String until, UUID partId) {
        WorkOrder w = new WorkOrder();
        w.title = title; w.workType = type; w.priority = priority; w.assetId = asset; w.siteId = site; w.estimatedHours = BigDecimal.valueOf(hours);
        w.failureCode = type.equals("PREVENTIVE") ? null : "P-ALARM"; w.causeCode = "C-WEAR"; w.remedyCode = "R-REPLACE";
        if (site.equals(ids.get("ypp"))) { w.customerId = ids.get("c2"); w.contractId = ids.get("k1"); }
        WorkOrder saved = crud.persistNew(w);
        task(saved.id, "Diagnose fault");
        task(saved.id, "Carry out repair");
        Instant start = Instant.now().minus(Duration.ofDays(daysAgo));
        assign(saved.id, tech, start.plus(Duration.ofDays(1).plusHours(daysAgo)), start.plus(Duration.ofDays(1).plusHours(daysAgo)).plus(Duration.ofMinutes((long) (hours * 60))));
        advance(saved.id, "DISPATCHED", hours);
        String techEmail = techEmail(tech);
        as(techEmail, () -> wo.transition(saved.id, "IN_PROGRESS", null, ver(saved.id)));
        if (partId != null) {
            UUID whId = site.equals(ids.get("ypp")) && partId.equals(ids.get("bearing")) ? ids.get("sat") : ids.get("main");
            StockReservation r = as(techEmail, () -> inv.reserve(partId, whId, saved.id, BigDecimal.ONE, "seed:r:" + saved.id));
            as(techEmail, () -> inv.issue(r.id, BigDecimal.ONE, "seed:i:" + saved.id));
        }
        for (WorkTask t : ((com.opesware.maintain.maintenance.infrastructure.WorkTaskRepository) crud.repo(WorkTask.class)).findByWorkOrderId(saved.id)) {
            as(techEmail, () -> wo.recordTask(saved.id, t.id, Map.of("status", "DONE", "result", "Completed as per procedure")));
        }
        TimeEntry te = new TimeEntry();
        te.workOrderId = saved.id; te.technicianId = tech; te.startedAt = start; te.endedAt = start.plus(Duration.ofMinutes((long) (hours * 60))); te.laborType = "REGULAR"; te.approved = true;
        te.note = "On-site repair";
        as(techEmail, () -> crud.persistNew(te));
        as(techEmail, () -> wo.transition(saved.id, "WORK_COMPLETED", null, withVer(saved.id, Map.of("completionNotes", "Fault rectified and tested."))));
        // backdate execution timestamps to build a realistic history
        WorkOrder done = crud.repo(WorkOrder.class).findById(saved.id).orElseThrow();
        done.actualStart = start;
        done.actualEnd = start.plus(Duration.ofMinutes((long) (hours * 60)));
        Instant created = start.minus(Duration.ofHours(6));
        done.slaDueAt = created.plus(Duration.ofHours("CRITICAL".equals(priority) ? 4 : 72));
        crud.saveDomain(done, "BACKDATE", null, Map.of());
        em.createQuery("update WorkOrder w set w.createdAt = :c where w.id = :id").setParameter("c", created).setParameter("id", saved.id).executeUpdate();
        em.createQuery("update MaintenanceRequest r set r.createdAt = :c, r.receivedAt = :c where r.workOrderId = :id").setParameter("c", created).setParameter("id", saved.id).executeUpdate();
        if ("WORK_COMPLETED".equals(until)) return crud.repo(WorkOrder.class).findById(saved.id).orElseThrow();
        as("manager@opes.demo", () -> wo.transition(saved.id, "REVIEWED", null, ver(saved.id)));
        as("manager@opes.demo", () -> wo.transition(saved.id, "CLOSED", null, withVer(saved.id, Map.of("closeoutCode", "FIXED"))));
        return crud.repo(WorkOrder.class).findById(saved.id).orElseThrow();
    }

    private String techEmail(UUID techId) {
        if (techId.equals(ids.get("tf"))) return "tech@opes.demo";
        if (techId.equals(ids.get("tg"))) return "tech2@opes.demo";
        if (techId.equals(ids.get("te"))) return "tech3@opes.demo";
        return "tech4@opes.demo";
    }

    private void downtime(UUID asset, String type, String mode, String impact, int daysAgo, double hours) {
        DowntimeEvent d = new DowntimeEvent();
        d.assetId = asset; d.downtimeType = type; d.failureMode = mode; d.impact = impact;
        d.startedAt = Instant.now().minus(Duration.ofDays(daysAgo)); d.endedAt = d.startedAt.plus(Duration.ofMinutes((long) (hours * 60)));
        crud.persistNew(d);
    }

    private void inspection(UUID template, UUID asset, String outcome, String answers, String defects) {
        InspectionResult r = new InspectionResult();
        r.templateId = template; r.assetId = asset; r.outcome = outcome; r.answers = answers; r.defectsFound = defects; r.performedAt = Instant.now().minus(Duration.ofDays(2));
        r.inspector = "Samuel Fotso";
        crud.persistNew(r);
    }

    private CalibrationPlan calPlan(UUID asset, String standard, int months, String tol, String provider, LocalDate next) {
        CalibrationPlan c = new CalibrationPlan();
        c.assetId = asset; c.standard = standard; c.intervalMonths = months; c.tolerance = tol; c.provider = provider; c.nextDueOn = next; c.status = "ACTIVE";
        return crud.persistNew(c);
    }

    private CalibrationEvent calEvent(UUID plan, UUID asset, LocalDate scheduled) {
        CalibrationEvent e = new CalibrationEvent();
        e.planId = plan; e.assetId = asset; e.scheduledOn = scheduled; e.referenceStandard = "Reference set RS-07 (traceable)";
        return crud.persistNew(e);
    }

    private void doc(String title, String type, String entityType, String entityId) {
        Document d = new Document();
        d.title = title; d.docType = type; d.entityType = entityType; d.entityId = entityId; d.confidential = "CONTRACT".equals(type);
        d.retentionUntil = LocalDate.now().plusYears(10);
        crud.persistNew(d);
    }

    private void notify(String recipient, String subject, String body, String link) {
        Notification n = new Notification();
        n.recipient = recipient; n.channel = "IN_APP"; n.subject = subject; n.body = body; n.link = link; n.status = "UNREAD"; n.createdOn = Instant.now();
        crud.persistNew(n);
    }

    @SuppressWarnings("unused")
    private static List<Object> none() {
        return new ArrayList<>();
    }
}
