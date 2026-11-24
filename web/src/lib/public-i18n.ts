"use client";
import { useCallback, useEffect, useState } from "react";

/** Language for the public (signed-out) pages: landing, sign-up. Remembered per browser. */
export type Lang = "en" | "fr";
const KEY = "opes.publicLang";

export function usePublicLang(): [Lang, (l: Lang) => void] {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(KEY); } catch { /* storage blocked */ }
    const q = new URLSearchParams(window.location.search).get("lang");
    const pick = q === "fr" || q === "en" ? q : stored === "fr" || stored === "en" ? stored : navigator.language?.toLowerCase().startsWith("fr") ? "fr" : "en";
    setLangState(pick as Lang);
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { window.localStorage.setItem(KEY, l); } catch { /* storage blocked */ }
  }, []);
  return [lang, setLang];
}

/** Asset types — same codes as asset.assetType in the platform. */
export const ASSET_TYPES: { code: string; icon: string; en: string; fr: string }[] = [
  { code: "MEDICAL_DEVICE", icon: "HeartPulse", en: "Medical devices", fr: "Dispositifs médicaux" },
  { code: "HVAC", icon: "AirVent", en: "HVAC & cold rooms", fr: "CVC & chambres froides" },
  { code: "ELECTRICAL", icon: "Zap", en: "Electrical", fr: "Électricité" },
  { code: "GENERATOR", icon: "Power", en: "Generators", fr: "Groupes électrogènes" },
  { code: "PLUMBING", icon: "Droplets", en: "Plumbing & water", fr: "Plomberie & eau" },
  { code: "VEHICLE", icon: "Truck", en: "Vehicles & fleet", fr: "Véhicules & flotte" },
  { code: "PRODUCTION", icon: "Factory", en: "Production machines", fr: "Machines de production" },
  { code: "LABORATORY", icon: "FlaskConical", en: "Laboratory", fr: "Laboratoire" },
  { code: "IT", icon: "Server", en: "IT equipment", fr: "Équipements informatiques" },
  { code: "BUILDING", icon: "Building2", en: "Buildings & facilities", fr: "Bâtiments & installations" },
  { code: "OTHER", icon: "Wrench", en: "Any other equipment", fr: "Tout autre équipement" },
];

export const INDUSTRIES: { code: string; en: string; fr: string }[] = [
  { code: "HEALTHCARE", en: "Hospital / clinic", fr: "Hôpital / clinique" },
  { code: "PHARMA", en: "Pharmaceutical", fr: "Pharmaceutique" },
  { code: "MANUFACTURING", en: "Manufacturing / factory", fr: "Industrie / usine" },
  { code: "FOOD_BEVERAGE", en: "Food & beverage", fr: "Agroalimentaire" },
  { code: "ENERGY", en: "Energy & utilities", fr: "Énergie & services publics" },
  { code: "OIL_GAS", en: "Oil, gas & fuel stations", fr: "Pétrole, gaz & stations-service" },
  { code: "MINING", en: "Mining", fr: "Mines" },
  { code: "TRANSPORT", en: "Transport & logistics", fr: "Transport & logistique" },
  { code: "FACILITIES", en: "Facilities / real estate", fr: "Gestion immobilière" },
  { code: "HOSPITALITY", en: "Hotels & hospitality", fr: "Hôtellerie" },
  { code: "EDUCATION", en: "Education", fr: "Éducation" },
  { code: "TELECOM", en: "Telecoms", fr: "Télécommunications" },
  { code: "PUBLIC_SECTOR", en: "Public sector", fr: "Secteur public" },
  { code: "MAINTENANCE_CONTRACTOR", en: "Maintenance service company", fr: "Société de maintenance" },
  { code: "OTHER", en: "Other", fr: "Autre" },
];

