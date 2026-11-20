import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(
      authorization.substring(7),
      true
    );

    const db = getAdminDb();
    const userSnap = await db.collection("users").doc(decoded.uid).get();

    if (!userSnap.exists) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }

    const user = userSnap.data()!;

    if (!["admin", "patient", "receptionist", "doctor"].includes(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const snapshot = await db.collection("doctors")
      .where("active", "==", true)
      .get();

    const doctors = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((doctor: any) => {
        if (user.role === "admin" || user.role === "patient") return true;

        if (user.role === "receptionist") {
          return doctor.clinicId === user.clinicId;
        }

        return doctor.id === user.doctorId;
      });

    return NextResponse.json({ doctors });
  } catch (error) {
    console.error("Doctors API error:", error);
    return NextResponse.json(
      { error: "Unable to fetch doctors" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(authorization.substring(7), true);
    const db = getAdminDb();
    const userSnap = await db.collection("users").doc(decoded.uid).get();

    if (!userSnap.exists) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }

    const user = userSnap.data()!;
    if (!["doctor", "receptionist", "admin"].includes(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const targetDoctorId =
      user.role === "doctor"
        ? user.doctorId
        : typeof body.doctorId === "string"
        ? body.doctorId.trim()
        : "";

    if (!targetDoctorId) {
      return NextResponse.json({ error: "Doctor ID is required." }, { status: 400 });
    }

    const doctorRef = db.collection("doctors").doc(targetDoctorId);
    const doctorSnap = await doctorRef.get();

    if (!doctorSnap.exists) {
      return NextResponse.json({ error: "Doctor not found." }, { status: 404 });
    }

    const doctor = doctorSnap.data()!;

    // Clinic-level access control for receptionists
    if (user.role === "receptionist" && doctor.clinicId !== user.clinicId) {
      return NextResponse.json({ error: "Forbidden: Cannot update doctor from another clinic." }, { status: 403 });
    }

    const updateData: Record<string, any> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (typeof body.available === "boolean") {
      updateData.available = body.available;
    }

    if (body.avgMinutes !== undefined) {
      const avgMinutes = Number(body.avgMinutes);
      if (isNaN(avgMinutes) || avgMinutes < 1 || avgMinutes > 120) {
        return NextResponse.json({ error: "Average consultation minutes must be between 1 and 120." }, { status: 400 });
      }
      updateData.avgMinutes = avgMinutes;
    }

    if (typeof body.department === "string" && body.department.trim()) {
      updateData.department = body.department.trim();
    }

    await doctorRef.update(updateData);

    return NextResponse.json({ success: true, message: "Doctor profile updated successfully." });
  } catch (error) {
    console.error("Doctor update error:", error);
    return NextResponse.json({ error: "Failed to update doctor profile." }, { status: 500 });
  }
}