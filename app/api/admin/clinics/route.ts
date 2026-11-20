import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function verifyAdmin(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("AUTH_REQUIRED");
  }

  const decoded = await getAdminAuth().verifyIdToken(authorization.substring(7), true);
  const profile = await getAdminDb().collection("users").doc(decoded.uid).get();

  if (!profile.exists || profile.data()?.role !== "admin") {
    throw new Error("ADMIN_REQUIRED");
  }
}

export async function GET(request: NextRequest) {
  try {
    await verifyAdmin(request);
    const db = getAdminDb();
    const snapshot = await db.collection("clinics").get();

    const clinics = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ clinics });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "AUTH_REQUIRED" ? 401 : message === "ADMIN_REQUIRED" ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? "Failed to load clinics." : message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    await verifyAdmin(request);
    const db = getAdminDb();
    const body = await request.json();

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const address = typeof body.address === "string" ? body.address.trim() : "";

    if (!name || !address) {
      return NextResponse.json({ error: "Clinic name and address are required." }, { status: 400 });
    }

    const docRef = await db.collection("clinics").add({
      name,
      address,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
    });

    await db.collection("auditLogs").add({
      action: "CLINIC_CREATED",
      clinicId: docRef.id,
      name,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      clinic: {
        id: docRef.id,
        name,
        address,
        active: true,
      },
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "AUTH_REQUIRED" ? 401 : message === "ADMIN_REQUIRED" ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? "Failed to create clinic." : message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await verifyAdmin(request);
    const db = getAdminDb();
    const body = await request.json();
    const clinicId = typeof body.id === "string" ? body.id.trim() : "";

    if (!clinicId) {
      return NextResponse.json({ error: "Clinic ID is required." }, { status: 400 });
    }

    const ref = db.collection("clinics").doc(clinicId);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json({ error: "Clinic not found." }, { status: 404 });
    }

    const updateData: Record<string, any> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (body.name) updateData.name = String(body.name).trim();
    if (body.address) updateData.address = String(body.address).trim();
    if (typeof body.active === "boolean") updateData.active = body.active;

    await ref.update(updateData);

    await db.collection("auditLogs").add({
      action: "CLINIC_UPDATED",
      clinicId,
      updatedFields: Object.keys(updateData),
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, message: "Clinic updated successfully." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "AUTH_REQUIRED" ? 401 : message === "ADMIN_REQUIRED" ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? "Failed to update clinic." : message }, { status });
  }
}
