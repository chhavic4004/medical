
"use client";

import { useEffect, useMemo, useState } from "react";
import DashShell from "@/components/DashShell";
import StatusBadge from "@/components/StatusBadge";
import { useQueue } from "@/hooks/useQueue";
import { queueService } from "@/services/queue/queueService";
import { clinicalService } from "@/services/clinical/clinicalService";
import { firebaseAuthService } from "@/services/auth/firebaseAuthService";
import { auth } from "@/lib/firebase";
import type { User } from "@/types";

export default function DoctorDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [avgMinutes, setAvgMinutes] = useState(10);
  const [isAvailable, setIsAvailable] = useState(true);
  const [statusMsg, setStatusMsg] = useState("");
  const [activeHistory, setActiveHistory] = useState<any[] | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Prescription form state
  const [showRxForm, setShowRxForm] = useState(false);
  const [rxMedicine, setRxMedicine] = useState("");
  const [rxDosage, setRxDosage] = useState("");
  const [rxFrequency, setRxFrequency] = useState("Twice daily");
  const [rxDuration, setRxDuration] = useState("5 days");
  const [rxInstructions, setRxInstructions] = useState("");
  const [savingRx, setSavingRx] = useState(false);
  const [rxMsg, setRxMsg] = useState("");

  useEffect(() => {
    return firebaseAuthService.subscribe(setUser);
  }, []);

  const doctorId = user?.doctorId ?? "";
  const { tokens, refresh } = useQueue(doctorId);

  useEffect(() => {
    let active = true;

    async function loadDoctorDetails() {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        const token = await currentUser.getIdToken();

        const response = await fetch("/api/doctors", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        if (!response.ok) throw new Error("Unable to load doctor details.");

        const data = await response.json();
        const doctor = data.doctors?.find(
          (item: any) => item.id === doctorId
        );

        if (active && doctor) {
          if (Number(doctor.avgMinutes) > 0) {
            setAvgMinutes(Number(doctor.avgMinutes));
          }
          if (typeof doctor.available === "boolean") {
            setIsAvailable(doctor.available);
          }
        }
      } catch (error) {
        console.error("Doctor details error:", error);
      }
    }

    if (doctorId) loadDoctorDetails();

    return () => {
      active = false;
    };
  }, [doctorId]);

  const serving = tokens?.find((t) => t.status === "serving");
  const waiting = useMemo(
    () =>
      (tokens ?? [])
        .filter((t) => ["waiting", "almost", "called"].includes(t.status))
        .sort(
          (a, b) =>
            Number(b.priority) - Number(a.priority) ||
            a.number - b.number
        ),
    [tokens]
  );

  const done =
    tokens?.filter((t) => t.status === "completed").length ?? 0;

  const waitEstimates = useMemo(() => {
    const estimates = new Map<
      string,
      { patientsAhead: number; estimatedWaitMinutes: number }
    >();

    waiting.forEach((token, index) => {
      const patientsAhead = (serving ? 1 : 0) + index;

      estimates.set(token.id, {
        patientsAhead,
        estimatedWaitMinutes: patientsAhead * avgMinutes,
      });
    });

    return estimates;
  }, [waiting, serving, avgMinutes]);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      setStatusMsg("");
      await fn();
      await refresh();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Queue operation failed."
      );
    }
  };

  const handleToggleAvailability = async () => {
    try {
      const nextVal = !isAvailable;
      setIsAvailable(nextVal);
      await clinicalService.updateDoctorAvailability({
        doctorId,
        available: nextVal,
      });
      setStatusMsg(nextVal ? "You are now marked Available." : "You are now marked On Break / Away.");
    } catch (err) {
      setIsAvailable(!isAvailable);
      alert(err instanceof Error ? err.message : "Failed to update availability.");
    }
  };

  const handleUpdateDuration = async (minutes: number) => {
    setAvgMinutes(minutes);
    try {
      await clinicalService.updateDoctorAvailability({
        doctorId,
        avgMinutes: minutes,
      });
      setStatusMsg(`Consultation duration updated to ${minutes} minutes.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update consultation time.");
    }
  };

  const handleLoadHistory = async (patientId: string) => {
    setLoadingHistory(true);
    try {
      const records = await clinicalService.getMedicalRecords(patientId);
      setActiveHistory(records);
    } catch (err) {
      alert("Failed to load patient medical records.");
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSavePrescription = async () => {
    if (!serving || !rxMedicine.trim() || !rxDosage.trim()) {
      alert("Please provide medicine name and dosage.");
      return;
    }

    setSavingRx(true);
    setRxMsg("");
    try {
      await clinicalService.createPrescription({
        patientId: serving.patientId,
        doctorId,
        clinicId: serving.clinicId,
        medicine: rxMedicine.trim(),
        dosage: rxDosage.trim(),
        frequency: rxFrequency,
        duration: rxDuration,
        instructions: rxInstructions.trim(),
      });
      setRxMsg("Prescription saved successfully!");
      setRxMedicine("");
      setRxDosage("");
      setRxInstructions("");
      setTimeout(() => setShowRxForm(false), 1500);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save prescription.");
    } finally {
      setSavingRx(false);
    }
  };

  return (
    <DashShell role="doctor" title="Today's queue">
      {!doctorId && user && (
        <div className="card text-red-600">
          Your account is not linked to a doctor profile. Contact the administrator.
        </div>
      )}

      {statusMsg && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">
          {statusMsg}
        </div>
      )}

      {/* Feature 8: Doctor Availability & Settings Card */}
      <div className="card flex flex-wrap items-center justify-between gap-4 bg-white">
        <div className="flex items-center gap-3">
          <div className={`h-3.5 w-3.5 rounded-full ${isAvailable ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
          <div>
            <p className="text-sm font-bold text-ink">
              Status: {isAvailable ? "Available (Accepting Patients)" : "On Break / Away"}
            </p>
            <p className="text-xs text-ink/60">
              {isAvailable ? "Patients can join your queue and book slots." : "Queue & bookings for you are paused."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            className={`btn-ghost text-xs !py-1.5 !px-3 font-semibold border ${
              isAvailable
                ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            }`}
            onClick={handleToggleAvailability}
          >
            {isAvailable ? "Take Break / Go Away" : "Resume Availability"}
          </button>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-ink/60">Consultation pace:</span>
            <select
              className="rounded-lg border border-ink/20 px-2 py-1 text-xs"
              value={avgMinutes}
              onChange={(e) => handleUpdateDuration(Number(e.target.value))}
            >
              <option value={5}>5 min</option>
              <option value={8}>8 min</option>
              <option value={10}>10 min</option>
              <option value={15}>15 min</option>
              <option value={20}>20 min</option>
              <option value={30}>30 min</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-sm text-ink/60">Waiting</p>
          <p className="text-3xl font-extrabold">{waiting.length}</p>
        </div>

        <div className="card">
          <p className="text-sm text-ink/60">Completed</p>
          <p className="text-3xl font-extrabold">{done}</p>
        </div>

        <div className="card">
          <p className="text-sm text-ink/60">Now serving</p>
          <p className="text-3xl font-extrabold text-teal">
            {serving?.number ?? "-"}
          </p>
        </div>
      </div>

      {/* Current consultation card */}
      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-ink/60">Current consultation</p>
            <p className="text-xl font-bold">
              {serving
                ? `${serving.patientName} (Token #${serving.number})`
                : "No patient in the room"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary"
              disabled={!doctorId}
              onClick={() => act(() => queueService.callNext(doctorId))}
            >
              Call next patient
            </button>

            {/* Feature 5: Complete consultation button */}
            {serving && (
              <>
                <button
                  className="btn-primary !bg-emerald-600 hover:!bg-emerald-700 text-white"
                  onClick={() => act(() => queueService.setStatus(serving.id, "completed"))}
                >
                  Complete consultation
                </button>

                <button
                  className="btn-ghost !border !border-teal/30 text-teal hover:bg-teal/5"
                  onClick={() => {
                    setShowRxForm(!showRxForm);
                    setRxMsg("");
                  }}
                >
                  {showRxForm ? "Hide Prescription" : "Write Prescription"}
                </button>

                <button
                  className="btn-ghost !border !border-ink/20 text-ink/80 hover:bg-ink/5"
                  onClick={() => handleLoadHistory(serving.patientId)}
                >
                  {loadingHistory ? "Loading..." : "Patient History"}
                </button>

                <button
                  className="btn-ghost"
                  onClick={() => act(() => queueService.setStatus(serving.id, "skipped"))}
                >
                  Skip
                </button>

                <button
                  className="btn-ghost text-red-600"
                  onClick={() => act(() => queueService.setStatus(serving.id, "no-show"))}
                >
                  No-show
                </button>
              </>
            )}
          </div>
        </div>

        {/* Feature 6: Prescription Form */}
        {serving && showRxForm && (
          <div className="rounded-xl border border-teal/20 bg-teal/5 p-4 space-y-3">
            <h3 className="font-bold text-teal">Write Prescription for {serving.patientName}</h3>
            {rxMsg && <p className="text-sm text-emerald-700 font-semibold">{rxMsg}</p>}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-ink/70">Medicine Name *</label>
                <input
                  className="input mt-1 text-sm"
                  placeholder="e.g. Amoxicillin 500mg"
                  value={rxMedicine}
                  onChange={(e) => setRxMedicine(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-ink/70">Dosage *</label>
                <input
                  className="input mt-1 text-sm"
                  placeholder="e.g. 1 capsule"
                  value={rxDosage}
                  onChange={(e) => setRxDosage(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-ink/70">Frequency</label>
                <select
                  className="input mt-1 text-sm"
                  value={rxFrequency}
                  onChange={(e) => setRxFrequency(e.target.value)}
                >
                  <option value="Once daily">Once daily</option>
                  <option value="Twice daily">Twice daily</option>
                  <option value="Three times daily">Three times daily</option>
                  <option value="As needed (SOS)">As needed (SOS)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-ink/70">Duration</label>
                <input
                  className="input mt-1 text-sm"
                  placeholder="e.g. 5 days"
                  value={rxDuration}
                  onChange={(e) => setRxDuration(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-ink/70">Instructions</label>
              <input
                className="input mt-1 text-sm"
                placeholder="e.g. Take after meals with warm water"
                value={rxInstructions}
                onChange={(e) => setRxInstructions(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <button
                className="btn-primary !py-1.5 !px-4 text-xs"
                disabled={savingRx || !rxMedicine.trim() || !rxDosage.trim()}
                onClick={handleSavePrescription}
              >
                {savingRx ? "Saving..." : "Save & Issue Prescription"}
              </button>
              <button
                className="btn-ghost !py-1.5 !px-3 text-xs"
                onClick={() => setShowRxForm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Feature 7: Patient Medical History Display */}
        {serving && activeHistory !== null && (
          <div className="rounded-xl border border-ink/10 bg-slate-50 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">Medical Records for {serving.patientName}</h3>
              <button className="text-xs text-ink/50 hover:text-ink" onClick={() => setActiveHistory(null)}>
                Close
              </button>
            </div>

            {activeHistory.length === 0 ? (
              <p className="text-xs text-ink/60">No prior medical records found for this patient.</p>
            ) : (
              <div className="space-y-2 mt-2 max-h-48 overflow-y-auto">
                {activeHistory.map((rec) => (
                  <div key={rec.id} className="rounded-lg bg-white p-2.5 border border-ink/10 text-xs">
                    <div className="flex justify-between font-semibold">
                      <span>{rec.title}</span>
                      <span className="text-ink/40">{rec.date ? new Date(rec.date).toLocaleDateString() : ""}</span>
                    </div>
                    {rec.diagnosis && <p className="text-amber-800 mt-0.5">Diagnosis: {rec.diagnosis}</p>}
                    {rec.notes && <p className="text-ink/70 mt-0.5">{rec.notes}</p>}
                    {Array.isArray(rec.allergies) && rec.allergies.length > 0 && (
                      <p className="text-red-600 mt-0.5 font-medium">Allergies: {rec.allergies.join(", ")}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-3 font-bold">Queue and estimated waiting time</h2>

        <p className="mb-3 text-xs text-ink/60">
          Estimate based on {avgMinutes} minutes per consultation.
        </p>

        <table className="w-full text-sm">
          <thead className="text-left text-ink/60">
            <tr>
              <th className="py-2">Token</th>
              <th>Patient</th>
              <th>Arrived</th>
              <th>Status</th>
              <th>Patients ahead</th>
              <th>Est. wait</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {tokens?.map((t) => {
              const estimate = waitEstimates.get(t.id);

              return (
                <tr key={t.id} className="border-t border-ink/10">
                  <td className="py-2 font-bold">{t.number}</td>
                  <td>
                    {t.patientName}
                    {t.priority && (
                      <span className="ml-2 text-red-600 text-xs font-semibold">
                        Emergency
                      </span>
                    )}
                  </td>
                  <td>
                    {t.arrivedAt
                      ? new Date(t.arrivedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "-"}
                  </td>
                  <td>
                    <StatusBadge status={t.status} />
                  </td>
                  <td>
                    {estimate ? estimate.patientsAhead : "-"}
                  </td>
                  <td className="font-semibold">
                    {estimate
                      ? `${estimate.estimatedWaitMinutes} min`
                      : t.status === "serving"
                        ? "Now"
                        : "-"}
                  </td>
                  <td className="whitespace-nowrap space-x-1 py-1">
                    {/* Feature 5: Start consultation directly from table if waiting/called */}
                    {["waiting", "called"].includes(t.status) && (
                      <button
                        className="btn-ghost !px-2 !py-0.5 text-xs text-teal font-semibold hover:bg-teal/10"
                        onClick={() => act(() => queueService.setStatus(t.id, "serving"))}
                      >
                        Start
                      </button>
                    )}
                    {t.status === "serving" && (
                      <button
                        className="btn-ghost !px-2 !py-0.5 text-xs text-emerald-700 font-semibold hover:bg-emerald-50"
                        onClick={() => act(() => queueService.setStatus(t.id, "completed"))}
                      >
                        Complete
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}

            {tokens?.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-ink/60">
                  No patients in today's queue.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </DashShell>
  );
}
