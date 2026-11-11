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

/**
 * Device display size in the dump's coordinate space. uiautomator reports
 * bounds in device pixels, while scrcpy's touch events are expressed in the
 * video-frame coordinate space — those differ whenever max_size downscales
 * the stream (e.g. 1080x2400 device streamed as 864x1920). The largest node
 * bounds (the root window) gives us the device side.
 */
export function detectDisplaySize(xml: string): { width: number; height: number } | null {
    let width = 0;
    let height = 0;
    for (const node of parseUiHierarchy(xml)) {
        const b = node.bounds;
        if (!b) continue;
        // Root/status-bar/nav-bar style nodes start at the screen origin and,
        // taken together, span the whole display. A widget floating in the
        // middle (left/top > 0) tells us nothing about the display size.
        if (b.left <= 4 && b.top <= 4) {
            if (b.left + b.width > width) width = b.left + b.width;
            if (b.top + b.height > height) height = b.top + b.height;
        }
    }
    return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * Translate a dump (device-pixel) rectangle into the video-frame coordinate
 * space the touch injector expects. Without a known display size the rectangle
 * is used as-is (video and device sizes usually match unless max_size is set).
 */
export function scaleAreaToVideo(
    area: PatternArea,
    display: { width: number; height: number } | null,
    videoWidth: number,
    videoHeight: number,
): PatternArea {
    if (!display || display.width <= 0 || display.height <= 0) return area;
    if (videoWidth <= 0 || videoHeight <= 0) return area;
    if (display.width === videoWidth && display.height === videoHeight) return area;
    const sx = videoWidth / display.width;
    const sy = videoHeight / display.height;
    return {
        left: Math.round(area.left * sx),
        top: Math.round(area.top * sy),
        width: Math.round(area.width * sx),
        height: Math.round(area.height * sy),
    };
}

/**
 * Find the pattern grid rectangle, or null.
 *
 * Several nodes can carry "LockPattern"/"PatternView" in their class or id —
 * a wrapper container at the top of the tree and the real 3x3 grid inside it.
 * Containers are usually not square and may span most of the screen, so the
 * pick is scored: a `LockPatternView` class beats a matching resource id, and
 * a square-ish, non-fullscreen rectangle beats a wide/tall one. Choosing the
 * wrapper would shift every injected dot away from the drawn pattern.
 */
export function findPatternArea(xml: string): PatternArea | null {
    const display = detectDisplaySize(xml);
    const screenArea = display ? display.width * display.height : 0;
    let best: { area: PatternArea; score: number } | null = null;
    for (const node of parseUiHierarchy(xml)) {
        const b = node.bounds;
        if (!b) continue;
        const byClass = PATTERN_CLASS_RE.test(node.className);
        const byId = PATTERN_CLASS_RE.test(node.resourceId);
        if (!byClass && !byId) continue;
        // A real grid is roughly square; a parent container is not.
        const aspect = b.width / b.height;
        if (aspect < 0.75 || aspect > 1.33) continue;
        // Skip a rectangle that covers most of the screen (a dialog/window root).
        if (screenArea > 0 && b.width * b.height > screenArea * 0.7) continue;
        const score = (byClass ? 10 : 0) + (1 - Math.abs(1 - aspect));
        if (!best || score > best.score) best = { area: b, score };
    }
    return best ? best.area : null;
}

/**
 * The PIN/password field rectangle, or null. Prefer a real EditText (the field
 * the text must land in); fall back to vendor PIN views. The rectangle is what
 * lets us focus the field before injecting text — typing into a lock screen
 * with no focused input silently goes nowhere.
 */
export function findPinInputArea(xml: string): PatternArea | null {
    const candidates = parseUiHierarchy(xml).filter(
        (n) => n.bounds && (PIN_CLASS_RE.test(n.className) || PIN_CLASS_RE.test(n.resourceId)),
    );
    const editText = candidates.find((n) => /EditText/i.test(n.className));
    const chosen = editText ?? candidates[0];
    return chosen ? chosen.bounds : null;
}

/** Whether a PIN/password text field is present. */
export function findPinInput(xml: string): boolean {
    return findPinInputArea(xml) !== null;
}

/** Result of one UI-hierarchy probe: the XML, or the server-reported error. */
export interface UiHierarchyResult {
    xml: string | null;
    error: string | null;
}

/** How long a single dump may take before it is abandoned. A hung dump used to
 * stall the whole poll loop: the loop only checks its own deadline between
 * rounds, so one stuck request froze detection forever with no error shown. */
const DUMP_TIMEOUT_MS = 8000;

/** Fetch one uiautomator dump. Errors (including non-XML bodies the server
 * rejects) come back in `error` so the UI can show why detection failed. */
export async function fetchUiHierarchy(udid: string): Promise<UiHierarchyResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DUMP_TIMEOUT_MS);
    try {
        const res = await fetch(`/api/devices/ui-hierarchy?udid=${encodeURIComponent(udid)}`, {
            signal: controller.signal,
        });
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
        const error = (e as Error).name === 'AbortError' ? `dump timed out after ${DUMP_TIMEOUT_MS}ms` : (e as Error).message;
        return { xml: null, error };
    } finally {
        clearTimeout(timer);
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
    | { kind: 'pattern'; area: PatternArea; display: { width: number; height: number } | null }
    | { kind: 'pin'; area: PatternArea | null; display: { width: number; height: number } | null }
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
        onDetected?: (
            area: PatternArea,
            display: { width: number; height: number } | null,
        ) => void;
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
            const display = detectDisplaySize(xml);
            const area = findPatternArea(xml);
            if (area) {
                options.onDetected?.(area, display);
                return { kind: 'pattern', area, display };
            }
            const pinArea = findPinInputArea(xml);
            if (pinArea) {
                return { kind: 'pin', area: pinArea, display };
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
