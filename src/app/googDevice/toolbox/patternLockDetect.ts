/**
 * Pattern-lock / PIN entry detection on the remote device, ported from
 * Screen-Remote's approach:
 *
 * 1. Ask the server for a uiautomator dump (`GET /api/devices/ui-hierarchy`).
 * 2. Find the node whose className/resourceId mentions LockPattern/PatternView
 *    and read its `bounds="[l,t][r,b]"` — that rectangle is the on-screen 3x3
 *    grid. A PIN entry (EditText) is detected the same way.
 * 3. Poll until the grid appears (the lock screen takes a moment after
 *    waking/swiping), then return the area. Fall back to a centered default
 *    on timeout, exactly like Screen-Remote.
 *
 * The lock screen is a black surface to the scrcpy video stream on unrooted
 * devices, so this dump-based detection is what makes "blind" unlock work.
 */

import type { PatternArea } from './unlockStore';

const PATTERN_CLASS_RE = /LockPattern|PatternView/i;
// Numeric PIN fields vary by vendor: the classic EditText (resource-id
// passwordEntry) plus MIUI/Keyguard's dedicated PIN views.
const PIN_CLASS_RE = /EditText|Password|PinKeyguard|pinEntry/i;

export interface UiNode {
    className: string;
    resourceId: string;
    bounds: PatternArea | null;
}

/** Parse a uiautomator XML dump into flat nodes with their bounds. */
export function parseUiHierarchy(xml: string): UiNode[] {
    const nodes: UiNode[] = [];
    // uiautomator XML is well-formed; scan node tags without a full DOM parser.
    const tagRe = /<node[^>]*>/g;
    const attrRe = /([a-zA-Z-]+)="([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(xml)) !== null) {
        const tag = m[0];
        const node: UiNode = { className: '', resourceId: '', bounds: null };
        let a: RegExpExecArray | null;
        attrRe.lastIndex = 0;
        while ((a = attrRe.exec(tag)) !== null) {
            const key = a[1]!;
            const value = a[2]!;
            if (key === 'class') node.className = value;
            else if (key === 'resource-id') node.resourceId = value;
            else if (key === 'bounds') {
                // bounds="[l,t][r,b]"
                const mm = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(value);
                if (mm) {
                    const left = Number(mm[1]);
                    const top = Number(mm[2]);
                    const right = Number(mm[3]);
                    const bottom = Number(mm[4]);
                    if (right > left && bottom > top) {
                        node.bounds = { left, top, width: right - left, height: bottom - top };
                    }
                }
            }
        }
        nodes.push(node);
    }
    return nodes;
}

/** Find the pattern grid rectangle, or null. */
export function findPatternArea(xml: string): PatternArea | null {
    for (const node of parseUiHierarchy(xml)) {
        if (
            node.bounds &&
            (PATTERN_CLASS_RE.test(node.className) || PATTERN_CLASS_RE.test(node.resourceId))
        ) {
            return node.bounds;
        }
    }
    return null;
}

/** Whether a PIN/password text field is present. */
export function findPinInput(xml: string): boolean {
    return parseUiHierarchy(xml).some(
        (n) => n.bounds && (PIN_CLASS_RE.test(n.className) || PIN_CLASS_RE.test(n.resourceId)),
    );
}

/** Result of one UI-hierarchy probe: the XML, or the server-reported error. */
export interface UiHierarchyResult {
    xml: string | null;
    error: string | null;
}

/** Fetch one uiautomator dump. Errors (including non-XML bodies the server
 * rejects) come back in `error` so the UI can show why detection failed. */
export async function fetchUiHierarchy(udid: string): Promise<UiHierarchyResult> {
    try {
        const res = await fetch(`/api/devices/ui-hierarchy?udid=${encodeURIComponent(udid)}`);
        if (res.ok) {
            return { xml: await res.text(), error: null };
        }
        let detail = `HTTP ${res.status}`;
        try {
            const body = (await res.json()) as { error?: string; detail?: string };
            detail = body.detail ? `${body.error}: ${body.detail}` : (body.error ?? detail);
        } catch {
            // non-JSON error body
        }
        return { xml: null, error: detail };
    } catch (e) {
        return { xml: null, error: (e as Error).message };
    }
}

