/**
 * Writes a publish-ready package.json into packages/shrine/dist.
 * Workspace deps (@eidola/cli, @eidola/tool-state) are bundled at build time.
 */
import { readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const shrineRoot = resolve(scriptDir, '..');
const distRoot = join(shrineRoot, 'dist');

async function writePublishManifest() {
  const sourcePkg = JSON.parse(await readFile(join(shrineRoot, 'package.json'), 'utf8'));
  const publishPkg = {
    name: sourcePkg.name,
    version: sourcePkg.version,
    type: sourcePkg.type,
    description: sourcePkg.description,
    main: 'server/index.js',
    dependencies: { ...sourcePkg.dependencies },
    engines: sourcePkg.engines,
  };

  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    if (!(section in publishPkg)) {
      continue;
    }
    for (const [name, version] of Object.entries(publishPkg[section])) {
      if (String(version).startsWith('workspace:')) {
        delete publishPkg[section][name];
      }
    }
    if (Object.keys(publishPkg[section]).length === 0) {
      delete publishPkg[section];
    }
  }

  await writeFile(join(distRoot, 'package.json'), `${JSON.stringify(publishPkg, null, 2)}\n`, 'utf8');
}

async function removeOrphanedDisplayConfig() {
  const serverDist = join(distRoot, 'server');
  for (const name of [
    'display-config.js',
    'display-config.d.ts',
    'display-config.js.map',
    'display-config.d.ts.map',
  ]) {
    await rm(join(serverDist, name), { force: true });
  }
}

await removeOrphanedDisplayConfig();
await writePublishManifest();
console.log('[prepare-dist] publish manifest ready at', join(distRoot, 'package.json'));
