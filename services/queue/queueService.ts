import { auth, db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import type { QueueToken, QueueStatus } from "@/types";

async function apiRequest<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("Please log in again.");
  }

  const token = await currentUser.getIdToken();

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Queue request failed.");
  }

  return data as T;
}

function normalizeToken(token: any): QueueToken {
  let arrivedAt = token.arrivedAt ?? "";

  if (arrivedAt && typeof arrivedAt.toDate === "function") {
    arrivedAt = arrivedAt.toDate().toISOString();
  } else if (typeof arrivedAt !== "string" && arrivedAt?._seconds) {
    arrivedAt = new Date(arrivedAt._seconds * 1000).toISOString();
  }

  return {
    ...token,
    arrivedAt,
  } as QueueToken;
}

export const queueService = {
  async list(doctorId?: string): Promise<QueueToken[]> {
    const queryString = doctorId
      ? `?doctorId=${encodeURIComponent(doctorId)}`
      : "";

    const data = await apiRequest<{ tokens: any[] }>(
      `/api/queue${queryString}`
    );

    return data.tokens.map(normalizeToken);
  },

  async subscribeToQueue(
    onChange: (tokens: QueueToken[]) => void,
    onError: (error: Error) => void
  ): Promise<Unsubscribe> {
    await auth.authStateReady();

    const currentUser = auth.currentUser;

    if (!currentUser) {
      throw new Error("Please log in again.");
    }

    const profileSnap = await getDoc(
      doc(db, "users", currentUser.uid)
    );

    if (!profileSnap.exists()) {
      throw new Error("User profile not found.");
    }

    const profile = profileSnap.data();
    const queueRef = collection(db, "queueTokens");

    let queueQuery;

    if (profile.role === "patient") {
      queueQuery = query(
        queueRef,
        where("patientId", "==", currentUser.uid)
      );
    } else if (profile.role === "doctor") {
      if (!profile.doctorId) {
        throw new Error("Doctor profile is not linked.");
      }

      queueQuery = query(
        queueRef,
        where("doctorId", "==", profile.doctorId)
      );
    } else if (profile.role === "receptionist") {
      if (!profile.clinicId) {
        throw new Error("Receptionist clinic is not assigned.");
      }

      queueQuery = query(
        queueRef,
        where("clinicId", "==", profile.clinicId)
      );
    } else if (profile.role === "admin") {
      queueQuery = queueRef;
    } else {
      throw new Error("You are not allowed to view the queue.");
    }

    return onSnapshot(
      queueQuery,
      (snapshot) => {
        const tokens = snapshot.docs.map((item) =>
          normalizeToken({
            id: item.id,
            ...item.data(),
          })
        );

        onChange(tokens);
      },
      (error) => {
        onError(error);
      }
    );
  },

  async joinQueue(patient: {
    clinicId: string;
    doctorId: string;
    patientId: string;
    patientName: string;
    priority?: boolean;
  }): Promise<QueueToken> {
    const data = await apiRequest<{ token: any }>("/api/queue", {
      method: "POST",
      body: JSON.stringify({
        ...patient,
        patientId: patient.patientId || auth.currentUser?.uid,
      }),
    });

    return normalizeToken(data.token);
  },

  async setStatus(
    id: string,
    status: QueueStatus
  ): Promise<boolean> {
    await apiRequest("/api/queue", {
      method: "PATCH",
      body: JSON.stringify({ id, status }),
    });

    return true;
  },

  async callNext(doctorId: string): Promise<QueueToken | null> {
    const data = await apiRequest<{ token: any | null }>(
      "/api/queue/next",
      {
        method: "POST",
        body: JSON.stringify({ doctorId }),
      }
    );

    return data.token ? normalizeToken(data.token) : null;
  },
};