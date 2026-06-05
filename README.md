# Consulta

Academic consultation booking system for Mapúa University SOIT.  
Students book consultation slots with professors. Professors manage schedules and log outcomes. Admins monitor all activity.

---

## Tech Stack

| Layer        | Technology                           |
|--------------|--------------------------------------|
| Frontend     | Next.js 15 (App Router, TypeScript)  |
| Backend      | Express.js 5 (Node.js)               |
| Database     | PostgreSQL 16                        |
| Auth         | JWT (jsonwebtoken + bcrypt 12 rounds)|
| Email        | Brevo (native fetch to REST API)     |
| File Storage | Cloudinary                           |
| Reports      | PDFKit + ExcelJS                     |
| Security     | Helmet, express-rate-limit, express-validator |

---

## Project Structure

```
Consulta/
├── backend/
│   ├── db/
│   │   ├── schema.sql          # Initial DDL
│   │   └── migrate.sql         # Additive migrations (safe to re-run)
│   ├── middleware/
│   │   └── auth.middleware.js  # JWT verify + role authorize
│   ├── routes/
│   │   ├── auth.js             # Register / login / profile / password reset
│   │   ├── admin.js            # User management, approvals, calendar overrides
│   │   ├── schedules.js        # Professor availability slots
│   │   ├── consultations.js    # Booking lifecycle
│   │   ├── reports.js          # PDF / Excel export
│   │   ├── forms.js            # Advising slip generation + upload
│   │   ├── chat.js             # Chatbot (Claude API-powered FAQ widget)
│   │   ├── announcements.js    # Announcements CRUD
│   │   ├── calendar.js         # Calendar overrides, notes, blocked dates
│   │   └── settings.js         # User profile, notifications, system settings
│   ├── .env.example
│   └── server.js
└── frontend/
    ├── app/
    │   ├── (auth)/login/        # Login page
    │   ├── (auth)/register/     # Register page
    │   ├── forgot-password/     # Request password reset
    │   ├── reset-password/      # Set new password via token
    │   └── dashboard/
    │       ├── student/         # Student dashboard
    │       ├── professor/       # Professor dashboard
    │       ├── admin/           # Admin dashboard
    │       ├── home/            # Academic tracker (week, calendar, countdowns)
    │       └── help/            # Help Center
    ├── components/
    │   └── DashboardShell.tsx   # Shared layout: week badge + chatbot
    └── lib/
        ├── api.ts               # Typed API client
        └── academicCalendar.ts  # Term utilities (week, progress, holidays)
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Docker (for PostgreSQL) or a local PostgreSQL 16 instance

### 1. Database

```bash
cd backend
docker compose up -d        # starts PostgreSQL on port 5432
```

Apply schema and migrations:

```bash
psql $DATABASE_URL -f db/schema.sql
psql $DATABASE_URL -f db/migrate.sql
```

### 2. Backend

```bash
cd backend
cp .env.example .env        # fill in your values
npm install
npm run dev                 # http://localhost:4000
```

**Required env vars:**

| Variable                | Description                                                         |
|-------------------------|---------------------------------------------------------------------|
| `PORT`                  | Express port (default 4000)                                         |
| `DATABASE_URL`          | PostgreSQL connection string                                        |
| `JWT_SECRET`            | Secret for signing JWTs (min 32 chars in prod)                      |
| `ALLOWED_ORIGINS`       | Comma-separated CORS origins (default: `http://localhost:3000`)     |
| `BREVO_API_KEY`         | Brevo API key for sending password reset emails                     |
| `EMAIL_FROM`            | Sender email address (e.g. `consultsiya.noreply@gmail.com`)         |
| `FRONTEND_URL`          | Base URL used in reset links (e.g. `https://consult-siya-ten.vercel.app`) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name                                               |
| `CLOUDINARY_API_KEY`    | Cloudinary API key                                                  |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret                                               |

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                 # http://localhost:3000
```

Set in `frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

---

## Deployment

