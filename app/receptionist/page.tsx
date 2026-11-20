
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashShell from "@/components/DashShell";
import StatusBadge from "@/components/StatusBadge";
import { firebaseAuthService } from "@/services/auth/firebaseAuthService";
import { queueService } from "@/services/queue/queueService";
import { appointmentService } from "@/services/appointments/appointmentService";
import { clinicalService } from "@/services/clinical/clinicalService";
import { useQueue } from "@/hooks/useQueue";
import { auth } from "@/lib/firebase";
import type { QueueStatus, User, QueueToken, Appointment } from "@/types";

interface ClinicDoctor {
  id: string;
  name: string;
  department: string;
  clinicId: string;
}

export default function Receptionist() {
  const [user, setUser] = useState<User | null>(null);
  const [doctors, setDoctors] = useState<ClinicDoctor[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [tokens, setTokens] = useState<QueueToken[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const { tokens: liveTokens, refresh } = useQueue();

  useEffect(() => {
    if (liveTokens) {
      setTokens(liveTokens);
      setLoading(false);
    }
  }, [liveTokens]);

  const [name, setName] = useState("");
  const [priority, setPriority] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    return firebaseAuthService.subscribe(setUser);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const token = await currentUser.getIdToken();
      const response = await fetch("/api/doctors", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const data = await response.json();
      if (response.ok && data.doctors) {
        setDoctors(data.doctors);
        if (data.doctors.length > 0 && !doctorId) {
          setDoctorId(data.doctors[0].id);
        }
      }

      const appts = await appointmentService.list();
      setAppointments(appts || []);
    } catch (err) {
      console.error("Receptionist data loading error:", err);
    } finally {
      setLoading(false);
    }
  }, [doctorId]);

  useEffect(() => {
    if (user) {
      loadData();
      refresh();
    }
  }, [user, loadData, refresh]);

  const rows = useMemo(() => {
    return tokens
      .filter((token) =>
        (filter === "all" || token.status === filter) &&
        token.patientName.toLowerCase().includes(search.toLowerCase())
      )
      .sort(
        (a, b) =>
          Number(b.priority) - Number(a.priority) || a.number - b.number
      );
  }, [tokens, search, filter]);

  const generateToken = async () => {
    const selectedDoctor = doctors.find((d) => d.id === doctorId);
    const targetClinicId = user?.clinicId || selectedDoctor?.clinicId || "";

    if (!name.trim() || !doctorId || !targetClinicId) {
      setError("Please enter patient name and select a doctor.");
      return;
    }

    setBusy(true);
    setError("");
    setSuccessMsg("");

    try {
      const token = await queueService.joinQueue({
        clinicId: targetClinicId,
        doctorId,
        patientId: `walkin_${Date.now()}`,
        patientName: name.trim(),
        priority,
      });

      setName("");
      setPriority(false);
      setSuccessMsg(`Token #${token.number} generated for ${token.patientName}!`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate token.");
    } finally {
      setBusy(false);
    }
  };

  const handleCheckIn = async (appt: Appointment) => {
    setBusy(true);
    setError("");
    setSuccessMsg("");

    try {
      // 1. Mark appointment checked-in
      await clinicalService.checkInAppointment(appt.id);

      // 2. Add to doctor's live queue
      const token = await queueService.joinQueue({
        clinicId: appt.clinicId,
        doctorId: appt.doctorId,
        patientId: appt.patientId,
        patientName: appt.patientName || "Appointment Patient",
        priority: false,
      });

      setSuccessMsg(`Checked in! Token #${token.number} created for ${appt.patientName || "patient"}.`);
      
      // 3. Refresh live lists
      const updatedAppts = await appointmentService.list();
      setAppointments(updatedAppts || []);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const updateStatus = async (id: string, status: QueueStatus) => {
    setBusy(true);
    setError("");
    setSuccessMsg("");

    try {
      await queueService.setStatus(id, status);
      setSuccessMsg(`Token status updated to "${status}".`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update token.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashShell role="receptionist" title="Queue management">
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

      <div className="card">
        <p className="text-sm text-ink/60">Assigned clinic</p>
        <h2 className="font-semibold">{user?.clinicId || doctors[0]?.clinicId || "Clinic"}</h2>
      </div>

      {/* Feature 9: Add walk-in patient to queue */}
      <div className="card flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <label className="text-sm font-semibold">Walk-in patient name</label>
          <input
            className="input mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
          />
        </div>

        <div className="min-w-48 flex-1">
          <label className="text-sm font-semibold">Select doctor</label>
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
        </div>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={priority}
            onChange={(e) => setPriority(e.target.checked)}
          />
          Emergency / Priority
        </label>

        <button
          className="btn-primary"
          disabled={!name.trim() || !doctorId || busy}
          onClick={generateToken}
        >
          {busy ? "Generating..." : "Generate token"}
        </button>
      </div>

      {/* Feature 10: Appointments & Patient Check-in */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold">Appointments & Check-in</h2>
            <p className="text-xs text-ink/60">Check in arriving patients to add them directly to their doctor&apos;s live queue.</p>
          </div>
          <button
            className="btn-ghost text-xs"
            onClick={async () => {
              const appts = await appointmentService.list();
              setAppointments(appts || []);
            }}
          >
            Refresh appointments
          </button>
        </div>

        {appointments.filter((a) => a.status === "booked").length === 0 ? (
          <p className="text-sm text-ink/60 py-2">No pending booked appointments to check in.</p>
        ) : (
          <div className="space-y-2">
            {appointments
              .filter((a) => a.status === "booked")
              .map((appt) => (
                <div key={appt.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 p-3 bg-white">
                  <div>
                    <p className="font-bold text-sm text-ink">{appt.patientName || "Patient"}</p>
                    <p className="text-xs text-ink/60">
                      Doctor: {doctors.find((d) => d.id === appt.doctorId)?.name || appt.doctorId} · Slot: {appt.date} at {appt.time}
                    </p>
                    {appt.reason && <p className="text-xs text-ink/70 mt-0.5 italic">&quot;{appt.reason}&quot;</p>}
                  </div>

                  <button
                    className="btn-primary !py-1.5 !px-3 text-xs !bg-teal hover:!bg-teal/90"
                    disabled={busy}
                    onClick={() => handleCheckIn(appt)}
                  >
                    Check In to Queue
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          className="input max-w-xs"
          placeholder="Search patient"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="input max-w-44"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {["all", "waiting", "almost", "called", "serving", "completed", "skipped", "no-show", "cancelled"].map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <button className="btn-ghost" onClick={refresh}>
          Refresh queue
        </button>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <p className="py-6 text-center text-ink/60">Loading queue...</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-ink/60">
            No patients match these filters.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-ink/60">
              <tr>
                <th>Token</th>
                <th>Patient</th>
                <th>Doctor</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((token) => (
                <tr key={token.id} className="border-t border-ink/10">
                  <td className="py-2 font-bold">{token.number}</td>
                  <td>{token.patientName}</td>
                  <td>
                    {doctors.find((doctor) => doctor.id === token.doctorId)?.name || token.doctorId}
                  </td>
                  <td>{token.priority ? "Yes" : "-"}</td>
                  <td><StatusBadge status={token.status} /></td>
                  <td className="space-x-1 whitespace-nowrap">
                    <button
                      className="btn-ghost !px-2 !py-1"
                      disabled={busy}
                      onClick={() => updateStatus(token.id, "called")}
                    >
                      Call
                    </button>
                    <button
                      className="btn-ghost !px-2 !py-1"
                      disabled={busy}
                      onClick={() => updateStatus(token.id, "completed")}
                    >
                      Done
                    </button>
                    <button
                      className="btn-ghost !px-2 !py-1"
                      disabled={busy}
                      onClick={() => updateStatus(token.id, "no-show")}
                    >
                      No-show
                    </button>
                    <button
                      className="btn-ghost !px-2 !py-1"
                      disabled={busy}
                      onClick={() => updateStatus(token.id, "cancelled")}
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DashShell>
  );
}
