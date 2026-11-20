# Qurely

Qurely is a clinic operations platform for appointment booking, digital patient
queues, staff workflows, and basic clinical records. It is built with Next.js
and Firebase and supports four role-based experiences:

- **Patients** join a doctor's queue, monitor their position, book/reschedule/cancel
  appointments, and view prescriptions and medical records.
- **Doctors** call the next patient, manage queue status, set availability and
  consultation duration, review patient history, and issue prescriptions.
- **Receptionists** manage a clinic queue, create walk-in tokens, check in
  appointments, and update queue statuses.
- **Administrators** view clinic analytics and create/link doctor and
  receptionist accounts.

## Technology

- Next.js 14 App Router
- React 18 and TypeScript
- Tailwind CSS
- Firebase Authentication
- Cloud Firestore
- Firebase Admin SDK for protected server-side operations
- Recharts for admin analytics
- Lucide React for icons

## Application routes

| Route | Purpose |
| --- | --- |
| `/` | Public landing page |
| `/login` | Firebase email/password sign-in and patient registration |
| `/patient` | Patient queue, appointment, prescription, and medical record dashboard |
| `/doctor` | Doctor queue and consultation dashboard |
| `/receptionist` | Reception desk queue and appointment check-in dashboard |
| `/admin` | Admin analytics and staff account management |

All dashboard pages are protected by `DashShell`. Users without a valid
Firestore profile are redirected to `/login`; users opening the wrong
role-specific dashboard are redirected to their own dashboard.

## Project structure

```text
app/
  page.tsx                    Public landing page
  login/page.tsx              Authentication and patient registration
  patient/page.tsx            Patient workflow
  doctor/page.tsx             Doctor workflow
  receptionist/page.tsx       Reception workflow
  admin/page.tsx              Admin workflow
  api/                        Server-side Firebase Admin API routes
components/
  DashShell.tsx               Auth guard, layout, and logout
  AuthUserContext.tsx         Current-user React context
  StatusBadge.tsx             Queue/appointment status presentation
data/mock/
  index.ts                    Seed data and fallback admin chart data
hooks/
  useQueue.ts                 Auth-aware real-time queue subscription
lib/
  firebase.ts                 Browser Firebase Auth/Firestore clients
  firebaseAdmin.ts            Server-only Firebase Admin initialization
services/
  auth/                       Authentication and profile lookup
  queue/                      Queue API client and Firestore listener
  appointments/               Appointment API client
  clinical/                   Prescription, record, and doctor actions
scripts/                      Firebase bootstrap and staff-linking scripts
types/
  index.ts                    Shared domain types
firestore.rules               Client Firestore read/write rules
```

## Data flow

1. The browser authenticates with Firebase Authentication.
2. The client reads the user's role and clinic/doctor associations from
   `users/{uid}`.
3. Service modules obtain a Firebase ID token and call `/api/*`.
4. Next.js API routes verify the token with Firebase Admin, load the user's
   profile, enforce role/clinic ownership, and perform Firestore operations.
5. Queue mutations use the server API. Queue reads initially use the API and
   then subscribe to `queueTokens` with Firestore `onSnapshot` for live updates.

The `useQueue` hook cleans up listeners when authentication or the selected
doctor changes and falls back to an HTTP refresh if the real-time listener
cannot be created.

## API areas

The App Router API handlers are under [`app/api`](./app/api):

- `queue` and `queue/next`: list, create, update, and advance queue tokens
- `appointments`: list, book, cancel, complete, and reschedule appointments
- `doctors`: list active doctors and update availability/consultation duration
- `patients`: search patients, register walk-ins, and check in appointments
- `prescriptions`: read and create/update prescriptions
- `medical-records`: read and create clinical records
- `user/profile`: user profile operations
- `admin/users`: list clinics/users and create/update staff accounts
- `admin/stats`: protected clinic statistics and chart data
- `admin/clinics` and `admin/logs`: protected admin data endpoints

Protected requests must include:

```http
Authorization: Bearer <Firebase ID token>
```

## Firestore collections

The application uses these main collections:

- `users`
- `clinics`
- `doctors`
- `queueTokens`
- `queueCounters`
- `appointments`
- `appointmentSlots`
- `prescriptions`
- `medicalRecords`
- `medicalDocuments`
- `notifications`
- `auditLogs`

The API is the authoritative write path for operational data. The
[`firestore.rules`](./firestore.rules) file permits scoped client reads for
profiles, clinics, doctors, and queue tokens, while protecting direct writes
and the remaining collections.

## Prerequisites

- Node.js 18 or newer
- npm
- A Firebase project
- Firebase Authentication with the **Email/Password** provider enabled
- Cloud Firestore enabled
- A Firebase service-account JSON file for server-side access

## Local setup

Install dependencies:

```bash
npm install
```

Create `.env.local` from [`.env.example`](./.env.example) and set the Firebase
browser configuration:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

Set `FIREBASE_SERVICE_ACCOUNT_PATH` to the absolute path of the service-account
JSON file. Keep that file outside the repository, and never commit it.

On Windows PowerShell:

```powershell
$env:FIREBASE_SERVICE_ACCOUNT_PATH = "C:\secure\qurely-service-account.json"
```

On macOS/Linux:

```bash
export FIREBASE_SERVICE_ACCOUNT_PATH=/secure/qurely-service-account.json
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Firebase bootstrap

The repository includes scripts for creating the initial Firestore data and
linking Firebase Auth accounts to application profiles. Run them only after
setting `FIREBASE_SERVICE_ACCOUNT_PATH`:

```bash
node scripts/seedClinicsAndDoctors.mjs
node scripts/provisionAdmin.mjs
```

The staff-linking scripts contain project-specific email addresses and IDs.
Review and update their constants before running them:

```bash
node scripts/linkDoctor.mjs
node scripts/linkReceptionist.mjs
node scripts/linkAdditionalStaff.mjs
```

Alternatively, an administrator can create doctor and receptionist accounts
from `/admin`. Doctor creation automatically creates a doctor document and
links it to the new user profile.

## Common commands

```bash
npm run dev       # Start the development server
npm run build     # Create a production build and run type checking
npm run start     # Serve the production build
```

## Security notes

- Role checks in the UI are for navigation only; API routes enforce
  authorization on the server.
- Do not expose the Firebase service-account JSON or
  `FIREBASE_SERVICE_ACCOUNT_PATH` to the browser.
- Do not commit `.env.local`, service-account files, `node_modules`, or `.next`.
- Deploy the Firestore rules in `firestore.rules` alongside the application.
- Review Firebase Auth, Firestore, and service-account permissions before
  using real patient data.

## Current scope

Implemented workflows include authentication, patient registration, queue
creation and live updates, walk-ins, appointment booking and check-in,
appointment rescheduling/cancellation, doctor availability, prescriptions,
medical record viewing/creation APIs, admin staff management, audit logging
hooks, and analytics.

The data model also includes notifications and medical documents, but there is
currently no complete end-user UI for those collections. The `data/mock`
module provides seed/fallback data used by the interface; production
operational reads and writes go through Firebase-backed API routes.
