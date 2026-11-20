"use client";

import { useEffect, useState } from "react";
import DashShell from "@/components/DashShell";
import StatusBadge from "@/components/StatusBadge";
import { useQueue } from "@/hooks/useQueue";
import { queueService } from "@/services/queue/queueService";
import { appointmentService } from "@/services/appointments/appointmentService";
import { clinicalService } from "@/services/clinical/clinicalService";
import { firebaseAuthService } from "@/services/auth/firebaseAuthService";
import { auth } from "@/lib/firebase";
import type { Appointment, Prescription, User } from "@/types";
import { readJsonResponse } from "@/lib/apiResponse";

interface ClinicDoctor {
  id: string;
  name: string;
  department: string;
  clinicId: string;
  avgMinutes?: number;
}

export default function PatientDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [doctors, setDoctors] = useState<ClinicDoctor[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [medicalRecords, setMedicalRecords] = useState<any[]>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const [joining, setJoining] = useState(false);
  const [booking, setBooking] = useState(false);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduling, setRescheduling] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const { tokens, refresh } = useQueue();

  useEffect(() => {
    return firebaseAuthService.subscribe(setUser);
  }, []);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function loadData() {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        const token = await currentUser.getIdToken();

        const response = await fetch("/api/doctors", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        const data = await readJsonResponse<{ doctors: ClinicDoctor[] }>(response);

        if (!cancelled) {
          setDoctors(data.doctors);
          if (data.doctors.length > 0) {
            setDoctorId(data.doctors[0].id);
          }
        }

        const [apptsResult, rxResult, medResult] = await Promise.all([
          appointmentService.list(),
          clinicalService.getPrescriptions().catch(() => []),
          clinicalService.getMedicalRecords().catch(() => []),
        ]);

        if (!cancelled) {
          setAppointments(apptsResult);
          setPrescriptions(rxResult);
          setMedicalRecords(medResult);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load data.");
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const mine = tokens?.find(
    (t) =>
      t.patientId === user?.id &&
      !["completed", "cancelled", "skipped", "no-show"].includes(t.status)
  );

  const serving = tokens?.find((t) => t.status === "serving");
  const selectedDoctor = doctors.find((d) => d.id === doctorId);

  const ahead = mine
    ? typeof (mine as any).patientsAhead === "number"
      ? (mine as any).patientsAhead
      : tokens!.filter(
          (t) =>
            ["waiting", "almost", "called"].includes(t.status) &&
            (Number(t.priority) > Number(mine.priority) ||
              (Number(t.priority) === Number(mine.priority) && t.number < mine.number))
        ).length
    : 0;

  const eta = mine
    ? typeof (mine as any).estimatedWaitMinutes === "number"
      ? (mine as any).estimatedWaitMinutes
      : ahead * (selectedDoctor?.avgMinutes ?? 10)
    : 0;

  const joinQueue = async () => {
    if (!user || !selectedDoctor) return;

    setJoining(true);
    setError("");

    try {
      await queueService.joinQueue({
        clinicId: selectedDoctor.clinicId,
        doctorId: selectedDoctor.id,
        patientId: user.id,
        patientName: user.name,
      });

      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to join queue.");
    } finally {
      setJoining(false);
    }
  };

  const bookAppointment = async () => {
    if (!selectedDoctor || !date || !time || !reason.trim()) {
      setError("Please fill in all appointment details.");
      return;
    }

    setBooking(true);
    setError("");

    try {
      await appointmentService.book({
        patientId: user!.id,
        doctorId: selectedDoctor.id,
        clinicId: selectedDoctor.clinicId,
        date,
        time,
        reason: reason.trim(),
      });

      const result = await appointmentService.list();
      setAppointments(result);
      setDate("");
      setTime("");
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed.");
    } finally {
      setBooking(false);
    }
  };

  const cancelAppointment = async (id: string) => {
    try {
      setError("");
      setSuccessMsg("");
      await appointmentService.cancel(id);
      const result = await appointmentService.list();
      setAppointments(result);
      setSuccessMsg("Appointment cancelled successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancellation failed.");
    }
  };

  const handleReschedule = async (id: string) => {
    if (!rescheduleDate || !rescheduleTime) {
      setError("Please select both a new date and time.");
      return;
    }

    setRescheduling(true);
    setError("");
    setSuccessMsg("");

    try {
      await appointmentService.reschedule(id, rescheduleDate, rescheduleTime);
      const result = await appointmentService.list();
      setAppointments(result);
      setReschedulingId(null);
      setRescheduleDate("");
      setRescheduleTime("");
      setSuccessMsg("Appointment rescheduled successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rescheduling failed.");
    } finally {
      setRescheduling(false);
    }
  };

  return (
    <DashShell role="patient" title="Your queue">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">
          {successMsg}
        </div>
      )}

      {!tokens ? (
        <div className="card h-48 animate-pulse" />
      ) : mine ? (
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink/60">
              Clinic: {mine.clinicId} · Doctor: {selectedDoctor?.name || mine.doctorId}
            </p>
            <StatusBadge status={mine.status} />
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-8">
            <div>
              <p className="text-xs text-ink/60">Your token</p>
              <p className="text-6xl font-extrabold text-amber-token">{mine.number}</p>
            </div>
            <div>
              <p className="text-xs text-ink/60">Now serving</p>
              <p className="text-4xl font-bold text-teal">{serving?.number ?? "-"}</p>
            </div>
            <div>
              <p className="text-xs text-ink/60">Ahead of you</p>
              <p className="text-4xl font-bold">{ahead}</p>
            </div>
            <div>
              <p className="text-xs text-ink/60">Estimated wait</p>
              <p className="text-4xl font-bold">{eta} min</p>
            </div>
          </div>

          <div className="mt-5 h-2 rounded-full bg-ink/10">
            <div
              className="h-2 rounded-full bg-teal transition-all"
              style={{ width: `${Math.max(5, 100 - ahead * 10)}%` }}
            />
          </div>

          <button
            className="btn-ghost mt-4"
            onClick={async () => {
              await queueService.setStatus(mine.id, "cancelled");
              await refresh();
            }}
          >
            Leave queue
          </button>
        </div>
      ) : (
        <div className="card">
          <p className="font-semibold">You are not in a queue right now.</p>

          <label className="mt-3 block text-sm font-semibold">Select doctor</label>
          <select
            className="input mt-1"
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
          >
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name} — {doctor.department}
              </option>
            ))}
          </select>

          <button
            className="btn-primary mt-3"
            disabled={joining || !selectedDoctor}
            onClick={joinQueue}
          >
            {joining ? "Joining..." : "Join queue"}
          </button>
        </div>
      )}

      <div className="card">
        <h2 className="font-bold">Book an appointment</h2>

        <label className="mt-3 block text-sm font-semibold">Select doctor</label>
        <select
          className="input mt-1"
          value={doctorId}
          onChange={(e) => setDoctorId(e.target.value)}
        >
          {doctors.map((doctor) => (
            <option key={doctor.id} value={doctor.id}>
              {doctor.name} — {doctor.department}
            </option>
          ))}
        </select>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold">Appointment date</label>
            <input
              className="input mt-1"
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-semibold">Appointment time</label>
            <input
              className="input mt-1"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>

        <label className="mt-3 block text-sm font-semibold">Reason for visit</label>
        <textarea
          className="input mt-1"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Briefly describe why you need an appointment"
        />

        <button
          className="btn-primary mt-3"
          disabled={booking || !selectedDoctor || !date || !time || !reason.trim()}
          onClick={bookAppointment}
        >
          {booking ? "Booking..." : "Book appointment"}
        </button>
      </div>

      <div className="card">
        <h2 className="font-bold">Your appointments</h2>

        {appointments.length === 0 ? (
          <p className="mt-3 text-sm text-ink/60">No appointments booked yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {appointments.map((appointment) => (
              <div key={appointment.id} className="rounded-xl border border-ink/10 p-3">
                <p className="font-semibold">
                  {doctors.find((d) => d.id === appointment.doctorId)?.name || appointment.doctorId}
                </p>
                <p className="text-sm text-ink/60">
                  {appointment.date} · {appointment.time}
                </p>
                <p className="text-sm">{appointment.reason}</p>
                <p className="mt-1 text-sm capitalize">
                  Status: {appointment.status}
                </p>

                {appointment.status === "booked" && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      className="btn-ghost !px-3 !py-1 text-sm text-red-600 hover:bg-red-50"
                      onClick={() => cancelAppointment(appointment.id)}
                    >
                      Cancel appointment
                    </button>
                    <button
                      className="btn-ghost !px-3 !py-1 text-sm text-teal hover:bg-teal/10"
                      onClick={() => {
                        setReschedulingId(reschedulingId === appointment.id ? null : appointment.id);
                        setRescheduleDate(appointment.date);
                        setRescheduleTime(appointment.time);
                      }}
                    >
                      {reschedulingId === appointment.id ? "Close reschedule" : "Reschedule"}
                    </button>
                  </div>
                )}

                {reschedulingId === appointment.id && (
                  <div className="mt-3 rounded-lg border border-teal/20 bg-teal/5 p-3 space-y-2">
                    <p className="text-xs font-semibold text-teal">Select new date & time</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        className="input text-sm"
                        type="date"
                        min={new Date().toISOString().slice(0, 10)}
                        value={rescheduleDate}
                        onChange={(e) => setRescheduleDate(e.target.value)}
                      />
                      <input
                        className="input text-sm"
                        type="time"
                        value={rescheduleTime}
                        onChange={(e) => setRescheduleTime(e.target.value)}
                      />
                    </div>
                    <button
                      className="btn-primary !py-1 !px-3 text-xs"
                      disabled={rescheduling || !rescheduleDate || !rescheduleTime}
                      onClick={() => handleReschedule(appointment.id)}
                    >
                      {rescheduling ? "Updating..." : "Confirm new slot"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Feature 3: View Prescriptions */}
      <div className="card">
        <h2 className="font-bold">Your Prescriptions</h2>
        {prescriptions.length === 0 ? (
          <p className="mt-2 text-sm text-ink/60">No prescriptions issued yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {prescriptions.map((rx) => (
              <div key={rx.id} className="rounded-xl border border-ink/10 p-3 bg-white">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-teal">{rx.medicine}</h3>
                  <span className="text-xs text-ink/50">{rx.duration}</span>
                </div>
                <p className="text-sm mt-1">Dosage: <span className="font-medium">{rx.dosage}</span> · Frequency: <span className="font-medium">{rx.frequency}</span></p>
                {rx.instructions && (
                  <p className="text-xs text-ink/70 mt-1 italic">Instructions: {rx.instructions}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Feature 4: View Medical History */}
      <div className="card">
        <h2 className="font-bold">Medical History & Clinical Records</h2>
        {medicalRecords.length === 0 ? (
          <p className="mt-2 text-sm text-ink/60">No past clinical records on file.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {medicalRecords.map((rec) => (
              <div key={rec.id} className="rounded-xl border border-ink/10 p-3 bg-white">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">{rec.title}</h3>
                  <span className="text-xs text-ink/50">{rec.date ? new Date(rec.date).toLocaleDateString() : ""}</span>
                </div>
                {rec.diagnosis && (
                  <p className="text-sm mt-1">Diagnosis: <span className="font-medium text-amber-700">{rec.diagnosis}</span></p>
                )}
                {rec.notes && <p className="text-sm mt-1 text-ink/80">{rec.notes}</p>}
                {Array.isArray(rec.allergies) && rec.allergies.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="text-xs text-ink/60 mr-1">Allergies:</span>
                    {rec.allergies.map((alg: string, idx: number) => (
                      <span key={idx} className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                        {alg}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashShell>
  );
}