
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

const EMAIL = "chhavi@gmail.com";
const DOCTOR_ID = "d1";

async function linkDoctor() {
  const account = await auth.getUserByEmail(EMAIL);
  const userRef = db.collection("users").doc(account.uid);
  const doctorRef = db.collection("doctors").doc(DOCTOR_ID);

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const doctorSnap = await tx.get(doctorRef);

    if (!userSnap.exists || userSnap.data().role !== "doctor") {
      throw new Error("Firebase account is missing a valid doctor profile.");
    }

    if (!doctorSnap.exists) {
      throw new Error("Doctor record d1 does not exist.");
    }

    if (
      doctorSnap.data().userId &&
      doctorSnap.data().userId !== account.uid
    ) {
      throw new Error("This doctor record is already linked to another account.");
    }

    if (
      userSnap.data().doctorId &&
      userSnap.data().doctorId !== DOCTOR_ID
    ) {
      throw new Error("This account is already linked to another doctor.");
    }

    tx.update(doctorRef, { userId: account.uid });
    tx.update(userRef, {
      doctorId: DOCTOR_ID,
      clinicId: doctorSnap.data().clinicId,
    });
  });

  console.log("Doctor account linked successfully!");
  console.log("Email:", EMAIL);
  console.log("Doctor:", DOCTOR_ID);
}

linkDoctor().catch((error) => {
  console.error("Linking failed:", error.message);
  process.exitCode = 1;
});
