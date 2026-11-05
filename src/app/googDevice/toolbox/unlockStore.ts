/**
 * Saved unlock credentials + pattern-area cache, per device.
 *
 * - PIN: the numeric lock-screen password (string).
 * - Pattern: the unlock pattern as a list of point indices 0-8 (row-major:
 *   0 1 2 / 3 4 5 / 6 7 8), mirroring Screen-Remote's pattern encoding.
 * - Pattern area: the last detected on-screen bounding box of the 3x3
 *   pattern grid (uiautomator node bounds), reused on later unlocks to skip
 *   re-detection (Screen-Remote's "位置缓存").
 *
 * All stored in localStorage keyed by udid. Plaintext on purpose (a personal
 * remote-control tool): the server config is not extended just to hold these.
 */

const PIN_PREFIX = 'ws_unlock_pin_';
const PATTERN_PREFIX = 'ws_unlock_pattern_';
const AREA_PREFIX = 'ws_pattern_area_';
const USE_CACHE_PREFIX = 'ws_use_pattern_cache_';
const MODE_PREFIX = 'ws_unlock_mode_';

/** 'pin' | 'pattern' — which tab the unlock dialog should open with (remembered
 * from the last time this device was unlocked). Defaults to 'pin'. */
export type UnlockMode = 'pin' | 'pattern';

export function getUnlockMode(udid: string): UnlockMode {
    return localStorage.getItem(MODE_PREFIX + udid) === 'pattern' ? 'pattern' : 'pin';
}

export function setUnlockMode(udid: string, mode: UnlockMode): void {
    localStorage.setItem(MODE_PREFIX + udid, mode);
}

export interface PatternArea {
    left: number;
    top: number;
    width: number;
    height: number;
}

function readJson<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

function writeJson(key: string, value: unknown): void {
    localStorage.setItem(key, JSON.stringify(value));
}

export function getSavedPin(udid: string): string | null {
    return localStorage.getItem(PIN_PREFIX + udid);
}

export function setSavedPin(udid: string, pin: string): void {
    localStorage.setItem(PIN_PREFIX + udid, pin.trim());
}

export function clearSavedPin(udid: string): void {
    localStorage.removeItem(PIN_PREFIX + udid);
}

/** Max point index for the largest supported grid (5x5 = 0..24). */
const MAX_PATTERN_INDEX = 24;

export interface SavedPattern {
    /** Grid size: 3 (3x3, Android default), 4 (4x4), or 5 (5x5). */
    size: number;
    /** Point indices 0..(size*size-1), row-major, deduplicated. */
    points: number[];
}

/**
 * Normalize a pattern: keep only valid point indices (0..maxIndex), drop
 * duplicates while preserving order (Android ignores re-visits of an
 * already-touched dot, and old editors could store longer/dirty sequences).
 * Returns [] when nothing valid remains.
 */
export function normalizePattern(points: number[], maxIndex: number = MAX_PATTERN_INDEX): number[] {
    const seen = new Set<number>();
    const out: number[] = [];
    for (const p of points) {
        if (p >= 0 && p <= maxIndex && !seen.has(p)) {
            seen.add(p);
            out.push(p);
        }
    }
    return out;
}

export function getSavedPattern(udid: string): SavedPattern | null {
    const v = readJson<unknown>(PATTERN_PREFIX + udid);
    if (v === null) return null;
    // Legacy format: a bare point list, always 3x3.
    if (Array.isArray(v)) {
        const clean = normalizePattern(v as number[], 8);
        return clean.length >= 4 ? { size: 3, points: clean } : null;
    }
    if (typeof v !== 'object') return null;
    const obj = v as Record<string, unknown>;
    const size = typeof obj['size'] === 'number' && (obj['size'] === 3 || obj['size'] === 4 || obj['size'] === 5)
        ? obj['size']
        : 3;
    const points = Array.isArray(obj['points'])
        ? normalizePattern(obj['points'] as number[], (size as number) * (size as number) - 1)
        : [];
    return points.length >= 4 ? { size, points } : null;
}

export function setSavedPattern(udid: string, size: number, pattern: number[]): void {
    const gridSize = size === 4 || size === 5 ? size : 3;
    writeJson(PATTERN_PREFIX + udid, {
        size: gridSize,
        points: normalizePattern(pattern, gridSize * gridSize - 1),
    });
}

export function clearSavedPattern(udid: string): void {
    localStorage.removeItem(PATTERN_PREFIX + udid);
}

export function getPatternAreaCache(udid: string): PatternArea | null {
    const v = readJson<PatternArea>(AREA_PREFIX + udid);
    if (!v || typeof v.left !== 'number' || typeof v.top !== 'number') return null;
    return v;
}

export function setPatternAreaCache(udid: string, area: PatternArea): void {
    writeJson(AREA_PREFIX + udid, area);
}

/** Drop the remembered pattern-grid position for a device. */
export function clearPatternAreaCache(udid: string): void {
    localStorage.removeItem(AREA_PREFIX + udid);
}

/** Whether later unlocks should reuse the last detected pattern area. Default: on. */
export function getUsePatternCache(udid: string): boolean {
    return localStorage.getItem(USE_CACHE_PREFIX + udid) !== '0';
}

export function setUsePatternCache(udid: string, enabled: boolean): void {
    localStorage.setItem(USE_CACHE_PREFIX + udid, enabled ? '1' : '0');
}

export function clearUnlockStore(udid: string): void {
    clearSavedPin(udid);
    clearSavedPattern(udid);
    localStorage.removeItem(AREA_PREFIX + udid);
    localStorage.removeItem(USE_CACHE_PREFIX + udid);
}

/** Clear the saved PIN and pattern (and the cached grid position) for a device. */
export function clearUnlockPasswords(udid: string): void {
    clearSavedPin(udid);
    clearSavedPattern(udid);
    localStorage.removeItem(AREA_PREFIX + udid);
}

/**
 * Whether the user opted to persist unlock passwords for this device. Read
 * from the same behavior_<udid> object as the other toggles (ConfigureScrcpy
 * writes it). Default: OFF — passwords are used once and discarded unless the
 * "保存密码" toggle is explicitly enabled.
 */
export function isSavePasswordEnabled(udid: string): boolean {
    try {
        const behavior = JSON.parse(localStorage.getItem(`behavior_${udid}`) || '{}') as Record<string, unknown>;
        return behavior['savePassword'] === true;
    } catch {
        return false;
    }
}
