
"use client";

import { useEffect, useState, type FormEvent } from "react";
import DashShell from "@/components/DashShell";
import { analytics } from "@/data/mock";
import { auth } from "@/lib/firebase";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { readJsonResponse } from "@/lib/apiResponse";

type Clinic = { id: string; name: string };

const stats: [string, string][] = [
  ["Patients this week", "1,284"],
  ["Appointments", "962"],
  ["No-show rate", "6.4%"],
  ["Avg. wait", "18 min"],
];

export default function Admin() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"doctor" | "receptionist">("doctor");
  const [department, setDepartment] = useState("");
  const [clinicId, setClinicId] = useState("");
  const [avgMinutes, setAvgMinutes] = useState("10");
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [liveStats, setLiveStats] = useState<[string, string][]>(stats);
  const [liveAnalytics, setLiveAnalytics] = useState(analytics);
  const [loading, setLoading] = useState(false);
  const [loadingClinics, setLoadingClinics] = useState(true);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    async function loadClinics() {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error("Please sign in again.");

        const token = await currentUser.getIdToken();
        const response = await fetch("/api/admin/users", {
          headers: { Authorization: `Bearer ${token}` },
        });

        const result = await readJsonResponse<{
          clinics: Clinic[];
        }>(response);

        setClinics(result.clinics);
        if (result.clinics.length > 0) {
          setClinicId(result.clinics[0].id);
        }

        // Fetch live stats & analytics
        const statsRes = await fetch("/api/admin/stats", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (statsRes.ok) {
          const statsData = await readJsonResponse<{
            stats: {
              patientsThisWeek: number;
              appointments: number;
              noShowRate: string;
              avgWait: string;
            };
            analytics: typeof analytics;
          }>(statsRes);
          if (statsData.stats) {
            setLiveStats([
              ["Patients this week", String(statsData.stats.patientsThisWeek)],
              ["Appointments", String(statsData.stats.appointments)],
              ["No-show rate", String(statsData.stats.noShowRate)],
              ["Avg. wait", String(statsData.stats.avgWait)],
            ]);
          }
          if (statsData.analytics) {
            setLiveAnalytics(statsData.analytics);
          }
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to load clinics.");
        setIsError(true);
      } finally {
        setLoadingClinics(false);
      }
    }

    loadClinics();
  }, []);

  async function createUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Please sign in again.");

      const token = await currentUser.getIdToken();

      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          email,
          password,
          role,
          clinicId,
          ...(role === "doctor" ? { department, avgMinutes } : {}),
        }),
      });

      const result = await readJsonResponse<{ message: string }>(response);

      setMessage(result.message);
      setIsError(false);
      setName("");
      setEmail("");
      setPassword("");
      setDepartment("");
      setAvgMinutes("10");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashShell role="admin" title="Clinic analytics">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {liveStats.map(([label, value]) => (
          <div key={label} className="card">
            <p className="text-sm text-ink/60">{label}</p>
            <p className="text-3xl font-extrabold">{value}</p>
          </div>
        ))}
      </div>

      <section className="card space-y-4">
        <div>
          <h2 className="text-xl font-bold">User Management</h2>
          <p className="text-sm text-ink/60">
            Create staff accounts and automatically link them to a clinic.
            Doctor profiles are created automatically.
          </p>
        </div>

        <form onSubmit={createUser} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-semibold">Full name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-ink/20 p-3"
              placeholder="Enter full name" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold">Email address</label>
            <input required type="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-ink/20 p-3"
              placeholder="Enter email" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold">Temporary password</label>
            <input required type="password" minLength={6} value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-ink/20 p-3"
              placeholder="At least 6 characters" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold">Account role</label>
            <select value={role}
              onChange={(e) => setRole(e.target.value as "doctor" | "receptionist")}
              className="w-full rounded-lg border border-ink/20 p-3">
              <option value="doctor">Doctor</option>
              <option value="receptionist">Receptionist</option>
            </select>
          </div>

          {role === "doctor" && (
            <>
              <div>
                <label className="mb-1 block text-sm font-semibold">Department / Speciality</label>
                <input required value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full rounded-lg border border-ink/20 p-3"
                  placeholder="e.g. Cardiology" />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">
                  Average consultation time (minutes)
                </label>
                <input required type="number" min="1" max="120"
                  value={avgMinutes} onChange={(e) => setAvgMinutes(e.target.value)}
                  className="w-full rounded-lg border border-ink/20 p-3" />
              </div>
            </>
          )}

          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-semibold">Assign clinic</label>
            <select required value={clinicId}
              onChange={(e) => setClinicId(e.target.value)}
              disabled={loadingClinics || clinics.length === 0}
              className="w-full rounded-lg border border-ink/20 p-3">
              {clinics.length === 0 && <option value="">No clinics available</option>}
              {clinics.map((clinic) => (
                <option key={clinic.id} value={clinic.id}>{clinic.name}</option>
              ))}
            </select>
          </div>

          {message && (
            <p role="alert" className={`text-sm sm:col-span-2 ${isError ? "text-red-600" : "text-green-700"}`}>
              {message}
            </p>
          )}

          <button type="submit"
            disabled={loading || loadingClinics || clinics.length === 0}
            className="btn-primary sm:col-span-2 disabled:opacity-50">
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-bold">Patients per hour</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={liveAnalytics.perHour}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="patients" fill="#0F766E" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h2 className="mb-3 font-bold">Average waiting time (minutes)</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={liveAnalytics.waitTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Line dataKey="minutes" stroke="#F2A33A" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card lg:col-span-2">
          <h2 className="mb-3 font-bold">Doctor workload</h2>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={liveAnalytics.workload} layout="vertical">
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={110} />
                <Tooltip />
                <Bar dataKey="patients" fill="#0A4F4A" radius={6} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </DashShell>
  );
}
