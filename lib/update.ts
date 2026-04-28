const RELEASES_API =
  'https://api.github.com/repos/nguyeehub/sierra-user-guide-creation/releases/latest';

export type UpdateInfo = {
  checkedAt: number;
  currentVersion: string;
  latestVersion: string | null;
  available: boolean;
  htmlUrl: string | null;
  downloadUrl: string | null;
  notes: string | null;
  error: string | null;
};

const STORAGE_KEY = 'updateInfo';

export async function checkForUpdate(): Promise<UpdateInfo> {
  const currentVersion = browser.runtime.getManifest().version;
  const base: UpdateInfo = {
    checkedAt: Date.now(),
    currentVersion,
    latestVersion: null,
    available: false,
    htmlUrl: null,
    downloadUrl: null,
    notes: null,
    error: null,
  };

  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) {
      base.error = `HTTP ${res.status}`;
      await browser.storage.local.set({ [STORAGE_KEY]: base });
      return base;
    }
    const data = (await res.json()) as {
      tag_name?: string;
      name?: string;
      html_url?: string;
      body?: string;
      assets?: { browser_download_url?: string; name?: string }[];
    };
    const latest = stripV(data.tag_name ?? data.name ?? '');
    const crxAsset = data.assets?.find((a) =>
      (a.name ?? '').toLowerCase().endsWith('.zip'),
    );
    const info: UpdateInfo = {
      ...base,
      latestVersion: latest || null,
      htmlUrl: data.html_url ?? null,
      downloadUrl: crxAsset?.browser_download_url ?? data.html_url ?? null,
      notes: data.body ?? null,
      available: latest ? compareSemver(latest, currentVersion) > 0 : false,
    };
    await browser.storage.local.set({ [STORAGE_KEY]: info });
    return info;
  } catch (err) {
    base.error = err instanceof Error ? err.message : String(err);
    await browser.storage.local.set({ [STORAGE_KEY]: base });
    return base;
  }
}

export async function getStoredUpdateInfo(): Promise<UpdateInfo | null> {
  const raw = await browser.storage.local.get(STORAGE_KEY);
  const v = raw[STORAGE_KEY];
  return v && typeof v === 'object' ? (v as UpdateInfo) : null;
}

export async function dismissUpdate(version: string) {
  await browser.storage.local.set({ updateDismissedVersion: version });
}

export async function getDismissedVersion(): Promise<string | null> {
  const raw = await browser.storage.local.get('updateDismissedVersion');
  const v = raw.updateDismissedVersion;
  return typeof v === 'string' ? v : null;
}

function stripV(s: string): string {
  return s.replace(/^v/i, '').trim();
}

export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}
