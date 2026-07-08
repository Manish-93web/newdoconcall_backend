// One-off, idempotent bootstrap for manual QA/UAT login credentials. Safe to re-run —
// every account is looked up by email first and only created if missing. Run with:
//   node src/seed/seedQaAccounts.js
require("../config/env");
const bcrypt = require("bcryptjs");
const { connectDB, disconnectDB } = require("../config/db");
const User = require("../models/User");
const DoctorProfile = require("../models/DoctorProfile");
const ClinicProfile = require("../models/ClinicProfile");
const Specialization = require("../models/Specialization");
const { ROLES } = require("../config/constants");

const QA_PASSWORD = "QaPass#2026";

async function findOrCreateUser({ name, email, role }) {
  let user = await User.findOne({ email });
  if (user) {
    console.log(`[qa-seed] ${role} already exists: ${email}`);
    return { user, created: false };
  }
  const passwordHash = await bcrypt.hash(QA_PASSWORD, 10);
  user = await User.create({ name, email, passwordHash, role, status: "active" });
  console.log(`[qa-seed] Created ${role}: ${email}`);
  return { user, created: true };
}

async function run() {
  await connectDB();

  const { user: admin } = await findOrCreateUser({
    name: "QA Admin",
    email: "qa.admin@doconcall.test",
    role: ROLES.PLATFORM_ADMIN,
  });

  const { user: doctorUser, created: doctorCreated } = await findOrCreateUser({
    name: "Dr. QA Sharma",
    email: "qa.doctor@doconcall.test",
    role: ROLES.DOCTOR,
  });
  let doctorProfile = await DoctorProfile.findOne({ user: doctorUser._id });
  if (!doctorProfile) {
    const generalPhysician = await Specialization.findOne({ name: "General Physician" });
    doctorProfile = await DoctorProfile.create({
      user: doctorUser._id,
      specializations: generalPhysician ? [generalPhysician._id] : [],
      qualifications: [{ degree: "MBBS", institute: "QA Medical College", year: 2015 }],
      registrationNumber: "QA-REG-0001",
      registrationCouncil: "QA Medical Council",
      experienceYears: 8,
      bio: "Seeded QA account for manual testing — pre-verified and listed.",
      consultationFee: { inClinic: 500, video: 400, voice: 300, chat: 200 },
      verification: { status: "verified", reviewedAt: new Date() },
      isListed: true,
      liveStatus: { state: "available", updatedAt: new Date() },
    });
    console.log("[qa-seed] Created verified + listed + available DoctorProfile for QA doctor");
  } else if (doctorCreated) {
    console.log("[qa-seed] Doctor user was new but a DoctorProfile already existed — left as-is");
  }

  const { user: clinicAdminUser, created: clinicAdminCreated } = await findOrCreateUser({
    name: "QA Clinic Admin",
    email: "qa.clinic@doconcall.test",
    role: ROLES.CLINIC_ADMIN,
  });
  let clinicProfile = await ClinicProfile.findOne({ owner: clinicAdminUser._id });
  if (!clinicProfile) {
    clinicProfile = await ClinicProfile.create({
      owner: clinicAdminUser._id,
      name: "QA Test Clinic",
      type: "clinic",
      address: {
        line1: "1 QA Test Street",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560001",
        geo: { type: "Point", coordinates: [77.5946, 12.9716] },
      },
      verification: { status: "verified", reviewedAt: new Date() },
    });
    console.log("[qa-seed] Created verified ClinicProfile for QA clinic admin");
  } else if (clinicAdminCreated) {
    console.log("[qa-seed] Clinic admin user was new but a ClinicProfile already existed — left as-is");
  }

  // Deliberately left with no subscription/health ID so this account exercises the full
  // onboarding → plan-selection → payment flow from scratch when used for QA.
  await findOrCreateUser({
    name: "QA Patient",
    email: "qa.patient@doconcall.test",
    role: ROLES.PATIENT,
  });

  console.log(`\n[qa-seed] Done. All accounts share the password: ${QA_PASSWORD}`);
  await disconnectDB();
  process.exit(0);
}

run().catch((err) => {
  console.error("[qa-seed] Failed", err);
  process.exit(1);
});
