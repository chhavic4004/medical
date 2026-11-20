import { auth } from "@/lib/firebase";
import type { Appointment } from "@/types";

async function apiRequest<T>(
  options: RequestInit = {}
): Promise<T> {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("Please log in again.");
  }

  const token = await currentUser.getIdToken();

  const response = await fetch("/api/appointments", {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Appointment request failed.");
  }

  return data as T;
}

export const appointmentService = {
  async list(filters?: { status?: string; date?: string; doctorId?: string; patientId?: string; search?: string }): Promise<Appointment[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.date) params.set("date", filters.date);
    if (filters?.doctorId) params.set("doctorId", filters.doctorId);
    if (filters?.patientId) params.set("patientId", filters.patientId);
    if (filters?.search) params.set("search", filters.search);

    const query = params.toString() ? `?${params.toString()}` : "";
    const currentUser = auth.currentUser;

    if (!currentUser) {
      throw new Error("Please log in again.");
    }

    const token = await currentUser.getIdToken();
    const response = await fetch(`/api/appointments${query}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Appointment request failed.");
    }

    return data.appointments;
  },

  async book(
    appointment: Omit<Appointment, "id" | "status"> & { patientName?: string }
  ): Promise<Appointment> {
    const data = await apiRequest<{
      appointment: Appointment;
    }>({
      method: "POST",
      body: JSON.stringify(appointment),
    });

    return data.appointment;
  },

  async cancel(id: string): Promise<boolean> {
    await apiRequest<{ success: boolean }>({
      method: "PATCH",
      body: JSON.stringify({
        id,
        status: "cancelled",
      }),
    });

    return true;
  },

  async reschedule(id: string, newDate: string, newTime: string): Promise<boolean> {
    await apiRequest<{ success: boolean }>({
      method: "PATCH",
      body: JSON.stringify({
        id,
        action: "reschedule",
        newDate,
        newTime,
      }),
    });

    return true;
  },

  async complete(id: string): Promise<boolean> {
    await apiRequest<{ success: boolean }>({
      method: "PATCH",
      body: JSON.stringify({
        id,
        status: "completed",
      }),
    });

    return true;
  },
};