import { spawn, type ChildProcess } from 'node:child_process';

const PACKAGE_NAME = '@eidola/cli';

export interface UninstallNpmPackageResult {
  attempted: boolean;
  ok: boolean;
  output: string;
}

export interface UninstallNpmPackageOptions {
  /** Override for tests — defaults to node:child_process spawn. */
  spawnFn?: typeof spawn;
}

/**
 * Removes the globally-installed npm package itself. `eidola uninstall`
 * previously only rewrote Eidola's own config files (mcp.json, hooks.json,
 * workspace artifacts) and left the package on disk — this closes that gap
 * so "uninstall" actually means uninstall. A no-op (`ok: true`, "not
 * installed") when there's nothing global to remove, e.g. when only run via
 * `npx` without ever being installed globally.
 */
export async function uninstallNpmPackage(
  options: UninstallNpmPackageOptions = {},
): Promise<UninstallNpmPackageResult> {
  const spawnFn = options.spawnFn ?? spawn;
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = ['uninstall', '-g', PACKAGE_NAME];
  // npm.cmd is a batch file on Windows — spawn requires shell:true to run it
  // directly. Passed as a single joined string (not an args array) so Node
  // doesn't emit DEP0190; there's no user input here to worry about escaping.
  const useShell = process.platform === 'win32';

  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = useShell
        ? spawnFn([npmCommand, ...args].join(' '), { shell: true })
        : spawnFn(npmCommand, args, { shell: false });
    } catch (error) {
      resolve({
        attempted: true,
        ok: false,
        output: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.once('error', (error) => {
      resolve({ attempted: true, ok: false, output: error.message });
    });

    child.once('close', (code) => {
      resolve({ attempted: true, ok: code === 0, output: `${stdout}${stderr}`.trim() });
    });
  });
}
