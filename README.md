# Qurely
Your care. Your queue. Your time. A real-time clinic queue and appointment platform (frontend, mock mode).

## Run
```bash
npm install && npm run dev   # http://localhost:3000
```
Open `/login`, pick a role. Sign-in is a **demo only**; there is no real authentication.

## Architecture
- `types/` shared interfaces (User, Doctor, Clinic, Appointment, QueueToken, Prescription, Notification, MedicalDocument)
- `data/mock/` seed data
- `services/` the only place UI touches data (`authService`, `queueService`, `appointmentService`)
- `hooks/useQueue.ts` polls the service every 2s to feel live

## Connecting the backend
Keep each service's function signatures and replace the bodies with API/Firebase calls. Needed operations:
`queueService.list/joinQueue/setStatus/callNext`, `appointmentService.list/book/cancel`, `authService.loginAsRole/current/logout`.
Put config in `.env.local` (see `.env.example`). The backend must enforce role authorization; UI role checks are not security. Swap polling for a Firestore/WebSocket listener inside `useQueue`.

## Status
Built: landing, demo login, patient queue tracker, doctor queue, receptionist queue + walk-in, admin analytics.
Not yet built: full booking flow, directories, prescriptions, notes, notifications, settings, audit logs, staff management, signup/reset pages, toasts and dialogs.
