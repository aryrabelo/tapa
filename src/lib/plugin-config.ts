// Per-plugin user config, persisted in localStorage as a nested object keyed by
// plugin id then field key. Plugins declare their fields in plugins.ts; Settings
// renders them; consumers read the configured value here.
const STORAGE_KEY = "tapa-plugin-config";

type ConfigStore = Record<string, Record<string, string>>;

const listeners = new Set<(pluginId: string, key: string) => void>();

function readStore(): ConfigStore {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ConfigStore) : {};
  } catch {
    return {};
  }
}

/** Read a single configured value, or null if unset. */
export function getPluginConfigValue(pluginId: string, key: string): string | null {
  const value = readStore()[pluginId]?.[key];
  return typeof value === "string" ? value : null;
}

/** Persist a single configured value, preserving the plugin's other keys. */
export function setPluginConfigValue(pluginId: string, key: string, value: string): void {
  if (typeof localStorage === "undefined") return;
  const obj = readStore();
  obj[pluginId] = { ...obj[pluginId], [key]: value };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  for (const cb of listeners) cb(pluginId, key);
}

/** Called after every save, so a running plugin can apply a change without a restart. */
export function subscribePluginConfig(cb: (pluginId: string, key: string) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
