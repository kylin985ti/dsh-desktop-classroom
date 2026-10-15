// Resolve from the running Desktop, including user-owned ~/Applications installs.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
export function officePython() {
  const anchor = fileURLToPath(import.meta.resolve('@deepseek-ai/schemastery'));
  const marker = anchor.indexOf('/app.asar/');
  const roots = [process.env.DSH_DESKTOP_RESOURCES, process.resourcesPath,
    marker >= 0 ? anchor.slice(0, marker) : null,
    join(dirname(process.execPath), '../Resources')].filter(Boolean);
  for (const root of roots) {
    const candidate = join(root, 'office-runtime/primary-runtime/dependencies/python/bin/python3');
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('未找到 DSH Desktop 的 Office Python，请安装教学清单中的 Desktop 版本');
}
