
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authenticate(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("AUTH_REQUIRED");
  }

  const decoded = await getAdminAuth().verifyIdToken(
    authorization.substring(7),
    true
  );

  const db = getAdminDb();
  const profile = await db.collection("users").doc(decoded.uid).get();

  if (!profile.exists) throw new Error("PROFILE_REQUIRED");

  return { uid: decoded.uid, user: profile.data()!, db };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message === "AUTH_REQUIRED" || message.includes("Firebase ID token")) {
    return NextResponse.json(
      { error: "Please log in again." },
      { status: 401 }
    );
  }

  if (message === "PROFILE_REQUIRED") {
    return NextResponse.json(
      { error: "User profile not found." },
      { status: 403 }
    );
  }

  if (message === "FORBIDDEN") {
    return NextResponse.json(
      { error: "You are not allowed to perform this action." },
      { status: 403 }
    );
  }

  if (message === "NOT_FOUND") {
    return NextResponse.json(
      { error: "Appointment not found." },
      { status: 404 }
    );
  }

  if (message === "SLOT_TAKEN") {
    return NextResponse.json(
      { error: "This appointment slot is already booked." },
      { status: 409 }
    );
  }

  console.error("Appointments API error:", error);

  return NextResponse.json(
    { error: "Appointment request failed." },
    { status: 500 }
  );
}

// GET: Fetch appointments for the logged-in user's role with optional filtering.
export async function GET(request: NextRequest) {
  try {
    const { uid, user, db } = await authenticate(request);
    const appointmentsRef = db.collection("appointments");

    const searchParams = request.nextUrl.searchParams;
    const filterStatus = searchParams.get("status");
    const filterDate = searchParams.get("date");
    const filterDoctorId = searchParams.get("doctorId");
    const filterPatientId = searchParams.get("patientId");
    const search = searchParams.get("search")?.toLowerCase().trim();

    let query: FirebaseFirestore.Query = appointmentsRef;

    if (user.role === "patient") {
      query = query.where("patientId", "==", uid);
    } else if (user.role === "doctor") {
      if (!user.doctorId) throw new Error("FORBIDDEN");
      query = query.where("doctorId", "==", user.doctorId);
    } else if (user.role === "receptionist") {
      if (!user.clinicId) throw new Error("FORBIDDEN");
      query = query.where("clinicId", "==", user.clinicId);

      if (filterDoctorId) {
        query = query.where("doctorId", "==", filterDoctorId);
      }
    } else if (user.role === "admin") {
      if (filterDoctorId) {
        query = query.where("doctorId", "==", filterDoctorId);
      }
    } else {
      throw new Error("FORBIDDEN");
    }

    if (filterStatus) {
      query = query.where("status", "==", filterStatus);
    }

    if (filterDate) {
      query = query.where("date", "==", filterDate);
    }

    if (filterPatientId && (user.role === "doctor" || user.role === "receptionist" || user.role === "admin")) {
      query = query.where("patientId", "==", filterPatientId);
    }

    const snapshot = await query.get();

    const doctorsSnapshot = await db.collection("doctors").get();
    const doctorMap = new Map(
      doctorsSnapshot.docs.map((d) => [d.id, d.data().name || "Doctor"])
    );

    const appointments = await Promise.all(
      snapshot.docs.map(async (appointmentDoc) => {
        const appointment = appointmentDoc.data();

        let patientName = appointment.patientName;
        if (!patientName) {
          const patientSnap = await db.collection("users").doc(appointment.patientId).get();
          patientName = patientSnap.exists ? patientSnap.data()?.name ?? "Patient" : "Patient";
        }

        const doctorName = doctorMap.get(appointment.doctorId) || "Doctor";

        return {
          id: appointmentDoc.id,
          ...appointment,
          patientName,
          doctorName,
        };
      })
    );

    const filtered = search
      ? appointments.filter(
          (a: any) =>
            a.patientName.toLowerCase().includes(search) ||
            a.doctorName.toLowerCase().includes(search) ||
            (a.reason && a.reason.toLowerCase().includes(search))
        )
      : appointments;

    filtered.sort((a: any, b: any) => {
      const dateDiff = String(a.date || "").localeCompare(String(b.date || ""));
      if (dateDiff !== 0) return dateDiff;
      return String(a.time || "").localeCompare(String(b.time || ""));
    });

    return NextResponse.json({ appointments: filtered });
  } catch (error) {
    return errorResponse(error);
  }
}

