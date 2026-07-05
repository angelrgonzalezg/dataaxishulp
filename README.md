# DataAxis Hulp

Issue management, resolution, and history for DataAxis systems.

The UI follows the same visual line as **Thuiszorg_V2** (DataAxis brand colors, logo, login, sidebar, and dashboard).

## Stack

- **Frontend:** React + Vite + Tailwind + React Query
- **Backend:** Node.js + Express + Prisma + JWT
- **App database:** SQL Server (`DataAxisHulp`)
- **System connections:** multi-DB registry (starts with `KadasterStatia-BDMigration`)

## Structure

```
Dataaxishulp/
  backend/     REST API
  frontend/    React UI
```

## Ports

| Service  | Port |
|----------|------|
| Frontend | 3020 |
| Backend  | 3021 |

(Thuiszorg uses 3000/3001, so they do not conflict.)

## Quick start

### 1. Application database

Create the `DataAxisHulp` database on local SQL Server (SSMS or `sqlcmd`):

```sql
CREATE DATABASE DataAxisHulp;
```

Adjust `backend/.env` with your SQL Server credentials.

### 2. Backend

```bash
cd backend
npm install
npx prisma db push
npm run seed:admin
npm run seed:systems
npm run dev
```

Initial user:

- **Username:** `admin`
- **Password:** `Admin!2026`

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3020

Default UI language is **English** (Spanish remains available in the language switcher).

## Included modules

| Module | Description |
|--------|-------------|
| Login / JWT | Authentication with refresh token |
| Users | Roles `admin`, `agent`, `viewer` |
| Dashboard | Issue totals and per-system breakdown |
| Issues | Create, status changes, resolution, and history |
| Systems / DB | Connection registry and connectivity tests |

## System connections

Passwords for system databases are **not stored in the app database**. Each system points to an environment variable.

Currently registered:

| System | Variable | Database |
|--------|----------|----------|
| Kadaster Statia | `SYSTEM_DB_KADASTER_STATIA_URL` | `KadasterStatia-BDMigration` |

Example in `backend/.env`:

```env
SYSTEM_DB_KADASTER_STATIA_URL="sqlserver://localhost:1433;database=KadasterStatia-BDMigration;integratedSecurity=true;encrypt=false;trustServerCertificate=true"
```

Or with username/password:

```env
SYSTEM_DB_KADASTER_STATIA_URL="sqlserver://localhost:1433;database=KadasterStatia-BDMigration;user=staging;password=YourPassword;encrypt=false;trustServerCertificate=true"
```

From the UI (**Systems / DB**) you can test the connection.

To add another system later:

1. Add the URL in `.env` (`SYSTEM_DB_OTHER_SYSTEM_URL=...`)
2. Insert the row in `system_connections` (or extend `seedSystems.ts`)

## Roles

| Role | Permissions |
|------|-------------|
| `admin` | Everything |
| `agent` | Dashboard, issues (CRUD/resolve), view systems |
| `viewer` | Read-only dashboard, issues, and systems |
