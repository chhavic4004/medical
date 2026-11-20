import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function authenticate(request: NextRequest) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new Error("AUTH_REQUIRED");
  }

  const decoded = await getAdminAuth().verifyIdToken(header.substring(7), true);
  const db = getAdminDb();
  const profileSnap = await db.collection("users").doc(decoded.uid).get();

  if (!profileSnap.exists) {
    throw new Error("PROFILE_REQUIRED");
  }

  return { uid: decoded.uid, user: profileSnap.data()!, db };
}

// GET: Search patients by name, email, or phone
export async function GET(request: NextRequest) {
  try {
    const { user, db } = await authenticate(request);

    if (!["doctor", "receptionist", "admin"].includes(user.role)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search")?.toLowerCase().trim() || "";

    const snapshot = await db.collection("users").where("role", "==", "patient").get();
    let patients = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    if (search) {
      patients = patients.filter(
        (p: any) =>
          p.name?.toLowerCase().includes(search) ||
          p.email?.toLowerCase().includes(search) ||
          p.phone?.toLowerCase().includes(search)
      );
    }

    return NextResponse.json({ patients });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "AUTH_REQUIRED" ? 401 : message === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? "Failed to search patients." : message }, { status });
  }
}

// POST: Register a walk-in patient or check-in an appointment
export async function POST(request: NextRequest) {
  try {
    const { user, db } = await authenticate(request);

    if (!["receptionist", "admin"].includes(user.role)) {
      return NextResponse.json({ error: "Only staff can register patients." }, { status: 403 });
    }

    const body = await request.json();
    const action = body.action || "register";

    if (action === "check-in") {
      const appointmentId = typeof body.appointmentId === "string" ? body.appointmentId.trim() : "";
      if (!appointmentId) {
        return NextResponse.json({ error: "Appointment ID is required for check-in." }, { status: 400 });
      }

      const apptRef = db.collection("appointments").doc(appointmentId);
      const apptSnap = await apptRef.get();
      if (!apptSnap.exists) {
        return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
      }

      const appt = apptSnap.data()!;
      if (user.role === "receptionist" && appt.clinicId !== user.clinicId) {
        return NextResponse.json({ error: "Forbidden: Appointment belongs to another clinic." }, { status: 403 });
      }

      await apptRef.update({
        status: "checked-in",
        checkedInAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true, message: "Patient checked in successfully." });
    }

    // Default: Register a patient profile
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const clinicId = user.clinicId || body.clinicId || "";

    if (!name) {
      return NextResponse.json({ error: "Patient name is required." }, { status: 400 });
    }

    const patientId = `walkin_${Date.now()}`;
    const patientRef = db.collection("users").doc(patientId);

    const record = {
      uid: patientId,
      name,
      email: email || `${patientId}@walkin.qurely`,
      phone,
      role: "patient",
      clinicId,
      isWalkin: true,
      createdAt: FieldValue.serverTimestamp(),
    };

    await patientRef.set(record);

    return NextResponse.json({
      success: true,
      patient: {
        id: patientId,
        ...record,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Patient registration error:", error);
    return NextResponse.json({ error: "Failed to process patient request." }, { status: 500 });
  }
}