// POST: Book an appointment with past-date validation & duplicate-slot protection.
export async function POST(request: NextRequest) {
  try {
    const { uid, user, db } = await authenticate(request);

    if (!["patient", "receptionist", "admin"].includes(user.role)) {
      throw new Error("FORBIDDEN");
    }

    const body = await request.json();
    const doctorId = typeof body.doctorId === "string" ? body.doctorId.trim() : "";
    const clinicId = typeof body.clinicId === "string" ? body.clinicId.trim() : "";
    const date = typeof body.date === "string" ? body.date.trim() : "";
    const time = typeof body.time === "string" ? body.time.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!doctorId || !clinicId || !date || !time || !reason) {
      return NextResponse.json(
        { error: "Please provide all appointment details (doctor, clinic, date, time, reason)." },
        { status: 400 }
      );
    }

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
    ) {
      return NextResponse.json(
        { error: "Invalid appointment date or time format." },
        { status: 400 }
      );
    }

    // Prevent appointments from being booked in the past
    const appointmentDateTime = new Date(`${date}T${time}:00`);
    if (isNaN(appointmentDateTime.getTime()) || appointmentDateTime.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "Cannot book appointments in the past. Please select a future date and time." },
        { status: 400 }
      );
    }

    // Role-based clinic authorization
    if (user.role === "receptionist" && user.clinicId !== clinicId) {
      throw new Error("FORBIDDEN");
    }

    // Validate clinic availability
    const clinicRef = db.collection("clinics").doc(clinicId);
    const clinicSnap = await clinicRef.get();
    if (!clinicSnap.exists || clinicSnap.data()?.active === false) {
      return NextResponse.json(
        { error: "The selected clinic is currently unavailable." },
        { status: 400 }
      );
    }

    // Validate doctor availability and clinic assignment
    const doctorRef = db.collection("doctors").doc(doctorId);
    const doctorSnap = await doctorRef.get();

    if (!doctorSnap.exists) {
      return NextResponse.json(
        { error: "Doctor not found." },
        { status: 404 }
      );
    }

    const doctor = doctorSnap.data()!;
    if (doctor.active !== true || doctor.clinicId !== clinicId || doctor.available === false) {
      return NextResponse.json(
        { error: "The selected doctor is currently unavailable at this clinic." },
        { status: 400 }
      );
    }

    // Determine target patientId & patientName
    const patientId = user.role === "patient"
      ? uid
      : (typeof body.patientId === "string" && body.patientId.trim() ? body.patientId.trim() : `walkin_${Date.now()}`);

    let patientName = body.patientName?.trim() || "";
    if (user.role === "patient") {
      patientName = user.name || "Patient";
    } else if (!patientName && patientId.startsWith("walkin_")) {
      patientName = "Walk-in Patient";
    } else if (!patientName) {
      const patientUserSnap = await db.collection("users").doc(patientId).get();
      patientName = patientUserSnap.exists ? patientUserSnap.data()?.name || "Patient" : "Patient";
    }

    const appointmentRef = db.collection("appointments").doc();

    const slotId = [
      encodeURIComponent(doctorId),
      date,
      time.replace(":", "-"),
    ].join("_");

    const slotRef = db.collection("appointmentSlots").doc(slotId);

    await db.runTransaction(async (transaction) => {
      const slotSnap = await transaction.get(slotRef);

      const conflictQuery = db
        .collection("appointments")
        .where("doctorId", "==", doctorId)
        .where("date", "==", date)
        .where("time", "==", time)
        .where("status", "==", "booked");

      const conflicts = await transaction.get(conflictQuery);

      if (!conflicts.empty) {
        throw new Error("SLOT_TAKEN");
      }

      if (slotSnap.exists) {
        const previousAppointmentId = slotSnap.data()?.appointmentId;

        if (typeof previousAppointmentId === "string") {
          const previousRef = db
            .collection("appointments")
            .doc(previousAppointmentId);

          const previousSnap = await transaction.get(previousRef);

          if (
            previousSnap.exists &&
            previousSnap.data()?.status === "booked"
          ) {
            throw new Error("SLOT_TAKEN");
          }
        }
      }

      transaction.set(slotRef, {
        appointmentId: appointmentRef.id,
        doctorId,
        date,
        time,
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.set(appointmentRef, {
        patientId,
        patientName,
        doctorId,
        clinicId,
        date,
        time,
        reason: reason.trim(),
        status: "booked",
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json(
      {
        appointment: {
          id: appointmentRef.id,
          patientId,
          patientName,
          doctorId,
          clinicId,
          date,
          time,
          reason: reason.trim(),
          status: "booked",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

// PATCH: Cancel, Complete, or Reschedule an appointment.
export async function PATCH(request: NextRequest) {
  try {
    const { uid, user, db } = await authenticate(request);
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const action = body.action || (body.status === "cancelled" ? "cancel" : body.status === "completed" ? "complete" : "update");
    const newStatus = body.status;

    if (!id) {
      return NextResponse.json(
        { error: "Appointment ID is required." },
        { status: 400 }
      );
    }

    const ref = db.collection("appointments").doc(id);

    // Rescheduling workflow
    if (action === "reschedule" || (body.newDate && body.newTime)) {
      const newDate = typeof body.newDate === "string" ? body.newDate.trim() : "";
      const newTime = typeof body.newTime === "string" ? body.newTime.trim() : "";

      if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(newTime)) {
        return NextResponse.json(
          { error: "Invalid rescheduled appointment date or time format." },
          { status: 400 }
        );
      }

      const newDateTime = new Date(`${newDate}T${newTime}:00`);
      if (isNaN(newDateTime.getTime()) || newDateTime.getTime() <= Date.now()) {
        return NextResponse.json(
          { error: "Cannot reschedule appointment to a past date or time." },
          { status: 400 }
        );
      }

      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) throw new Error("NOT_FOUND");

        const appointment = snapshot.data()!;

        // Permission check
        const allowed =
          (user.role === "patient" && appointment.patientId === uid) ||
          (user.role === "doctor" && appointment.doctorId === user.doctorId) ||
          (user.role === "receptionist" && appointment.clinicId === user.clinicId) ||
          user.role === "admin";

        if (!allowed) throw new Error("FORBIDDEN");

        if (appointment.status !== "booked") {
          throw new Error("CANNOT_MODIFY_FINISHED");
        }

        const oldSlotId = [
          encodeURIComponent(appointment.doctorId),
          appointment.date,
          appointment.time.replace(":", "-"),
        ].join("_");

        const newSlotId = [
          encodeURIComponent(appointment.doctorId),
          newDate,
          newTime.replace(":", "-"),
        ].join("_");

        const oldSlotRef = db.collection("appointmentSlots").doc(oldSlotId);
        const newSlotRef = db.collection("appointmentSlots").doc(newSlotId);

        const newSlotSnap = await transaction.get(newSlotRef);
        if (newSlotSnap.exists) {
          const conflictApptId = newSlotSnap.data()?.appointmentId;
          if (conflictApptId && conflictApptId !== id) {
            const conflictAppt = await transaction.get(db.collection("appointments").doc(conflictApptId));
            if (conflictAppt.exists && conflictAppt.data()?.status === "booked") {
              throw new Error("SLOT_TAKEN");
            }
          }
        }

        // Release old slot and lock new slot
        transaction.delete(oldSlotRef);
        transaction.set(newSlotRef, {
          appointmentId: id,
          doctorId: appointment.doctorId,
          date: newDate,
          time: newTime,
          updatedAt: FieldValue.serverTimestamp(),
        });

        transaction.update(ref, {
          date: newDate,
          time: newTime,
          status: "booked",
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      return NextResponse.json({ success: true, message: "Appointment rescheduled successfully." });
    }

    // Cancellation or Completion workflow
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new Error("NOT_FOUND");

      const appointment = snapshot.data()!;

      const allowed =
        (user.role === "patient" && appointment.patientId === uid) ||
        (user.role === "doctor" && appointment.doctorId === user.doctorId) ||
        (user.role === "receptionist" && appointment.clinicId === user.clinicId) ||
        user.role === "admin";

      if (!allowed) throw new Error("FORBIDDEN");

      if (action === "cancel" || newStatus === "cancelled") {
        if (appointment.status !== "booked") {
          throw new Error("ALREADY_CLOSED");
        }

        // Release slot lock so slot can be booked again
        const slotId = [
          encodeURIComponent(appointment.doctorId),
          appointment.date,
          appointment.time.replace(":", "-"),
        ].join("_");
        const slotRef = db.collection("appointmentSlots").doc(slotId);
        transaction.delete(slotRef);

        transaction.update(ref, {
          status: "cancelled",
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else if (action === "complete" || newStatus === "completed") {
        if (user.role === "patient") {
          throw new Error("FORBIDDEN");
        }
        if (appointment.status !== "booked") {
          throw new Error("ALREADY_CLOSED");
        }

        transaction.update(ref, {
          status: "completed",
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        throw new Error("INVALID_ACTION");
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "ALREADY_CLOSED") {
      return NextResponse.json(
        { error: "This appointment is already cancelled or completed." },
        { status: 400 }
      );
    }
    if (message === "CANNOT_MODIFY_FINISHED") {
      return NextResponse.json(
        { error: "Cannot reschedule an appointment that is not in booked status." },
        { status: 400 }
      );
    }
    return errorResponse(error);
  }
}
