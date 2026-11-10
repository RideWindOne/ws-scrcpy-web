/**
 * User settings for the fullscreen edge strip — the translucent bar that slides
 * the toolbox in and out.
 *
 * It used to be a full-height invisible strip on the right edge, which both
 * looked like a permanent border and could not be reached comfortably on a
 * tablet. The strip is now a short centred bar whose side, length and thickness
 * the user picks; this module owns the storage and the change notification, so
 * the running stream can pick a new value up without reconnecting.
 */

export type EdgeZoneSide = 'left' | 'right';

export interface EdgeZoneConfig {
    side: EdgeZoneSide;
    /** Bar length in CSS px (the touch area is the same box). */
    length: number;
    /** Bar thickness in CSS px. */
    width: number;
    /** Centre of the bar as a percentage of the screen height (0..100). */
    offset: number;
}

export const EDGE_ZONE_LENGTH_MIN = 32;
export const EDGE_ZONE_LENGTH_MAX = 320;
export const EDGE_ZONE_WIDTH_MIN = 10;
export const EDGE_ZONE_WIDTH_MAX = 80;

/** Right side, centred, roughly 1 cm on a phone (≈60 CSS px there). */
export const EDGE_ZONE_DEFAULTS: EdgeZoneConfig = {
    side: 'right',
    length: 60,
    width: 22,
    offset: 50,
};

export const EDGE_ZONE_CHANGED = 'edge-zone-changed';

const STORAGE_KEY = 'ws_edge_zone';

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, Math.round(value)));

function parse(value: unknown): EdgeZoneConfig | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const raw = value as Partial<EdgeZoneConfig>;
    const side: EdgeZoneSide = raw.side === 'left' ? 'left' : 'right';
    const length = Number(raw.length);
    const width = Number(raw.width);
    if (!Number.isFinite(length) || !Number.isFinite(width)) {
        return null;
    }
    const offset = Number(raw.offset);
    return {
        side,
        length: clamp(length, EDGE_ZONE_LENGTH_MIN, EDGE_ZONE_LENGTH_MAX),
        width: clamp(width, EDGE_ZONE_WIDTH_MIN, EDGE_ZONE_WIDTH_MAX),
        offset: clamp(Number.isFinite(offset) ? offset : EDGE_ZONE_DEFAULTS.offset, 0, 100),
    };
}

/** Stored settings, or the defaults when nothing usable has been saved yet. */
export function loadEdgeZoneConfig(): EdgeZoneConfig {
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (!stored) {
            return { ...EDGE_ZONE_DEFAULTS };
        }
        return parse(JSON.parse(stored)) ?? { ...EDGE_ZONE_DEFAULTS };
    } catch {
        return { ...EDGE_ZONE_DEFAULTS };
    }
}

/** Persist and notify the running stream. */
export function saveEdgeZoneConfig(config: EdgeZoneConfig): EdgeZoneConfig {
    const next: EdgeZoneConfig = {
        side: config.side === 'left' ? 'left' : 'right',
        length: clamp(config.length, EDGE_ZONE_LENGTH_MIN, EDGE_ZONE_LENGTH_MAX),
        width: clamp(config.width, EDGE_ZONE_WIDTH_MIN, EDGE_ZONE_WIDTH_MAX),
        offset: clamp(Number.isFinite(config.offset) ? config.offset : EDGE_ZONE_DEFAULTS.offset, 0, 100),
    };
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        // Private mode / quota: the live session still gets the new value.
    }
    window.dispatchEvent(new CustomEvent(EDGE_ZONE_CHANGED, { detail: next }));
    return next;
}

/** Apply a config to the strip element (inline, so CSS only supplies the look). */
export function applyEdgeZoneConfig(zone: HTMLElement, config: EdgeZoneConfig): void {
    const style = zone.style;
    style.top = `${config.offset}%`;
    style.bottom = '';
    style.height = `${config.length}px`;
    style.width = `${config.width}px`;
    style.transform = 'translateY(-50%)';
    if (config.side === 'left') {
        style.left = '0';
        style.right = '';
    } else {
        style.left = '';
        style.right = '0';
    }
}
