// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
    clearUnlockPasswords,
    clearUnlockStore,
    getPatternAreaCache,
    getSavedPattern,
    getSavedPin,
    getUsePatternCache,
    isSavePasswordEnabled,
    normalizePattern,
    setPatternAreaCache,
    setSavedPattern,
    setSavedPin,
    setUsePatternCache,
} from '../unlockStore';

const UDID = '192.168.1.5:5555';

describe('unlockStore (localStorage, per udid)', () => {
    it('round-trips a numeric PIN', () => {
        setSavedPin(UDID, '1234');
        expect(getSavedPin(UDID)).toBe('1234');
    });

    it('round-trips a pattern point list (default 3x3)', () => {
        setSavedPattern(UDID, 3, [0, 4, 8, 6]);
        expect(getSavedPattern(UDID)).toEqual({ size: 3, points: [0, 4, 8, 6] });
    });

    it('round-trips 4x4 and 5x5 patterns with their grid size', () => {
        setSavedPattern(UDID, 4, [0, 5, 10, 15]);
        expect(getSavedPattern(UDID)).toEqual({ size: 4, points: [0, 5, 10, 15] });
        setSavedPattern(UDID, 5, [0, 6, 12, 18, 24]);
        expect(getSavedPattern(UDID)).toEqual({ size: 5, points: [0, 6, 12, 18, 24] });
    });

    it('normalizes dirty legacy patterns (out-of-range + duplicates)', () => {
        // Default max index covers the largest grid (5x5 → 24); 9 is now valid.
        expect(normalizePattern([0, 1, 2, 1, 2, 3, 25, -1, 4])).toEqual([0, 1, 2, 3, 4]);
        // With an explicit 3x3 cap, 9 stays out of range (legacy semantics).
        expect(normalizePattern([0, 1, 2, 1, 2, 3, 9, -1, 4], 8)).toEqual([0, 1, 2, 3, 4]);
        // Legacy bare-list storage is read as a 3x3 pattern; entries beyond
        // index 8 are dropped, and <4 valid points rejects the read.
        localStorage.setItem('ws_unlock_pattern_' + UDID, JSON.stringify([0, 1, 0, 2, 3, 9, 7, 8, 8, 6, 5]));
        expect(getSavedPattern(UDID)).toEqual({ size: 3, points: [0, 1, 2, 3, 7, 8, 6, 5] });
        localStorage.setItem('ws_unlock_pattern_' + UDID, JSON.stringify([0, 9, 9, 9]));
        expect(getSavedPattern(UDID)).toBeNull();
        // Out-of-range points for a 5x5 save are dropped, duplicates removed.
        setSavedPattern(UDID, 5, [0, 6, 6, 12, 18, 24, 30, 25]);
        expect(getSavedPattern(UDID)).toEqual({ size: 5, points: [0, 6, 12, 18, 24] });
    });

    it('rejects patterns with fewer than 4 points', () => {
        localStorage.setItem('ws_unlock_pattern_' + UDID, JSON.stringify([0, 1]));
        expect(getSavedPattern(UDID)).toBeNull();
    });

    it('round-trips the detected pattern area cache', () => {
        const area = { left: 216, top: 480, width: 648, height: 648 };
        setPatternAreaCache(UDID, area);
        expect(getPatternAreaCache(UDID)).toEqual(area);
    });

    it('is scoped per udid', () => {
        setSavedPin(UDID, '0000');
        setSavedPin('other-device', '9999');
        expect(getSavedPin(UDID)).toBe('0000');
        expect(getSavedPin('other-device')).toBe('9999');
    });

    it('clears everything for a device', () => {
        setSavedPin(UDID, '1234');
        setSavedPattern(UDID, 3, [0, 1, 2, 5]);
        setPatternAreaCache(UDID, { left: 0, top: 0, width: 100, height: 100 });
        clearUnlockStore(UDID);
        expect(getSavedPin(UDID)).toBeNull();
        expect(getSavedPattern(UDID)).toBeNull();
        expect(getPatternAreaCache(UDID)).toBeNull();
    });

    it('use-position-cache toggle defaults to on and persists off', () => {
        localStorage.removeItem('ws_use_pattern_cache_' + UDID);
        expect(getUsePatternCache(UDID)).toBe(true);
        setUsePatternCache(UDID, false);
        expect(getUsePatternCache(UDID)).toBe(false);
        setUsePatternCache(UDID, true);
        expect(getUsePatternCache(UDID)).toBe(true);
    });

    it('clears passwords (pin, pattern, cached area) but keeps the cache preference', () => {
        setSavedPin(UDID, '1234');
        setSavedPattern(UDID, 3, [0, 1, 2, 5]);
        setPatternAreaCache(UDID, { left: 0, top: 0, width: 100, height: 100 });
        setUsePatternCache(UDID, false);
        clearUnlockPasswords(UDID);
        expect(getSavedPin(UDID)).toBeNull();
        expect(getSavedPattern(UDID)).toBeNull();
        expect(getPatternAreaCache(UDID)).toBeNull();
        expect(getUsePatternCache(UDID)).toBe(false);
    });

    it('password saving is OFF by default and only on when the behavior toggle is true', () => {
        localStorage.removeItem(`behavior_${UDID}`);
        expect(isSavePasswordEnabled(UDID)).toBe(false);
        localStorage.setItem(`behavior_${UDID}`, JSON.stringify({ savePassword: false }));
        expect(isSavePasswordEnabled(UDID)).toBe(false);
        localStorage.setItem(`behavior_${UDID}`, JSON.stringify({ savePassword: true }));
        expect(isSavePasswordEnabled(UDID)).toBe(true);
        // Other toggles alone do not enable it.
        localStorage.setItem(`behavior_${UDID}`, JSON.stringify({ notifications: true }));
        expect(isSavePasswordEnabled(UDID)).toBe(false);
    });
});
