import { NextRequest, NextResponse } from "next/server";
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

    const snapshot = await db.collection("auditLogs").limit(100).get();
    const logs = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate().toISOString() : doc.data().createdAt,
    }));

    logs.sort((a: any, b: any) => {
      const timeA = new Date(a.timestamp || 0).getTime();
      const timeB = new Date(b.timestamp || 0).getTime();
      return timeB - timeA;
    });

    return NextResponse.json({ logs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "AUTH_REQUIRED" ? 401 : message === "ADMIN_REQUIRED" ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? "Failed to load audit logs." : message }, { status });
  }
}
