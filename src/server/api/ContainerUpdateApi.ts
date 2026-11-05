import type { IncomingMessage, ServerResponse } from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { requireOperator } from '../auth/requireOperator';
import { getAppVersion } from '../appVersion';
import { Logger } from '../Logger';
import { inContainer } from './containerGuard';
import { readJsonBody } from './utils';
import { resolveDataRoot } from '../dataRoot';
import type {
    ContainerGithubRelease,
    ContainerUpdateActionResponse,
    ContainerUpdateErrorResponse,
    ContainerUpdateStatusResponse,
    ContainerUpdateUploadRequest,
} from '../../common/ContainerUpdateEvents';

const execFileP = promisify(execFile);
const log = Logger.for('ContainerUpdateApi');

/** A dist package is a few MB; anything near this is not a dist package. */
const MAX_PACKAGE_BYTES = 512 * 1024 * 1024;
/** Keep GitHub responses bounded. */
const MAX_GH_BODY_BYTES = 4 * 1024 * 1024;
/** Asset names that qualify as a dist package: dist-*.tar.gz / dist_*.tar.gz. */
const DIST_ASSET_RE = /^dist[-_].*\.tar\.gz$/i;

/** Wait between the response finishing and exiting, so reverse proxies (fnOS
 *  remote access, ugdocker-style tunnels) get time to forward the body before
 *  the process dies and the upstream connection drops. */
const EXIT_DELAY_MS = 1000;

// ──────────────────────────────────────────────────────────────────────────
// Repo persistence (<DATA_ROOT>/container-update-repo.json, env overrides).

function repoFilePath(): string {
    const root = resolveDataRoot(process.env) ?? os.tmpdir();
    return path.join(root, 'container-update-repo.json');
}

export function readUpdateRepo(): string | null {
    const fromEnv = process.env['WS_SCRCPY_UPDATE_REPO'];
    if (fromEnv && fromEnv.length > 0) return fromEnv;
    try {
        const raw = fs.readFileSync(repoFilePath(), 'utf8');
        const parsed = JSON.parse(raw) as { repo?: unknown };
        if (typeof parsed.repo === 'string' && parsed.repo.length > 0) return parsed.repo;
    } catch {
        // Not configured yet — that is a normal state.
    }
    // Default to this project's own fork so a fresh container checks the
    // right repo out of the box.
    return 'RideWindOne/ws-scrcpy-web';
}

function writeUpdateRepo(repo: string): void {
    const file = repoFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ repo }, null, 2));
    fs.renameSync(tmp, file);
}

// ──────────────────────────────────────────────────────────────────────────
// GitHub release look-up.

/** Fetch releases/latest for `owner/repo`. Pure-ish; exported for tests. */
export async function fetchLatestGithubRelease(repo: string): Promise<ContainerGithubRelease> {
    const url = `https://api.github.com/repos/${encodeURIComponent(repo)}/releases/latest`;
    const resp = await fetch(url, {
        headers: {
            'User-Agent': 'ws-scrcpy-web',
            Accept: 'application/vnd.github+json',
        },
    });
    if (!resp.ok) {
        throw new Error(`GitHub API ${resp.status} for ${repo}`);
    }
    const body = await resp.text();
    if (body.length > MAX_GH_BODY_BYTES) {
        throw new Error('GitHub response too large');
    }
    const data = JSON.parse(body) as {
        tag_name?: unknown;
        published_at?: unknown;
        assets?: Array<{ name?: unknown; size?: unknown; browser_download_url?: unknown }>;
    };
    if (typeof data.tag_name !== 'string') {
        throw new Error('GitHub release has no tag');
    }
    const assets: ContainerGithubRelease['assets'] = (data.assets ?? [])
        .filter(
            (a) =>
                typeof a.name === 'string' &&
                typeof a.size === 'number' &&
                typeof a.browser_download_url === 'string',
        )
        .map((a) => ({
            name: a.name as string,
            size: a.size as number,
            url: a.browser_download_url as string,
        }));
    return {
        tag: data.tag_name,
        publishedAt: typeof data.published_at === 'string' ? data.published_at : '',
        assets,
    };
}