export const COUNTRIES: { code: string; en: string; fr: string }[] = [
  ["CM", "Cameroon", "Cameroun"], ["GA", "Gabon", "Gabon"], ["CG", "Congo", "Congo"], ["CD", "DR Congo", "RD Congo"],
  ["TD", "Chad", "Tchad"], ["CF", "Central African Republic", "République centrafricaine"], ["GQ", "Equatorial Guinea", "Guinée équatoriale"],
  ["CI", "Côte d'Ivoire", "Côte d'Ivoire"], ["SN", "Senegal", "Sénégal"], ["BJ", "Benin", "Bénin"], ["TG", "Togo", "Togo"],
  ["BF", "Burkina Faso", "Burkina Faso"], ["ML", "Mali", "Mali"], ["NE", "Niger", "Niger"], ["NG", "Nigeria", "Nigeria"],
  ["GH", "Ghana", "Ghana"], ["KE", "Kenya", "Kenya"], ["RW", "Rwanda", "Rwanda"], ["ZA", "South Africa", "Afrique du Sud"],
  ["FR", "France", "France"], ["BE", "Belgium", "Belgique"], ["GB", "United Kingdom", "Royaume-Uni"],
  ["US", "United States", "États-Unis"], ["CA", "Canada", "Canada"], ["XX", "Other country", "Autre pays"],
].map(([code, en, fr]) => ({ code, en, fr }));

export const PLANS = [
  { code: "TRIAL", users: 10, assets: 500 },
  { code: "STARTER", users: 5, assets: 250 },
  { code: "PROFESSIONAL", users: 25, assets: 2500 },
  { code: "ENTERPRISE", users: null, assets: null },
] as const;

