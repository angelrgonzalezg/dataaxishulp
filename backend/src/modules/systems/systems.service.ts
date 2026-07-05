import { prisma } from '../../config/db';
import { NotFoundError, ValidationError } from '../../utils/AppError';
import {
  resolveSystemConnectionUrl,
  testSqlServerConnection,
} from '../../utils/systemConnection';
import { isProductionSystem } from '../support/support.frames';

export interface SystemResponse {
  system_id: number;
  system_key: string;
  name: string;
  description: string | null;
  env_var_name: string;
  host: string | null;
  port: number | null;
  database_name: string | null;
  is_active: boolean;
  is_production: boolean;
  has_connection_url: boolean;
  last_checked_at: Date | null;
  last_status: string | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapSystem(row: {
  systemId: number;
  systemKey: string;
  name: string;
  description: string | null;
  envVarName: string;
  host: string | null;
  port: number | null;
  databaseName: string | null;
  isActive: boolean;
  lastCheckedAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SystemResponse {
  return {
    system_id: row.systemId,
    system_key: row.systemKey,
    name: row.name,
    description: row.description,
    env_var_name: row.envVarName,
    host: row.host,
    port: row.port,
    database_name: row.databaseName,
    is_active: row.isActive,
    is_production: isProductionSystem(row.systemKey, row.envVarName),
    has_connection_url: Boolean(resolveSystemConnectionUrl(row.envVarName)),
    last_checked_at: row.lastCheckedAt,
    last_status: row.lastStatus,
    last_error: row.lastError,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export async function listSystems(): Promise<SystemResponse[]> {
  const rows = await prisma.systemConnection.findMany({
    orderBy: { name: 'asc' },
  });
  return rows.map(mapSystem);
}

export async function getSystemById(systemId: number): Promise<SystemResponse> {
  const row = await prisma.systemConnection.findUnique({ where: { systemId } });
  if (!row) throw new NotFoundError('System not found');
  return mapSystem(row);
}

export async function testSystemConnection(systemId: number): Promise<SystemResponse> {
  const row = await prisma.systemConnection.findUnique({ where: { systemId } });
  if (!row) throw new NotFoundError('System not found');

  const url = resolveSystemConnectionUrl(row.envVarName);
  if (!url) {
    throw new ValidationError(
      `Connection URL not configured. Set environment variable ${row.envVarName}`,
    );
  }

  const result = await testSqlServerConnection(url);
  const updated = await prisma.systemConnection.update({
    where: { systemId },
    data: {
      lastCheckedAt: new Date(),
      lastStatus: result.ok ? 'online' : 'offline',
      lastError: result.ok ? null : (result.error ?? 'Connection failed').slice(0, 500),
    },
  });

  return mapSystem(updated);
}
