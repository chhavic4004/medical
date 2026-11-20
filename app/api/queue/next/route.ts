
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

async function authenticate(request: NextRequest) {
  const header = request.headers.get("authorization");

  if (!header?.startsWith("Bearer ")) {
    throw new Error("AUTH_REQUIRED");
  }

  const decoded = await getAdminAuth().verifyIdToken(
    header.substring(7),
    true
  );

  const db = getAdminDb();
  const profileSnap = await db.collection("users").doc(decoded.uid).get();

  if (!profileSnap.exists) {
    throw new Error("PROFILE_REQUIRED");
  }

  return {
    uid: decoded.uid,
    user: profileSnap.data()!,
    db,
  };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  const status =
    message === "AUTH_REQUIRED" ? 401 :
    message === "PROFILE_REQUIRED" ? 403 :
    message === "FORBIDDEN" ? 403 :
    message === "DOCTOR_NOT_FOUND" ? 404 :
    500;

  return NextResponse.json(
    {
      error:
        status === 500
          ? "Unable to call the next patient."
          : message,
    },
    { status }
  );
}

export async function POST(request: NextRequest) {
  try {
    const { uid, user, db } = await authenticate(request);

    if (!["doctor", "receptionist", "admin"].includes(user.role)) {
      throw new Error("FORBIDDEN");
    }

    const body = await request.json();
    const doctorId =
      typeof body.doctorId === "string" ? body.doctorId : "";

    if (!doctorId) {
      return NextResponse.json(
        { error: "Doctor ID is required." },
        { status: 400 }
      );
    }

    if (user.role === "doctor" && user.doctorId !== doctorId) {
      throw new Error("FORBIDDEN");
    }

    const doctorRef = db.collection("doctors").doc(doctorId);
    const doctorSnap = await doctorRef.get();

    if (!doctorSnap.exists) {
      throw new Error("DOCTOR_NOT_FOUND");
    }

    const doctor = doctorSnap.data()!;

    if (doctor.active !== true) {
      throw new Error("FORBIDDEN");
    }

    if (
      user.role === "receptionist" &&
      user.clinicId !== doctor.clinicId
    ) {
      throw new Error("FORBIDDEN");
    }

    const clinicId = doctor.clinicId;

    const counterRef = db
      .collection("queueCounters")
      .doc(`${clinicId}_${doctorId}`);

    const queueQuery = db
      .collection("queueTokens")
      .where("doctorId", "==", doctorId);

    const result = await db.runTransaction(async (tx) => {
      // This document serializes simultaneous call-next requests.
      const counterSnap = await tx.get(counterRef);
      const queueSnap = await tx.get(queueQuery);

      const tokens = queueSnap.docs.map((doc) => ({
        ref: doc.ref,
        id: doc.id,
        ...doc.data(),
      })) as Array<{
        ref: FirebaseFirestore.DocumentReference;
        id: string;
        number: number;
        priority: boolean;
        status: string;
        [key: string]: unknown;
      }>;

      const currentlyServing = tokens.filter(
        (token) =>
          token.status === "serving" &&
          token.clinicId === clinicId
      );

      const waiting = tokens
        .filter(
          (token) =>
            ["waiting", "almost", "called"].includes(token.status) &&
            token.clinicId === clinicId
        )
        .sort(
          (a, b) =>
            Number(b.priority) - Number(a.priority) ||
            a.number - b.number
        );

      // Complete the currently serving patient(s).
      for (const token of currentlyServing) {
        tx.update(token.ref, {
          status: "completed",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      // Select and start the next patient.
      const next = waiting[0] ?? null;

      if (next) {
        tx.update(next.ref, {
          status: "serving",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      // Update the counter document to serialize concurrent requests.
      tx.set(
        counterRef,
        {
          lastCalledAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      if (!next) return null;

      const arrivedAt = (next as any).arrivedAt?.toDate
        ? (next as any).arrivedAt.toDate().toISOString()
        : typeof (next as any).arrivedAt === "string"
        ? (next as any).arrivedAt
        : new Date().toISOString();

      return {
        id: next.id,
        number: next.number,
        patientId: (next as any).patientId,
        patientName: (next as any).patientName,
        doctorId: (next as any).doctorId,
        clinicId: (next as any).clinicId,
        priority: (next as any).priority,
        status: "serving",
        arrivedAt,
      };
    });

    if (!result) {
      return NextResponse.json({
        success: true,
        message: "No waiting patients in queue.",
        token: null,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Next patient called successfully.",
      token: result,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
