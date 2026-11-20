
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

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (!serviceAccountJson && !keyPath) {
    throw new Error(
      "Missing Firebase service account configuration. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH."
    );
  }

  const serviceAccount = JSON.parse(
    serviceAccountJson ?? readFileSync(keyPath!, "utf8")
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
