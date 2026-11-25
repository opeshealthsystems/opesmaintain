import { registerAnalyticsHooks, refreshInsights } from "./analytics";
import { checkVersion, loadEntity, persistNew, saveDomain } from "./crud";
import {
  calibrationCommand,
  generateBillingExport,
  generateDuePm,
  ingestSensorReading,
  issuePassportToken,
  issueReservation,
  pmCommand,
  postCycleCount,
  purchaseOrderCommand,
  quoteCommand,
  receiveStock,
  recordWorkTask,
  registerDomainHooks,
  requestCommand,
  requisitionCommand,
  convertRequisitionToPo,
  reserveStock,
  transitionWorkOrder,
  permitCommand,
} from "./domains";
import { buildPrincipalFromUser, hashPassword } from "./security";
import {
  addDaysDate,
  addDaysIso,
  addMonthsDate,
  getStore,
  isoDateOnly,
  nowIso,
  runWithPrincipal,
  tableOf,
} from "./store";
import type { EntityRecord, Principal, TenantRecord } from "./types";

export const DEMO_PASSWORD = "OpesDemo2026";

let hooksRegistered = false;

export function ensureSeeded(): void {
  if (!hooksRegistered) {
    registerDomainHooks();
    registerAnalyticsHooks();
    hooksRegistered = true;
  }

  const store = getStore();
  if (store.seeded) return;

  try {
    store.seeded = true;
    runSeed();
  } catch (err) {
    store.seeded = false;
    throw err;
  }
}

function createTenant(code: string, legalName: string): string {
  const id = cryptoRandomUuid();
  const t: TenantRecord = {
    id,
    code,
    legalName,
    country: "CM",
    timeZone: "Africa/Douala",
    currency: "XAF",
    language: "EN",
    plan: "ENTERPRISE",
    status: "ACTIVE",
    maxUsers: 500,
    maxAssets: 20000,
    createdAt: nowIso(),
  };
  getStore().tenants.set(id, t);
  return id;
}

function cryptoRandomUuid(): string {
  return globalThis.crypto.randomUUID();
}

