import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveEidolaRuntimeConfig, createStateSocketServer, SessionState, autoActivateFromWorkspace, listEngramDirectories, resolveEngramLocation, linkEngramToWorkspace, copySoulToWorkspace, ensureSoulImport, removeSoulImport, removeSoulFromWorkspace, findActiveSoulImportEngramId, deactivateEngramInWorkspace, resolveActiveEngram, readWorkspaceRegistry, readWorkspaceConfig, writeMcpAwakenSignal, writeShrineLock, removeShrineLock, type EngramListEntry, type StateSocketServer } from '../vendor/mcp.js';
import { resolveShrineSurface, shrineHttpPort, type ShrineSurface } from '../shared/shrine-surface.js';
import { buildHttpClipUrl, toHttpClipUrl, type ShrineStatePayload } from '../shared/types.js';
import { StateSocketClient } from '../shared/state-socket-client.js';
import { createDefaultResolver, type VesselResolver } from '../shared/vessel-resolver.js';
import {
  expandHomePath,
  isExistingDirectory,
  readShrineFolderConfig,
  writeShrineFolderConfig,
} from '../shared/shrine-folder-config.js';
import { resolveEngramsDirByFingerprint } from './resolve-engrams-dir.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

interface SseClient {
  id: number;
  res: ServerResponse;
}

export interface ShrineHttpServerOptions {
  port?: number;
  surface?: ShrineSurface;
  rendererDir?: string;
}

export class ShrineHttpServer {
  private readonly port: number;
  private readonly surface: ShrineSurface;
  private readonly rendererDir: string;
  private readonly isDev: boolean = Boolean(process.env.EIDOLA_SHRINE_DEV?.trim());
  private readonly baseRuntime = resolveEidolaRuntimeConfig();
  private engramsDir: string;
  private vesselsDir: string;
  private folderConfigured: boolean;
  private readonly resolver: VesselResolver;
  private session: SessionState | null = null;
  private stateSocketServer: StateSocketServer | null = null;
  private socketClient: StateSocketClient | null = null;
  private sseClients = new Map<number, SseClient>();
  private nextClientId = 1;
  private engramCatalog = new Map<string, EngramListEntry>();
  private versionCheckCache: { currentVersion: string; latestVersion: string; updateAvailable: boolean } | null = null;
  private server = createServer((req, res) => {
    void this.handleRequest(req, res);
  });

  constructor(options: ShrineHttpServerOptions = {}) {
    this.port = options.port ?? shrineHttpPort();
    this.surface = options.surface ?? resolveShrineSurface();
    this.rendererDir = options.rendererDir ?? join(__dirname, '../renderer');
    this.engramsDir = this.baseRuntime.engramsDir;
    this.vesselsDir = this.baseRuntime.vesselsDir;
    this.folderConfigured = Boolean(process.env.EIDOLA_ROOT?.trim());
    this.resolver = createDefaultResolver({
      engramsDir: this.engramsDir,
      vesselsDir: this.vesselsDir,
      folderConfigured: this.folderConfigured,
    });
  }

  async start(): Promise<void> {
    await this.loadPersistedFolder();

    const alreadyRunning = await this.tryListen();
    if (alreadyRunning) {
      console.log(
        `[eidola-shrine:http] already running at http://127.0.0.1:${this.port}/shrine — nothing to do.`,
      );
      return;
    }

    await this.startStateBridge();
    console.log(
      `[eidola-shrine:http] ${this.surface.preset} ${this.surface.width}×${this.surface.height} at http://127.0.0.1:${this.port}/shrine`,
    );
  }

