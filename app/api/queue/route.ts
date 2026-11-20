
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import type { QueueStatus } from "@/types";

export const runtime = "nodejs";

const validStatuses: QueueStatus[] = [
  "waiting", "almost", "called", "serving",
  "completed", "cancelled", "skipped", "no-show",
];

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
  const profile = await db.collection("users").doc(decoded.uid).get();

  if (!profile.exists) throw new Error("PROFILE_REQUIRED");

  return { uid: decoded.uid, user: profile.data()!, db };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  const status =
    message === "AUTH_REQUIRED" ? 401 :
    message === "PROFILE_REQUIRED" ? 403 :
    message === "FORBIDDEN" ? 403 :
    500;

  return NextResponse.json(
    { error: status === 500 ? "Queue operation failed." : message },
    { status }
  );
}

export async function GET(request: NextRequest) {
  try {
    const { uid, user, db } = await authenticate(request);
    const doctorId = request.nextUrl.searchParams.get("doctorId");

    let query = db.collection("queueTokens");

    if (user.role === "patient") {
      query = query.where("patientId", "==", uid) as typeof query;
    } else if (user.role === "doctor") {
      if (!user.doctorId || (doctorId && doctorId !== user.doctorId)) {
        throw new Error("FORBIDDEN");
      }
      query = query.where("doctorId", "==", user.doctorId) as typeof query;
    } else if (user.role === "receptionist") {
      if (!user.clinicId) throw new Error("FORBIDDEN");
      query = query.where("clinicId", "==", user.clinicId) as typeof query;

      if (doctorId) {
        query = query.where("doctorId", "==", doctorId) as typeof query;
      }
    } else if (user.role !== "admin") {
      throw new Error("FORBIDDEN");
    }

    const snapshot = await query.get();

    const userTokens = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      arrivedAt: doc.data().arrivedAt?.toDate?.().toISOString() ?? (typeof doc.data().arrivedAt === "string" ? doc.data().arrivedAt : ""),
    }));

    // If patient, we need active tokens of the patient's doctors to accurately compute queue position & wait time
    let contextTokens = userTokens;
    if (user.role === "patient" && userTokens.length > 0) {
      const activePatientTokens = userTokens.filter((t: any) =>
        ["waiting", "almost", "called", "serving"].includes(t.status)
      );
      const doctorIds = Array.from(new Set(activePatientTokens.map((t: any) => t.doctorId)));

      if (doctorIds.length > 0) {
        const activeDoctorTokensSnap = await db
          .collection("queueTokens")
          .where("doctorId", "in", doctorIds.slice(0, 10))
          .get();

        contextTokens = activeDoctorTokensSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          arrivedAt: doc.data().arrivedAt?.toDate?.().toISOString() ?? (typeof doc.data().arrivedAt === "string" ? doc.data().arrivedAt : ""),
        }));
      }
    }

    const doctorsSnapshot = await db.collection("doctors").get();
    const doctorTimes = new Map(
      doctorsSnapshot.docs.map((doc) => [
        doc.id,
        Number(doc.data().avgMinutes) > 0 ? Number(doc.data().avgMinutes) : 10,
      ])
    );

    const tokens = userTokens.map((token: any) => {
      const doctorQueue = contextTokens.filter(
        (item: any) =>
          item.doctorId === token.doctorId &&
          item.clinicId === token.clinicId
      );

      const waitingQueue = doctorQueue
        .filter((item: any) => ["waiting", "almost", "called"].includes(item.status))
        .sort(
          (a: any, b: any) =>
            Number(b.priority) - Number(a.priority) || a.number - b.number
        );

      const servingQueue = doctorQueue.filter(
        (item: any) => item.status === "serving"
      );

      const position = waitingQueue.findIndex(
        (item: any) => item.id === token.id
      );

      const avgMinutes = doctorTimes.get(token.doctorId) ?? 10;
      const isWaiting = ["waiting", "almost", "called"].includes(token.status);

      const patientsAhead =
        isWaiting && position >= 0
          ? servingQueue.length + position
          : 0;

      return {
        ...token,
        patientsAhead,
        estimatedWaitMinutes: isWaiting ? patientsAhead * avgMinutes : 0,
      };
    });

    return NextResponse.json({ tokens });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { uid, user, db } = await authenticate(request);

    if (!["patient", "receptionist", "admin"].includes(user.role)) {
      throw new Error("FORBIDDEN");
    }

    const body = await request.json();
    const doctorId = typeof body.doctorId === "string" ? body.doctorId.trim() : "";
    const clinicId = typeof body.clinicId === "string" ? body.clinicId.trim() : "";

    if (!doctorId || !clinicId) {
      return NextResponse.json(
        { error: "Select a doctor and clinic." },
        { status: 400 }
      );
    }

    if (user.role === "patient" && body.patientId && body.patientId !== uid) {
      throw new Error("FORBIDDEN");
    }

    if (user.role === "receptionist" && user.clinicId && user.clinicId !== clinicId) {
      throw new Error("FORBIDDEN");
    }
    if (user.role === "receptionist" && !user.clinicId) {
      await db.collection("users").doc(uid).set({ clinicId }, { merge: true });
    }

    // Verify clinic is active and open
    const clinicRef = db.collection("clinics").doc(clinicId);
    const clinicSnap = await clinicRef.get();
    if (!clinicSnap.exists || clinicSnap.data()?.active === false) {
      return NextResponse.json(
        { error: "The selected clinic is currently closed or unavailable." },
        { status: 400 }
      );
    }

    // Verify doctor is active, available, and belongs to the clinic
    const doctorRef = db.collection("doctors").doc(doctorId);
    const doctorSnap = await doctorRef.get();

    if (
      !doctorSnap.exists ||
      doctorSnap.data()?.clinicId !== clinicId ||
      doctorSnap.data()?.active !== true ||
      doctorSnap.data()?.available === false
    ) {
      return NextResponse.json(
        { error: "Doctor is currently unavailable at this clinic." },
        { status: 400 }
      );
    }

    const patientId = user.role === "patient"
      ? uid
      : (typeof body.patientId === "string" && body.patientId.trim() ? body.patientId.trim() : `walkin_${Date.now()}`);

    const patientName = user.role === "patient"
      ? (user.name || "Patient")
      : String(body.patientName ?? "").trim();

    if (!patientName) {
      return NextResponse.json(
        { error: "Patient name is required." },
        { status: 400 }
      );
    }

    // Prevent duplicate active queue tokens for the same patient and doctor
    const existingActiveSnap = await db
      .collection("queueTokens")
      .where("doctorId", "==", doctorId)
      .where("patientId", "==", patientId)
      .get();

    const hasActiveToken = existingActiveSnap.docs.some((doc) =>
      ["waiting", "almost", "called", "serving"].includes(doc.data().status)
    );

    if (hasActiveToken) {
      return NextResponse.json(
        { error: "Patient already has an active queue token for this doctor." },
        { status: 409 }
      );
    }

    const counterRef = db
      .collection("queueCounters")
      .doc(`${clinicId}_${doctorId}`);
    const tokenRef = db.collection("queueTokens").doc();

    const token = await db.runTransaction(async (tx) => {
      const counterSnap = await tx.get(counterRef);
      const nextNumber =
        (counterSnap.exists ? counterSnap.data()?.lastNumber ?? 0 : 0) + 1;

      const isPriority =
        (user.role === "receptionist" || user.role === "admin") &&
        body.priority === true;

      const record = {
        number: nextNumber,
        patientId,
        patientName,
        doctorId,
        clinicId,
        status: "waiting",
        priority: isPriority,
        arrivedAt: FieldValue.serverTimestamp(),
      };

      tx.set(counterRef, { lastNumber: nextNumber }, { merge: true });
      tx.create(tokenRef, record);

      return {
        id: tokenRef.id,
        ...record,
        arrivedAt: new Date().toISOString(),
      };
    });

    return NextResponse.json({ token }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { uid, user, db } = await authenticate(request);

    const body = await request.json();
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const status = body.status as QueueStatus;

    if (!id || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: "Invalid token ID or status." },
        { status: 400 }
      );
    }

    const tokenRef = db.collection("queueTokens").doc(id);

    await db.runTransaction(async (tx) => {
      const tokenSnap = await tx.get(tokenRef);

      if (!tokenSnap.exists) {
        throw new Error("Token not found.");
      }

      const token = tokenSnap.data()!;
      const currentStatus = token.status as QueueStatus;
      const terminalStatuses = ["completed", "cancelled", "skipped", "no-show"];

      // Terminal status guard
      if (terminalStatuses.includes(currentStatus)) {
        throw new Error("TERMINAL_STATUS");
      }

      if (user.role === "patient") {
        if (token.patientId !== uid) {
          throw new Error("FORBIDDEN");
        }
        if (status !== "cancelled" || !["waiting", "almost"].includes(currentStatus)) {
          throw new Error("FORBIDDEN");
        }
      } else if (user.role === "doctor") {
        if (token.doctorId !== user.doctorId) {
          throw new Error("FORBIDDEN");
        }
        if (!["almost", "called", "serving", "completed", "skipped", "no-show"].includes(status)) {
          throw new Error("FORBIDDEN");
        }
      } else if (user.role === "receptionist") {
        if (token.clinicId !== user.clinicId) {
          throw new Error("FORBIDDEN");
        }
        if (!["almost", "called", "serving", "completed", "cancelled", "skipped", "no-show"].includes(status)) {
          throw new Error("FORBIDDEN");
        }
      } else if (user.role !== "admin") {
        throw new Error("FORBIDDEN");
      }

      tx.update(tokenRef, {
        status,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "TERMINAL_STATUS") {
      return NextResponse.json(
        { error: "Cannot modify a token that has already been completed, cancelled, or closed." },
        { status: 400 }
      );
    }
    if (message === "Token not found.") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return errorResponse(error);
  }
}
