/**
 * Assembles packages/cli/dist, published as a subfolder of @eidola/cli
 * (never as its own package root — see packages/cli/package.json for the
 * canonical main/bin/exports, all dist/-prefixed):
 * - Bundles @eidola/tool-state (no separate publish)
 * - Copies @eidola/shrine server + Vite renderer into dist/shrine/
 *
 * Shrine bundling decision (Sprint 4.2.1): bundle-all in one package.
 * Three.js and Lottie ship inside the prebuilt renderer assets (~few MB);
 * no peer @eidola/shrine publish — User install stays `npm install -g @eidola/cli`.
 */
import { cp, mkdir, readFile, readdir, rm, writeFile, access } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mcpRoot = resolve(scriptDir, '..');
const repoRoot = resolve(mcpRoot, '../../');
const toolStateRoot = join(repoRoot, 'packages', 'tool-state');
const shrineRoot = join(repoRoot, 'packages', 'shrine');
const cursorHooksRoot = join(repoRoot, 'packages', 'cursor-hooks');
const claudeHooksRoot = join(repoRoot, 'packages', 'claude-hooks');
const distRoot = join(mcpRoot, 'dist');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed in ${cwd}`);
  }
}

async function copyDir(src, dest) {
  await mkdir(dest, { recursive: true });
  await cp(src, dest, { recursive: true });
}

async function patchVendorToolState() {
  const vendorFile = join(distRoot, 'vendor', 'tool-state.js');
  const vendorTypes = join(distRoot, 'vendor', 'tool-state.d.ts');
  let source = await readFile(vendorFile, 'utf8');
  source = source.replace(/from ['"]@eidola\/tool-state['"]/g, "from './tool-state-pkg/index.js'");
  await writeFile(vendorFile, source);

  if (await fileExists(vendorTypes)) {
    let types = await readFile(vendorTypes, 'utf8');
    types = types.replace(/from ['"]@eidola\/tool-state['"]/g, "from './tool-state-pkg/index.js'");
    await writeFile(vendorTypes, types);
  }

  // workspace-registry is a separate Node-only subpath export (kept out of
  // the main barrel so @eidola/shrine's browser bundle stays Node-builtin-free).
  const workspaceRegistryVendorFile = join(distRoot, 'vendor', 'tool-state-workspace-registry.js');
  const workspaceRegistryVendorTypes = join(distRoot, 'vendor', 'tool-state-workspace-registry.d.ts');
  let workspaceRegistrySource = await readFile(workspaceRegistryVendorFile, 'utf8');
  workspaceRegistrySource = workspaceRegistrySource.replace(
    /from ['"]@eidola\/tool-state\/workspace-registry['"]/g,
    "from './tool-state-pkg/workspace-registry.js'",
  );
  await writeFile(workspaceRegistryVendorFile, workspaceRegistrySource);

  if (await fileExists(workspaceRegistryVendorTypes)) {
    let workspaceRegistryTypes = await readFile(workspaceRegistryVendorTypes, 'utf8');
    workspaceRegistryTypes = workspaceRegistryTypes.replace(
      /from ['"]@eidola\/tool-state\/workspace-registry['"]/g,
      "from './tool-state-pkg/workspace-registry.js'",
    );
    await writeFile(workspaceRegistryVendorTypes, workspaceRegistryTypes);
  }

  await copyDir(join(toolStateRoot, 'dist'), join(distRoot, 'vendor', 'tool-state-pkg'));
}

async function writePublishManifest() {
  const sourcePkg = JSON.parse(await readFile(join(mcpRoot, 'package.json'), 'utf8'));
  const publishPkg = {
    name: sourcePkg.name,
    version: sourcePkg.version,
    type: sourcePkg.type,
    description: sourcePkg.description,
    license: sourcePkg.license,
    publishConfig: sourcePkg.publishConfig,
    keywords: sourcePkg.keywords,
    main: 'index.js',
    types: 'index.d.ts',
    bin: { eidola: 'cli.js' },
    exports: {
      '.': { types: './index.d.ts', import: './index.js' },
      './server': { types: './server.d.ts', import: './server.js' },
    },
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

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function walkJsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkJsFiles(path)));
    } else if (entry.name.endsWith('.js')) {
      files.push(path);
    }
  }
  return files;
}

async function patchCursorHooksImports() {
  const hooksDist = join(distRoot, 'cursor-hooks');
  const files = await walkJsFiles(hooksDist);
  for (const file of files) {
    let source = await readFile(file, 'utf8');
    if (!source.includes('@eidola/tool-state')) {
      continue;
    }
    source = source.replace(
      /from ['"]@eidola\/tool-state['"]/g,
      "from '../vendor/tool-state-pkg/index.js'",
    );
    await writeFile(file, source);
  }
}

async function patchClaudeHooksImports() {
  const hooksDist = join(distRoot, 'claude-hooks');
  const files = await walkJsFiles(hooksDist);
  for (const file of files) {
    let source = await readFile(file, 'utf8');
    if (!source.includes('@eidola/tool-state')) {
      continue;
    }
    source = source.replace(
      /from ['"]@eidola\/tool-state\/workspace-registry['"]/g,
      "from '../vendor/tool-state-pkg/workspace-registry.js'",
    );
    source = source.replace(
      /from ['"]@eidola\/tool-state['"]/g,
      "from '../vendor/tool-state-pkg/index.js'",
    );
    await writeFile(file, source);
  }
}

async function patchShrineMcpImports() {
  const shrineDist = join(distRoot, 'shrine');
  const files = await walkJsFiles(shrineDist);
  const mcpIndex = resolve(distRoot, 'index.js');

  for (const file of files) {
    let source = await readFile(file, 'utf8');
    if (
      !source.includes('vendor/mcp.js') &&
      !source.includes("'eidola'") &&
      !source.includes('"eidola"')
    ) {
      continue;
    }

    const fileDir = dirname(file);
    let rel = relative(fileDir, mcpIndex).replace(/\\/g, '/');
    if (!rel.startsWith('.')) {
      rel = `./${rel}`;
    }

    source = source.replace(/from ['"]\.\.\/vendor\/mcp\.js['"]/g, `from '${rel}'`);
    source = source.replace(/from ['"]\.\.\/\.\.\/vendor\/mcp\.js['"]/g, `from '${rel}'`);
    source = source.replace(/from ['"]eidola['"]/g, `from '${rel}'`);
    source = source.replace(/from ['"]@eidola\.app\/cli['"]/g, `from '${rel}'`);
    await writeFile(file, source);
  }
}

async function main() {
  run('pnpm', ['--filter', '@eidola/tool-state', 'run', 'build'], repoRoot);
  run('pnpm', ['--filter', '@eidola/cursor-hooks', 'run', 'build'], repoRoot);
  run('pnpm', ['--filter', '@eidola/claude-hooks', 'run', 'build'], repoRoot);
  run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], mcpRoot);
  await patchVendorToolState();

  run('pnpm', ['--filter', '@eidola/shrine', 'run', 'build'], repoRoot);

  const cursorHooksDist = join(distRoot, 'cursor-hooks');
  await rm(cursorHooksDist, { recursive: true, force: true });
  await copyDir(join(cursorHooksRoot, 'dist'), cursorHooksDist);
  await copyDir(join(cursorHooksRoot, 'templates'), join(cursorHooksDist, 'templates'));
  await patchCursorHooksImports();

  const claudeHooksDist = join(distRoot, 'claude-hooks');
  await rm(claudeHooksDist, { recursive: true, force: true });
  await copyDir(join(claudeHooksRoot, 'dist'), claudeHooksDist);
  await copyDir(join(claudeHooksRoot, 'templates'), join(claudeHooksDist, 'templates'));
  await patchClaudeHooksImports();

  const shrineDist = join(distRoot, 'shrine');
  await rm(shrineDist, { recursive: true, force: true });
  for (const segment of ['server', 'shared', 'renderer', 'vendor']) {
    await copyDir(join(shrineRoot, 'dist', segment), join(shrineDist, segment));
  }
  await patchShrineMcpImports();
  for (const name of [
    'display-config.js',
    'display-config.d.ts',
    'display-config.js.map',
    'display-config.d.ts.map',
  ]) {
    await rm(join(shrineDist, 'server', name), { force: true });
  }
  await writePublishManifest();
  console.log('[prepare-dist] dist ready at', distRoot);
}

main().catch((error) => {
  console.error('[prepare-dist] failed:', error);
  process.exit(1);
});
