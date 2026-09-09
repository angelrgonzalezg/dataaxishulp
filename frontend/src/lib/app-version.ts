/**
 * App version for UI and diagnostics.
 *
 * Source of truth: `frontend/package.json` → injected at build via `vite.config.ts`
 * as `VITE_APP_VERSION`.
 *
 * Optional: set `VITE_APP_RELEASE` in CI (git tag / release name), e.g.
 * `2026.09` or `rc.1`, to show beside the semver.
 *
 * Bump locally with: `npm version patch|minor|major` (from `frontend/`).
 */

export function getAppVersion(): string {
  return import.meta.env.VITE_APP_VERSION?.trim() || '0.0.0';
}

export function getAppRelease(): string | null {
  const release = import.meta.env.VITE_APP_RELEASE?.trim();
  return release || null;
}

/** Label shown in the UI, e.g. `v1.0.0` or `v1.0.0 · 2026.09`. */
export function getAppVersionLabel(): string {
  const version = getAppVersion();
  const release = getAppRelease();
  const versionLabel = version.startsWith('v') ? version : `v${version}`;
  if (!release) return versionLabel;
  if (release === version || release === versionLabel) return versionLabel;
  return `${versionLabel} · ${release}`;
}