| Layer    | Platform                         |
|----------|----------------------------------|
| Frontend | Vercel                           |
| Backend  | Railway                          |
| Database | Neon (PostgreSQL 16, serverless) |

> Railway injects `PORT` automatically. `FRONTEND_URL` must match the deployed Vercel domain so password reset links resolve correctly.

---

## Roles & Features

### Student
- Browse professor availability and book consultation slots
- Choose date, time, mode (Face-to-Face / Online), and nature of concern
- View, cancel, and track consultation history grouped by quarter
- Download blank advising slip template; upload signed form after session
- **Password reset** — request a reset link via email; set a new password via token
- **Home page** — current academic week, term progress, countdown to finals
- **Help Center** — usage guide, submission guidelines, expandable FAQs
- **Chatbot** — full FAQ widget powered by Claude API; answers questions about professors, booking steps, policies, and concern types

### Professor
- **My Consultations** — confirm (with optional meeting link for Online), complete (action taken, referral, remarks), or reschedule bookings
- **Manage Schedules** — create slots with multiple time ranges per date, set location
- **Export Report** — PDF or Excel report filtered by period (week / semester / year)
- **History** — past sessions grouped by quarter
- **Home** and **Help Center** accessible from sidebar

### Admin
- View all consultations with stats (total / pending / confirmed / completed / cancelled)
- User management: approve, reject, deactivate/reactivate, create, delete accounts
- Promote/demote professors to/from admin (max 2 admins enforced)
- **Announcements** — create, edit, pin, and delete notices visible to all users
- **Calendar management** — set exam weeks, mode overrides (In-Person / Online), and blocked dates
- **Home** and **Help Center** accessible from sidebar

---

## Security

### Implemented

| Area | Implementation |
|------|----------------|
| **Password hashing** | bcrypt with 12 salt rounds |
| **SQL injection** | Parameterized queries (`$1, $2`) throughout — no string concatenation |
| **JWT auth** | `Authorization: Bearer` on all protected routes; 7-day expiry |
| **Role authorization** | Server-side `authorize(...roles)` middleware on every protected endpoint |
| **Account lockout** | 5 failed login attempts → 15-minute lockout (`failed_attempts`, `locked_until` in DB) |
| **Password reset** | Single-use token (1-hour expiry), cleared on use |
| **Input validation** | `express-validator` on all auth endpoints (email format, password length, required fields) |
| **Security headers** | `helmet` — X-Content-Type-Options, X-Frame-Options, CSP, HSTS, etc. |
| **Rate limiting** | Auth endpoints: 10 req/15 min (skips successes) · Chatbot: 20 req/min · Global limiter: disabled |
| **CORS** | Origin whitelist via `ALLOWED_ORIGINS` env var |
| **File upload** | Cloudinary — PDF/JPG/PNG only, 10 MB max |
| **XSS** | React inherently escapes all output; no `dangerouslySetInnerHTML` on user data |

### To-do for production

- Enforce HTTPS at reverse proxy (nginx/Caddy) with HSTS
- Set `Secure; HttpOnly; SameSite=Strict` cookie attributes (currently token is stored in localStorage — migrate to httpOnly cookie for prod)
- Rotate `JWT_SECRET` and use a secrets manager (e.g., AWS Secrets Manager)
- Add audit logging for sensitive actions (account approval, deletion, report export)
- Re-enable and tune global rate limiter

---

## API Endpoints

### Auth — `/api/auth`
| Method | Path               | Auth | Description                                    |
|--------|--------------------|------|------------------------------------------------|
| POST   | `/register`        | —    | Register (student/professor, pending approval) |
| POST   | `/login`           | —    | Login; returns JWT; enforces lockout           |
| POST   | `/logout`          | —    | Logout (clears client-side token)              |
| GET    | `/profile`         | JWT  | Get current user profile                       |
| PATCH  | `/profile`         | JWT  | Update profile fields                          |
| POST   | `/forgot-password` | —    | Send password reset email via Brevo            |
| POST   | `/reset-password`  | —    | Set new password using reset token             |

