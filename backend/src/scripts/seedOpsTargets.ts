import { disconnectDb, prisma } from '../config/db';

type SeedTarget = {
  targetKey: string;
  displayName: string;
  productFamily: string;
  componentKind: string;
  environment: string;
  ownerApp: string;
  probeMode: 'dax_ops_agent' | 'pending_agent';
  baseUrlEnvVar: string | null;
  healthPath: string;
  authEnvVar: string | null;
  requiresVpn: boolean;
  agentInstalled: boolean;
  notes: string;
};

const targets: SeedTarget[] = [
  {
    targetKey: 'thuiszorgtv_local',
    displayName: 'Thuiszorgtv (local)',
    productFamily: 'thuiszorgtv',
    componentKind: 'application',
    environment: 'local',
    ownerApp: 'thuiszorgtv',
    probeMode: 'dax_ops_agent',
    baseUrlEnvVar: 'OPS_TARGET_THUISZORGTV_LOCAL_URL',
    healthPath: '/api/dax-ops/health',
    authEnvVar: 'OPS_AGENT_TOKEN_THUISZORGTV',
    requiresVpn: false,
    agentInstalled: true,
    notes: 'DAX-OPS agent live. Default http://localhost:3000 — same token as Thuiszorgtv DAX_OPS_AGENT_TOKEN.',
  },
  {
    targetKey: 'thuiszorgtv_prod',
    displayName: 'Thuiszorgtv (Vercel)',
    productFamily: 'thuiszorgtv',
    componentKind: 'vercel',
    environment: 'production',
    ownerApp: 'thuiszorgtv',
    probeMode: 'dax_ops_agent',
    baseUrlEnvVar: 'OPS_TARGET_THUISZORGTV_URL',
    healthPath: '/api/dax-ops/health',
    authEnvVar: 'OPS_AGENT_TOKEN_THUISZORGTV',
    requiresVpn: false,
    agentInstalled: true,
    notes: 'Vercel production. Agent reports app version, region, function memory and SQL Server from inside the app.',
  },
  {
    targetKey: 'kadaster_app',
    displayName: 'Kadaster',
    productFamily: 'kadaster',
    componentKind: 'application',
    environment: 'production',
    ownerApp: 'kadaster',
    probeMode: 'pending_agent',
    baseUrlEnvVar: null,
    healthPath: '/api/dax-ops/health',
    authEnvVar: null,
    requiresVpn: true,
    agentInstalled: false,
    notes: 'Reserved. Copy dax-ops-agent after Thuiszorgtv version control is aligned.',
  },
  {
    targetKey: 'kadaster_statia_saba_app',
    displayName: 'Kadaster Statia / Saba',
    productFamily: 'kadaster-statia-saba',
    componentKind: 'application',
    environment: 'production',
    ownerApp: 'kadaster',
    probeMode: 'pending_agent',
    baseUrlEnvVar: null,
    healthPath: '/api/dax-ops/health',
    authEnvVar: null,
    requiresVpn: true,
    agentInstalled: false,
    notes: 'Reserved for the Statia/Saba application. Agent not installed yet.',
  },
  {
    targetKey: 'tereno_app',
    displayName: 'Tereno / DLV Aruba',
    productFamily: 'tereno',
    componentKind: 'application',
    environment: 'production',
    ownerApp: 'tereno',
    probeMode: 'pending_agent',
    baseUrlEnvVar: null,
    healthPath: '/api/dax-ops/health',
    authEnvVar: null,
    requiresVpn: true,
    agentInstalled: false,
    notes: 'Reserved. VPN databases will be reported by the Tereno agent, not from Dataaxishulp directly.',
  },
];

async function seedOpsTargets(): Promise<void> {
  for (const target of targets) {
    await prisma.opsTarget.upsert({
      where: { targetKey: target.targetKey },
      update: {
        displayName: target.displayName,
        productFamily: target.productFamily,
        componentKind: target.componentKind,
        environment: target.environment,
        ownerApp: target.ownerApp,
        origin: 'daxhulp',
        probeMode: target.probeMode,
        baseUrlEnvVar: target.baseUrlEnvVar,
        healthPath: target.healthPath,
        authEnvVar: target.authEnvVar,
        requiresVpn: target.requiresVpn,
        agentInstalled: target.agentInstalled,
        notes: target.notes,
        isActive: true,
      },
      create: {
        ...target,
        origin: 'daxhulp',
        lastStatus: target.agentInstalled ? 'unknown' : 'pending',
      },
    });
    console.log(`Ops target ready: ${target.targetKey} [${target.probeMode}]`);
  }
}

seedOpsTargets()
  .catch((error) => {
    console.error('Failed to seed ops targets:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDb();
  });
