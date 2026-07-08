require("../config/env");
const { connectDB, disconnectDB } = require("../config/db");
const PlatformSetting = require("../models/PlatformSetting");
const Specialization = require("../models/Specialization");
const Medicine = require("../models/Medicine");
const DiagnosticTest = require("../models/DiagnosticTest");
const Lab = require("../models/Lab");
const HealthTag = require("../models/HealthTag");
const SubscriptionPlan = require("../models/SubscriptionPlan");

const SPECIALIZATIONS = [
  "General Physician",
  "Pediatrician",
  "Gynecologist",
  "Dermatologist",
  "Cardiologist",
  "Orthopedist",
  "ENT Specialist",
  "Neurologist",
  "Psychiatrist",
  "Dentist",
  "Ophthalmologist",
  "Endocrinologist",
  "Gastroenterologist",
  "Pulmonologist",
  "Urologist",
  "Nephrologist",
  "Oncologist",
  "Rheumatologist",
  "Dietitian/Nutritionist",
  "Physiotherapist",
];

async function seedSpecializations() {
  for (const name of SPECIALIZATIONS) {
    await Specialization.updateOne({ name }, { $setOnInsert: { name } }, { upsert: true });
  }
  console.log(`[seed] Specializations ensured (${SPECIALIZATIONS.length})`);
}

const MEDICINES = [
  { name: "Paracetamol 500mg", genericName: "Paracetamol", composition: "Paracetamol 500mg", form: "tablet", packSize: "15 tablets", price: { mrp: 30, sellingPrice: 25 }, prescriptionRequired: false, category: "Pain Relief" },
  { name: "Crocin Advance", genericName: "Paracetamol", composition: "Paracetamol 500mg", form: "tablet", packSize: "15 tablets", price: { mrp: 35, sellingPrice: 30 }, prescriptionRequired: false, category: "Pain Relief" },
  { name: "Azithromycin 500mg", genericName: "Azithromycin", composition: "Azithromycin 500mg", form: "tablet", packSize: "3 tablets", price: { mrp: 120, sellingPrice: 99 }, prescriptionRequired: true, category: "Antibiotic" },
  { name: "Amoxicillin 500mg", genericName: "Amoxicillin", composition: "Amoxicillin 500mg", form: "capsule", packSize: "10 capsules", price: { mrp: 90, sellingPrice: 75 }, prescriptionRequired: true, category: "Antibiotic" },
  { name: "Cetirizine 10mg", genericName: "Cetirizine", composition: "Cetirizine 10mg", form: "tablet", packSize: "10 tablets", price: { mrp: 25, sellingPrice: 20 }, prescriptionRequired: false, category: "Allergy" },
  { name: "Pantoprazole 40mg", genericName: "Pantoprazole", composition: "Pantoprazole 40mg", form: "tablet", packSize: "15 tablets", price: { mrp: 110, sellingPrice: 95 }, prescriptionRequired: true, category: "Gastro" },
  { name: "ORS Powder", genericName: "Oral Rehydration Salts", composition: "ORS", form: "other", packSize: "1 sachet", price: { mrp: 20, sellingPrice: 18 }, prescriptionRequired: false, category: "Hydration" },
  { name: "Vitamin D3 60K", genericName: "Cholecalciferol", composition: "Vitamin D3", form: "capsule", packSize: "4 capsules", price: { mrp: 100, sellingPrice: 85 }, prescriptionRequired: false, category: "Supplement" },
];

async function seedMedicines() {
  for (const med of MEDICINES) {
    await Medicine.updateOne({ name: med.name }, { $setOnInsert: med }, { upsert: true });
  }
  console.log(`[seed] Medicines ensured (${MEDICINES.length})`);
}

