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
    const requestedPatientId = searchParams.get("patientId");

    let query: FirebaseFirestore.Query = db.collection("medicalRecords");

    if (user.role === "patient") {
      query = query.where("patientId", "==", uid);
    } else if (user.role === "doctor" || user.role === "admin" || user.role === "receptionist") {
      if (requestedPatientId) {
        query = query.where("patientId", "==", requestedPatientId);
      } else if (user.role === "receptionist") {
        if (!user.clinicId) throw new Error("FORBIDDEN");
        query = query.where("clinicId", "==", user.clinicId);
      }
    } else {
      throw new Error("FORBIDDEN");
    }

    const snapshot = await query.get();
    const records = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      date: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate().toISOString() : doc.data().createdAt,
    }));

    records.sort((a: any, b: any) => {
      const timeA = new Date(a.date || 0).getTime();
      const timeB = new Date(b.date || 0).getTime();
      return timeB - timeA;
    });

    return NextResponse.json({ records });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "AUTH_REQUIRED" ? 401 : message === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? "Failed to fetch medical records." : message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { uid, user, db } = await authenticate(request);

    if (!["doctor", "admin"].includes(user.role)) {
      return NextResponse.json({ error: "Only healthcare professionals can add medical records." }, { status: 403 });
    }

    const body = await request.json();
    const patientId = typeof body.patientId === "string" ? body.patientId.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const diagnosis = typeof body.diagnosis === "string" ? body.diagnosis.trim() : "";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const allergies = Array.isArray(body.allergies) ? body.allergies : [];
    const clinicId = user.clinicId || body.clinicId || "";
    const doctorId = user.role === "doctor" ? user.doctorId : body.doctorId || "";

    if (!patientId || !title) {
      return NextResponse.json({ error: "Patient ID and record title are required." }, { status: 400 });
    }

    const docRef = await db.collection("medicalRecords").add({
      patientId,
      doctorId,
      clinicId,
      title,
      diagnosis,
      notes,
      allergies,
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      record: {
        id: docRef.id,
        patientId,
        doctorId,
        clinicId,
        title,
        diagnosis,
        notes,
        allergies,
        date: new Date().toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Create medical record error:", error);
    return NextResponse.json({ error: "Failed to create medical record." }, { status: 500 });
  }
}
