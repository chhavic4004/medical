
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

const serviceAccount = JSON.parse(
  readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, "utf8")
);

const app = initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth(app);
const db = getFirestore(app);

const doctors = [
  { email: "kavita@gmail.com", doctorId: "d2" },
  { email: "sameer@gmail.com", doctorId: "d3" },
];

const receptionist = {
  email: "savita@gmail.com",
  clinicId: "c2",
};

async function linkDoctor({ email, doctorId }) {
  const account = await auth.getUserByEmail(email);
  const userRef = db.collection("users").doc(account.uid);
  const doctorRef = db.collection("doctors").doc(doctorId);

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const doctorSnap = await tx.get(doctorRef);

    if (!userSnap.exists || userSnap.data().role !== "doctor")
      throw new Error(`${email}: Invalid doctor account.`);

    if (!doctorSnap.exists)
      throw new Error(`${doctorId}: Doctor record not found.`);

    const doctor = doctorSnap.data();
    const user = userSnap.data();

    if (doctor.userId && doctor.userId !== account.uid)
      throw new Error(`${doctorId}: Already linked to another account.`);

    if (user.doctorId && user.doctorId !== doctorId)
      throw new Error(`${email}: Already linked to another doctor.`);

    tx.update(doctorRef, { userId: account.uid });
    tx.update(userRef, {
      doctorId,
      clinicId: doctor.clinicId,
    });
  });

  console.log(`Doctor linked: ${email} → ${doctorId}`);
}

async function linkReceptionist({ email, clinicId }) {
  const account = await auth.getUserByEmail(email);
  const userRef = db.collection("users").doc(account.uid);
  const clinicRef = db.collection("clinics").doc(clinicId);

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const clinicSnap = await tx.get(clinicRef);

    if (!userSnap.exists || userSnap.data().role !== "receptionist")
      throw new Error(`${email}: Invalid receptionist account.`);

    if (!clinicSnap.exists)
      throw new Error(`${clinicId}: Clinic not found.`);

    const existingClinic = userSnap.data().clinicId;

    if (existingClinic && existingClinic !== clinicId)
      throw new Error(`${email}: Already assigned to another clinic.`);

    tx.update(userRef, { clinicId });
  });

  console.log(`Receptionist linked: ${email} → ${clinicId}`);
}

async function main() {
  for (const doctor of doctors) {
    await linkDoctor(doctor);
  }

  await linkReceptionist(receptionist);

  console.log("All additional staff linked successfully!");
}

main().catch((error) => {
  console.error("Linking failed:", error.message);
  process.exitCode = 1;
});