/** The release's dist asset, if it has one. */
export function pickDistAsset(release: ContainerGithubRelease): (typeof release.assets)[number] | null {
    const exact = release.assets.find((a) => DIST_ASSET_RE.test(a.name));
    if (exact) return exact;
    return release.assets.find((a) => a.name.toLowerCase().endsWith('.tar.gz')) ?? null;
}

/** 'v0.6.0' -> '0.6.0'. */
function normalizeTag(tag: string): string {
    return tag.replace(/^v/i, '');
}

/** Numeric dot-segment compare. -1/0/1; malformed segments compare as 0. */
export function compareVersions(a: string, b: string): number {
    const pa = normalizeTag(a).split('.').map((s) => parseInt(s, 10) || 0);
    const pb = normalizeTag(b).split('.').map((s) => parseInt(s, 10) || 0);
    const n = Math.max(pa.length, pb.length);
    for (let i = 0; i < n; i++) {
        const da = pa[i] ?? 0;
        const db = pb[i] ?? 0;
        if (da !== db) return da < db ? -1 : 1;
    }
    return 0;
}

// ──────────────────────────────────────────────────────────────────────────
// Package staging: a validated dist tree in <DATA_ROOT>/pending-update.

interface StageResult {
    ok: true;
    distDir: string;
    pendingDir: string;
}

/** Remove a path recursively without throwing. */
function rmrf(p: string): void {
    try {
        fs.rmSync(p, { recursive: true, force: true });
    } catch {
        // Best-effort cleanup only.
    }
}

/**
 * Validate a .tar.gz, extract it, and move its dist/ tree to
 * <DATA_ROOT>/pending-update/dist with a `ready` marker. Exported for tests,
 * where `appDataRoot`/`appDist` pins an arbitrary temp tree.
 */
export async function stageDistPackage(
    tarPath: string,
    appDataRoot: string = resolveDataRoot(process.env) ?? os.tmpdir(),
): Promise<StageResult | { ok: false; error: string }> {
    const stat = await fs.promises.stat(tarPath).catch(() => null);
    if (!stat || !stat.isFile()) return { ok: false, error: 'uploaded package not found' };
    if (stat.size <= 0) return { ok: false, error: 'uploaded package is empty' };
    if (stat.size > MAX_PACKAGE_BYTES) return { ok: false, error: 'package too large' };

    // Entry pre-check: no absolute paths, no '..', no drive letters.
    let listing: string;
    try {
        const out = await execFileP('tar', ['-tzf', tarPath], { maxBuffer: 64 * 1024 * 1024 });
        listing = out.stdout;
    } catch {
        return { ok: false, error: 'not a readable tar.gz archive' };
    }
    const entries = listing.split('\n').filter((e) => e.length > 0);
    for (const e of entries) {
        if (e.startsWith('/') || /^[A-Za-z]:/.test(e) || e.split('/').includes('..')) {
            return { ok: false, error: 'archive contains unsafe paths' };
        }
    }

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-update-'));
    try {
        await execFileP('tar', ['-xzf', tarPath, '-C', tmpRoot]);
        const distDir = locateDistDir(tmpRoot);
        if (!distDir) {
            return { ok: false, error: 'package has no dist/ tree' };
        }
        if (!fs.existsSync(path.join(distDir, 'index.js'))) {
            return { ok: false, error: 'dist/ is missing index.js' };
        }
        if (!fs.existsSync(path.join(distDir, 'public', 'bundle.js'))) {
            return { ok: false, error: 'dist/ is missing public/bundle.js' };
        }

        const pending = path.join(appDataRoot, 'pending-update');
        rmrf(pending);
        fs.mkdirSync(pending, { recursive: true });
        const dest = path.join(pending, 'dist');
        try {
            fs.renameSync(distDir, dest);
        } catch (err) {
            // /tmp and the data volume often live on different filesystems;
            // rename(2) cannot cross devices (EXDEV). Copy recursively instead.
            if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
                fs.cpSync(distDir, dest, { recursive: true });
            } else {
                throw err;
            }
        }
        fs.writeFileSync(path.join(pending, 'ready'), new Date().toISOString());
        return { ok: true, distDir: path.join(pending, 'dist'), pendingDir: pending };
    } finally {
        rmrf(tmpRoot);
    }
}

