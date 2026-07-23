import { disconnectDb, prisma } from '../config/db';

const systems = [
  {
    systemKey: 'kadaster_statia',
    name: 'Kadaster Statia (Local)',
    description: 'Local KadasterStatia-BDMigration database',
    envVarName: 'SYSTEM_DB_KADASTER_STATIA_URL',
    host: 'localhost',
    port: 1433,
    databaseName: 'KadasterStatia-BDMigration',
  },
  {
    systemKey: 'kadaster_saba',
    name: 'Kadaster Saba (Local)',
    description: 'Local KadasterSaba-BDMigration database',
    envVarName: 'SYSTEM_DB_KADASTER_SABA_URL',
    host: 'localhost',
    port: 1433,
    databaseName: 'KadasterSabaBDMigration',
  },
  {
    systemKey: 'kadaster_bonaire',
    name: 'Kadaster Bonaire (Local)',
    description: 'Local Kadaster-BDMigration database',
    envVarName: 'SYSTEM_DB_KADASTER_BONAIRE_URL',
    host: 'localhost',
    port: 1433,
    databaseName: 'Kadaster-BDMigration',
  },
  {
    systemKey: 'kadaster_statia_prod',
    name: 'Kadaster Statia (PROD)',
    description: 'Production KadasterStatia-BDMigration database',
    envVarName: 'SYSTEM_DB_KADASTER_STATIA_PROD_URL',
    host: '200.6.147.70',
    port: 1433,
    databaseName: 'KadasterStatia-BDMigration',
  },
  {
    systemKey: 'kadaster_saba_prod',
    name: 'Kadaster Saba (PROD)',
    description: 'Production KadasterSaba-BDMigration database',
    envVarName: 'SYSTEM_DB_KADASTER_SABA_PROD_URL',
    host: '200.6.147.70',
    port: 1433,
    databaseName: 'KadasterSaba-BDMigration',
  },
  {
    systemKey: 'kadaster_bonaire_prod',
    name: 'Kadaster Bonaire (PROD)',
    description: 'Production Kadaster-BDMigration database',
    envVarName: 'SYSTEM_DB_KADASTER_BONAIRE_PROD_URL',
    host: '200.6.147.70',
    port: 1433,
    databaseName: 'Kadaster-BDMigration',
  },
  {
    systemKey: 'dlv_aruba',
    name: 'DLV Aruba (Local)',
    description: 'Local Tereno / DLV test database (tereno_dev_AG_local)',
    envVarName: 'SYSTEM_DB_DLV_ARUBA_URL',
    host: 'localhost',
    port: 1433,
    databaseName: 'tereno_dev_AG_local',
  },
  {
    systemKey: 'dlv_aruba_prod',
    name: 'DLV Aruba (PROD)',
    description: 'Production DLV / Tereno Aruba (Azure SQL — requires VPN)',
    envVarName: 'SYSTEM_DB_DLV_ARUBA_PROD_URL',
    host: 'sql-tereno-dev.database.windows.net',
    port: 1433,
    databaseName: 'sqldb-tereno-dev',
  },
];

async function seedSystems(): Promise<void> {
  for (const system of systems) {
    await prisma.systemConnection.upsert({
      where: { systemKey: system.systemKey },
      update: {
        name: system.name,
        description: system.description,
        envVarName: system.envVarName,
        host: system.host,
        port: system.port,
        databaseName: system.databaseName,
        isActive: true,
      },
      create: system,
    });
    console.log(`System ready: ${system.systemKey} → ${system.envVarName}`);
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
