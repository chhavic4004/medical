
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

if (!serviceAccountPath) {
  throw new Error("Firebase service account path is missing.");
}

const serviceAccount = JSON.parse(
  readFileSync(serviceAccountPath, "utf8")
);

const app = initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore(app);

const clinics = [
  {
    id: "c1",
    name: "Sunrise Family Clinic",
    address: "Sector 29, Gurugram",
  },
  {
    id: "c2",
    name: "CityCare Medical Centre",
    address: "MG Road, Gurugram",
  },
];

const doctors = [
  {
    id: "d1",
    name: "Dr. Rohan Mehta",
    department: "General Medicine",
    clinicId: "c1",
    avgMinutes: 8,
  },
  {
    id: "d2",
    name: "Dr. Kavita Iyer",
    department: "Dermatology",
    clinicId: "c1",
    avgMinutes: 12,
  },
  {
    id: "d3",
    name: "Dr. Sameer Khan",
    department: "Paediatrics",
    clinicId: "c2",
    avgMinutes: 10,
  },
];

async function seedCollection(collectionName, records) {
  for (const record of records) {
    const { id, ...data } = record;
    const ref = db.collection(collectionName).doc(id);

    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(ref);

      if (existing.exists) {
        console.log(`${collectionName}/${id} already exists. Skipped.`);
        return;
      }

      transaction.create(ref, {
        ...data,
        ...(collectionName === "doctors" && { userId: null }),
        active: true,
        createdAt: FieldValue.serverTimestamp(),
      });

      console.log(`${collectionName}/${id} created.`);
    });
  }
}

async function seed() {
  await seedCollection("clinics", clinics);
  await seedCollection("doctors", doctors);

  console.log("Clinic and doctor seeding completed!");
}

seed().catch((error) => {
  console.error("Seeding failed:", error);
  process.exitCode = 1;
});
