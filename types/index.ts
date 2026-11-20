export type Role = "patient" | "doctor" | "receptionist" | "admin";
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  clinicId?: string;
  doctorId?: string;
}
export interface Clinic { id: string; name: string; address: string }
export interface Doctor { id: string; name: string; department: string; clinicId: string; avgMinutes: number }
export type QueueStatus = "waiting" | "almost" | "called" | "serving" | "completed" | "cancelled" | "skipped" | "no-show";
export interface QueueToken { id: string; number: number; patientId: string; patientName: string; doctorId: string; clinicId: string; status: QueueStatus; priority: boolean; arrivedAt: string }
export interface Appointment { id: string; patientId: string; doctorId: string; clinicId: string; date: string; time: string; reason: string; status: "booked" | "cancelled" | "completed"; patientName?: string; doctorName?: string }
export interface Prescription { id: string; patientId: string; doctorId: string; medicine: string; dosage: string; frequency: string; duration: string; instructions?: string }
export interface Notification { id: string; userId: string; message: string; read: boolean; createdAt: string }
export interface MedicalDocument { id: string; patientId: string; title: string; url: string }
export interface Patient extends User { phone?: string }
export interface Receptionist extends User { clinicId: string }
export interface Admin extends User {}
