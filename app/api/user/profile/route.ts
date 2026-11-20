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
    const { uid, user } = await authenticate(request);
    return NextResponse.json({ user: { id: uid, ...user } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "AUTH_REQUIRED" ? 401 : message === "PROFILE_REQUIRED" ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? "Failed to get profile." : message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { uid, db } = await authenticate(request);
    const body = await request.json();

    const updateData: Record<string, any> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (typeof body.name === "string" && body.name.trim()) {
      updateData.name = body.name.trim();
    }

    if (typeof body.phone === "string") {
      updateData.phone = body.phone.trim();
    }

    const userRef = db.collection("users").doc(uid);
    await userRef.update(updateData);

    const updatedSnap = await userRef.get();
    return NextResponse.json({
      success: true,
      message: "Profile updated successfully.",
      user: { id: uid, ...updatedSnap.data() },
    });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json({ error: "Failed to update profile." }, { status: 500 });
  }
}