/** dist/ at the archive root, or wrapped one directory deep (e.g. ws-scrcpy-web/dist/). */
function locateDistDir(root: string): string | null {
    const direct = path.join(root, 'dist');
    if (fs.existsSync(path.join(direct, 'index.js'))) return direct;
    let tops: string[] = [];
    try {
        tops = fs.readdirSync(root).filter((n) => fs.statSync(path.join(root, n)).isDirectory());
    } catch {
        return null;
    }
    if (tops.length === 1) {
        const top = tops[0];
        if (!top) return null;
        const nested = path.join(root, top, 'dist');
        if (fs.existsSync(path.join(nested, 'index.js'))) return nested;
    }
    return null;
}

// ──────────────────────────────────────────────────────────────────────────
// HTTP API.

/**
 * Container-only update surface.
 *
 *   GET    /api/container-update/status        -> status (200)
 *   PATCH  /api/container-update/repo          -> { repo: "owner/repo" | "" } (200)
 *   POST   /api/container-update/github-check  -> status with available release (200)
 *   POST   /api/container-update/github-apply  -> { ok, mode:'restart' } then exit(0)
 *   POST   /api/container-update/upload        -> { ok, mode:'restart' } then exit(0)
 *
 * Non-container deployments get 409: the desktop updater owns that path.
 * The staged update only ever replaces /app/dist — never seed/, dependencies
 * or start.sh — and is applied by the image entrypoint on the next boot.
 */
export class ContainerUpdateApi {
    constructor(
        private readonly schedule: (cb: () => void, ms: number) => unknown = setTimeout,
        private readonly exit: (code: number) => void = (code: number) => process.exit(code),
    ) {}

    public async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
        const url = req.url || '';
        if (!url.startsWith('/api/container-update/')) return false;

        res.setHeader('Content-Type', 'application/json');

        if (!inContainer()) {
            const body: ContainerUpdateErrorResponse = {
                ok: false,
                error: 'container update API is only available in a container',
                reason: 'unsupported',
            };
            res.writeHead(409);
            res.end(JSON.stringify(body));
            return true;
        }

        if (!requireOperator(req, res)) return true;

