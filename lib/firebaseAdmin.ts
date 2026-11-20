
import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

function getAdminApp() {
  const existingApp = getApps().find(
    (app) => app.name === "qurely-admin"
  );

  if (existingApp) return existingApp;

  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (!keyPath) {
    throw new Error("Missing Firebase service account path.");
  }

  const serviceAccount = JSON.parse(
    readFileSync(keyPath, "utf8")
  );

  return initializeApp(
    {
      credential: cert(serviceAccount),
    },
    "qurely-admin"
  );
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}