function runSeed(): void {
  const demoPasswordHash = hashPassword(DEMO_PASSWORD);
  const demoTenantId = createTenant("opes-demo", "OPES Health Systems — Engineering Services");
  const usersByEmail = new Map<string, EntityRecord>();
  const ids = new Map<string, string>();

  const asUser = <T>(email: string | null, tenantId: string, fn: () => T): T => {
    const u = email ? usersByEmail.get(email) ?? null : null;
    const p: Principal = u
      ? buildPrincipalFromUser(u)
      : {
          userId: null,
          tenantId,
          email: "seed@opes",
          name: "System Seeder",
          role: "ADMIN",
          customerId: null,
          scope: null,
        };
    return runWithPrincipal(p, fn);
  };

  // Master data
  asUser(null, demoTenantId, () => {
    const org = (code: string, name: string, kind: string, country: string) =>
      persistNew("organizations", {
        code,
        name,
        kind,
        legalName: name,
        country,
        timeZone: "Africa/Douala",
        currency: "XAF",
        language: "FR",
        plan: "ENTERPRISE",
        status: "ACTIVE",
        email: `contact@${code.toLowerCase()}.cm`,
      });

    const site = (code: string, name: string, city: string, timeZone: string, organizationId: string | null) =>
      persistNew("sites", {
        code,
        name,
        city,
        country: "Cameroon",
        region: city === "Yaoundé" ? "Centre" : "Littoral",
        timeZone,
        organizationId,
        status: "ACTIVE",
        locationTrackingEnabled: true,
      });

    const loc = (code: string, name: string, siteId: string, kind: string, parentId: string | null) =>
      persistNew("locations", { code, name, siteId, kind, parentId });

    const customer = (
      code: string,
      name: string,
      industry: string,
      contactName: string,
      email: string,
      organizationId: string | null,
    ) =>
      persistNew("customers", {
        code,
        name,
        industry,
        contactName,
        email,
        phone: "+237 6 99 00 00 00",
        organizationId,
        status: "ACTIVE",
        paymentTerms: "30 days",
        billingAddress: "Douala, Cameroon",
      });

    const sla = (name: string, priority: string, responseHours: number, resolutionHours: number) =>
      persistNew("sla-policies", {
        name,
        priority,
        responseHours,
        resolutionHours,
        clockStart: "RECEIPT",
        businessHoursOnly: false,
      });

    const contract = (
      customerId: string,
      title: string,
      contractType: string,
      slaPolicyId: string | null,
      value: number,
      billingCycle: string,
      status: string,
    ) =>
      persistNew("service-contracts", {
        customerId,
        title,
        contractType,
        slaPolicyId,
        startDate: addMonthsDate(isoDateOnly(), -4),
        endDate: addMonthsDate(isoDateOnly(), 8),
        value,
        currency: "XAF",
        billingCycle,
        status,
        autoRenew: true,
      });

    const createUser = (
      fullName: string,
      email: string,
      role: string,
      siteId: string | null,
      customerId: string | null,
      organizationId: string | null = null,
    ) => {
      const saved = persistNew("users", {
        fullName,
        email,
        role,
        siteId,
        customerId,
        organizationId,
        status: "ACTIVE",
        language: "EN",
        jobTitle: role.charAt(0) + role.slice(1).toLowerCase().replace(/_/g, " "),
        phone: `+237 6 77 ${10 + usersByEmail.size} 00 00`,
        passwordHash: demoPasswordHash,
      });
      usersByEmail.set(email, saved);
      return saved;
    };

    const createDevice = (userId: string, name: string, platform: string, status: string) =>
      persistNew("devices", {
        userId,
        name,
        platform,
        status,
        appVersion: "1.0.0",
        lastSyncAt: new Date(Date.now() - 3 * 3600000).toISOString(),
      });

    const createTech = (
      userId: string,
      fullName: string,
      employeeNo: string,
      trade: string,
      hourlyRate: number,
      siteId: string,
      availability: string,
      skills: string,
      contractor = false,
      contractorOrgId: string | null = null,
    ) =>
      persistNew("technicians", {
        userId,
        fullName,
        employeeNo,
        trade,
        hourlyRate,
        siteId,
        shift: "DAY",
        availability,
        skills,
        contractor,
        contractorOrgId,
        phone: "+237 6 55 00 00 00",
      });

    const createAsset = (
      tag: string,
      name: string,
      assetType: string,
      manufacturer: string,
      model: string,
      serialNumber: string,
      criticality: string,
      siteId: string,
      locationId: string | null,
      parentId: string | null,
      purchaseCost: number,
      expectedLifeYears: number,
      customerId: string | null = null,
    ) => {
      const hashOffset = Math.abs(tag.split("").reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 0)) & 0xff;
      const purchaseDate = addDaysDate(addMonthsDate(isoDateOnly(), -36), -hashOffset);
      const commissionedOn = addDaysDate(purchaseDate, 14);
      const warrantyEnd = addMonthsDate(purchaseDate, 12 * (3 + (tag.length % 3)));
      return persistNew("assets", {
        tag,
        name,
        assetType,
        manufacturer,
        model,
        serialNumber,
        criticality,
        siteId,
        locationId,
        parentId,
        customerId,
        purchaseCost,
        expectedLifeYears,
        purchaseDate,
        commissionedOn,
        warrantyEnd,
        status: "ACTIVE",
        safetyState: "CLEAR",
        custodian: "Biomedical & Facilities Engineering",
      });
    };

    const createMeter = (assetId: string, name: string, meterType: string, unit: string, maxValue: number | null) =>
      persistNew("meters", { assetId, name, meterType, unit, status: "ACTIVE", maxValue });

    const createReading = (meterId: string, value: number, daysAgo: number) =>
      persistNew("meter-readings", {
        meterId,
        value,
        readingAt: addDaysIso(nowIso(), -daysAgo),
        source: daysAgo % 2 === 0 ? "MOBILE" : "MANUAL",
      });

    const createVendor = (
      code: string,
      name: string,
      category: string,
      contactName: string,
      email: string,
      country: string,
      rating: number,
    ) =>
      persistNew("vendors", {
        code,
        name,
        category,
        contactName,
        email,
        country,
        rating,
        approved: true,
        status: "ACTIVE",
        phone: "+237 2 33 00 00 00",
      });

    const createWh = (code: string, name: string, siteId: string, kind: string, keeper: string) =>
      persistNew("warehouses", { code, name, siteId, kind, keeper, status: "ACTIVE" });

    const createPart = (
      partNo: string,
      name: string,
      category: string,
      unit: string,
      unitCost: number,
      reorderPoint: number,
      reorderQty: number,
      criticalSpare: boolean,
      preferredVendorId: string,
    ) =>
      persistNew("parts", {
        partNo,
        name,
        category,
        unit,
        unitCost,
        reorderPoint,
        reorderQty,
        criticalSpare,
        preferredVendorId,
        status: "ACTIVE",
        barcode: `62${partNo.replace("P-", "")}0001`,
      });

    const createSetting = (settingKey: string, settingValue: string, category: string, description: string) =>
      persistNew("settings", { settingKey, settingValue, category, description });

    const createTemplate = (code: string, name: string, assetType: string, questions: string) =>
      persistNew("inspection-templates", {
        code,
        name,
        assetType,
        questions,
        status: "PUBLISHED",
        templateVersion: 1,
        passThreshold: 100,
      });

    const createCompliance = (
      name: string,
      regulation: string,
      assetType: string,
      frequency: string,
      dueInDays: number,
      owner: string,
      status: string,
    ) =>
      persistNew("compliance-items", {
        name,
        regulation,
        assetType,
        frequency,
        nextDue: addDaysDate(isoDateOnly(), dueInDays),
        owner,
        status,
      });

    const createSensor = (
      assetId: string,
      name: string,
      sensorType: string,
      unit: string,
      warnLow: number | null,
      warnHigh: number | null,
      alarmLow: number | null,
      alarmHigh: number | null,
    ) =>
      persistNew("sensors", {
        assetId,
        name,
        sensorType,
        unit,
        gateway: "edge-gw-01",
        warnLow,
        warnHigh,
        alarmLow,
        alarmHigh,
      });

    const createInteg = (name: string, kind: string, endpoint: string, authType: string, status: string) =>
      persistNew("integrations", { name, kind, endpoint, authType, status });

    const today = isoDateOnly();
    const owner = org("OPES", "OPES Health Systems", "OWNER", "CM");
    const client1 = org("LQH", "Laquintinie Hospital", "CLIENT", "CM");
    const client2 = org("SPC", "Sanaga Pharma Company", "CLIENT", "CM");
    const contractor = org("ELX", "ElectroTech Services SARL", "SERVICE_PROVIDER", "CM");
    org("MDS", "MedDevice Supply Ltd", "VENDOR", "NG");

    persistNew("service-grants", {
      providerOrgId: contractor.id,
      clientOrgId: owner.id,
      scope: "SELECTED_SITES",
      siteIds: "Douala General Campus",
      validFrom: addMonthsDate(today, -6),
      validTo: addMonthsDate(today, 6),
    });
    persistNew("service-grants", {
      providerOrgId: owner.id,
      clientOrgId: client2.id,
      scope: "ALL_SITES",
      validFrom: addMonthsDate(today, -12),
      validTo: addDaysDate(today, -10),
    });

    const dgh = site("DGH", "Douala General Campus", "Douala", "Africa/Douala", owner.id);
    const ypp = site("YPP", "Yaoundé Pharma Plant", "Yaoundé", "Africa/Douala", client2.id);
    const lsd = site("LSD", "Limbe Service Depot", "Limbe", "Africa/Douala", owner.id);
    ids.set("dgh", dgh.id);
    ids.set("ypp", ypp.id);
    ids.set("lsd", lsd.id);

    const bldA = loc("A", "Building A — Clinical", dgh.id, "BUILDING", null);
    const icu = loc("A-ICU", "Intensive Care Unit", dgh.id, "ZONE", bldA.id);
    const theatre = loc("A-OT2", "Operating Theatre 2", dgh.id, "ROOM", bldA.id);
    const lab = loc("A-LAB", "Clinical Laboratory", dgh.id, "ROOM", bldA.id);
    const plant = loc("U", "Utility Plant Room", dgh.id, "BUILDING", null);
    const line1 = loc("L1", "Tablet Line 1", ypp.id, "PRODUCTION_LINE", null);
    const qc = loc("QC", "QC Laboratory", ypp.id, "ROOM", null);
    const yard = loc("Y", "Vehicle Yard", lsd.id, "ZONE", null);

    const c1 = customer("CUS-LQH", "Laquintinie Hospital", "HEALTHCARE", "Dr. Marie Ngo", "facilities@laquintinie.cm", client1.id);
    const c2 = customer("CUS-SPC", "Sanaga Pharma Company", "PHARMA", "Paul Essomba", "maintenance@sanagapharma.cm", client2.id);
    const c3 = customer("CUS-HTL", "Akwa Palace Hotel", "HOSPITALITY", "Lydie Mbarga", "engineering@akwapalace.cm", null);
    ids.set("c1", c1.id);
    ids.set("c2", c2.id);

    const slaCrit = sla("Critical — 4h fix", "CRITICAL", 1, 4);
    sla("High — next business day", "HIGH", 4, 24);
    sla("Medium — 3 days", "MEDIUM", 8, 72);
    sla("Low — 10 days", "LOW", 24, 240);
    const slaPlanned = sla("Planned — 30 days", "PLANNED", 72, 720);

    const k1 = contract(c2.id, "Full service — tablet line & QC lab", "FULL_SERVICE", slaCrit.id, 48000000, "MONTHLY", "ACTIVE");
    contract(c1.id, "Biomedical preventive maintenance", "PREVENTIVE_ONLY", slaPlanned.id, 18000000, "QUARTERLY", "ACTIVE");
    contract(c3.id, "HVAC on-call support", "ON_CALL", null, 6000000, "PER_JOB", "DRAFT");
    ids.set("k1", k1.id);

    createUser("Amina Tchoua", "admin@opes.demo", "ADMIN", dgh.id, null);
    createUser("Jean-Pierre Kamga", "manager@opes.demo", "MANAGER", dgh.id, null);
    createUser("Clarisse Ewane", "planner@opes.demo", "PLANNER", dgh.id, null);
    createUser("Boris Nkeng", "dispatcher@opes.demo", "DISPATCHER", dgh.id, null);
    const t1 = createUser("Samuel Fotso", "tech@opes.demo", "TECHNICIAN", dgh.id, null);
    const t2 = createUser("Grace Nyamsi", "tech2@opes.demo", "TECHNICIAN", dgh.id, null);
    const t3 = createUser("Eric Manga", "tech3@opes.demo", "TECHNICIAN", ypp.id, null);
    createUser("Rose Abena", "stores@opes.demo", "STOREKEEPER", dgh.id, null);
    createUser("Victor Ondoa", "safety@opes.demo", "SAFETY_OFFICER", dgh.id, null);
    createUser("Nadine Ebode", "calibration@opes.demo", "CALIBRATION_OFFICER", ypp.id, null);
    createUser("Thierry Mvondo", "commercial@opes.demo", "COMMERCIAL", dgh.id, null);
    createUser("Esther Bella", "procurement@opes.demo", "PROCUREMENT", dgh.id, null);
    createUser("Hélène Atangana", "auditor@opes.demo", "AUDITOR", dgh.id, null);
    createUser("Paul Essomba", "customer@opes.demo", "CUSTOMER", ypp.id, c2.id);
    const t4 = createUser("Marc Djomo", "tech4@opes.demo", "TECHNICIAN", dgh.id, null);
    const contractorUser = createUser("Aristide Ngando", "contractor@opes.demo", "TECHNICIAN", dgh.id, null, contractor.id);

    persistNew("delegations", {
      delegatorId: usersByEmail.get("manager@opes.demo")!.id,
      delegateId: usersByEmail.get("planner@opes.demo")!.id,
      permission: "APPROVE_WORK_ORDERS",
      validFrom: addDaysIso(nowIso(), -2),
      validTo: addDaysIso(nowIso(), 12),
      reason: "Manager on annual leave",
      reviewerId: usersByEmail.get("admin@opes.demo")!.id,
    });

    createDevice(t1.id, "TAB-SF-01", "ANDROID", "TRUSTED");
    createDevice(t2.id, "TAB-GN-02", "ANDROID", "TRUSTED");
    createDevice(t3.id, "PH-EM-07", "IOS", "REVOKED");

    const tf = createTech(t1.id, "Samuel Fotso", "T-104", "BIOMEDICAL", 4500, dgh.id, "AVAILABLE", "Infusion pumps, ventilators, patient monitors");
    const tg = createTech(t2.id, "Grace Nyamsi", "T-117", "ELECTRICAL", 4200, dgh.id, "ON_JOB", "LV switchgear, generators, UPS");
    const te = createTech(t3.id, "Eric Manga", "T-122", "MECHANICAL", 4000, ypp.id, "AVAILABLE", "Tablet presses, compressors, pumps");
    const tm = createTech(t4.id, "Marc Djomo", "T-131", "HVAC", 3900, dgh.id, "AVAILABLE", "Chillers, AHUs, cold rooms");
    createTech(contractorUser.id, "Aristide Ngando", "C-009", "ELECTRICAL", 6500, dgh.id, "OFF_SHIFT", "HV switching (contractor)", true, contractor.id);
    ids.set("tf", tf.id);
    ids.set("tg", tg.id);
    ids.set("te", te.id);
    ids.set("tm", tm.id);

    const gen = createAsset("GEN-001", "Standby generator 500 kVA", "GENERATOR", "Caterpillar", "C15", "CAT0C15X01", "A_CRITICAL", dgh.id, plant.id, null, 185000000, 20);
    const ats = createAsset("ATS-001", "Automatic transfer switch", "ELECTRICAL", "Schneider Electric", "TransferPacT", "SE-ATS-8812", "A_CRITICAL", dgh.id, plant.id, gen.id, 12500000, 15);
    const chiller = createAsset("CHL-002", "Water-cooled chiller 350 kW", "HVAC", "Carrier", "30XW", "CR30XW2219", "B_HIGH", dgh.id, plant.id, null, 96000000, 20);
    const ahu = createAsset("AHU-OT2", "Theatre air handling unit", "HVAC", "Daikin", "D-AHU 12", "DK-AHU-7731", "A_CRITICAL", dgh.id, theatre.id, null, 38000000, 15);
    const vent = createAsset("VEN-ICU-03", "ICU ventilator", "MEDICAL_DEVICE", "Dräger", "Evita V500", "DR-V500-33102", "A_CRITICAL", dgh.id, icu.id, null, 24500000, 10);
    const vent2 = createAsset("VEN-ICU-04", "ICU ventilator", "MEDICAL_DEVICE", "Dräger", "Evita V500", "DR-V500-33117", "A_CRITICAL", dgh.id, icu.id, null, 24500000, 10);
    const mon = createAsset("MON-ICU-11", "Patient monitor", "MEDICAL_DEVICE", "Philips", "IntelliVue MX550", "PH-MX550-9120", "B_HIGH", dgh.id, icu.id, null, 6200000, 8);
    const pump = createAsset("INF-ICU-21", "Infusion pump", "MEDICAL_DEVICE", "B. Braun", "Infusomat Space", "BB-IS-552001", "B_HIGH", dgh.id, icu.id, null, 1900000, 8);
    const analyzer = createAsset("LAB-HEM-01", "Haematology analyzer", "LABORATORY", "Sysmex", "XN-1000", "SY-XN1-44821", "B_HIGH", dgh.id, lab.id, null, 42000000, 10);
    const ups = createAsset("UPS-OT-01", "Theatre UPS 60 kVA", "ELECTRICAL", "Eaton", "93PM", "ET-93PM-1021", "A_CRITICAL", dgh.id, theatre.id, null, 21000000, 12);
    const press = createAsset("TBP-L1-01", "Rotary tablet press", "PRODUCTION", "Fette", "FE35", "FT-FE35-3307", "A_CRITICAL", ypp.id, line1.id, null, 310000000, 20, c2.id);
    const comp = createAsset("CMP-L1-02", "Oil-free air compressor", "PRODUCTION", "Atlas Copco", "ZR 90", "AC-ZR90-5512", "B_HIGH", ypp.id, line1.id, null, 54000000, 15, c2.id);
    const balance = createAsset("QC-BAL-01", "Analytical balance", "LABORATORY", "Mettler Toledo", "XPR205", "MT-XPR-88231", "B_HIGH", ypp.id, qc.id, null, 7400000, 10, c2.id);
    const hplc = createAsset("QC-HPLC-02", "HPLC system", "LABORATORY", "Agilent", "1260 Infinity II", "AG-1260-77310", "B_HIGH", ypp.id, qc.id, null, 68000000, 12, c2.id);
    const thermo = createAsset("QC-TH-05", "Reference thermometer", "LABORATORY", "Fluke", "1524", "FL-1524-0091", "C_MEDIUM", ypp.id, qc.id, null, 2100000, 10, c2.id);
    const truck = createAsset("VEH-LSD-01", "Service truck", "VEHICLE", "Toyota", "Hilux", "AHTFR22G2010", "C_MEDIUM", lsd.id, yard.id, null, 28000000, 8);
    const van = createAsset("VEH-LSD-02", "Parts delivery van", "VEHICLE", "Renault", "Master", "VF1MA0001234", "C_MEDIUM", lsd.id, yard.id, null, 22000000, 8);
    const cold = createAsset("CLD-PH-01", "Pharmacy cold room", "HVAC", "Thermo King", "CR-12", "TK-CR12-2204", "A_CRITICAL", dgh.id, bldA.id, null, 15500000, 12);

    ids.set("gen", gen.id);
    ids.set("chiller", chiller.id);
    ids.set("ahu", ahu.id);
    ids.set("vent", vent.id);
    ids.set("vent2", vent2.id);
    ids.set("mon", mon.id);
    ids.set("pump", pump.id);
    ids.set("analyzer", analyzer.id);
    ids.set("ups", ups.id);
    ids.set("press", press.id);
    ids.set("comp", comp.id);
    ids.set("balance", balance.id);
    ids.set("hplc", hplc.id);
    ids.set("thermo", thermo.id);
    ids.set("cold", cold.id);
    ids.set("ats", ats.id);
    ids.set("truck", truck.id);

    issuePassportToken(gen.id);
    issuePassportToken(vent.id);
    issuePassportToken(press.id);

    const genHours = createMeter(gen.id, "Engine run hours", "CUMULATIVE", "h", null);
    const pressCycles = createMeter(press.id, "Compression cycles", "CUMULATIVE", "kcycles", null);
    const chlTemp = createMeter(chiller.id, "Leaving water temperature", "INSTANTANEOUS", "°C", 15);
    const truckOdo = createMeter(truck.id, "Odometer", "CUMULATIVE", "km", null);
    ids.set("genHours", genHours.id);
    ids.set("pressCycles", pressCycles.id);

    createReading(genHours.id, 1180, 40);
    createReading(genHours.id, 1236, 20);
    createReading(genHours.id, 1290, 2);
    createReading(pressCycles.id, 8400, 30);
    createReading(pressCycles.id, 9120, 5);
    createReading(chlTemp.id, 6.8, 3);
    createReading(chlTemp.id, 7.1, 1);
    createReading(truckOdo.id, 84210, 15);
    createReading(truckOdo.id, 85960, 1);

    const v1 = persistNew("vehicles", {
      assetId: truck.id,
      plateNumber: "LT 482 AB",
      make: "Toyota",
      model: "Hilux",
      year: 2021,
      fuelType: "DIESEL",
      odometerKm: 85960,
      driverName: "Daniel Ekwalla",
      insuranceExpiry: addMonthsDate(today, 4),
      inspectionExpiry: addDaysDate(today, 25),
      status: "IN_USE",
      vin: "AHTFR22G2010",
    });
    const v2 = persistNew("vehicles", {
      assetId: van.id,
      plateNumber: "LT 115 CF",
      make: "Renault",
      model: "Master",
      year: 2019,
      fuelType: "DIESEL",
      odometerKm: 132400,
      driverName: "Ibrahim Moussa",
      insuranceExpiry: addDaysDate(today, 18),
      status: "AVAILABLE",
    });
    for (let i = 0; i < 4; i++) {
      const liters = 55 + i * 3;
      persistNew("fuel-logs", {
        vehicleId: i % 2 === 0 ? v1.id : v2.id,
        filledAt: addDaysIso(nowIso(), -(3 + i * 7)),
        liters,
        cost: liters * 828,
        odometerKm: 85960 - i * 420,
        station: i % 2 === 0 ? "Total Bonanjo" : "Tradex Limbe",
        driverName: i % 2 === 0 ? "Daniel Ekwalla" : "Ibrahim Moussa",
      });
    }

    const fcs: [string, string, string, string][] = [
      ["P-NOSTART", "Will not start", "PROBLEM", "GENERATOR"],
      ["P-OVERHEAT", "Overheating", "PROBLEM", "HVAC"],
      ["P-ALARM", "Device alarm", "PROBLEM", "MEDICAL_DEVICE"],
      ["P-LEAK", "Leak", "PROBLEM", "PLUMBING"],
      ["P-VIBR", "Excessive vibration", "PROBLEM", "PRODUCTION"],
      ["C-WEAR", "Normal wear", "CAUSE", ""],
      ["C-ELEC", "Electrical fault", "CAUSE", ""],
      ["C-OPER", "Operator error", "CAUSE", ""],
      ["C-CONTAM", "Contamination", "CAUSE", ""],
      ["R-REPLACE", "Replaced component", "REMEDY", ""],
      ["R-ADJUST", "Adjusted / calibrated", "REMEDY", ""],
      ["R-CLEAN", "Cleaned", "REMEDY", ""],
      ["R-REPAIR", "Repaired", "REMEDY", ""],
    ];
    for (const fc of fcs) {
      persistNew("failure-codes", {
        code: fc[0],
        name: fc[1],
        codeType: fc[2],
        assetType: fc[3] || null,
        active: true,
      });
    }

    const vMed = createVendor("V-MDS", "MedDevice Supply Ltd", "OEM", "Chidi Okafor", "orders@meddevice.ng", "NG", 4);
    const vElec = createVendor("V-CFAO", "CFAO Equipment Cameroun", "PARTS", "Alain Tchinda", "sales@cfao-equip.cm", "CM", 5);
    const vCal = createVendor("V-CALAB", "Cal-Lab Afrique", "CALIBRATION", "Sandrine Owona", "lab@calabafrique.cm", "CM", 4);
    createVendor("V-ELX", "ElectroTech Services SARL", "CONTRACTOR", "Aristide Ngando", "ops@electrotech.cm", "CM", 3);
    ids.set("vMed", vMed.id);
    ids.set("vElec", vElec.id);
    ids.set("vCal", vCal.id);

    const main = createWh("WH-DGH", "Main store — Douala", dgh.id, "MAIN_STORE", "Rose Abena");
    const sat = createWh("WH-YPP", "Plant store — Yaoundé", ypp.id, "SATELLITE", "Eric Manga");
    const van1 = createWh("VAN-01", "Van stock — Service truck", lsd.id, "VAN", "Daniel Ekwalla");
    createWh("WH-QUAR", "Quarantine cage", dgh.id, "QUARANTINE", "Rose Abena");
    ids.set("main", main.id);
    ids.set("sat", sat.id);

    const filter = createPart("P-1001", "Oil filter CAT 1R-0750", "Generator", "pcs", 18500, 4, 10, true, vElec.id);
    const fuelF = createPart("P-1002", "Fuel filter CAT 1R-0751", "Generator", "pcs", 16200, 4, 10, false, vElec.id);
    const belt = createPart("P-2001", "AHU drive belt B-68", "HVAC", "pcs", 9800, 6, 12, false, vElec.id);
    const hepa = createPart("P-2002", "HEPA filter H14 610×610", "HVAC", "pcs", 145000, 4, 8, true, vElec.id);
    const refr = createPart("P-2003", "Refrigerant R-134a 13.6 kg", "HVAC", "cyl", 92000, 2, 4, false, vElec.id);
    const o2 = createPart("P-3001", "Ventilator O2 sensor", "Biomedical", "pcs", 210000, 3, 6, true, vMed.id);
    const flow = createPart("P-3002", "Ventilator flow sensor", "Biomedical", "pcs", 165000, 3, 6, true, vMed.id);
    const spo2 = createPart("P-3003", "SpO2 sensor adult", "Biomedical", "pcs", 38000, 10, 20, false, vMed.id);
    const battery = createPart("P-4001", "UPS battery 12V 9Ah", "Electrical", "pcs", 24000, 20, 40, true, vElec.id);
    const punch = createPart("P-5001", "Tablet press punch set D", "Production", "set", 1250000, 1, 2, true, vMed.id);
    const bearing = createPart("P-5002", "Bearing SKF 6205-2RS", "Production", "pcs", 7600, 10, 20, false, vElec.id);
    const grease = createPart("P-5003", "Food-grade grease H1 400 g", "Production", "tube", 6900, 12, 24, false, vElec.id);

    ids.set("filter", filter.id);
    ids.set("o2", o2.id);
    ids.set("belt", belt.id);
    ids.set("bearing", bearing.id);
    ids.set("battery", battery.id);
    ids.set("hepa", hepa.id);

    const openings: [EntityRecord, EntityRecord, number][] = [
      [filter, main, 12],
      [fuelF, main, 9],
      [belt, main, 15],
      [hepa, main, 5],
      [refr, main, 3],
      [o2, main, 4],
      [flow, main, 2],
      [spo2, main, 26],
      [battery, main, 18],
      [punch, sat, 2],
      [bearing, sat, 30],
      [grease, sat, 8],
      [filter, van1, 2],
      [bearing, main, 6],
    ];
    for (const [part, wh, qty] of openings) {
      receiveStock(part.id, wh.id, qty, part.unitCost, "Opening balance", `seed:open:${part.partNo}:${wh.code}`);
    }

    persistNew("cycle-counts", {
      warehouseId: main.id,
      partId: spo2.id,
      countedQty: 25,
      countedAt: addDaysIso(nowIso(), -1),
      countedBy: "Rose Abena",
      status: "DRAFT",
    });
    const cc2 = persistNew("cycle-counts", {
      warehouseId: main.id,
      partId: belt.id,
      countedQty: 14,
      countedAt: addDaysIso(nowIso(), -8),
      countedBy: "Rose Abena",
      status: "DRAFT",
    });
    postCycleCount(cc2.id);

    createSetting("workorder.separation_of_duties", "true", "Work orders", "Performer cannot review their own work");
    createSetting("pm.lead_days_default", "7", "Preventive maintenance", "Days before due date that PM work is generated");
    createSetting("mobile.max_offline_hours", "72", "Mobile", "Maximum offline period before re-authentication");
    createSetting("locale.default", "fr-CM", "Localization", "Default locale for new users");
    createSetting("reports.retention_years", "10", "Records", "Retention for closed maintenance records");
    createSetting("location.tracking", "enabled", "Privacy", "Allow technician location capture during active jobs");

    const it1 = createTemplate(
      "INS-VENT",
      "Ventilator safety inspection",
      "MEDICAL_DEVICE",
      "Visual inspection of casing and cables\nAlarm function test\nO2 sensor calibration check\nLeak test passed\nElectrical safety test (IEC 62353)\nLabel and asset tag present",
    );
    const it2 = createTemplate(
      "INS-GEN",
      "Generator weekly check",
      "GENERATOR",
      "Oil level within range\nCoolant level within range\nBattery voltage ≥ 24 V\nNo visible leaks\nTest run 15 min under load\nFuel tank above 50%",
    );
    createTemplate(
      "INS-FIRE",
      "Fire extinguisher monthly check",
      "BUILDING",
      "Pressure gauge in green zone\nSafety pin and seal intact\nNo visible damage\nInspection tag updated",
    );
    ids.set("it1", it1.id);
    ids.set("it2", it2.id);

    createCompliance("Electrical installation inspection", "Arrêté MINEE 2018", "ELECTRICAL", "ANNUAL", 40, "Grace Nyamsi", "COMPLIANT");
    createCompliance("Medical device electrical safety", "IEC 62353", "MEDICAL_DEVICE", "ANNUAL", 12, "Samuel Fotso", "DUE");
    createCompliance("Pressure vessel inspection — compressor receiver", "Décret 2014/2379", "PRODUCTION", "BIENNIAL", -5, "Eric Manga", "OVERDUE");
    createCompliance("GMP equipment qualification review", "WHO TRS 986 Annex 2", "PRODUCTION", "ANNUAL", 90, "Nadine Ebode", "COMPLIANT");
    createCompliance("Fire safety system test", "Code de sécurité incendie", "BUILDING", "QUARTERLY", 20, "Victor Ondoa", "COMPLIANT");

    const s1 = createSensor(chiller.id, "Chiller leaving water temp", "TEMPERATURE", "°C", 4, 9, 2, 12);
    const s2 = createSensor(press.id, "Press main bearing vibration", "VIBRATION", "mm/s", null, 4.5, null, 7.1);
    const s3 = createSensor(cold.id, "Cold room temperature", "TEMPERATURE", "°C", 2, 8, 1, 10);
    createSensor(gen.id, "Generator battery voltage", "CURRENT", "V", 24, null, 22.5, null);

    ingestSensorReading(s1.id, 7.2);
    ingestSensorReading(s2.id, 5.3);
    ingestSensorReading(s3.id, 10.6);

    createInteg("OPES ERP — billing", "ERP", "https://erp.opes.cm/api/v2", "OAUTH2", "ENABLED");
    createInteg("Keycloak — SSO", "IDENTITY", "https://sso.opes.cm/realms/opes", "OAUTH2", "ENABLED");
    createInteg("Plant edge gateway (read-only)", "IOT_GATEWAY", "mqtts://edge.ypp.local:8883", "MTLS", "ENABLED");
    createInteg("Building management system", "BMS", "http://bms.dgh.local", "API_KEY", "DISABLED");

    persistNew("webhook-subscriptions", {
      url: "https://erp.opes.cm/hooks/maintenance",
      eventTypes: "WorkOrderClosed.v1, QuoteApproved.v1, BillingExportGenerated.v1",
    });
  });

  // Operations
  asUser(null, demoTenantId, () => {
    const dgh = ids.get("dgh")!;
    const ypp = ids.get("ypp")!;
    const today = isoDateOnly();

    const pmPlan = (
      name: string,
      assetId: string,
      triggerType: string,
      intervalValue: number | null,
      intervalUnit: string | null,
      anchorDate: string,
      meterId: string | null,
      meterInterval: number | null,
      estimatedHours: number,
      taskList: string,
    ) =>
      persistNew("pm-plans", {
        name,
        assetId,
        triggerType,
        intervalValue,
        intervalUnit,
        anchorDate,
        meterId,
        meterInterval,
        estimatedHours,
        taskList,
        dueWindowDays: 7,
        leadDays: 7,
      });

    const p1Anchor = `${addMonthsDate(today, -2).slice(0, 8)}05`;
    const p1 = pmPlan(
      "Generator 250-hour service",
      ids.get("gen")!,
      "CALENDAR_OR_METER",
      3,
      "MONTH",
      p1Anchor,
      ids.get("genHours")!,
      250,
      4,
      "Change engine oil and filter\nReplace fuel filter\nInspect belts and hoses\nCheck coolant and battery\nLoad test 30 minutes",
    );
    const p2 = pmPlan(
      "Ventilator preventive maintenance",
      ids.get("vent")!,
      "CALENDAR",
      6,
      "MONTH",
      addMonthsDate(addDaysDate(today, 5), -6),
      null,
      null,
      3,
      "Replace O2 sensor if > 12 months\nRun self-test\nVerify alarms\nElectrical safety test\nUpdate service label",
    );
    const p3 = pmPlan(
      "Theatre AHU filter change",
      ids.get("ahu")!,
      "CALENDAR",
      1,
      "MONTH",
      addMonthsDate(addDaysDate(today, 3), -1),
      null,
      null,
      2,
      "Replace pre-filters\nInspect HEPA differential pressure\nCheck belt tension\nClean drain pan",
    );
    const p4 = pmPlan(
      "Tablet press lubrication",
      ids.get("press")!,
      "METER",
      null,
      null,
      addMonthsDate(today, -1),
      ids.get("pressCycles")!,
      1000,
      1.5,
      "Lubricate punches and dies\nInspect cam track\nCheck guards and interlocks",
    );
    const p5 = pmPlan(
      "Chiller quarterly inspection",
      ids.get("chiller")!,
      "CALENDAR",
      3,
      "MONTH",
      addDaysDate(today, 10),
      null,
      null,
      4,
      "Check refrigerant pressures\nInspect condenser tubes\nVerify safety controls\nRecord approach temperatures",
    );

    pmCommand(p1.id, "activate");
    pmCommand(p2.id, "activate");
    pmCommand(p3.id, "activate");
    pmCommand(p4.id, "approve");
    pmCommand(p4.id, "activate");
    pmCommand(p5.id, "approve");
    generateDuePm(demoTenantId);

    const createReq = (
      title: string,
      description: string,
      assetId: string | null,
      siteId: string,
      priority: string,
      category: string,
      reportedBy: string,
      customerId: string | null = null,
    ) =>
      persistNew("maintenance-requests", {
        title,
        description,
        assetId,
        siteId,
        priority,
        category,
        reportedBy,
        customerId,
        channel: assetId && priority === "CRITICAL" ? "QR" : "WEB",
      });

    const r1 = createReq(
      "ICU ventilator VEN-ICU-04 high-pressure alarm",
      "Repeated high airway pressure alarm during patient use; device swapped out.",
      ids.get("vent2")!,
      dgh,
      "CRITICAL",
      "BREAKDOWN",
      "Nurse Odile Kom",
    );
    const r2 = createReq(
      "Theatre 2 temperature too high",
      "Theatre ambient 26 °C during morning list; surgeons report discomfort.",
      ids.get("ahu")!,
      dgh,
      "HIGH",
      "MECHANICAL",
      "Dr. Fabrice Nguema",
    );
    const r3 = createReq(
      "Water leak under lab sink",
      "Small leak at trap, bucket placed.",
      null,
      dgh,
      "LOW",
      "PLUMBING",
      "Lab tech Carine",
    );
    const r4 = createReq(
      "Tablet press abnormal noise",
      "Knocking noise at turret speed above 60 rpm.",
      ids.get("press")!,
      ypp,
      "HIGH",
      "MECHANICAL",
      "Shift lead Albert",
      ids.get("c2")!,
    );
    const r5 = createReq(
      "Corridor lights flickering — Block A level 1",
      "Fluorescent tubes flickering near pharmacy.",
      null,
      dgh,
      "MEDIUM",
      "ELECTRICAL",
      "Security desk",
    );
    const r6 = createReq(
      "Theatre 2 too warm (duplicate)",
      "Same issue reported by anaesthesia team.",
      ids.get("ahu")!,
      dgh,
      "HIGH",
      "MECHANICAL",
      "Dr. Anne Biyong",
    );

    asUser("dispatcher@opes.demo", demoTenantId, () => {
      requestCommand(r2.id, "acknowledge", null);
      requestCommand(r2.id, "triage", { note: "Check AHU belt and chilled water valve" });
      requestCommand(r5.id, "acknowledge", null);
      requestCommand(r3.id, "reject", { reason: "Handled by housekeeping plumbing contractor" });
    });

    const wVent = asUser("dispatcher@opes.demo", demoTenantId, () => requestCommand(r1.id, "convert", null));
    const wAhu = asUser("dispatcher@opes.demo", demoTenantId, () => requestCommand(r2.id, "convert", null));
    asUser("dispatcher@opes.demo", demoTenantId, () => requestCommand(r6.id, "link-duplicate", { originalId: r2.id }));
    const wPress = asUser("dispatcher@opes.demo", demoTenantId, () => requestCommand(r4.id, "convert", null));

    const task = (workOrderId: string, description: string) =>
      persistNew("work-tasks", { workOrderId, description, required: true });

    const ver = (woId: string) => ({ version: tableOf("work-orders").get(woId)!.version });
    const withVer = (woId: string, extra: Record<string, unknown>) => ({ ...extra, ...ver(woId) });

    const assign = (workOrderId: string, technicianId: string, scheduledStart: string, scheduledEnd: string) =>
      persistNew("assignments", {
        workOrderId,
        technicianId,
        scheduledStart,
        scheduledEnd,
        role: "LEAD",
        status: "PLANNED",
      });

    const advance = (woId: string, until: string, hours: number) => {
      const chain = ["TRIAGED", "APPROVED", "PLANNED", "DISPATCHED"];
      const w = tableOf("work-orders").get(woId)!;
      if ((w.estimatedHours === null || w.estimatedHours === undefined) && hours > 0) {
        w.estimatedHours = hours;
        saveDomain("work-orders", w, "UPDATE", null, {});
      }
      for (const s of chain) {
        const cur = tableOf("work-orders").get(woId)!;
        if (chain.indexOf(s) <= chain.indexOf(cur.status)) continue;
        const actor =
          s === "TRIAGED" || s === "DISPATCHED"
            ? "dispatcher@opes.demo"
            : s === "APPROVED"
              ? "manager@opes.demo"
              : "planner@opes.demo";
        asUser(actor, demoTenantId, () => transitionWorkOrder(woId, s, null, ver(woId)));
        if (s === until) break;
      }
    };

    const plan = (woId: string, techId: string, hours: number) => {
      const start = new Date(Date.now() + 3600000).toISOString();
      const end = new Date(Date.now() + (1 + hours) * 3600000).toISOString();
      assign(woId, techId, start, end);
      asUser("planner@opes.demo", demoTenantId, () => transitionWorkOrder(woId, "PLANNED", null, ver(woId)));
    };

    const techEmail = (techId: string) => {
      if (techId === ids.get("tf")) return "tech@opes.demo";
      if (techId === ids.get("tg")) return "tech2@opes.demo";
      if (techId === ids.get("te")) return "tech3@opes.demo";
      return "tech4@opes.demo";
    };

    const closedHistoryUntil = (
      assetId: string,
      siteId: string,
      title: string,
      workType: string,
      priority: string,
      techId: string,
      daysAgo: number,
      hours: number,
      until: string,
      partId: string | null = null,
    ) => {
      const saved = persistNew("work-orders", {
        title,
        workType,
        priority,
        assetId,
        siteId,
        estimatedHours: hours,
        failureCode: workType === "PREVENTIVE" ? null : "P-ALARM",
        causeCode: "C-WEAR",
        remedyCode: "R-REPLACE",
        customerId: siteId === ypp ? ids.get("c2") : null,
        contractId: siteId === ypp ? ids.get("k1") : null,
      });
      task(saved.id, "Diagnose fault");
      task(saved.id, "Carry out repair");
      const startMs = Date.now() - daysAgo * 86400000;
      const start = new Date(startMs).toISOString();
      const assignStart = new Date(startMs + 86400000 + daysAgo * 3600000).toISOString();
      const assignEnd = new Date(startMs + 86400000 + daysAgo * 3600000 + hours * 3600000).toISOString();
      assign(saved.id, techId, assignStart, assignEnd);
      advance(saved.id, "DISPATCHED", hours);

      const email = techEmail(techId);
      asUser(email, demoTenantId, () => transitionWorkOrder(saved.id, "IN_PROGRESS", null, ver(saved.id)));
      if (partId) {
        const whId = siteId === ypp && partId === ids.get("bearing") ? ids.get("sat")! : ids.get("main")!;
        const r = asUser(email, demoTenantId, () => reserveStock(partId, whId, saved.id, 1, `seed:r:${saved.id}`));
        asUser(email, demoTenantId, () => issueReservation(r.id, 1, `seed:i:${saved.id}`));
      }
      for (const t of tableOf("work-tasks").values()) {
        if (t.workOrderId === saved.id) {
          asUser(email, demoTenantId, () =>
            recordWorkTask(saved.id, t.id, { status: "DONE", result: "Completed as per procedure" }),
          );
        }
      }
      asUser(email, demoTenantId, () =>
        persistNew("time-entries", {
          workOrderId: saved.id,
          technicianId: techId,
          startedAt: start,
          endedAt: new Date(startMs + hours * 3600000).toISOString(),
          laborType: "REGULAR",
          approved: true,
          note: "On-site repair",
        }),
      );
      asUser(email, demoTenantId, () =>
        transitionWorkOrder(saved.id, "WORK_COMPLETED", null, withVer(saved.id, { completionNotes: "Fault rectified and tested." })),
      );

      // Backdate timestamps for realistic historical KPIs and charts
      const done = tableOf("work-orders").get(saved.id)!;
      const created = new Date(startMs - 6 * 3600000).toISOString();
      done.actualStart = start;
      done.actualEnd = new Date(startMs + hours * 3600000).toISOString();
      done.slaDueAt = new Date(startMs - 6 * 3600000 + (priority === "CRITICAL" ? 4 : 72) * 3600000).toISOString();
      done.createdAt = created;
      saveDomain("work-orders", done, "BACKDATE", null, {});
      done.createdAt = created;
      tableOf("work-orders").set(done.id, done);

      if (until === "WORK_COMPLETED") return done;
      asUser("manager@opes.demo", demoTenantId, () => transitionWorkOrder(saved.id, "REVIEWED", null, ver(saved.id)));
      asUser("manager@opes.demo", demoTenantId, () =>
        transitionWorkOrder(saved.id, "CLOSED", null, withVer(saved.id, { closeoutCode: "FIXED" })),
      );
      return tableOf("work-orders").get(saved.id)!;
    };

    const closedHistory = (
      assetId: string,
      siteId: string,
      title: string,
      workType: string,
      priority: string,
      techId: string,
      daysAgo: number,
      hours: number,
      partId: string | null = null,
    ) => closedHistoryUntil(assetId, siteId, title, workType, priority, techId, daysAgo, hours, "CLOSED", partId);

    closedHistory(ids.get("vent2")!, dgh, "Ventilator flow sensor failure", "EMERGENCY", "CRITICAL", ids.get("tf")!, 40, 3.5, ids.get("o2")!);
    closedHistory(ids.get("gen")!, dgh, "Generator failed to start on test", "CORRECTIVE", "HIGH", ids.get("tg")!, 33, 5, ids.get("filter")!);
    closedHistory(ids.get("chiller")!, dgh, "Chiller high head pressure trip", "CORRECTIVE", "HIGH", ids.get("tm")!, 26, 6, null);
    closedHistory(ids.get("press")!, ypp, "Press turret bearing noise", "CORRECTIVE", "HIGH", ids.get("te")!, 21, 4, ids.get("bearing")!);
    closedHistory(ids.get("press")!, ypp, "Press feeder jam", "CORRECTIVE", "MEDIUM", ids.get("te")!, 14, 2, null);
    closedHistory(ids.get("press")!, ypp, "Press punch breakage", "EMERGENCY", "CRITICAL", ids.get("te")!, 9, 7, null);
    closedHistory(ids.get("ups")!, dgh, "UPS battery alarm", "CORRECTIVE", "HIGH", ids.get("tg")!, 5, 3, ids.get("battery")!);
    closedHistory(ids.get("cold")!, dgh, "Cold room door seal replacement", "CORRECTIVE", "MEDIUM", ids.get("tm")!, 3, 2, null);

    asUser("planner@opes.demo", demoTenantId, () => {
      task(wVent.id, "Download alarm log");
      task(wVent.id, "Replace flow sensor");
      task(wVent.id, "Run full self-test");
      task(wVent.id, "Electrical safety test");

      task(wAhu.id, "Inspect drive belt");
      task(wAhu.id, "Check chilled water valve actuator");
      task(wAhu.id, "Verify theatre temperature ≤ 22 °C");

      task(wPress.id, "Vibration measurement");
      task(wPress.id, "Inspect upper cam track");
      task(wPress.id, "Replace worn bearings");
    });

    advance(wVent.id, "APPROVED", 4);
    plan(wVent.id, ids.get("tf")!, 4);
    advance(wVent.id, "DISPATCHED", 0);
    asUser("tech@opes.demo", demoTenantId, () => transitionWorkOrder(wVent.id, "IN_PROGRESS", null, ver(wVent.id)));
    asUser("tech@opes.demo", demoTenantId, () => {
      const first = Array.from(tableOf("work-tasks").values()).find(
        (t) => t.workOrderId === wVent.id && t.sequence === 1,
      )!;
      return recordWorkTask(wVent.id, first.id, { status: "DONE", result: "Log shows flow sensor drift" });
    });
    asUser("tech@opes.demo", demoTenantId, () =>
      reserveStock(ids.get("o2")!, ids.get("main")!, wVent.id, 1, "seed:res:vent"),
    );

    advance(wAhu.id, "APPROVED", 3);
    plan(wAhu.id, ids.get("tm")!, 3);
    advance(wPress.id, "TRIAGED", 0);

    const em = persistNew("work-orders", {
      title: "Pharmacy cold room temperature alarm",
      description: "Cold room at 10.6 °C; vaccines moved to backup fridge.",
      workType: "EMERGENCY",
      priority: "CRITICAL",
      assetId: ids.get("cold")!,
      siteId: dgh,
    });
    task(em.id, "Check compressor and condenser fan");

    const holdWo = persistNew("work-orders", {
      title: "Replace ATS control module",
      workType: "CORRECTIVE",
      priority: "HIGH",
      assetId: ids.get("ats")!,
      siteId: dgh,
      estimatedHours: 6,
      permitRequired: true,
    });
    task(holdWo.id, "Isolate and lock out ATS");
    task(holdWo.id, "Replace control module");
    task(holdWo.id, "Functional transfer test");
    advance(holdWo.id, "APPROVED", 0);
    asUser("manager@opes.demo", demoTenantId, () =>
      transitionWorkOrder(holdWo.id, "ON_HOLD", null, withVer(holdWo.id, { reason: "Awaiting control module from OEM" })),
    );

    persistNew("work-orders", {
      title: "Monthly fire extinguisher inspection — Block A",
      workType: "INSPECTION",
      priority: "PLANNED",
      siteId: dgh,
      dueAt: addDaysIso(nowIso(), 6),
    });

    const awaiting = closedHistoryUntil(
      ids.get("comp")!,
      ypp,
      "Compressor air dryer service",
      "PREVENTIVE",
      "PLANNED",
      ids.get("te")!,
      2,
      3,
      "WORK_COMPLETED",
    );
    awaiting.customerId = ids.get("c2")!;
    saveDomain("work-orders", awaiting, "UPDATE", null, {});

    // Dispatch calendar work orders
    const calTitles = [
      "Infusion pump PM batch",
      "Patient monitor calibration check",
      "Generator weekly test run",
      "AHU belt inspection",
      "HPLC pump seal check",
      "Cold room defrost check",
    ];
    const calAssets = [
      ids.get("pump")!,
      ids.get("mon")!,
      ids.get("gen")!,
      ids.get("ahu")!,
      ids.get("hplc")!,
      ids.get("cold")!,
    ];
    const calTechs = [
      ids.get("tf")!,
      ids.get("tf")!,
      ids.get("tg")!,
      ids.get("tm")!,
      ids.get("te")!,
      ids.get("tm")!,
    ];
    for (let i = 0; i < 6; i++) {
      const saved = persistNew("work-orders", {
        title: calTitles[i],
        workType: i === 4 ? "PREVENTIVE" : "INSPECTION",
        priority: "PLANNED",
        siteId: i === 4 ? ypp : dgh,
        assetId: calAssets[i],
        estimatedHours: 2,
      });
      task(saved.id, "Perform checklist");
      advance(saved.id, "APPROVED", 0);
      const dayStr = addDaysDate(today, 1 + (i % 4));
      const hour = 8 + (i % 3) * 3;
      const startMs = new Date(`${dayStr}T${String(hour).padStart(2, "0")}:00:00+01:00`).getTime();
      assign(saved.id, calTechs[i], new Date(startMs).toISOString(), new Date(startMs + 2 * 3600000).toISOString());
      asUser("planner@opes.demo", demoTenantId, () => transitionWorkOrder(saved.id, "PLANNED", null, ver(saved.id)));
      if (i < 3) {
        asUser("dispatcher@opes.demo", demoTenantId, () => transitionWorkOrder(saved.id, "DISPATCHED", null, ver(saved.id)));
      }
    }

    // Downtime events
    const downtime = (assetId: string, downtimeType: string, failureMode: string, impact: string, daysAgo: number, hours: number) => {
      const startMs = Date.now() - daysAgo * 86400000;
      persistNew("downtime-events", {
        assetId,
        downtimeType,
        failureMode,
        impact,
        startedAt: new Date(startMs).toISOString(),
        endedAt: new Date(startMs + hours * 3600000).toISOString(),
      });
    };
    downtime(ids.get("press")!, "UNPLANNED", "Punch breakage", "PRODUCTION_STOP", 9, 7);
    downtime(ids.get("press")!, "UNPLANNED", "Bearing noise", "DEGRADED", 21, 4);
    downtime(ids.get("gen")!, "UNPLANNED", "Failed start", "NONE", 33, 5);
    downtime(ids.get("vent2")!, "UNPLANNED", "Flow sensor failure", "PATIENT_IMPACT", 40, 3.5);
    downtime(ids.get("chiller")!, "PLANNED", "Quarterly service", "DEGRADED", 26, 6);
    persistNew("downtime-events", {
      assetId: ids.get("vent2")!,
      downtimeType: "UNPLANNED",
      failureMode: "High-pressure alarm",
      impact: "PATIENT_IMPACT",
      startedAt: new Date(Date.now() - 30 * 3600000).toISOString(),
      workOrderId: wVent.id,
    });

    // Permits & safety incidents
    const permit = asUser("tech2@opes.demo", demoTenantId, () =>
      persistNew("work-permits", {
        permitType: "ELECTRICAL_ISOLATION",
        siteId: dgh,
        assetId: ids.get("ats")!,
        workOrderId: holdWo.id,
        scope: "Replace ATS control module with generator and mains isolated",
        hazards: "Electric shock, arc flash, unexpected generator start",
        controls: "LOTO on mains breaker Q1 and generator start circuit; test for dead; arc-rated PPE",
        isolationPoints: "Q1 main incomer\nGenerator start battery isolator",
        validFrom: new Date(Date.now() - 3600000).toISOString(),
        validTo: new Date(Date.now() + 10 * 3600000).toISOString(),
      }),
    );
    asUser("tech2@opes.demo", demoTenantId, () => permitCommand(permit.id, "submit", null));
    asUser("safety@opes.demo", demoTenantId, () => permitCommand(permit.id, "verify", null));

    const hot = asUser("tech3@opes.demo", demoTenantId, () =>
      persistNew("work-permits", {
        permitType: "HOT_WORK",
        siteId: ypp,
        assetId: ids.get("comp")!,
        scope: "Weld bracket on compressor skid",
        hazards: "Fire, fumes",
        controls: "Fire watch 60 min, extinguisher, screens",
        validFrom: new Date(Date.now() - 2 * 3600000).toISOString(),
        validTo: new Date(Date.now() + 6 * 3600000).toISOString(),
      }),
    );
    asUser("tech3@opes.demo", demoTenantId, () => permitCommand(hot.id, "submit", null));
    asUser("safety@opes.demo", demoTenantId, () => permitCommand(hot.id, "verify", null));
    asUser("safety@opes.demo", demoTenantId, () => permitCommand(hot.id, "issue", null));
    asUser("tech3@opes.demo", demoTenantId, () => permitCommand(hot.id, "activate", { acceptedBy: "Eric Manga" }));

    persistNew("work-permits", {
      permitType: "WORK_AT_HEIGHT",
      siteId: dgh,
      scope: "Replace corridor light fittings Block A L1",
      hazards: "Fall from ladder",
      controls: "Podium steps, second person",
      validFrom: addDaysIso(nowIso(), 1),
      validTo: new Date(Date.now() + 32 * 3600000).toISOString(),
    });

    persistNew("safety-incidents", {
      title: "Near miss — unguarded press during cleaning",
      severity: "NEAR_MISS",
      occurredAt: addDaysIso(nowIso(), -6),
      siteId: ypp,
      assetId: ids.get("press")!,
      description: "Operator began cleaning while turret was coasting down.",
      immediateAction: "Toolbox talk; interlock check added to PM",
      status: "ACTIONS_ASSIGNED",
    });
    persistNew("safety-incidents", {
      title: "Minor cut while replacing filter",
      severity: "MINOR",
      occurredAt: addDaysIso(nowIso(), -15),
      siteId: dgh,
      description: "Technician cut finger on AHU frame edge.",
      immediateAction: "First aid; edge guards ordered",
      status: "CLOSED",
    });

    // Inspections
    persistNew("inspection-results", {
      templateId: ids.get("it1")!,
      assetId: ids.get("vent")!,
      outcome: "PASS",
      answers:
        "Visual inspection of casing and cables: PASS\nAlarm function test: PASS\nO2 sensor calibration check: PASS\nLeak test passed: PASS\nElectrical safety test (IEC 62353): PASS\nLabel and asset tag present: PASS",
      performedAt: addDaysIso(nowIso(), -2),
      inspector: "Samuel Fotso",
    });
    persistNew("inspection-results", {
      templateId: ids.get("it2")!,
      assetId: ids.get("gen")!,
      outcome: "FAIL",
      answers:
        "Oil level within range: PASS\nCoolant level within range: PASS\nBattery voltage ≥ 24 V: FAIL\nNo visible leaks: PASS\nTest run 15 min under load: PASS\nFuel tank above 50%: PASS",
      defectsFound: "Battery voltage 22.9 V — replace starter batteries",
      performedAt: addDaysIso(nowIso(), -2),
      inspector: "Samuel Fotso",
    });

    // Calibration
    const calPlan = (assetId: string, standard: string, intervalMonths: number, tolerance: string, provider: string, nextDueOn: string) =>
      persistNew("calibration-plans", { assetId, standard, intervalMonths, tolerance, provider, nextDueOn, status: "ACTIVE" });

    const calEvent = (planId: string, assetId: string, scheduledOn: string) =>
      persistNew("calibration-events", { planId, assetId, scheduledOn, referenceStandard: "Reference set RS-07 (traceable)" });

    const cp1 = calPlan(ids.get("balance")!, "OIML R76 / USP <41>", 12, "± 0.1 mg", "Cal-Lab Afrique", addDaysDate(today, 9));
    const cp2 = calPlan(ids.get("thermo")!, "ISO/IEC 17025 traceable", 12, "± 0.05 °C", "Cal-Lab Afrique", addMonthsDate(today, 7));
    calPlan(ids.get("hplc")!, "Agilent OQ/PV protocol", 6, "Flow ± 1 %", "Agilent Service", addDaysDate(today, -4));
    calPlan(ids.get("mon")!, "IEC 60601-2-49 NIBP accuracy", 12, "± 3 mmHg", "In-house biomedical", addMonthsDate(today, 3));

    const ce1 = calEvent(cp2.id, ids.get("thermo")!, addDaysDate(today, -20));
    asUser("calibration@opes.demo", demoTenantId, () => {
      calibrationCommand(ce1.id, "record-as-found", { asFound: "+0.03 °C at 0 °C; +0.04 °C at 100 °C", inTolerance: true });
      calibrationCommand(ce1.id, "record-as-left", { asLeft: "No adjustment required", inTolerance: true, certificateNo: "CAL-CERT-2026-0412" });
      calibrationCommand(ce1.id, "review", null);
    });
    asUser("manager@opes.demo", demoTenantId, () => calibrationCommand(ce1.id, "approve", null));

    const ce2 = calEvent(cp1.id, ids.get("balance")!, addDaysDate(today, -2));
    asUser("calibration@opes.demo", demoTenantId, () =>
      calibrationCommand(ce2.id, "record-as-found", { asFound: "+0.18 mg at 200 g (limit ± 0.1 mg)", inTolerance: false }),
    );
    calEvent(cp1.id, ids.get("balance")!, addDaysDate(today, 9));

    // Commercial
    const quote = persistNew("quotes", {
      customerId: ids.get("c2")!,
      workOrderId: wPress.id,
      title: "Tablet press turret overhaul",
      laborAmount: 1850000,
      partsAmount: 3400000,
      taxRate: 19.25,
      currency: "XAF",
      validUntil: addDaysDate(today, 21),
      notes: "Includes punch set D and bearing kit. 2-day line stoppage required.",
    });
    asUser("commercial@opes.demo", demoTenantId, () => quoteCommand(quote.id, "send"));

    persistNew("quotes", {
      customerId: ids.get("c1")!,
      title: "Replacement of 4 infusion pumps",
      laborAmount: 150000,
      partsAmount: 7600000,
      taxRate: 19.25,
      currency: "XAF",
      validUntil: addDaysDate(today, 30),
    });

    const periodStart = `${addDaysDate(today, -30).slice(0, 8)}01`;
    const bxs = persistNew("billing-exports", {
      customerId: ids.get("c2")!,
      contractId: ids.get("k1")!,
      periodStart,
      periodEnd: today,
      currency: "XAF",
      targetSystem: "OPES_ERP",
    });
    asUser("commercial@opes.demo", demoTenantId, () => generateBillingExport(bxs.id));

    // Procurement
    const prs = persistNew("purchase-requisitions", {
      partId: ids.get("o2")!,
      description: "Ventilator O2 sensors — replenish critical spares",
      quantity: 4,
      estimatedCost: 840000,
      neededBy: addDaysDate(today, 14),
      requestedBy: "Rose Abena",
      status: "SUBMITTED",
    });
    asUser("procurement@opes.demo", demoTenantId, () => requisitionCommand(prs.id, "approve"));
    const po = asUser("procurement@opes.demo", demoTenantId, () => convertRequisitionToPo(prs.id, ids.get("vMed")!));
    po.warehouseId = ids.get("main")!;
    po.expectedDate = addDaysDate(today, 10);
    po.currency = "XAF";
    saveDomain("purchase-orders", po, "UPDATE", null, {});
    asUser("procurement@opes.demo", demoTenantId, () => purchaseOrderCommand(po.id, "issue", null));

    persistNew("purchase-requisitions", {
      partId: ids.get("hepa")!,
      description: "HEPA H14 filters for theatres",
      quantity: 6,
      estimatedCost: 870000,
      neededBy: addDaysDate(today, 30),
      requestedBy: "Clarisse Ewane",
      status: "DRAFT",
    });

    const po2s = persistNew("purchase-orders", {
      vendorId: ids.get("vElec")!,
      partId: ids.get("bearing")!,
      quantity: 20,
      unitPrice: 7400,
      warehouseId: ids.get("sat")!,
      currency: "XAF",
      expectedDate: addDaysDate(today, -2),
    });
    asUser("procurement@opes.demo", demoTenantId, () => purchaseOrderCommand(po2s.id, "issue", null));
    asUser("stores@opes.demo", demoTenantId, () => purchaseOrderCommand(po2s.id, "receive", { quantity: 12 }));

    // Documents & Reports & Notifications
    const doc = (title: string, docType: string, entityType: string, entityId: string) =>
      persistNew("documents", {
        title,
        docType,
        entityType,
        entityId,
        confidential: docType === "CONTRACT",
        retentionUntil: addMonthsDate(today, 120),
      });

    doc("Dräger Evita V500 — service manual", "MANUAL", "Asset", ids.get("vent")!);
    doc("Generator warranty certificate", "WARRANTY", "Asset", ids.get("gen")!);
    doc("Thermometer calibration certificate CAL-CERT-2026-0412", "CERTIFICATE", "Asset", ids.get("thermo")!);
    doc("LOTO standard operating procedure", "SOP", "Site", dgh);
    doc("Utility plant single-line diagram", "DRAWING", "Site", dgh);
    doc("Full service contract — Sanaga Pharma", "CONTRACT", "Customer", ids.get("c2")!);

    persistNew("report-jobs", { reportType: "PM_COMPLIANCE", parameters: "last 365 days" });
    persistNew("report-jobs", { reportType: "INVENTORY_VALUATION" });

    const notify = (recipient: string | null, subject: string, body: string, link: string) =>
      persistNew("notifications", {
        recipient,
        channel: "IN_APP",
        subject,
        body,
        link,
        status: "UNREAD",
        createdOn: nowIso(),
      });

    notify("role:MANAGER", `SLA at risk: ${em.number}`, "Critical cold room alarm due within 4 hours.", `/m/work-orders/${em.id}`);
    notify("role:MANAGER", "Quote awaiting customer approval", `${quote.number} sent to Sanaga Pharma.`, `/m/quotes/${quote.id}`);
    notify("role:STOREKEEPER", "Low stock: Ventilator flow sensor", "Available quantity is at reorder point.", `/m/parts/${ids.get("o2")}`);
    notify("role:TECHNICIAN", "New assignment", `You have been dispatched to ${wVent.number}.`, "/technician");
    notify("role:SAFETY_OFFICER", "Permit awaiting issue", "Electrical isolation permit verified and ready to issue.", `/m/work-permits/${permit.id}`);
    notify(null, "Welcome to OPES Maintain", "Your demo workspace is ready. Explore modules from the sidebar.", "/");

    refreshInsights(demoTenantId);
  });

  // Isolation Tenant
  const isolationId = createTenant("isolation-co", "Isolation Test Company");
  asUser(null, isolationId, () => {
    const isoSite = persistNew("sites", {
      code: "ISO-HQ",
      name: "Isolation HQ",
      city: "Lagos",
      country: "Nigeria",
      region: "Lagos",
      timeZone: "Africa/Lagos",
      status: "ACTIVE",
      locationTrackingEnabled: true,
    });
    persistNew("users", {
      fullName: "Ida Isolated",
      email: "admin@isolation.test",
      role: "ADMIN",
      siteId: isoSite.id,
      status: "ACTIVE",
      language: "EN",
      passwordHash: demoPasswordHash,
    });
    persistNew("assets", {
      tag: "ISO-0001",
      name: "Isolated chiller",
      assetType: "HVAC",
      criticality: "B_HIGH",
      siteId: isoSite.id,
      status: "ACTIVE",
      safetyState: "CLEAR",
    });
  });

  // Reference helpers exported cleanly (keep checkVersion/loadEntity in scope if needed)
  void checkVersion;
  void loadEntity;
}
