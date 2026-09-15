# dax-ops-agent

Portable health module that each DataAxis **application** hosts.

Dataaxishulp (`daxhulp`) polls these APIs. It does **not** need VPN access to
client databases: the app already has that connection and reports DB health
from the inside.

| Prefix | Lives in | Role |
|--------|----------|------|
| **daxhulp** | Dataaxishulp | Inventory (`ops_targets`), logs, poller, TV wall, alerts |
| **dax-ops-agent** | Each product (Thuiszorgtv, later Kadaster / Tereno) | `/api/dax-ops/*` health APIs |

## Drop into another app

1. Copy this folder to `src/lib/dax-ops-agent/` (Next.js) or `src/dax-ops-agent/` (Express).
2. Mount `GET /api/dax-ops/health` (see Thuiszorgtv: `src/app/api/dax-ops/health/route.ts`).
3. Set `DAX_OPS_AGENT_TOKEN` in the app and the matching env var in Dataaxishulp.
4. Seed / activate the `ops_targets` row (`probe_mode = dax_ops_agent`, `agent_installed = true`).

## Contract

- Header: `X-DAX-OPS-TOKEN` (or `Authorization: Bearer …`)
- JSON `contract`: `dax-ops/1.0`
- JSON `module`: `dax-ops-agent`