        try {
            if (req.method === 'GET' && url === '/api/container-update/status') {
                res.writeHead(200);
                res.end(JSON.stringify(this.buildStatus()));
                return true;
            }
            if (req.method === 'PATCH' && url === '/api/container-update/repo') {
                return await this.handleRepo(req, res);
            }
            if (req.method === 'POST' && url === '/api/container-update/github-check') {
                return await this.handleGithubCheck(req, res);
            }
            if (req.method === 'POST' && url === '/api/container-update/github-apply') {
                return await this.handleGithubApply(req, res);
            }
            if (req.method === 'POST' && url === '/api/container-update/upload') {
                return await this.handleUpload(req, res);
            }
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
            return true;
        } catch (err) {
            log.error(`${req.method} ${req.url} threw: ${(err as Error)?.message ?? String(err)}`);
            res.writeHead(500);
            res.end(JSON.stringify({ error: (err as Error).message }));
            return true;
        }
    }

    private buildStatus(): ContainerUpdateStatusResponse {
        return {
            ok: true,
            currentVersion: getAppVersion(),
            container: true,
            repo: readUpdateRepo(),
        };
    }

    private async handleRepo(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
        const raw = await readJsonBody(req);
        const repo = typeof raw['repo'] === 'string' ? raw['repo'] : undefined;
        if (repo === undefined) {
            const body: ContainerUpdateErrorResponse = { ok: false, error: 'repo must be a string' };
            res.writeHead(400);
            res.end(JSON.stringify(body));
            return true;
        }
        const trimmed = repo.trim();
        if (trimmed.length === 0) {
            writeUpdateRepo('');
        } else if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed)) {
            const body: ContainerUpdateErrorResponse = {
                ok: false,
                error: 'repo must look like "owner/repo"',
            };
            res.writeHead(400);
            res.end(JSON.stringify(body));
            return true;
        } else {
            writeUpdateRepo(trimmed);
        }
        const body: ContainerUpdateActionResponse = { ok: true, status: this.buildStatus() };
        res.writeHead(200);
        res.end(JSON.stringify(body));
        return true;
    }

    private async handleGithubCheck(_req: IncomingMessage, res: ServerResponse): Promise<boolean> {
        const repo = readUpdateRepo();
        if (!repo) {
            const body: ContainerUpdateErrorResponse = {
                ok: false,
                error: 'no GitHub repo configured — set owner/repo first',
            };
            res.writeHead(400);
            res.end(JSON.stringify(body));
            return true;
        }
        let release: ContainerGithubRelease;
        try {
            release = await fetchLatestGithubRelease(repo);
        } catch (err) {
            const body: ContainerUpdateErrorResponse = { ok: false, error: (err as Error).message };
            res.writeHead(502);
            res.end(JSON.stringify(body));
            return true;
        }
        const status = this.buildStatus();
        status.available = release;
        status.lastCheckedAt = new Date().toISOString();
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, status } satisfies ContainerUpdateActionResponse));
        return true;
    }

    private async handleGithubApply(_req: IncomingMessage, res: ServerResponse): Promise<boolean> {
        const repo = readUpdateRepo();
        if (!repo) {
            const body: ContainerUpdateErrorResponse = {
                ok: false,
                error: 'no GitHub repo configured — set owner/repo first',
            };
            res.writeHead(400);
            res.end(JSON.stringify(body));
            return true;
        }
        let release: ContainerGithubRelease;
        try {
            release = await fetchLatestGithubRelease(repo);
        } catch (err) {
            const body: ContainerUpdateErrorResponse = { ok: false, error: (err as Error).message };
            res.writeHead(502);
            res.end(JSON.stringify(body));
            return true;
        }
        const asset = pickDistAsset(release);
        if (!asset) {
            const body: ContainerUpdateErrorResponse = {
                ok: false,
                error: `release ${release.tag} has no dist-*.tar.gz asset`,
            };
            res.writeHead(404);
            res.end(JSON.stringify(body));
            return true;
        }
        log.info(`downloading ${asset.name} from ${repo}`);
        const tarPath = path.join(os.tmpdir(), `ws-gh-${Date.now()}.tar.gz`);
        try {
            const resp = await fetch(asset.url, {
                headers: { 'User-Agent': 'ws-scrcpy-web', Accept: 'application/octet-stream' },
                redirect: 'follow',
            });
            if (!resp.ok || !resp.body) {
                throw new Error(`download failed: HTTP ${resp.status}`);
            }
            const out = fs.createWriteStream(tarPath);
            await pipeline(Readable.fromWeb(resp.body as never), out);
        } catch (err) {
            rmrf(tarPath);
            const body: ContainerUpdateErrorResponse = { ok: false, error: (err as Error).message };
            res.writeHead(502);
            res.end(JSON.stringify(body));
            return true;
        }
        await this.stageAndExit(tarPath, res);
        return true;
    }

    private async handleUpload(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
        // Two upload encodings, because the deployed frontend is cached
        // indefinitely (bundle.js keeps its name) and an old build may still
        // POST base64 JSON:
        //   - application/octet-stream: the tarball itself, sent raw. The body
        //     stays the package size; base64 would inflate a ~1 MB tarball to
        //     ~1.4 MB, which a reverse proxy with a ~1 MB request-body cap
        //     answers with "failed to forward" before the API ever runs.
        //   - application/json: legacy base64 path, kept for cached clients.
        const contentType = String(req.headers['content-type'] ?? '');
        const fileName = decodeURIComponent(String(req.headers['x-file-name'] ?? 'upload.tar.gz'));
        let tarPath: string | null = null;
        if (contentType.includes('application/json')) {
            const raw = await readJsonBody(req, MAX_PACKAGE_BYTES * 1.4 + 1024);
            const body = raw as Partial<ContainerUpdateUploadRequest>;
            if (typeof body.dataBase64 !== 'string' || body.dataBase64.length === 0) {
                const err: ContainerUpdateErrorResponse = { ok: false, error: 'no file data' };
                res.writeHead(400);
                res.end(JSON.stringify(err));
                return true;
            }
            if (body.dataBase64.length > MAX_PACKAGE_BYTES * 1.4 + 1024) {
                const err: ContainerUpdateErrorResponse = { ok: false, error: 'upload too large' };
                res.writeHead(400);
                res.end(JSON.stringify(err));
                return true;
            }
            tarPath = path.join(os.tmpdir(), `ws-up-${Date.now()}.tar.gz`);
            try {
                fs.writeFileSync(tarPath, Buffer.from(body.dataBase64, 'base64'));
            } catch (err) {
                rmrf(tarPath);
                const e: ContainerUpdateErrorResponse = { ok: false, error: (err as Error).message };
                res.writeHead(400);
                res.end(JSON.stringify(e));
                return true;
            }
        } else {
            // Raw binary body, capped at the same MAX_PACKAGE_BYTES.
            tarPath = path.join(os.tmpdir(), `ws-up-${Date.now()}.tar.gz`);
            const chunks: Buffer[] = [];
            let total = 0;
            try {
                for await (const chunk of req) {
                    total += chunk.length;
                    if (total > MAX_PACKAGE_BYTES) {
                        rmrf(tarPath);
                        const err: ContainerUpdateErrorResponse = { ok: false, error: 'upload too large' };
                        res.writeHead(413);
                        res.end(JSON.stringify(err));
                        return true;
                    }
                    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                }
                fs.writeFileSync(tarPath, Buffer.concat(chunks));
            } catch (err) {
                rmrf(tarPath);
                const e: ContainerUpdateErrorResponse = { ok: false, error: (err as Error).message };
                res.writeHead(400);
                res.end(JSON.stringify(e));
                return true;
            }
        }
        await this.stageAndExit(tarPath, res, fileName);
        return true;
    }

    private async stageAndExit(
        tarPath: string,
        res: ServerResponse,
        label: string = 'package',
    ): Promise<void> {
        let staged: Awaited<ReturnType<typeof stageDistPackage>>;
        try {
            staged = await stageDistPackage(tarPath);
        } catch (err) {
            staged = { ok: false, error: (err as Error).message };
        } finally {
            rmrf(tarPath);
        }
        if (!staged.ok) {
            const body: ContainerUpdateErrorResponse = { ok: false, error: staged.error };
            res.writeHead(400);
            res.end(JSON.stringify(body));
            return;
        }
        log.info(`staged ${label} to ${staged.pendingDir}; exiting for entrypoint swap`);
        const body: ContainerUpdateActionResponse = {
            ok: true,
            mode: 'restart',
            message: `staged ${label}; the container restarts to apply it`,
        };
        res.writeHead(200);
        res.end(JSON.stringify(body));
        // Exit only after the response has actually been flushed — not just
        // after res.end() was called. Otherwise an immediate process.exit(0)
        // can kill the connection before a reverse proxy forwards the body,
        // and the client sees a proxy "failed to forward" text instead.
        res.once('finish', () => {
            this.schedule(() => {
                log.info('exiting (process.exit 0) after staging container update');
                this.exit(0);
            }, EXIT_DELAY_MS);
        });
    }
}