/** Screen-Remote's default fallback: a W/3 square centered, slightly above middle. */
export function defaultPatternArea(screenWidth: number, screenHeight: number): PatternArea {
    const size = screenWidth / 3;
    const left = (screenWidth - size) / 2;
    const top = (screenHeight - size) / 2 - screenHeight / 8;
    return { left, top, width: size, height: size };
}

/**
 * Poll the server's UI hierarchy until the pattern grid (or PIN field) shows
 * up, then resolve. Falls back to `defaultPatternArea` on timeout.
 */
export async function pollForPatternArea(
    udid: string,
    screenWidth: number,
    screenHeight: number,
    options: {
        timeoutMs?: number;
        pollMs?: number;
        onDetected?: (area: PatternArea) => void;
        /** Called every few polling rounds so the caller can re-wake the screen. */
        onKeepAwake?: () => void;
        /** Called when the server reports a dump failure, for diagnostics. */
        onError?: (error: string) => void;
    } = {},
): Promise<PatternArea> {
    const timeoutMs = options.timeoutMs ?? 30000;
    const pollMs = options.pollMs ?? 300;
    const start = Date.now();
    let rounds = 0;
    while (Date.now() - start < timeoutMs) {
        const { xml, error } = await fetchUiHierarchy(udid);
        if (xml) {
            const area = findPatternArea(xml);
            if (area) {
                options.onDetected?.(area);
                return area;
            }
        } else if (error && rounds === 0) {
            options.onError?.(error);
        }
        await new Promise((r) => setTimeout(r, pollMs));
        rounds++;
        // Roughly every ~3s, let the caller nudge the screen back on.
        if (options.onKeepAwake && rounds % 10 === 0) {
            try {
                options.onKeepAwake();
            } catch {
                // best effort
            }
        }
    }
    return defaultPatternArea(screenWidth, screenHeight);
}

/**
 * What the lock screen is currently asking for: the 3x3 pattern grid, a
 * numeric PIN field, or neither. Android demotes a pattern lock to a numeric
 * PIN prompt after too many failed attempts, so "no pattern grid" often means
 * "a PIN field is on screen now" — the unlock flow must handle both.
 */
export type UnlockTarget =
    | { kind: 'pattern'; area: PatternArea }
    | { kind: 'pin' }
    | { kind: 'none'; area: PatternArea };

/**
 * Poll until either the pattern grid or a PIN field is found. `none` (with the
 * default fallback area) is returned only on timeout, for a last-ditch blind
 * pattern swipe exactly like Screen-Remote.
 */
export async function pollForUnlockTarget(
    udid: string,
    screenWidth: number,
    screenHeight: number,
    options: {
        timeoutMs?: number;
        pollMs?: number;
        onDetected?: (area: PatternArea) => void;
        onKeepAwake?: () => void;
        onError?: (error: string) => void;
    } = {},
): Promise<UnlockTarget> {
    const timeoutMs = options.timeoutMs ?? 30000;
    const pollMs = options.pollMs ?? 300;
    const start = Date.now();
    let rounds = 0;
    while (Date.now() - start < timeoutMs) {
        const { xml, error } = await fetchUiHierarchy(udid);
        if (xml) {
            const area = findPatternArea(xml);
            if (area) {
                options.onDetected?.(area);
                return { kind: 'pattern', area };
            }
            if (findPinInput(xml)) {
                return { kind: 'pin' };
            }
        } else if (error && rounds === 0) {
            options.onError?.(error);
        }
        await new Promise((r) => setTimeout(r, pollMs));
        rounds++;
        // Roughly every ~3s, let the caller nudge the screen back on.
        if (options.onKeepAwake && rounds % 10 === 0) {
            try {
                options.onKeepAwake();
            } catch {
                // best effort
            }
        }
    }
    return { kind: 'none', area: defaultPatternArea(screenWidth, screenHeight) };
}

/**
 * Map a 0-8 pattern index to a pixel coordinate inside the grid, exactly like
 * Screen-Remote: each of the 3x3 cells is a third of the area.
 */
export function patternPointCoordinates(
    area: PatternArea,
    index: number,
    gridSize: number = 3,
): { x: number; y: number } {
    const row = Math.floor(index / gridSize);
    const col = index % gridSize;
    const x = Math.round(area.left + (col + 0.5) * (area.width / gridSize));
    const y = Math.round(area.top + (row + 0.5) * (area.height / gridSize));
    return { x, y };
}