const DIAGNOSTIC_TESTS = [
  { name: "Complete Blood Count (CBC)", category: "Blood", sampleType: "Blood", basePrice: 300, reportTurnaroundHours: 12 },
  { name: "Lipid Profile", category: "Blood", sampleType: "Blood", basePrice: 500, reportTurnaroundHours: 24 },
  { name: "Thyroid Profile (T3 T4 TSH)", category: "Blood", sampleType: "Blood", basePrice: 450, reportTurnaroundHours: 24 },
  { name: "Blood Sugar (Fasting)", category: "Blood", sampleType: "Blood", basePrice: 100, reportTurnaroundHours: 6, preparationInstructions: "8-10 hours fasting required" },
  { name: "HbA1c", category: "Blood", sampleType: "Blood", basePrice: 400, reportTurnaroundHours: 24 },
  { name: "Chest X-Ray", category: "Radiology", sampleType: "Imaging", basePrice: 350, reportTurnaroundHours: 4 },
  { name: "MRI Brain", category: "Radiology", sampleType: "Imaging", basePrice: 4500, reportTurnaroundHours: 24 },
  { name: "Full Body Checkup", category: "Package", sampleType: "Blood + Urine", basePrice: 1500, reportTurnaroundHours: 24 },
];

async function seedDiagnosticTests() {
  for (const test of DIAGNOSTIC_TESTS) {
    await DiagnosticTest.updateOne({ name: test.name }, { $setOnInsert: test }, { upsert: true });
  }
  console.log(`[seed] Diagnostic tests ensured (${DIAGNOSTIC_TESTS.length})`);
}

async function seedSampleLab() {
  const existing = await Lab.findOne({ name: "DoconCall Diagnostics — MG Road" });
  if (existing) return console.log("[seed] Sample lab already exists");

  const tests = await DiagnosticTest.find();
  await Lab.create({
    name: "DoconCall Diagnostics — MG Road",
    address: {
      line1: "MG Road",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560001",
      geo: { type: "Point", coordinates: [77.6094017, 12.9747431] },
    },
    testsOffered: tests.map((t) => ({
      test: t._id,
      price: t.basePrice,
      homeCollectionAvailable: t.category !== "Radiology",
      homeCollectionFee: t.category !== "Radiology" ? 100 : 0,
    })),
    verification: { status: "verified" },
  });
  console.log("[seed] Sample lab created");
}

async function seedClinicSubscriptionPlans() {
  const settings = await PlatformSetting.getSettings();
  if (settings.clinicSubscriptionPlans.length) return console.log("[seed] Clinic subscription plans already exist");

  settings.clinicSubscriptionPlans = [
    { name: "DoconCall Ray Basic", price: 999, billingCycle: "monthly" },
    { name: "DoconCall Ray Pro", price: 2999, billingCycle: "monthly" },
  ];
  await settings.save();
  console.log("[seed] Clinic subscription plans ensured");
}

const HEALTH_TAGS = ["Diabetes", "Hypertension", "Thyroid", "Asthma", "Heart Condition", "Allergies"];

async function seedHealthTags() {
  for (let i = 0; i < HEALTH_TAGS.length; i++) {
    await HealthTag.updateOne(
      { name: HEALTH_TAGS[i] },
      { $setOnInsert: { name: HEALTH_TAGS[i], order: i } },
      { upsert: true }
    );
  }
  console.log(`[seed] Health tags ensured (${HEALTH_TAGS.length})`);
}

async function seedPatientSubscriptionPlans() {
  const existing = await SubscriptionPlan.countDocuments();
  if (existing) return console.log("[seed] Patient subscription plans already exist");

  await SubscriptionPlan.create([
    {
      name: "Freemium",
      description: "Your first consultation, on us.",
      price: 0,
      billingCycle: "one_time",
      sessionsIncluded: 1,
      isFreemium: true,
    },
    {
      name: "Annual Health Consultant Plan",
      description: "12 doctor consultations across a year, digital prescriptions, and health history tracking.",
      price: 2999,
      billingCycle: "annual",
      sessionsIncluded: 12,
      isFreemium: false,
    },
  ]);
  console.log("[seed] Patient subscription plans created");
}

async function run() {
  await connectDB();

  await PlatformSetting.getSettings();
  console.log("[seed] PlatformSetting ensured");
  await seedClinicSubscriptionPlans();

  await seedSpecializations();
  await seedMedicines();
  await seedDiagnosticTests();
  await seedSampleLab();
  await seedHealthTags();
  await seedPatientSubscriptionPlans();

  console.log("[seed] Done. Run again anytime — seeders are idempotent.");
  await disconnectDB();
}

run().catch((err) => {
  console.error("[seed] Failed", err);
  process.exit(1);
});
