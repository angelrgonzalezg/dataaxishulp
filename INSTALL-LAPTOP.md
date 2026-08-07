# DataAxis Hulp — instalación en laptop de prueba

Paquete para correr la app **sin** clonar el repositorio Git.

## Requisitos en la laptop

1. **Node.js 20+** (LTS) — https://nodejs.org/
2. **SQL Server** local (Developer/Express) o acceso a un SQL remoto
3. (Opcional) **ODBC Driver 18 for SQL Server** si usas Windows auth / conexiones locales nativas
4. (Opcional) VPN si vas a probar bases PROD en Azure / red interna

## Contenido del ZIP

- `backend/` — API
- `frontend/` — UI
- `package.json` — launcher `npm run dev`
- `backend/.env.example` — plantilla de configuración
- este archivo (`INSTALL-LAPTOP.md`)

**No incluye** `node_modules`, `.git`, ni `backend/.env` (credenciales).

## Instalación (primera vez)

### 1. Descomprimir

Ejemplo: `C:\Apps\Dataaxishulp\`

### 2. Crear la base de la aplicación

En SSMS / Azure Data Studio:

```sql
CREATE DATABASE DataAxisHulp;
```

### 3. Configurar el backend

```powershell
cd C:\Apps\Dataaxishulp\backend
copy .env.example .env
notepad .env
```

Ajusta al menos:

- `DATABASE_URL` → tu SQL Server y la DB `DataAxisHulp`
- `SYSTEM_DB_*` → solo las conexiones que quieras probar (puedes dejar vacías las que no uses)
- JWT secrets (cámbialos si la laptop no es solo tuya)

Si en tu máquina de desarrollo ya tienes un `.env` que funciona, puedes **copiarlo a mano** a `backend/.env` en la laptop (no va dentro del ZIP por seguridad).

### 4. Instalar dependencias

Desde la **raíz** del proyecto:

```powershell
cd C:\Apps\Dataaxishulp
npm run install:all
```

### 5. Crear tablas y datos iniciales

```powershell
cd backend
npx prisma generate
npx prisma db push
npm run seed:admin
npm run seed:systems
```

Usuario inicial:

- **Usuario:** `admin`
- **Password:** `Admin!2026`

### 6. Arrancar

Desde la raíz:

```powershell
cd C:\Apps\Dataaxishulp
npm run dev
```

| Servicio  | URL |
|-----------|-----|
| Frontend  | http://localhost:3020 |
| Backend   | http://localhost:3021/api/v1 |

## Después de cambios

Si vuelves a copiar un ZIP nuevo sobre la misma carpeta:

1. No borres tu `backend/.env`
2. Corre otra vez `npm run install:all` si cambió `package.json`
3. Si hay cambios de Prisma: `cd backend; npx prisma db push`

## Problemas frecuentes

| Síntoma | Qué revisar |
|---------|-------------|
| Prisma no encuentra schema | Ejecuta comandos **dentro de** `backend/` |
| Login SQL falla | `DATABASE_URL` / firewall / Windows auth vs user/password |
| Azure SQL “IP not allowed” | VPN o regla de firewall en Azure |
| `queryRaw is not a function` | Usa la build reciente (Tedious en worker); reinicia backend |
| Puerto ocupado | Cambia `PORT` en `.env` o cierra el proceso en 3020/3021 |

## Nota de seguridad

Este paquete es para **prueba interna**. No subas el ZIP a internet público si contiene un `.env` con passwords.
