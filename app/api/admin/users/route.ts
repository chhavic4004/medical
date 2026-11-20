
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

async function verifyAdmin(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("AUTH_REQUIRED");
  }

  const decoded = await getAdminAuth().verifyIdToken(
    authorization.substring(7),
    true
  );

  const profile = await getAdminDb()
    .collection("users")
    .doc(decoded.uid)
    .get();

  if (!profile.exists || profile.data()?.role !== "admin") {
    throw new Error("ADMIN_REQUIRED");
  }
}

export async function GET(request: NextRequest) {
  try {
    await verifyAdmin(request);
    const db = getAdminDb();
    const roleFilter = request.nextUrl.searchParams.get("role");
    const view = request.nextUrl.searchParams.get("view");

    const clinicsSnapshot = await db
      .collection("clinics")
      .get();

    const clinics = clinicsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    if (view === "users" || roleFilter) {
      let query: FirebaseFirestore.Query = db.collection("users");
      if (roleFilter) {
        query = query.where("role", "==", roleFilter);
      }
      const usersSnap = await query.get();
      const users = usersSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      return NextResponse.json({ clinics, users });
    }

    return NextResponse.json({ clinics });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    const status =
      message === "AUTH_REQUIRED" ? 401 :
      message === "ADMIN_REQUIRED" ? 403 : 500;

    return NextResponse.json(
      { error: status === 500 ? "Unable to load clinics." : message },
      { status }
    );
  }
}

export async function POST(request: NextRequest) {
  let createdUid: string | null = null;

  try {
    await verifyAdmin(request);

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string"
      ? body.email.trim().toLowerCase()
      : "";
    const password = typeof body.password === "string" ? body.password : "";
    const role = body.role;
    const clinicId = typeof body.clinicId === "string"
      ? body.clinicId.trim()
      : "";
    const department = typeof body.department === "string"
      ? body.department.trim()
      : "";
    const avgMinutes = Number(body.avgMinutes ?? 10);

    if (
      !name ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      password.length < 6 ||
      !["doctor", "receptionist"].includes(role) ||
      !clinicId
    ) {
      return NextResponse.json(
        { error: "Please enter valid account details and select a clinic." },
        { status: 400 }
      );
    }

    if (
      role === "doctor" &&
      (!department || !Number.isInteger(avgMinutes) || avgMinutes < 1 || avgMinutes > 120)
    ) {
      return NextResponse.json(
        { error: "Enter a valid department and consultation time (1–120 minutes)." },
        { status: 400 }
      );
    }

    const adminAuth = getAdminAuth();
    const db = getAdminDb();

    const newUser = await adminAuth.createUser({
      email,
      password,
      displayName: name,
    });

    createdUid = newUser.uid;

    const userRef = db.collection("users").doc(newUser.uid);
    const clinicRef = db.collection("clinics").doc(clinicId);
    const doctorRef = role === "doctor"
      ? db.collection("doctors").doc()
      : null;

    await db.runTransaction(async (transaction) => {
      const clinicSnap = await transaction.get(clinicRef);
      const userSnap = await transaction.get(userRef);

      if (!clinicSnap.exists || clinicSnap.data()?.active !== true) {
        throw new Error("Selected clinic is unavailable.");
      }

      if (userSnap.exists) {
        throw new Error("A user profile already exists.");
      }

      const profile: Record<string, unknown> = {
        uid: newUser.uid,
        name,
        email,
        role,
        clinicId,
        createdAt: FieldValue.serverTimestamp(),
      };

      if (role === "doctor" && doctorRef) {
        profile.doctorId = doctorRef.id;

        transaction.create(doctorRef, {
          name,
          department,
          clinicId,
          avgMinutes,
          userId: newUser.uid,
          active: true,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      transaction.create(userRef, profile);
    });

    // Write audit log
    await db.collection("auditLogs").add({
      action: "USER_CREATED",
      targetUid: newUser.uid,
      role,
      clinicId,
      createdBy: "admin",
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json(
      {
        message: `${role} account created and linked successfully.`,
        uid: newUser.uid,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Staff account creation error:", error);

    if (createdUid) {
      try {
        await getAdminAuth().deleteUser(createdUid);
      } catch (rollbackError) {
        console.error("Auth rollback failed:", rollbackError);
      }
    }

    const message = error instanceof Error ? error.message : "";

    const status =
      message === "AUTH_REQUIRED" ? 401 :
      message === "ADMIN_REQUIRED" ? 403 :
      message.includes("email-already-exists") ? 409 :
      message.includes("Selected clinic") ? 400 :
      message.includes("already exists") ? 409 : 500;

    const friendlyMessage =
      status === 401 ? "Please sign in again." :
      status === 403 ? "Admin access required." :
      status === 409 ? "This email or profile is already in use." :
      status === 400 ? message :
      "Unable to create the account. Please check the details and try again.";

    return NextResponse.json(
      { error: friendlyMessage },
      { status }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await verifyAdmin(request);
    const db = getAdminDb();
    const body = await request.json();
    const targetUid = typeof body.uid === "string" ? body.uid.trim() : "";

    if (!targetUid) {
      return NextResponse.json({ error: "User UID is required." }, { status: 400 });
    }

    const userRef = db.collection("users").doc(targetUid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const userData = userSnap.data()!;
    const updateData: Record<string, any> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (body.name) updateData.name = String(body.name).trim();
    if (body.phone) updateData.phone = String(body.phone).trim();
    if (body.clinicId) updateData.clinicId = String(body.clinicId).trim();
    if (typeof body.active === "boolean") updateData.active = body.active;

    await userRef.update(updateData);

    // If doctor, also sync active / department / avgMinutes
    if (userData.role === "doctor" && userData.doctorId) {
      const doctorRef = db.collection("doctors").doc(userData.doctorId);
      const doctorUpdate: Record<string, any> = {
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (typeof body.active === "boolean") doctorUpdate.active = body.active;
      if (body.department) doctorUpdate.department = String(body.department).trim();
      if (body.avgMinutes) doctorUpdate.avgMinutes = Number(body.avgMinutes);
      await doctorRef.update(doctorUpdate);
    }

    // Write audit log
    await db.collection("auditLogs").add({
      action: "USER_UPDATED",
      targetUid,
      updatedFields: Object.keys(updateData),
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, message: "User account updated successfully." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message === "AUTH_REQUIRED" ? 401 : message === "ADMIN_REQUIRED" ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? "Failed to update user." : message }, { status });
  }
}
