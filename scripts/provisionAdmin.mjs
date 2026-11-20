
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
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

const adminAuth = getAuth(app);
const db = getFirestore(app);

// Replace this with the UID you just shared.
const ADMIN_UID = "Ifzhd2hDdHgBgnyV7mcX7378Mtu2";
const ADMIN_NAME = "Qurely Administrator";

async function provisionAdmin() {
  const authUser = await adminAuth.getUser(ADMIN_UID);
  const profileRef = db.collection("users").doc(ADMIN_UID);
  const existingProfile = await profileRef.get();

  if (existingProfile.exists) {
    throw new Error("A profile already exists. No changes made.");
  }

  await profileRef.create({
    uid: ADMIN_UID,
    name: ADMIN_NAME,
    email: authUser.email,
    role: "admin",
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log("Admin profile created successfully.");
  console.log("Email:", authUser.email);
}

provisionAdmin().catch((error) => {
  console.error("Admin provisioning failed:", error.message);
  process.exitCode = 1;
});
