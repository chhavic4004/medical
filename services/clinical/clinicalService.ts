import { auth } from "@/lib/firebase";
import type { Prescription } from "@/types";
import { readJsonResponse } from "@/lib/apiResponse";

async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("Please log in again.");
  }

  const token = await currentUser.getIdToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
    cache: "no-store",
  });

  const data = await readJsonResponse<T>(response);

  return data;
}

export const clinicalService = {
  // Prescriptions
  async getPrescriptions(patientId?: string): Promise<Prescription[]> {
    const q = patientId ? `?patientId=${encodeURIComponent(patientId)}` : "";
    const res = await apiRequest<{ prescriptions: Prescription[] }>(`/api/prescriptions${q}`);
    return res.prescriptions || [];
  },

  async createPrescription(data: {
    patientId: string;
    doctorId?: string;
    clinicId?: string;
    appointmentId?: string;
    medicine: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions?: string;
  }): Promise<Prescription> {
    const res = await apiRequest<{ success: boolean; prescription: Prescription }>("/api/prescriptions", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return res.prescription;
  },

  // Medical Records
  async getMedicalRecords(patientId?: string): Promise<any[]> {
    const q = patientId ? `?patientId=${encodeURIComponent(patientId)}` : "";
    const res = await apiRequest<{ records: any[] }>(`/api/medical-records${q}`);
    return res.records || [];
  },

  async createMedicalRecord(data: {
    patientId: string;
    title: string;
    diagnosis?: string;
    notes?: string;
    allergies?: string[];
  }): Promise<any> {
    const res = await apiRequest<{ success: boolean; record: any }>("/api/medical-records", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return res.record;
  },

  // Doctor Availability & Duration
  async updateDoctorAvailability(data: {
    doctorId?: string;
    available?: boolean;
    avgMinutes?: number;
    department?: string;
  }): Promise<boolean> {
    await apiRequest<{ success: boolean }>("/api/doctors", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return true;
  },

  // Check in patient
  async checkInAppointment(appointmentId: string): Promise<boolean> {
    await apiRequest<{ success: boolean }>("/api/patients", {
      method: "POST",
      body: JSON.stringify({
        action: "check-in",
        appointmentId,
      }),
    });
    return true;
  },
};
