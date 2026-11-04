import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { compareVersions, fetchLatestGithubRelease, pickDistAsset, stageDistPackage } from '../ContainerUpdateApi';
import type { ContainerGithubRelease } from '../../../common/ContainerUpdateEvents';

const execFileP = promisify(execFile);

/** Make a real .tar.gz fixture with the given dist tree content. */
async function makeTar(dir: string, name: string, files: Record<string, string>): Promise<string> {
    for (const [rel, content] of Object.entries(files)) {
        const p = path.join(dir, rel);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, content);
    }
    const tar = path.join(os.tmpdir(), `${name}-${Date.now()}.tar.gz`);
    await execFileP('tar', ['-czf', tar, '-C', dir, '.']);
    return tar;
}

function tmpRoot(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'ws-cu-test-'));
}

describe('stageDistPackage', () => {
    it('stages a flat dist/ package and moves it into pending-update', async () => {
        const src = tmpRoot();
        const dataRoot = tmpRoot();
        try {
            const tar = await makeTar(src, 'flat', {
                'dist/index.js': 'server',
                'dist/public/bundle.js': 'client',
            });
            const result = await stageDistPackage(tar, dataRoot);
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(fs.existsSync(path.join(result.distDir, 'index.js'))).toBe(true);
                expect(fs.existsSync(path.join(result.distDir, 'public', 'bundle.js'))).toBe(true);
                expect(fs.existsSync(path.join(dataRoot, 'pending-update', 'ready'))).toBe(true);
            }
        } finally {
            fs.rmSync(src, { recursive: true, force: true });
            fs.rmSync(dataRoot, { recursive: true, force: true });
        }
    });

    it('accepts a single wrapper directory (ws-scrcpy-web/dist/)', async () => {
        const src = tmpRoot();
        const dataRoot = tmpRoot();
        try {
            const tar = await makeTar(src, 'wrapped', {
                'ws-scrcpy-web/dist/index.js': 'server',
                'ws-scrcpy-web/dist/public/bundle.js': 'client',
            });
            const result = await stageDistPackage(tar, dataRoot);
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(fs.existsSync(path.join(result.distDir, 'public', 'bundle.js'))).toBe(true);
            }
        } finally {
            fs.rmSync(src, { recursive: true, force: true });
            fs.rmSync(dataRoot, { recursive: true, force: true });
        }
    });

    it('rejects a package with no dist/ tree', async () => {
        const src = tmpRoot();
        const dataRoot = tmpRoot();
        try {
            const tar = await makeTar(src, 'nodist', {
                'other/index.js': 'x',
                'other/public/bundle.js': 'y',
            });
            const result = await stageDistPackage(tar, dataRoot);
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.error).toContain('dist');
        } finally {
            fs.rmSync(src, { recursive: true, force: true });
            fs.rmSync(dataRoot, { recursive: true, force: true });
        }
    });

    it('rejects a dist/ missing bundle.js', async () => {
        const src = tmpRoot();
        const dataRoot = tmpRoot();
        try {
            const tar = await makeTar(src, 'nobundle', {
                'dist/index.js': 'server',
            });
            const result = await stageDistPackage(tar, dataRoot);
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.error).toContain('bundle.js');
        } finally {
            fs.rmSync(src, { recursive: true, force: true });
            fs.rmSync(dataRoot, { recursive: true, force: true });
        }
    });

    it('rejects a package that is not a tar.gz', async () => {
        const dataRoot = tmpRoot();
        try {
            const junk = path.join(os.tmpdir(), `junk-${Date.now()}.tar.gz`);
            fs.writeFileSync(junk, 'this is not a tar');
            const result = await stageDistPackage(junk, dataRoot);
            expect(result.ok).toBe(false);
            fs.rmSync(junk, { force: true });
        } finally {
            fs.rmSync(dataRoot, { recursive: true, force: true });
        }
    });

    it('rejects an empty package', async () => {
        const dataRoot = tmpRoot();
        try {
            const empty = path.join(os.tmpdir(), `empty-${Date.now()}.tar.gz`);
            fs.writeFileSync(empty, '');
            const result = await stageDistPackage(empty, dataRoot);
            expect(result.ok).toBe(false);
            fs.rmSync(empty, { force: true });
        } finally {
            fs.rmSync(dataRoot, { recursive: true, force: true });
        }
    });
});

describe('compareVersions', () => {
    it('compares numeric dot segments', () => {
        expect(compareVersions('v0.6.0', 'v0.5.11')).toBe(1);
        expect(compareVersions('v0.5.11', 'v0.6.0')).toBe(-1);
        expect(compareVersions('v0.5.11', 'v0.5.11')).toBe(0);
        expect(compareVersions('0.6.0', 'v0.6.0')).toBe(0);
        expect(compareVersions('v1.0.0', 'v0.9.9')).toBe(1);
    });
});

describe('pickDistAsset', () => {
    const release: ContainerGithubRelease = {
        tag: 'v0.6.0',
        publishedAt: '2026-11-01T00:00:00Z',
        assets: [
            { name: 'source.tar.gz', size: 10, url: 'https://example.com/source.tar.gz' },
            { name: 'dist-v0.6.0.tar.gz', size: 1024, url: 'https://example.com/dist.tar.gz' },
        ],
    };

    it('prefers dist-*.tar.gz over other archives', () => {
        expect(pickDistAsset(release)?.name).toBe('dist-v0.6.0.tar.gz');
    });

    it('falls back to any tar.gz', () => {
        const only = { ...release, assets: [{ name: 'ws-scrcpy-web.tar.gz', size: 1, url: 'u' }] };
        expect(pickDistAsset(only)?.name).toBe('ws-scrcpy-web.tar.gz');
    });

    it('returns null when nothing is a tar.gz', () => {
        const none = { ...release, assets: [{ name: 'notes.txt', size: 1, url: 'u' }] };
        expect(pickDistAsset(none)).toBeNull();
    });
});

describe('fetchLatestGithubRelease', () => {
    it('fails loudly on a 404 repo', async () => {
        await expect(fetchLatestGithubRelease('this-repo-does-not-exist-xyz/also-not')).rejects.toThrow();
    });
});
