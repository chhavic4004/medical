
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

const serviceAccount = JSON.parse(
  readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, "utf8")
);

const app = initializeApp({
  credential: cert(serviceAccount),
});

const auth = getAuth(app);
const db = getFirestore(app);

const EMAIL = "harshit2008@gmail.com";
const CLINIC_ID = "c1";

async function linkReceptionist() {
  const account = await auth.getUserByEmail(EMAIL);
  const userRef = db.collection("users").doc(account.uid);
  const clinicRef = db.collection("clinics").doc(CLINIC_ID);

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const clinicSnap = await tx.get(clinicRef);

    if (!userSnap.exists || userSnap.data().role !== "receptionist") {
      throw new Error("Firebase account is missing a valid receptionist profile.");
    }

    if (!clinicSnap.exists) {
      throw new Error("Clinic c1 does not exist.");
    }

    if (
      userSnap.data().clinicId &&
      userSnap.data().clinicId !== CLINIC_ID
    ) {
      throw new Error("This receptionist is already linked to another clinic.");
    }

    tx.update(userRef, {
      clinicId: CLINIC_ID,
    });
  });

  console.log("Receptionist linked successfully!");
  console.log("Email:", EMAIL);
  console.log("Clinic:", CLINIC_ID);
}

linkReceptionist().catch((error) => {
  console.error("Linking failed:", error.message);
  process.exitCode = 1;
});