### Chatbot — `/api/chat`
| Method | Path | Auth | Description                                              |
|--------|------|------|----------------------------------------------------------|
| POST   | `/`  | JWT  | Claude API-powered FAQ widget (20 req/min rate-limited)  |

### Schedules — `/api/schedules`
| Method | Path                | Role      | Description                      |
|--------|---------------------|-----------|----------------------------------|
| POST   | `/`                 | Professor | Create a slot (multi-time-range) |
| GET    | `/`                 | Any       | List all available slots         |
| GET    | `/mine`             | Professor | Professor's own slots            |
| GET    | `/all`              | Admin     | All slots across professors      |
| PATCH  | `/:id`              | Professor | Edit slot                        |
| DELETE | `/:id`              | Professor | Delete slot                      |
| GET    | `/:id/booked-times` | Any       | Already-booked times for a date  |

### Consultations — `/api/consultations`
| Method | Path                | Role         | Description                     |
|--------|---------------------|--------------|---------------------------------|
| POST   | `/`                 | Student      | Book a consultation             |
| GET    | `/`                 | Any (scoped) | List consultations              |
| GET    | `/booked-dates`     | Any          | Fully-booked future dates       |
| PATCH  | `/:id/confirm`      | Professor    | Confirm + optional meeting link |
| PATCH  | `/:id/meeting-link` | Professor    | Update meeting link             |
| PATCH  | `/:id/cancel`       | Prof/Student | Cancel                          |
| PATCH  | `/:id/complete`     | Professor    | Mark complete + log outcome     |
| PATCH  | `/:id/reschedule`   | Professor    | Mark rescheduled                |

### Announcements — `/api/announcements`
| Method | Path   | Role  | Description            |
|--------|--------|-------|------------------------|
| GET    | `/`    | Any   | List all announcements |
| POST   | `/`    | Admin | Create announcement    |
| PATCH  | `/:id` | Admin | Update announcement    |
| DELETE | `/:id` | Admin | Delete announcement    |

### Calendar — `/api/calendar`
| Method | Path             | Auth | Description                            |
|--------|------------------|------|----------------------------------------|
| GET    | `/`              | JWT  | Calendar overrides (exam weeks, modes) |
| GET    | `/blocked-dates` | JWT  | Blocked dates                          |
| GET    | `/exam-weeks`    | JWT  | Exam week list                         |
| GET    | `/consultations` | JWT  | Consultations mapped to calendar dates |
| GET    | `/notes`         | JWT  | User's personal calendar notes         |
| POST   | `/notes`         | JWT  | Create/update a calendar note          |
| DELETE | `/notes/:id`     | JWT  | Delete a calendar note                 |

### Admin — `/api/admin`
| Method | Path                      | Description                       |
|--------|---------------------------|-----------------------------------|
| GET    | `/users`                  | List students + professors        |
| GET    | `/admins`                 | List admin accounts               |
| POST   | `/users`                  | Create user (auto-approved)       |
| DELETE | `/users/:id`              | Delete user                       |
| PATCH  | `/users/:id/approve`      | Approve pending account           |
| PATCH  | `/users/:id/reject`       | Reject + delete pending account   |
| PATCH  | `/users/:id/deactivate`   | Deactivate account                |
| PATCH  | `/users/:id/activate`     | Reactivate account                |
| PATCH  | `/transfer-admin`         | Promote to admin                  |
| PATCH  | `/demote-admin/:id`       | Demote admin to professor         |
| POST   | `/exam-weeks`             | Set an exam week override         |
| DELETE | `/exam-weeks/:weekNumber` | Remove exam week override         |
| POST   | `/blocked-dates`          | Block a date                      |
| DELETE | `/blocked-dates/:id`      | Unblock a date                    |
| POST   | `/calendar-overrides`     | Create calendar override          |
| PATCH  | `/calendar-overrides/:id` | Update calendar override          |
| DELETE | `/calendar-overrides/:id` | Delete calendar override          |

