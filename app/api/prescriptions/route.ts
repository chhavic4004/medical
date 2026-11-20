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

export async function GET(request: NextRequest) {
  try {
    const { uid, user, db } = await authenticate(request);
    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get("patientId");

    let query: FirebaseFirestore.Query = db.collection("prescriptions");

    if (user.role === "patient") {
      query = query.where("patientId", "==", uid);
    } else if (user.role === "doctor") {
      if (!user.doctorId) throw new Error("FORBIDDEN");
      if (patientId) {
        query = query.where("patientId", "==", patientId);
      } else {
        query = query.where("doctorId", "==", user.doctorId);
      }
    } else if (user.role === "receptionist") {
      if (!user.clinicId) throw new Error("FORBIDDEN");
      query = query.where("clinicId", "==", user.clinicId);
      if (patientId) {
        query = query.where("patientId", "==", patientId);
      }
    } else if (user.role !== "admin") {
      throw new Error("FORBIDDEN");
    }

    const snapshot = await query.get();
    const prescriptions = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate().toISOString() : doc.data().createdAt,
    }));

    // Sort by createdAt descending
    prescriptions.sort((a: any, b: any) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    return NextResponse.json({ prescriptions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "AUTH_REQUIRED" ? 401 : message === "FORBIDDEN" || message === "PROFILE_REQUIRED" ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? "Failed to fetch prescriptions." : message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { uid, user, db } = await authenticate(request);

    if (!["doctor", "admin"].includes(user.role)) {
      return NextResponse.json({ error: "Only doctors can issue prescriptions." }, { status: 403 });
    }

    const body = await request.json();
    const patientId = typeof body.patientId === "string" ? body.patientId.trim() : "";
    const doctorId = user.role === "doctor" ? user.doctorId : body.doctorId?.trim();
    const clinicId = user.clinicId || body.clinicId?.trim() || "";
    const medicine = typeof body.medicine === "string" ? body.medicine.trim() : "";
    const dosage = typeof body.dosage === "string" ? body.dosage.trim() : "";
    const frequency = typeof body.frequency === "string" ? body.frequency.trim() : "";
    const duration = typeof body.duration === "string" ? body.duration.trim() : "";
    const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";
    const appointmentId = typeof body.appointmentId === "string" ? body.appointmentId.trim() : "";

    if (!patientId || !doctorId || !medicine || !dosage || !frequency || !duration) {
      return NextResponse.json(
        { error: "Missing required prescription fields (patientId, medicine, dosage, frequency, duration)." },
        { status: 400 }
      );
    }

    const docRef = await db.collection("prescriptions").add({
      patientId,
      doctorId,
      clinicId,
      appointmentId,
      medicine,
      dosage,
      frequency,
      duration,
      instructions,
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      prescription: {
        id: docRef.id,
        patientId,
        doctorId,
        clinicId,
        appointmentId,
        medicine,
        dosage,
        frequency,
        duration,
        instructions,
        createdAt: new Date().toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Create prescription error:", error);
    return NextResponse.json({ error: "Failed to create prescription." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { uid, user, db } = await authenticate(request);

    if (!["doctor", "admin"].includes(user.role)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = await request.json();
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!id) {
      return NextResponse.json({ error: "Prescription ID is required." }, { status: 400 });
    }

    const ref = db.collection("prescriptions").doc(id);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json({ error: "Prescription not found." }, { status: 404 });
    }

    const record = snap.data()!;
    if (user.role === "doctor" && record.doctorId !== user.doctorId) {
      return NextResponse.json({ error: "Forbidden: Cannot edit another doctor's prescription." }, { status: 403 });
    }

    const updateData: Record<string, any> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (body.medicine) updateData.medicine = String(body.medicine).trim();
    if (body.dosage) updateData.dosage = String(body.dosage).trim();
    if (body.frequency) updateData.frequency = String(body.frequency).trim();
    if (body.duration) updateData.duration = String(body.duration).trim();
    if (body.instructions !== undefined) updateData.instructions = String(body.instructions).trim();

    await ref.update(updateData);

    return NextResponse.json({ success: true, message: "Prescription updated." });
  } catch (error) {
    console.error("Update prescription error:", error);
    return NextResponse.json({ error: "Failed to update prescription." }, { status: 500 });
  }
}