const T = {
  en: {
    nav_features: "Features", nav_assets: "Assets", nav_how: "How it works", nav_pricing: "Pricing", nav_faq: "FAQ",
    sign_in: "Sign in", start_trial: "Start free trial", open_app: "Open my workspace",
    hero_kicker: "Maintenance management software",
    hero_title: "Every asset, every work order, every inspection — in one place.",
    hero_sub: "OPES Maintain helps hospitals, factories, facilities and maintenance companies register their equipment, plan preventive maintenance, run work orders and prove compliance — from the office or the field.",
    hero_note: "30-day free trial · No card required · Your data stays separate from every other company",
    who_title: "Built for teams that keep equipment running",
    who: [
      ["Stethoscope", "Hospitals & clinics", "Medical devices, cold chain, biomedical engineering and accreditation evidence."],
      ["Factory", "Factories & pharma plants", "Production lines, utilities, calibration and GMP-ready audit trails."],
      ["HardHat", "Maintenance contractors", "Serve several client companies with contracts, SLAs, quotes and a customer portal."],
      ["Building2", "Facilities & real estate", "Buildings, HVAC, generators, lifts and plumbing across many sites."],
    ],
    assets_title: "Choose the assets you manage",
    assets_sub: "When you sign up, tick the kinds of equipment you own. OPES Maintain sets up your workspace around them.",
    feat_title: "Everything maintenance needs, already connected",
    feats: [
      ["Boxes", "Asset registry & QR passport", "Every asset with its history, documents, warranty and a QR code anyone can scan."],
      ["ClipboardList", "Requests & work orders", "From breakdown report to sign-off, with approvals, parts and labour captured."],
      ["CalendarClock", "Preventive maintenance", "Calendar and meter-based plans that create work orders on time, automatically."],
      ["Package", "Spare parts & stock", "Reservations, issues, returns, transfers and reorder alerts per store."],
      ["ShieldCheck", "Safety & permits to work", "Permits, isolations and incidents linked to the work being done."],
      ["Gauge", "Calibration & compliance", "Calibration plans, out-of-tolerance handling and a compliance register."],
      ["Smartphone", "Offline technician app", "Technicians work without network and sync when back online."],
      ["Users", "Customer portal", "Your clients follow requests, approve quotes and see their equipment."],
      ["ChartLine", "Reliability KPIs", "MTTR, MTBF, availability, PM compliance and SLA performance."],
    ],
    how_title: "Up and running in an afternoon",
    how: [
      ["Create your account", "Enter your company details and verify your e-mail. Your private workspace is ready immediately."],
      ["Add sites and assets", "Describe your sites and tick the asset types you own, then add equipment one by one or from a spreadsheet."],
      ["Plan and track maintenance", "Schedule preventive maintenance, assign work to technicians and follow everything on your dashboard."],
    ],
    pricing_title: "Simple plans that grow with you",
    pricing_sub: "Start with a free 30-day trial. Choose a plan when you are ready.",
    plan: {
      TRIAL: ["Free trial", "30 days, all features"],
      STARTER: ["Starter", "Small teams getting organised"],
      PROFESSIONAL: ["Professional", "Growing maintenance departments"],
      ENTERPRISE: ["Enterprise", "Multi-site and contractors"],
    } as Record<string, [string, string]>,
    users: "users", assets: "assets", unlimited: "Custom limits",
    price_free: "Free", price_contact: "Contact us",
    choose: "Start with this plan",
    faq_title: "Questions",
    faq: [
      ["Is my company's data separate from other companies?", "Yes. Every company gets its own isolated workspace. Users, assets and records of one company can never be seen by another."],
      ["Do I need to install anything?", "No. OPES Maintain runs in the browser. Technicians can also use the mobile app, which works offline."],
      ["What happens after the 30-day trial?", "You choose a plan to continue. Your data is kept; nothing is deleted when the trial ends."],
      ["Can I import my existing equipment list?", "Yes. You can add assets one by one or import them from a spreadsheet."],
      ["Is it secure?", "Access is role-based, sign-in uses two-step verification, every change is recorded in an audit trail, and all traffic is encrypted."],
      ["Is it available in French?", "Yes, the platform is available in English and French, and each user picks their own language."],
    ],
    cta_title: "Ready to take control of your maintenance?",
    cta_sub: "Create your workspace in minutes.",
    footer: "Maintenance management by OPES Health Systems",
    preview_open: "Open work orders", preview_pm: "PM compliance", preview_avail: "Availability", preview_mttr: "MTTR",
    preview_rows: [["WO-1042", "Ventilator alarm check", "In progress"], ["WO-1041", "Generator 500h service", "Scheduled"], ["WO-1039", "Cold room temperature drift", "Awaiting parts"]],
  },
  fr: {
    nav_features: "Fonctionnalités", nav_assets: "Équipements", nav_how: "Comment ça marche", nav_pricing: "Tarifs", nav_faq: "FAQ",
    sign_in: "Se connecter", start_trial: "Essai gratuit", open_app: "Ouvrir mon espace",
    hero_kicker: "Logiciel de gestion de la maintenance",
    hero_title: "Chaque équipement, chaque intervention, chaque inspection — au même endroit.",
    hero_sub: "OPES Maintain aide les hôpitaux, usines, gestionnaires d'installations et sociétés de maintenance à enregistrer leurs équipements, planifier la maintenance préventive, gérer les ordres de travail et prouver leur conformité — au bureau comme sur le terrain.",
    hero_note: "Essai gratuit de 30 jours · Sans carte bancaire · Vos données restent séparées de celles des autres entreprises",
    who_title: "Conçu pour les équipes qui font tourner les équipements",
    who: [
      ["Stethoscope", "Hôpitaux & cliniques", "Dispositifs médicaux, chaîne du froid, génie biomédical et preuves pour l'accréditation."],
      ["Factory", "Usines & sites pharmaceutiques", "Lignes de production, utilités, étalonnage et traçabilité conforme BPF."],
      ["HardHat", "Sociétés de maintenance", "Servez plusieurs clients avec contrats, SLA, devis et portail client."],
      ["Building2", "Installations & immobilier", "Bâtiments, CVC, groupes électrogènes, ascenseurs et plomberie sur plusieurs sites."],
    ],
    assets_title: "Choisissez les équipements que vous gérez",
    assets_sub: "À l'inscription, cochez les types d'équipements que vous possédez. OPES Maintain organise votre espace autour d'eux.",
    feat_title: "Tout ce dont la maintenance a besoin, déjà connecté",
    feats: [
      ["Boxes", "Registre des équipements & passeport QR", "Chaque équipement avec son historique, ses documents, sa garantie et un QR code."],
      ["ClipboardList", "Demandes & ordres de travail", "De la déclaration de panne à la clôture, avec validations, pièces et main-d'œuvre."],
      ["CalendarClock", "Maintenance préventive", "Plans calendaires ou par compteur qui créent les ordres de travail à temps."],
      ["Package", "Pièces de rechange & stock", "Réservations, sorties, retours, transferts et alertes de réapprovisionnement."],
      ["ShieldCheck", "Sécurité & permis de travail", "Permis, consignations et incidents liés aux travaux en cours."],
      ["Gauge", "Étalonnage & conformité", "Plans d'étalonnage, gestion des hors-tolérances et registre de conformité."],
      ["Smartphone", "Application technicien hors ligne", "Les techniciens travaillent sans réseau et synchronisent au retour."],
      ["Users", "Portail client", "Vos clients suivent leurs demandes, approuvent les devis et voient leurs équipements."],
      ["ChartLine", "Indicateurs de fiabilité", "MTTR, MTBF, disponibilité, respect de la MP et performance SLA."],
    ],
    how_title: "Opérationnel en un après-midi",
    how: [
      ["Créez votre compte", "Saisissez les informations de votre entreprise et vérifiez votre e-mail. Votre espace privé est prêt immédiatement."],
      ["Ajoutez sites et équipements", "Décrivez vos sites, cochez vos types d'équipements, puis ajoutez-les un par un ou depuis un tableur."],
      ["Planifiez et suivez", "Programmez la maintenance préventive, affectez les techniciens et suivez tout sur votre tableau de bord."],
    ],
    pricing_title: "Des offres simples qui évoluent avec vous",
    pricing_sub: "Commencez par un essai gratuit de 30 jours. Choisissez une offre quand vous êtes prêt.",
    plan: {
      TRIAL: ["Essai gratuit", "30 jours, toutes les fonctionnalités"],
      STARTER: ["Starter", "Petites équipes qui s'organisent"],
      PROFESSIONAL: ["Professionnel", "Services maintenance en croissance"],
      ENTERPRISE: ["Entreprise", "Multi-sites et prestataires"],
    } as Record<string, [string, string]>,
    users: "utilisateurs", assets: "équipements", unlimited: "Limites sur mesure",
    price_free: "Gratuit", price_contact: "Nous contacter",
    choose: "Commencer avec cette offre",
    faq_title: "Questions fréquentes",
    faq: [
      ["Les données de mon entreprise sont-elles séparées ?", "Oui. Chaque entreprise dispose de son propre espace isolé. Les utilisateurs, équipements et dossiers d'une entreprise ne sont jamais visibles par une autre."],
      ["Dois-je installer quelque chose ?", "Non. OPES Maintain fonctionne dans le navigateur. Les techniciens peuvent aussi utiliser l'application mobile, qui fonctionne hors ligne."],
      ["Que se passe-t-il après l'essai de 30 jours ?", "Vous choisissez une offre pour continuer. Vos données sont conservées ; rien n'est supprimé à la fin de l'essai."],
      ["Puis-je importer ma liste d'équipements ?", "Oui. Vous pouvez ajouter les équipements un par un ou les importer depuis un tableur."],
      ["Est-ce sécurisé ?", "Accès par rôle, connexion en deux étapes, journal d'audit de chaque modification et trafic entièrement chiffré."],
      ["Est-ce disponible en français ?", "Oui, la plateforme est disponible en français et en anglais, et chaque utilisateur choisit sa langue."],
    ],
    cta_title: "Prêt à reprendre le contrôle de votre maintenance ?",
    cta_sub: "Créez votre espace en quelques minutes.",
    footer: "Gestion de la maintenance par OPES Health Systems",
    preview_open: "OT ouverts", preview_pm: "Respect MP", preview_avail: "Disponibilité", preview_mttr: "MTTR",
    preview_rows: [["OT-1042", "Contrôle alarme ventilateur", "En cours"], ["OT-1041", "Révision groupe 500 h", "Planifié"], ["OT-1039", "Dérive température chambre froide", "Attente pièces"]],
  },
};

export type Dict = (typeof T)["en"];
export function dict(lang: Lang): Dict {
  return T[lang] as Dict;
}
