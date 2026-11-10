import { describe, expect, it } from 'vitest';
import { githubLatestReleaseUrl, isProxyUrl, proxifyGithubUrl } from '../api/ContainerUpdateApi';

/**
 * The Updates tab has one field for two very different things: an acceleration
 * prefix that is prepended to the GitHub URL, and an HTTP proxy that the request
 * is routed through. Getting that classification wrong sends a look-up to
 * `<http://127.0.0.1:7890>https://api.github.com/...`, which fails in a way the
 * tab can only report as "unexpected server response" — the very symptom this
 * feature exists to remove.
 */
describe('GitHub access proxy classification', () => {
    it('treats scheme://host:port as a routing proxy', () => {
        expect(isProxyUrl('http://127.0.0.1:7890')).toBe(true);
        expect(isProxyUrl('https://192.168.1.2:8443')).toBe(true);
        expect(isProxyUrl('  http://proxy.lan:1080  ')).toBe(true);
    });

    it('treats bare hosts and paths as an acceleration prefix', () => {
        expect(isProxyUrl('https://gh-proxy.com/')).toBe(false);
        expect(isProxyUrl('https://gh-proxy.com')).toBe(false);
        expect(isProxyUrl('https://ghproxy.net/')).toBe(false);
        expect(isProxyUrl('gh-proxy.com/')).toBe(false);
    });

    it('leaves the URL untouched for direct access and for a routing proxy', () => {
        const url = 'https://api.github.com/repos/RideWindOne/ws-scrcpy-web/releases/latest';
        expect(proxifyGithubUrl(url, null)).toBe(url);
        expect(proxifyGithubUrl(url, '')).toBe(url);
        expect(proxifyGithubUrl(url, 'http://127.0.0.1:7890')).toBe(url);
    });

    it('prepends the prefix, adding the missing slash', () => {
        const url = 'https://api.github.com/repos/RideWindOne/ws-scrcpy-web/releases/latest';
        expect(proxifyGithubUrl(url, 'https://gh-proxy.com/')).toBe(`https://gh-proxy.com/${url}`);
        expect(proxifyGithubUrl(url, 'https://gh-proxy.com')).toBe(`https://gh-proxy.com/${url}`);
    });

    it('does not double-prefix an already mirrored URL', () => {
        const url = 'https://api.github.com/repos/RideWindOne/ws-scrcpy-web/releases/latest';
        const mirrored = `https://gh-proxy.com/${url}`;
        expect(proxifyGithubUrl(mirrored, 'https://gh-proxy.com/')).toBe(mirrored);
    });

    it('mirrors release asset downloads too, not just the API', () => {
        const asset =
            'https://github.com/RideWindOne/ws-scrcpy-web/releases/download/v0.5.14/dist-update-20261111-7008e5c2.tar.gz';
        expect(proxifyGithubUrl(asset, 'https://gh-proxy.com/')).toBe(`https://gh-proxy.com/${asset}`);
    });
});

/**
 * `owner/repo` is two path segments. Encoding the whole string turns the slash
 * into %2F and GitHub answers 404 — which the tab cannot tell apart from a
 * blocked network, so every update check failed on every route.
 */
describe('GitHub release URL', () => {
    it('keeps the slash between owner and repo', () => {
        expect(githubLatestReleaseUrl('RideWindOne/ws-scrcpy-web')).toBe(
            'https://api.github.com/repos/RideWindOne/ws-scrcpy-web/releases/latest',
        );
    });

    it('never emits an encoded slash', () => {
        expect(githubLatestReleaseUrl('RideWindOne/ws-scrcpy-web')).not.toContain('%2F');
        expect(githubLatestReleaseUrl('RideWindOne/ws-scrcpy-web')).not.toContain('%2f');
    });

    it('still escapes characters inside each half', () => {
        expect(githubLatestReleaseUrl('owner name/repo name')).toBe(
            'https://api.github.com/repos/owner%20name/repo%20name/releases/latest',
        );
    });
});
