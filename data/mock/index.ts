import type { Clinic, Doctor, QueueToken, Appointment, User } from "@/types";
export const users: Record<string, User> = {
  patient: { id: "p1", name: "Ananya Sharma", email: "ananya@demo.qurely", role: "patient" },
  doctor: { id: "d1", name: "Dr. Rohan Mehta", email: "rohan@demo.qurely", role: "doctor" },
  receptionist: { id: "r1", name: "Priya Nair", email: "priya@demo.qurely", role: "receptionist" },
  admin: { id: "a1", name: "Vikram Rao", email: "vikram@demo.qurely", role: "admin" },
};
export const clinics: Clinic[] = [
  { id: "c1", name: "Sunrise Family Clinic", address: "Sector 29, Gurugram" },
  { id: "c2", name: "CityCare Medical Centre", address: "MG Road, Gurugram" },
];
export const doctors: Doctor[] = [
  { id: "d1", name: "Dr. Rohan Mehta", department: "General Medicine", clinicId: "c1", avgMinutes: 8 },
  { id: "d2", name: "Dr. Kavita Iyer", department: "Dermatology", clinicId: "c1", avgMinutes: 12 },
  { id: "d3", name: "Dr. Sameer Khan", department: "Paediatrics", clinicId: "c2", avgMinutes: 10 },
];
const names = ["Rahul Verma", "Meera Joshi", "Arjun Singh", "Sneha Kulkarni", "Imran Qureshi", "Divya Menon", "Ananya Sharma", "Karan Malhotra"];
const st = ["serving", "waiting", "waiting", "waiting", "waiting", "waiting", "waiting", "waiting"] as const;
export const queueSeed: QueueToken[] = names.map((n, i) => ({
  id: `t${i + 1}`, number: 101 + i, patientId: n === "Ananya Sharma" ? "p1" : `px${i}`, patientName: n,
  doctorId: "d1", clinicId: "c1", status: st[i], priority: i === 4, arrivedAt: new Date(Date.now() - (8 - i) * 6 * 60000).toISOString(),
}));
export const appointmentSeed: Appointment[] = [
  { id: "ap1", patientId: "p1", doctorId: "d1", clinicId: "c1", date: "2026-11-21", time: "10:30", reason: "Follow-up consultation", status: "booked" },
];
export const analytics = {
  perHour: ["9", "10", "11", "12", "1", "2", "3", "4", "5"].map((h, i) => ({ hour: h, patients: [8, 15, 19, 14, 6, 11, 16, 13, 7][i] })),
  waitTrend: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => ({ day: d, minutes: [22, 19, 24, 17, 15, 12][i] })),
  workload: doctors.map((d, i) => ({ name: d.name.replace("Dr. ", ""), patients: [42, 31, 27][i] })),
};
