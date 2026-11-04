// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
    defaultPatternArea,
    findPatternArea,
    findPinInput,
    parseUiHierarchy,
    patternPointCoordinates,
    pollForUnlockTarget,
} from '../patternLockDetect';

const LOCK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.android.systemui" content-desc="" checkable="false" bounds="[0,0][1080,1920]">
    <node index="0" text="" resource-id="com.android.systemui:id/patternView" class="com.android.internal.widget.LockPatternView" package="com.android.systemui" content-desc="" checkable="false" bounds="[216,480][864,1128]"/>
  </node>
</hierarchy>`;

const PIN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.android.systemui" content-desc="" checkable="false" bounds="[0,0][1080,1920]">
    <node index="0" text="" resource-id="com.android.systemui:id/passwordEntry" class="android.widget.EditText" package="com.android.systemui" content-desc="" checkable="false" bounds="[240,900][840,960]"/>
  </node>
</hierarchy>`;

describe('parseUiHierarchy', () => {
    it('parses node classes and bounds from a uiautomator dump', () => {
        const nodes = parseUiHierarchy(LOCK_XML);
        expect(nodes.length).toBe(2);
        const inner = nodes[1]!;
        expect(inner.className).toBe('com.android.internal.widget.LockPatternView');
        expect(inner.resourceId).toContain('patternView');
        expect(inner.bounds).toEqual({ left: 216, top: 480, width: 648, height: 648 });
    });

    it('returns null bounds for malformed bounds', () => {
        const nodes = parseUiHierarchy('<node class="android.view.View" bounds="oops"/>');
        expect(nodes[0]!.bounds).toBeNull();
    });
});

describe('findPatternArea', () => {
    it('detects the pattern grid via LockPatternView className', () => {
        expect(findPatternArea(LOCK_XML)).toEqual({
            left: 216,
            top: 480,
            width: 648,
            height: 648,
        });
    });

    it('detects via resourceId containing lockPattern', () => {
        const xml =
            '<node resource-id="com.android.keyguard:id/lockPatternView" class="android.view.View" bounds="[100,200][400,500]"/>';
        expect(findPatternArea(xml)).toEqual({ left: 100, top: 200, width: 300, height: 300 });
    });

    it('returns null when no pattern node exists', () => {
        expect(findPatternArea(PIN_XML)).toBeNull();
    });
});

describe('findPinInput', () => {
    it('detects an EditText password field', () => {
        expect(findPinInput(PIN_XML)).toBe(true);
    });

    it('returns false on a pattern lock screen', () => {
        expect(findPinInput(LOCK_XML)).toBe(false);
    });
});

describe('patternPointCoordinates', () => {
    const area = { left: 216, top: 480, width: 648, height: 648 };

    it('places the 3x3 points at cell centers (Screen-Remote formula)', () => {
        // col + 0.5 * (width/3)
        expect(patternPointCoordinates(area, 0)).toEqual({ x: 324, y: 588 });
        expect(patternPointCoordinates(area, 4)).toEqual({ x: 540, y: 804 });
        expect(patternPointCoordinates(area, 8)).toEqual({ x: 756, y: 1020 });
    });

    it('divides the same area into 4x4 / 5x5 cells when asked', () => {
        // 4x4: width/4 = 162 → centers at 216+81=297, 216+3*162+81=783
        expect(patternPointCoordinates(area, 0, 4)).toEqual({ x: 297, y: 561 });
        expect(patternPointCoordinates(area, 15, 4)).toEqual({ x: 783, y: 1047 });
        // 5x5: width/5 = 129.6 → index 0 ≈ 216+64.8 ≈ 281, index 24 (row/col 4)
        // ≈ 216 + 4.5*129.6 = 799, y = 480 + 4.5*129.6 = 1063
        expect(patternPointCoordinates(area, 0, 5)).toEqual({ x: 281, y: 545 });
        expect(patternPointCoordinates(area, 24, 5)).toEqual({ x: 799, y: 1063 });
    });
});

describe('defaultPatternArea', () => {
    it('falls back to a centered W/3 square slightly above middle', () => {
        const area = defaultPatternArea(1080, 1920);
        expect(area.width).toBe(360);
        expect(area.height).toBe(360);
        expect(area.left).toBe(360);
        expect(area.top).toBe(540); // (1920-360)/2 - 1920/8
    });
});

describe('pollForUnlockTarget', () => {
    const makeFetch = (xml: string) =>
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => xml })));

    it('returns the pattern grid when the pattern lock screen is showing', async () => {
        makeFetch(LOCK_XML);
        const target = await pollForUnlockTarget('d1', 1080, 1920, { pollMs: 5, timeoutMs: 2000 });
        expect(target.kind).toBe('pattern');
        if (target.kind === 'pattern') {
            expect(target.area).toEqual({ left: 216, top: 480, width: 648, height: 648 });
        }
        vi.unstubAllGlobals();
    });

    it('returns pin when Android demoted the lock to a numeric PIN field', async () => {
        makeFetch(PIN_XML);
        const target = await pollForUnlockTarget('d1', 1080, 1920, { pollMs: 5, timeoutMs: 2000 });
        expect(target.kind).toBe('pin');
        vi.unstubAllGlobals();
    });

    it('falls back to the default area on timeout', async () => {
        makeFetch('<hierarchy><node bounds="[0,0][1,1]"/></hierarchy>');
        const target = await pollForUnlockTarget('d1', 1080, 1920, { pollMs: 5, timeoutMs: 50 });
        expect(target.kind).toBe('none');
        if (target.kind === 'none') {
            expect(target.area.width).toBe(360);
        }
        vi.unstubAllGlobals();
    });
});