### Reports — `/api/reports`
| Method | Path          | Role         | Description                              |
|--------|---------------|--------------|------------------------------------------|
| GET    | `/professors` | Admin        | Professors with consultation counts      |
| GET    | `/excel`      | Prof / Admin | Excel report (`?period=week\|semester\|year`) |
| GET    | `/pdf`        | Prof / Admin | PDF report                               |

### Forms — `/api/forms`
| Method | Path                 | Description                        |
|--------|----------------------|------------------------------------|
| GET    | `/blank-slip`        | Download blank advising slip PDF   |
| GET    | `/advising-slip/:id` | Pre-filled slip for a consultation |
| POST   | `/upload/:id`        | Upload signed form (student)       |
| GET    | `/download/:id`      | Download uploaded form             |

### Settings — `/api/settings`
| Method | Path              | Auth  | Description                               |
|--------|-------------------|-------|-------------------------------------------|
| GET    | `/profile`        | JWT   | Get full profile (with student/prof data) |
| GET    | `/profile/public` | JWT   | Get public profile card                   |
| PATCH  | `/profile`        | JWT   | Update profile fields + avatar            |
| POST   | `/avatar`         | JWT   | Upload avatar image                       |
| DELETE | `/avatar`         | JWT   | Remove avatar                             |
| GET    | `/notifications`  | JWT   | Get notification preferences              |
| PATCH  | `/notifications`  | JWT   | Update notification preferences           |
| GET    | `/system`         | Admin | Get system-wide settings                  |
| GET    | `/term`           | JWT   | Get current academic term settings        |

---

## Database Schema

```
users                      — id, email, password_hash, role, is_approved,
                             failed_attempts, locked_until,
                             password_reset_token, password_reset_expires,
                             avatar, created_at
students                   — id, user_id→users, full_name, student_number,
                             program, year_level, phone, email
professors                 — id, user_id→users, full_name, department, phone, email
schedules                  — id, professor_id→professors, day, date,
                             time_start, time_end, time_ranges (JSONB),
                             is_available, location
consultations              — id, student_id, professor_id, schedule_id,
                             date, time, status, nature_of_advising,
                             nature_of_advising_specify, mode,
                             meeting_link, uploaded_form_path, created_at
consultation_details       — id, consultation_id, action_taken, referral,
                             referral_specify, remarks, completed_at
professor_responsibilities — id, professor_id→professors, concern_type
announcements              — id, title, body, type, pinned, created_by→users,
                             version, created_at, updated_at
user_calendar_notes        — id, user_id→users, date, note, color, created_at
calendar_overrides         — id, type, date, week_number, label, color
system_settings            — key, value, updated_by→users, updated_at
```

`status` flow: `pending` → `confirmed` → `completed` | `cancelled` | `rescheduled` | `missed`

---

## New Pages

### Home (`/dashboard/home`)
- **Current week badge** — Week N of 18, In-Person / Online
- **Countdown cards** — Days to Finals, Days to End of Term, Weeks Remaining, % Progress
- **Term progress bar** — with Midterm and Finals markers
- **Interactive calendar** — highlights today, exam weeks, online weeks, PH holidays
- **Announcements** — DB-backed feed managed by admin; supports pinning and info/warning types
- **Next week preview**

### Help Center (`/dashboard/help`)
- About the System (student / professor / admin role descriptions)
- How to Use (step-by-step guides per role)
- Submission Guidelines (advising slip, file types, etiquette)
- FAQs (10 expandable questions)
- Contact & Support

### Chatbot (floating, all dashboards)
- Accessible via the chat button (bottom-right corner of every dashboard)
- Full FAQ widget powered by the **Claude API** — answers questions about booking steps, professor responsibilities, consultation policies, system usage, and concern types
- Backed by `/api/chat` (JWT-authenticated, 20 req/min rate-limited)

### Password Reset
- `/forgot-password` — enter email to receive a reset link (always returns success to avoid email enumeration)
- `/reset-password?token=...` — enter new password; token expires in 1 hour and is single-use
