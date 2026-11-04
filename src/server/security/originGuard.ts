import { isIP } from 'node:net';

export interface OriginCheckResult {
    allowed: boolean;
    reason?: string;
}

const SAFE_METHODS = new Set(['GET', 'HEAD']);

/**
 * Whether an HTTP request must pass the Origin/Host check. We gate the entire
 * API surface (including `GET /api/*`, to stop DNS-rebinding data exfiltration)
 * and every state-changing method on any path. Safe-method requests for static
 * assets are left ungated so the page can bootstrap (a cross-origin page that
 * loads our HTML only gets an opaque response it cannot read).
 */
export function requiresOriginCheck(method: string | undefined, pathname: string): boolean {
    if (pathname === '/api' || pathname.startsWith('/api/')) {
        return true;
    }
    return !method || !SAFE_METHODS.has(method.toUpperCase());
}

/**
 * Parse the hostname out of a Host header value (strips the port and any IPv6
 * brackets). Returns null if the value cannot be parsed.
 *
 * Exported so a redirect target (HttpServer.ts's 'redirect' exposure mode)
 * parses a Host header the same way this file's own allowlist check does --
 * two independent Host parsers is how a caller-controlled Location header
 * that passes "looks like a hostname" but fails "is a host this app would
 * actually serve" gets built in the first place.
 */
export function hostnameOf(host: string): string | null {
    try {
        const hostname = new URL(`http://${host}`).hostname.toLowerCase();
        // WHATWG URL returns IPv6 hostnames bracketed (e.g. "[::1]"); strip the
        // brackets so isIP() can recognise the literal.
        if (hostname.startsWith('[') && hostname.endsWith(']')) {
            return hostname.slice(1, -1);
        }
        return hostname;
    } catch {
        return null;
    }
}

// Additional Host hostnames accepted beyond localhost / IP literals, populated
// once at server boot from config (`allowedHosts`). Empty by default so the
// localhost+IP-only DNS-rebinding defense is unchanged unless an operator opts
// in (e.g. to serve the app behind a reverse proxy on a domain name).
//
// Wildcard support (fork addition): an entry of the form `*.example.com`
// matches ANY subdomain of example.com — one or more labels, e.g.
// ws.example.com, a.b.example.com — but NOT the bare apex `example.com` itself
// (a trailing-dot suffix match, so `evilexample.com` is not caught either). A
// bare `*` entry matches every domain Host: that is an explicit opt-out of the
// DNS-rebinding defense and must only be used when the deployment genuinely
// cannot know its Host in advance (e.g. a tunnel that re-issues the domain).
let configuredAllowedHosts: ReadonlySet<string> = new Set();
let configuredWildcardSuffixes: readonly string[] = [];
let configuredMatchAllHosts = false;

/**
 * Register extra Host hostnames that isHostAllowed() accepts on top of
 * localhost / IP literals — the opt-in escape-hatch for reverse-proxy / domain
 * deployments. Called once during startup from `Config.allowedHosts`. Entries
 * are trimmed, lowercased, and de-duplicated; an empty array restores the
 * default localhost+IP-only policy.
 *
 * Wildcard entries start with `*.` (suffix match, see module docs above); a
 * bare `*` enables match-all. Everything else is an exact hostname.
 */
export function setAllowedHosts(hosts: readonly string[]): void {
    const exact: string[] = [];
    const suffixes: string[] = [];
    let matchAll = false;
    for (const raw of hosts) {
        const host = raw.trim().toLowerCase();
        if (host.length === 0) {
            continue;
        }
        if (host === '*') {
            matchAll = true;
        } else if (host.startsWith('*.')) {
            // Keep the leading dot so the suffix match is label-boundary-safe:
            // ".example.com" matches "ws.example.com" but not "example.com"
            // or "evilexample.com". "*." alone (empty suffix) is skipped.
            const suffix = host.slice(1);
            if (suffix.length > 1) {
                suffixes.push(suffix);
            }
        } else {
            exact.push(host);
        }
    }
    configuredAllowedHosts = new Set(exact);
    configuredWildcardSuffixes = suffixes;
    configuredMatchAllHosts = matchAll;
}

/**
 * A Host is allowed if its hostname is `localhost`, an IP literal, or one of the
 * operator-configured `allowedHosts` (see setAllowedHosts) — exact entries or,
 * in this fork, `*.suffix` wildcards / a bare `*` match-all.
 *
 * A DNS-rebinding attack requires a *domain name* (so the attacker can later
 * point it at a loopback/LAN address). Rejecting any Host that is neither
 * `localhost` nor a raw IP blocks rebinding without having to enumerate the
 * machine's own addresses, and still allows legitimate access by IP over the
 * LAN (e.g. http://192.168.1.5:8000). A domain deployment must explicitly opt
 * in via `allowedHosts` rather than the default accepting any domain. A
 * wildcard widens that opt-in to a whole suffix; a bare `*` removes the
 * defense entirely for that process, so it should be paired with authentication.
 */
export function isHostAllowed(host: string | undefined): boolean {
    if (!host) {
        return false;
    }
    const hostname = hostnameOf(host);
    if (!hostname) {
        return false;
    }
    if (hostname === 'localhost' || isIP(hostname) !== 0) {
        return true;
    }
    if (configuredMatchAllHosts) {
        return true;
    }
    if (configuredAllowedHosts.has(hostname)) {
        return true;
    }
    for (const suffix of configuredWildcardSuffixes) {
        if (hostname.endsWith(suffix)) {
            return true;
        }
    }
    return false;
}

/**
 * Decide whether an incoming HTTP/WS request may be served. Defends the
 * otherwise-unauthenticated API/WebSocket surface against cross-site (CSRF)
 * and DNS-rebinding attacks:
 *
 *   - Host must be `localhost` or an IP literal (DNS-rebinding defense).
 *   - If an Origin header is present it must match the Host's origin (CSRF
 *     defense). A *missing* Origin is allowed at this layer — non-browser
 *     clients and same-origin GET/HEAD requests omit it; the per-instance
 *     token closes that remaining gap for non-browser callers.
 */
export function isRequestAllowed(origin: string | undefined, host: string | undefined): OriginCheckResult {
    if (!isHostAllowed(host)) {
        return { allowed: false, reason: 'host not allowed (possible DNS rebinding)' };
    }
    if (origin) {
        const normalizedOrigin = origin.toLowerCase();
        const expectedHttp = `http://${host}`.toLowerCase();
        const expectedHttps = `https://${host}`.toLowerCase();
        if (normalizedOrigin !== expectedHttp && normalizedOrigin !== expectedHttps) {
            return { allowed: false, reason: 'cross-origin request rejected' };
        }
    }
    return { allowed: true };
}