  /** Returns true when a healthy Eidola Shrine is already listening on this port. */
  private async tryListen(): Promise<boolean> {
    try {
      await new Promise<void>((resolve, reject) => {
        this.server.once('error', reject);
        this.server.listen(this.port, '127.0.0.1', () => {
          this.server.off('error', reject);
          resolve();
        });
      });
      return false;
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EADDRINUSE') {
        throw error;
      }

      if (await this.isHealthyEidolaShrine()) {
        return true;
      }

      throw new Error(
        `Port ${this.port} is already in use by another process (not an Eidola Shrine). ` +
          `Stop that process, or set EIDOLA_SHRINE_HTTP_PORT to run Shrine on a different port.`,
      );
    }
  }

  private async isHealthyEidolaShrine(): Promise<boolean> {
    try {
      const response = await fetch(`http://127.0.0.1:${this.port}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (!response.ok) {
        return false;
      }
      const body = (await response.json()) as { ok?: boolean };
      return body.ok === true;
    } catch {
      return false;
    }
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}/shrine`;
  }

  stop(): void {
    this.socketClient?.stop();
    void this.stateSocketServer?.close();
    this.stateSocketServer = null;
    for (const client of this.sseClients.values()) {
      client.res.end();
    }
    this.sseClients.clear();
    this.server.close();
  }

  private async startStateBridge(): Promise<void> {
    const session = new SessionState();
    this.session = session;
    this.stateSocketServer = createStateSocketServer(session, {
      host: this.baseRuntime.stateSocketHost,
      port: this.baseRuntime.stateSocketPort,
      bufferSize: this.baseRuntime.stateBufferSize,
      onWarn: (message) => {
        console.error('[eidola-shrine:state-socket]', message);
      },
      onReassertVessel: async () => {
        await session.reloadActive();
      },
    });

    const address = await this.stateSocketServer.start();
    if (address.listening) {
      const activation = await autoActivateFromWorkspace(this.currentRuntime(), session, this.stateSocketServer);
      if (activation.activated) {
        console.log(
          `[eidola-shrine:state-socket] ${address.host}:${address.port} · ${activation.engramId ?? 'engram'}`,
        );
      } else {
        console.log(`[eidola-shrine:state-socket] ${address.host}:${address.port}`);
      }
    } else {
      console.warn(
        `[eidola-shrine:state-socket] port ${this.baseRuntime.stateSocketPort} in use — subscribing only`,
      );
    }

    this.socketClient = new StateSocketClient({
      host: this.baseRuntime.stateSocketHost,
      port: address.port,
      onBroadcast: (broadcast) => {
        void this.handleBroadcast(broadcast);
      },
    });
    this.socketClient.start();
  }

  private async handleBroadcast(broadcast: Parameters<VesselResolver['buildStatePayload']>[0]): Promise<void> {
    if (!broadcast.engram_id?.trim()) {
      return;
    }

    await this.ensureCatalogEntry(broadcast.engram_id);
    this.bindResolverFromCatalog(broadcast.engram_id);
    const config = await this.resolver.syncEngram(broadcast.engram_id);
    if (config) {
      this.broadcastSse('vessel-config', config);
    }

    const payload = await this.buildHttpStatePayload(broadcast, 'socket');
    if (payload) {
      this.broadcastSse('state', payload);
    }
  }

  private async buildHttpStatePayload(
    broadcast: Parameters<VesselResolver['buildStatePayload']>[0],
    source: ShrineStatePayload['source'],
  ): Promise<ShrineStatePayload | null> {
    const payload = await this.resolver.buildStatePayload(broadcast, source);
    if (!payload) {
      return null;
    }

    return {
      ...payload,
      clipUrl: toHttpClipUrl(payload.clipUrl),
    };
  }

  private async sendReadyPayloads(): Promise<void> {
    this.broadcastSse('surface', { surface: this.surface });

    const active = this.session?.getActive();
    if (!active) {
      return;
    }

    const catalogEntry = this.engramCatalog.get(active.engram.id);
    if (catalogEntry) {
      this.bindResolverFromCatalog(active.engram.id);
    }

    const config =
      this.resolver.getConfig() ?? (await this.resolver.syncEngram(active.engram.id));
    if (config) {
      this.broadcastSse('vessel-config', config);
    }

    const idleRaw = await this.resolver.buildIdlePayload({
      protocol_version: '1.0',
      ts: Date.now(),
      engram_id: active.engram.id,
    });
    if (idleRaw) {
      this.broadcastSse('state', { ...idleRaw, clipUrl: toHttpClipUrl(idleRaw.clipUrl) });
    }
  }

  private broadcastSse(type: string, payload: unknown): void {
    const data = JSON.stringify({ type, payload });
    for (const client of this.sseClients.values()) {
      client.res.write(`data: ${data}\n\n`);
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${this.port}`);
    const pathname = decodeURIComponent(url.pathname);

    if (req.method === 'POST' && pathname === '/shrine/api/folder/resolve') {
      await this.handleResolveFolder(req, res);
      return;
    }

    if (req.method === 'GET' && pathname === '/shrine/api/folder') {
      await this.handleGetFolder(res);
      return;
    }

    if (req.method === 'POST' && pathname === '/shrine/api/folder') {
      await this.handleSetFolder(req, res);
      return;
    }

    if (req.method === 'GET' && pathname === '/shrine/api/engrams') {
      await this.handleListEngrams(res);
      return;
    }

    if (req.method === 'POST' && pathname === '/shrine/api/awaken') {
      await this.handleAwaken(req, res);
      return;
    }

    if (req.method === 'GET' && pathname === '/shrine/api/active') {
      await this.handleGetActive(res);
      return;
    }

    if (req.method === 'POST' && pathname === '/shrine/api/sleep') {
      await this.handleSleep(req, res);
      return;
    }

    if (req.method === 'GET' && pathname === '/shrine/events') {
      this.handleSse(res);
      return;
    }

    if (req.method === 'POST' && pathname === '/shrine/ready') {
      await this.sendReadyPayloads();
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/vessels/')) {
      await this.serveVessel(pathname.slice('/vessels/'.length), res);
      return;
    }

    if (req.method === 'GET' && pathname === '/shrine') {
      res.writeHead(301, { Location: `/shrine/${url.search}` });
      res.end();
      return;
    }

    if (req.method === 'GET' && pathname === '/shrine/') {
      await this.serveFile(join(this.rendererDir, 'index.html'), res);
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/shrine/')) {
      const assetPath = pathname.slice('/shrine/'.length);
      await this.serveFile(join(this.rendererDir, assetPath), res);
      return;
    }

    if (req.method === 'GET' && pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, surface: this.surface.preset, dev: this.isDev }));
      return;
    }

    if (req.method === 'GET' && pathname === '/shrine/api/version-check') {
      await this.handleVersionCheck(res);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  }

  private currentRuntime() {
    return {
      ...this.baseRuntime,
      repoRoot: this.engramsDir,
      engramsDir: this.engramsDir,
      vesselsDir: this.vesselsDir,
    };
  }

  /**
   * "What's active right now" for the Shrine UI — Task 9's resolver, fed
   * the linked Cursor/Claude-Code workspace root (from the registry
   * `awaken` already reads) rather than `this.baseRuntime`'s own
   * workspaceRoot, since Shrine runs out-of-process from the editor.
   */
  private async resolveActive(): Promise<string | null> {
    if (!this.session) {
      return null;
    }

    const registry = await readWorkspaceRegistry();
    const { engramId } = await resolveActiveEngram(
      { ...this.currentRuntime(), workspaceRoot: registry?.workspace_root },
      this.session,
    );
    return engramId;
  }

  private async loadPersistedFolder(): Promise<void> {
    if (process.env.EIDOLA_ROOT?.trim()) {
      return;
    }

    const persisted = await readShrineFolderConfig();
    if (!persisted) {
      return;
    }

    try {
      await this.applyFolderPath(persisted.engramsDir, { persist: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[eidola-shrine] ignored persisted folder config:', message);
    }
  }

  private async applyFolderPath(
    rawPath: string,
    options: { persist: boolean },
  ): Promise<{ path: string }> {
    const resolved = expandHomePath(rawPath);
    if (!resolved) {
      throw new Error('Folder path is required.');
    }

    if (!isExistingDirectory(resolved)) {
      throw new Error('Folder does not exist.');
    }

    try {
      await access(resolved);
    } catch {
      throw new Error('Folder is not accessible.');
    }

    this.engramsDir = resolved;
    this.vesselsDir = join(resolved, 'vessels');
    this.folderConfigured = true;
    this.resolver.setPaths(this.engramsDir, this.vesselsDir);
    this.resolver.setFolderConfigured(true);
    await this.refreshEngramCatalog();
    this.syncVesselsDirFromCatalog();

    if (options.persist) {
      await writeShrineFolderConfig({ engramsDir: resolved });
    }

    return { path: resolved };
  }

  private syncVesselsDirFromCatalog(): void {
    const entries = Array.from(this.engramCatalog.values());
    if (entries.length === 1) {
      const entry = entries[0]!;
      this.vesselsDir = entry.vesselsDir;
      this.resolver.bindActiveEngram(entry.id, entry.engramDir, entry.vesselsDir);
    }
  }

  private bindResolverFromCatalog(engramId: string): void {
    const entry = this.engramCatalog.get(engramId);
    if (entry) {
      this.vesselsDir = entry.vesselsDir;
      this.resolver.bindActiveEngram(entry.id, entry.engramDir, entry.vesselsDir);
    }
  }

  private async ensureCatalogEntry(engramId: string): Promise<void> {
    if (!this.folderConfigured || this.engramCatalog.has(engramId)) {
      return;
    }

    await this.refreshEngramCatalog();
  }

  private async refreshEngramCatalog(): Promise<EngramListEntry[]> {
    const entries = await listEngramDirectories(this.engramsDir);
    this.engramCatalog = new Map(entries.map((entry) => [entry.id, entry]));
    this.resolver.setCatalogIds(entries.map((entry) => entry.id));
    return entries;
  }

  private mapEngramResponse(entry: EngramListEntry) {
    let previewUrl: string | undefined;
    if (entry.previewPath) {
      const slash = entry.previewPath.indexOf('/');
      if (slash > 0) {
        previewUrl = buildHttpClipUrl(
          entry.previewPath.slice(0, slash),
          entry.previewPath.slice(slash + 1),
        );
      }
    }

    return {
      id: entry.id,
      name: entry.name ?? entry.id,
      description: entry.description,
      author: entry.author,
      previewUrl,
      vesselType: entry.vesselType,
    };
  }

  private async handleResolveFolder(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: { folderName?: string; engramIds?: string[] };
    try {
      body = JSON.parse(await readRequestBody(req)) as { folderName?: string; engramIds?: string[] };
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body.' }));
      return;
    }

    const folderName = body.folderName?.trim();
    if (!folderName) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'folderName is required.' }));
      return;
    }

    const engramIds = Array.isArray(body.engramIds)
      ? body.engramIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];

    try {
      const path = await resolveEngramsDirByFingerprint(folderName, engramIds);
      if (!path) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: false,
            error:
              'Could not locate that folder on disk. Keep it under your home directory or current project.',
          }),
        );
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, path }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: message }));
    }
  }

  private async handleVersionCheck(res: ServerResponse): Promise<void> {
    res.writeHead(200, { 'Content-Type': 'application/json' });

    if (this.versionCheckCache) {
      res.end(JSON.stringify(this.versionCheckCache));
      return;
    }

    try {
      // Read current version from package.json two directories up from the compiled server file.
      // Works for both global install (.../cli/shrine/server/) and the monorepo dist layout.
      const pkgPath = join(__dirname, '../../package.json');
      const { readFile } = await import('node:fs/promises');
      const pkgRaw = await readFile(pkgPath, 'utf8');
      const currentVersion: string = (JSON.parse(pkgRaw) as { version: string }).version;

      const npmResponse = await fetch('https://registry.npmjs.org/@eidola%2Fcli/latest');
      const npmData = (await npmResponse.json()) as { version: string };
      const latestVersion = npmData.version;

      const updateAvailable = latestVersion !== currentVersion;
      this.versionCheckCache = { currentVersion, latestVersion, updateAvailable };
      res.end(JSON.stringify(this.versionCheckCache));
    } catch {
      // If anything fails (offline, bad path, etc.) just report no update needed.
      res.end(JSON.stringify({ currentVersion: 'unknown', latestVersion: 'unknown', updateAvailable: false }));
    }
  }

  private async handleGetFolder(res: ServerResponse): Promise<void> {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        path: this.engramsDir,
        configured: this.folderConfigured,
      }),
    );
  }

  private async handleSetFolder(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: { path?: string };
    try {
      body = JSON.parse(await readRequestBody(req)) as { path?: string };
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body.' }));
      return;
    }

    try {
      const result = await this.applyFolderPath(body.path ?? '', { persist: true });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...result, configured: true }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: message }));
    }
  }

  private async handleListEngrams(res: ServerResponse): Promise<void> {
    if (!this.folderConfigured) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, engrams: [], folder_required: true }));
      return;
    }

    const entries = await this.refreshEngramCatalog();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        engrams: entries.map((entry) => this.mapEngramResponse(entry)),
      }),
    );
  }

  private async handleAwaken(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: { engram_id?: string; enable_personality?: boolean };
    try {
      body = JSON.parse(await readRequestBody(req)) as {
        engram_id?: string;
        enable_personality?: boolean;
      };
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body.' }));
      return;
    }

    const enablePersonality = body.enable_personality !== false;
    const engramId = body.engram_id?.trim();
    if (!engramId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'engram_id is required.' }));
      return;
    }

    if (!this.session) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Session not ready.' }));
      return;
    }

    if (!this.folderConfigured) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Set your Eidola folder first.' }));
      return;
    }

    let directory: string;
    let vesselsDir = this.vesselsDir;
    const catalogEntry = this.engramCatalog.get(engramId);
    try {
      if (catalogEntry) {
        directory = catalogEntry.engramDir;
        vesselsDir = catalogEntry.vesselsDir;
      } else {
        const located = await resolveEngramLocation(this.engramsDir, engramId);
        directory = located.directory;
        vesselsDir = located.vesselsDir;
      }
      this.vesselsDir = vesselsDir;
      this.resolver.bindActiveEngram(engramId, directory, vesselsDir);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: message }));
      return;
    }

    let loadedSoul: string;
    try {
      const loaded = await this.session.load(directory, 'injection');
      loadedSoul = loaded.soul;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: message }));
      return;
    }

    const config = await this.resolver.syncEngram(engramId, directory);
    if (config) {
      this.broadcastSse('vessel-config', config);
    }

    this.stateSocketServer?.broadcastState({ state: 'idle', surface: 'manual' });

    const idleRaw = await this.resolver.buildIdlePayload({
      protocol_version: '1.0',
      ts: Date.now(),
      engram_id: engramId,
    });
    if (idleRaw) {
      this.broadcastSse('state', { ...idleRaw, clipUrl: toHttpClipUrl(idleRaw.clipUrl) });
    }

    let cursorLinked = false;
    let claudeMdLinked = false;
    let mcpSynced = false;
    let cursorLinkError: string | undefined;

    const registry = await readWorkspaceRegistry();
    if (!registry?.workspace_root) {
      cursorLinkError =
        'Open a Cursor or Claude Code project with Eidola MCP connected, then Awaken again.';
    } else {
      try {
        const priorConfig = await readWorkspaceConfig(registry.workspace_root);
        await linkEngramToWorkspace({
          workspaceRoot: registry.workspace_root,
          engramId,
          engramsDir: this.engramsDir,
          engramDirectory: directory,
          vesselsDir,
          previousEngramId: priorConfig?.active_engram_id,
          syncPersonality: enablePersonality,
        });
        cursorLinked = true;

        const previousEngramId = await findActiveSoulImportEngramId(registry.workspace_root);
        if (previousEngramId && (previousEngramId !== engramId || !enablePersonality)) {
          await removeSoulFromWorkspace(registry.workspace_root, previousEngramId);
        }

        if (enablePersonality) {
          await copySoulToWorkspace(registry.workspace_root, engramId, loadedSoul);
          await ensureSoulImport(registry.workspace_root, engramId);
          claudeMdLinked = true;
        } else if (previousEngramId) {
          await removeSoulImport(registry.workspace_root);
        }

        await writeMcpAwakenSignal({
          engram_id: engramId,
          workspace_root: registry.workspace_root,
          engrams_dir: this.engramsDir,
          engram_directory: directory,
          vessels_dir: vesselsDir,
        });
        mcpSynced = true;
      } catch (error) {
        cursorLinkError = error instanceof Error ? error.message : String(error);
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        engram_id: engramId,
        cursor_linked: cursorLinked,
        claude_md_linked: claudeMdLinked,
        mcp_synced: mcpSynced,
        ...(cursorLinkError ? { cursor_link_error: cursorLinkError } : {}),
      }),
    );

    this.broadcastSse('awakened', { engram_id: engramId });
  }

  /**
   * Task 12 — lets a Shrine window opened *after* an Engram was already
   * awakened from an editor show the correct active state on first load,
   * not just on the next SSE event.
   */
  private async handleGetActive(res: ServerResponse): Promise<void> {
    const engramId = await this.resolveActive();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, engram_id: engramId }));
  }

  /** Mirrors `handleAwaken` — inverse cleanup, then broadcasts `asleep` over SSE. */
  private async handleSleep(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: { engram_id?: string };
    try {
      body = JSON.parse(await readRequestBody(req)) as { engram_id?: string };
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body.' }));
      return;
    }

    const requestedEngramId = body.engram_id?.trim();
    const activeEngramId = requestedEngramId || (await this.resolveActive());
    if (!activeEngramId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'No active Engram to sleep.' }));
      return;
    }

    let cursorDeactivated = false;
    let claudeMdRemoved = false;

    const registry = await readWorkspaceRegistry();
    if (registry?.workspace_root) {
      const deactivated = await deactivateEngramInWorkspace(registry.workspace_root, activeEngramId);
      cursorDeactivated = deactivated.mdcDeactivated || deactivated.configCleared;

      const removedImport = await removeSoulImport(registry.workspace_root);
      const removedSoul = await removeSoulFromWorkspace(registry.workspace_root, activeEngramId);
      claudeMdRemoved = removedImport.removed || removedSoul.removed;
    }

    this.session?.clearActive();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        engram_id: activeEngramId,
        cursor_deactivated: cursorDeactivated,
        claude_md_removed: claudeMdRemoved,
      }),
    );

    this.broadcastSse('asleep', { engram_id: activeEngramId });
  }

  private handleSse(res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('\n');

    const id = this.nextClientId++;
    this.sseClients.set(id, { id, res });

    reqOnClose(res, () => {
      this.sseClients.delete(id);
    });
  }

  private async serveVessel(relativePath: string, res: ServerResponse): Promise<void> {
    const safe = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const roots = [
      this.vesselsDir,
      ...new Set(Array.from(this.engramCatalog.values()).map((entry) => entry.vesselsDir)),
    ];

    for (const root of roots) {
      const filePath = join(root, safe);
      if (!isPathWithinRoot(filePath, root)) {
        continue;
      }

      try {
        await access(filePath);
        await this.serveFile(filePath, res);
        return;
      } catch {
        // try next vessels root
      }
    }

    res.writeHead(404);
    res.end('Not found');
  }

  private async serveFile(filePath: string, res: ServerResponse): Promise<void> {
    try {
      await access(filePath);
      const fileStat = await stat(filePath);
      if (fileStat.isDirectory()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const ext = extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
      createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  }
}

function reqOnClose(res: ServerResponse, onClose: () => void): void {
  res.on('close', onClose);
}

function isPathWithinRoot(filePath: string, root: string): boolean {
  const resolvedFile = resolve(filePath);
  const resolvedRoot = resolve(root);
  const prefix = resolvedRoot.endsWith(sep) ? resolvedRoot : `${resolvedRoot}${sep}`;

  if (process.platform === 'win32') {
    const lowerFile = resolvedFile.toLowerCase();
    const lowerRoot = resolvedRoot.toLowerCase();
    const lowerPrefix = prefix.toLowerCase();
    return lowerFile === lowerRoot || lowerFile.startsWith(lowerPrefix);
  }

  return resolvedFile === resolvedRoot || resolvedFile.startsWith(prefix);
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function startShrineHttpServer(options?: ShrineHttpServerOptions): Promise<ShrineHttpServer> {
  const server = new ShrineHttpServer(options);
  await server.start();
  return server;
}

export function openInBrowser(url: string): void {
  const platform = process.platform;
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '""', url] : [url];

  try {
    spawn(command, args, { detached: true, stdio: 'ignore', shell: false }).unref();
  } catch (error) {
    console.warn('[eidola-shrine:http] could not open browser automatically:', error);
  }
}

async function main(): Promise<void> {
  const config = resolveEidolaRuntimeConfig();
  const isDev = Boolean(process.env.EIDOLA_SHRINE_DEV?.trim());

  const server = await startShrineHttpServer();

  await writeShrineLock(config.workspaceRoot, {
    pid: process.pid,
    surface: isDev ? 'dev' : 'cli',
    started_at: new Date().toISOString(),
  });

  const shutdown = async () => {
    server.stop();
    await removeShrineLock(config.workspaceRoot);
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error) => {
    console.error('[eidola-shrine:http] failed to start', error);
    process.exit(1);
  });
}
