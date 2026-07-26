import { disconnectDb, prisma } from '../config/db';
import {
  inferDialectFromSystemKey,
  type SystemDialect,
} from '../modules/support/systemDialect';

type SeedSystem = {
  systemKey: string;
  name: string;
  description: string;
  dialect: SystemDialect;
  envVarName: string;
  host: string;
  port: number;
  databaseName: string;
};

const systems: SeedSystem[] = [
  {
    systemKey: 'kadaster_statia',
    name: 'Kadaster Statia (Local)',
    description: 'Local KadasterStatia-BDMigration database',
    dialect: 'kadaster',
    envVarName: 'SYSTEM_DB_KADASTER_STATIA_URL',
    host: 'localhost',
    port: 1433,
    databaseName: 'KadasterStatia-BDMigration',
  },
  {
    systemKey: 'kadaster_saba',
    name: 'Kadaster Saba (Local)',
    description: 'Local KadasterSaba-BDMigration database',
    dialect: 'kadaster',
    envVarName: 'SYSTEM_DB_KADASTER_SABA_URL',
    host: 'localhost',
    port: 1433,
    databaseName: 'KadasterSabaBDMigration',
  },
  {
    systemKey: 'kadaster_bonaire',
    name: 'Kadaster Bonaire (Local)',
    description: 'Local Kadaster-BDMigration database (dialect reserved; kadaster-like until verified)',
    dialect: 'bonaire',
    envVarName: 'SYSTEM_DB_KADASTER_BONAIRE_URL',
    host: 'localhost',
    port: 1433,
    databaseName: 'Kadaster-BDMigration',
  },
  {
    systemKey: 'kadaster_statia_prod',
    name: 'Kadaster Statia (PROD)',
    description: 'Production KadasterStatia-BDMigration database',
    dialect: 'kadaster',
    envVarName: 'SYSTEM_DB_KADASTER_STATIA_PROD_URL',
    host: '200.6.147.70',
    port: 1433,
    databaseName: 'KadasterStatia-BDMigration',
  },
  {
    systemKey: 'kadaster_saba_prod',
    name: 'Kadaster Saba (PROD)',
    description: 'Production KadasterSaba-BDMigration database',
    dialect: 'kadaster',
    envVarName: 'SYSTEM_DB_KADASTER_SABA_PROD_URL',
    host: '200.6.147.70',
    port: 1433,
    databaseName: 'KadasterSaba-BDMigration',
  },
  {
    systemKey: 'kadaster_bonaire_prod',
    name: 'Kadaster Bonaire (PROD)',
    description: 'Production Kadaster-BDMigration database (dialect reserved; kadaster-like until verified)',
    dialect: 'bonaire',
    envVarName: 'SYSTEM_DB_KADASTER_BONAIRE_PROD_URL',
    host: '200.6.147.70',
    port: 1433,
    databaseName: 'Kadaster-BDMigration',
  },
  {
    systemKey: 'dlv_aruba',
    name: 'DLV Aruba (Local)',
    description: 'Local Tereno / DLV test database (tereno_dev_AG_local)',
    dialect: 'tereno',
    envVarName: 'SYSTEM_DB_DLV_ARUBA_URL',
    host: 'localhost',
    port: 1433,
    databaseName: 'tereno_dev_AG_local',
  },
  {
    systemKey: 'dlv_aruba_prod',
    name: 'DLV Aruba (PROD)',
    description: 'Production DLV / Tereno Aruba (Azure SQL — requires VPN)',
    dialect: 'tereno',
    envVarName: 'SYSTEM_DB_DLV_ARUBA_PROD_URL',
    host: 'sql-tereno-dev.database.windows.net',
    port: 1433,
    databaseName: 'sqldb-tereno-dev',
  },
];

async function seedSystems(): Promise<void> {
  for (const system of systems) {
    const dialect = system.dialect ?? inferDialectFromSystemKey(system.systemKey);
    await prisma.systemConnection.upsert({
      where: { systemKey: system.systemKey },
      update: {
        name: system.name,
        description: system.description,
        dialect,
        envVarName: system.envVarName,
        host: system.host,
        port: system.port,
        databaseName: system.databaseName,
        isActive: true,
      },
      create: { ...system, dialect },
    });
    console.log(`System ready: ${system.systemKey} [${dialect}] → ${system.envVarName}`);
  }
}

seedSystems()
  .catch((error) => {
    console.error('Failed to seed systems:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDb();
  });
