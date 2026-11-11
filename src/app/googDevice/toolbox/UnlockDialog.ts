import Size from '../../Size';
import Point from '../../Point';
import Position from '../../Position';
import { Modal } from '../../ui/Modal';
import KeyEvent from '../android/KeyEvent';
import MotionEvent from '../../MotionEvent';
import { KeyCodeControlMessage } from '../../controlMessage/KeyCodeControlMessage';
import { TouchControlMessage } from '../../controlMessage/TouchControlMessage';
import { TextControlMessage } from '../../controlMessage/TextControlMessage';
import { t } from '../../client/i18n';
import type { StreamClientScrcpy } from '../client/StreamClientScrcpy';
import {
    clearPatternAreaCache,
    getPatternAreaCache,
    getSavedPattern,
    getSavedPin,
    getUnlockMode,
    getUsePatternCache,
    isSavePasswordEnabled,
    setPatternAreaCache,
    setSavedPattern,
    setSavedPin,
    setUnlockMode,
    setUsePatternCache,
    clearSavedPin,
    clearSavedPattern,
    type PatternArea,
} from './unlockStore';
import {
    detectDisplaySize,
    fetchUiHierarchy,
    findPatternArea,
    findPinInputArea,
    patternPointCoordinates,
    pollForUnlockTarget,
    scaleAreaToVideo,
    type UnlockTarget,
} from './patternLockDetect';

/** In-dialog pattern grid tuning (same presets as the old drawing dialog). */
const PATTERN_PRESETS: Record<number, { dot: number; gap: number; pad: number }> = {
    3: { dot: 56, gap: 24, pad: 24 }, // 264px
    4: { dot: 44, gap: 14, pad: 20 }, // 258px
    5: { dot: 36, gap: 12, pad: 16 }, // 260px
};

const POINTER_ID = 1;
const MOVE_STEPS = 10;
const STEP_DELAY_MS = 15;

function delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * "Enter password" dialog: unlocks an unrooted phone whose lock screen is a
 * black surface on the scrcpy stream. Passwords are NEVER persisted — a PIN is
 * typed straight in, a pattern is drawn directly on the in-dialog grid and
 * used once, then discarded.
 *
 * Unlock flow mirrors Screen-Remote:
 *   check screen state (re-wake if off) → diagonal swipe up → poll the
 *   uiautomator dump for the pattern grid (or PIN field) → inject a touch/text
 *   sequence over the scrcpy control channel. While the grid is being probed
 *   the screen is nudged awake every few seconds, so a long detection never
 *   falls back to a dark screen.
 *
 * The detected grid is cached ("use position cache", on by default) so later
 * unlocks reuse it without waiting. Once "unlock" is tapped the dialog
 * minimizes to the centered in-video status notice, leaving the stream fully
 * visible while the unlock runs.
 */
export class UnlockDialog extends Modal {
    private readonly client: StreamClientScrcpy;
    private readonly udid: string;
    private readonly screenWidth: number;
    private readonly screenHeight: number;
    private readonly videoHost: HTMLElement | undefined;
    private statusEl: HTMLElement | null = null;
    private miniStatus: HTMLElement | null = null;
    /** Pattern drawn on the in-dialog grid this session — never persisted. */
    private pendingPattern: { size: number; points: number[] } | null = null;
    private patternSize = 3;
    private patternPoints: number[] = [];
    private patternArea: HTMLDivElement | null = null;
    private patternDots: HTMLDivElement[] = [];
    private patternCenters: { x: number; y: number }[] = [];
    private patternStatusEl: HTMLElement | null = null;
    private patternDrawing = false;

    constructor(client: StreamClientScrcpy, udid: string, screenSize: Size, videoHost?: HTMLElement) {
        super({ title: t('unlock_title') });
        this.client = client;
        this.udid = udid;
        this.screenWidth = screenSize.width;
        this.screenHeight = screenSize.height;
        this.videoHost = videoHost;
        this.dialog.classList.add('unlock-modal');
        queueMicrotask(() => this.fillBody(this.bodyEl));
    }

    protected buildBody(_container: HTMLElement): void {
        // Rendered by fillBody() from the constructor via queueMicrotask.
    }

    private showStatus(msg: string): void {
        if (this.miniStatus && this.miniStatus.isConnected) {
            this.miniStatus.textContent = msg;
        } else if (this.statusEl) {
            this.statusEl.textContent = msg;
        }
    }

    // ------------------------------------------------------------------
    // Mini status chip (shown while the unlock runs in the background)
    // ------------------------------------------------------------------

    private ensureMiniStatus(): HTMLElement {
        if (this.miniStatus && this.miniStatus.isConnected) return this.miniStatus;
        const el = document.createElement('div');
        // Same look and position as the "device is locked" notice: centered
        // inside the video surface, so it is never hidden behind page UI.
        el.className = 'stream-locked-notice unlock-mini-status';
        el.style.cssText = 'pointer-events:auto;cursor:pointer;z-index:9;';
        el.title = t('unlock_title');
        el.addEventListener('click', () => el.remove());
        const host = this.videoHost ?? document.body;
        host.appendChild(el);
        this.miniStatus = el;
        return el;
    }

    private removeMiniStatus(): void {
        if (this.miniStatus) {
            this.miniStatus.remove();
            this.miniStatus = null;
        }
    }

    /** Close the dialog and hand over to the centered in-video status notice. */
    private minimize(): void {
        this.ensureMiniStatus().textContent = t('unlock_waking');
        this.close();
    }

    // ------------------------------------------------------------------
    // UI
    // ------------------------------------------------------------------

    private fillBody(container: HTMLElement): void {
        container.replaceChildren();

        const style: Partial<CSSStyleDeclaration> = {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '14px',
        };
        Object.assign(container.style, style);

        const status = document.createElement('div');
        status.className = 'unlock-status';
        status.style.cssText = 'color:#e05555;font-size:13px;margin-bottom:10px;min-height:1.4em;';
        this.statusEl = status;
        container.appendChild(status);

        // ── Mode tabs: PIN / pattern (centered) ─────────────────────────
        const tabs = document.createElement('div');
        tabs.style.cssText = 'display:flex;gap:8px;justify-content:center;margin-bottom:14px;';
        const pinTab = document.createElement('button');
        const patternTab = document.createElement('button');
        // No passwords are ever persisted; start on the tab used the last time
        // this device was unlocked (remembered per device, not a password).
        let mode: 'pin' | 'pattern' = getUnlockMode(this.udid);

        const bodyWrap = document.createElement('div');
        bodyWrap.style.cssText = 'display:block;';
        container.appendChild(tabs);
        container.appendChild(bodyWrap);

        const renderTabStyles = (): void => {
            for (const [btn, active] of [
                [pinTab, mode === 'pin'],
                [patternTab, mode === 'pattern'],
            ] as const) {
                btn.style.cssText =
                    'padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;border:1px solid #444;' +
                    (active
                        ? 'background:#0078d4;color:#fff;border-color:#0078d4;'
                        : 'background:#222;color:#ccc;');
            }
        };
        pinTab.type = 'button';
        patternTab.type = 'button';
        pinTab.textContent = t('unlock_set_pin');
        patternTab.textContent = t('unlock_set_pattern');
        pinTab.addEventListener('click', () => {
            mode = 'pin';
            setUnlockMode(this.udid, 'pin');
            renderTabStyles();
            renderBody();
        });
        patternTab.addEventListener('click', () => {
            mode = 'pattern';
            setUnlockMode(this.udid, 'pattern');
            renderTabStyles();
            renderBody();
        });
        tabs.appendChild(pinTab);
        tabs.appendChild(patternTab);

        // Shared action buttons (bottom row, centered in both tabs). No
        // password is saved anymore — the PIN tab unlocks straight from the
        // input; the pattern tab unlocks via the drawing window.
        const actionRow = document.createElement('div');
        actionRow.style.cssText = 'display:flex;gap:8px;justify-content:center;margin-top:14px;';
        const unlockBtn = document.createElement('button');
        unlockBtn.type = 'button';
        unlockBtn.className = 'modal-button modal-button-primary';
        unlockBtn.textContent = t('unlock_now');
        actionRow.appendChild(unlockBtn);

        // ── Mode-specific body ──────────────────────────────────────────
        let pinInput: HTMLInputElement | null = null;

        const renderBody = (): void => {
            bodyWrap.replaceChildren();
            if (mode === 'pin') {
                const label = document.createElement('div');
                label.textContent = t('unlock_pin_label');
                label.style.cssText = 'font-size:13px;margin-bottom:6px;color:#888;';
                pinInput = document.createElement('input');
                pinInput.type = 'password';
                pinInput.inputMode = 'numeric';
                // Pre-fill the saved PIN only when the user enabled password
                // saving; otherwise start blank (passwords are used once).
                pinInput.value = isSavePasswordEnabled(this.udid) ? getSavedPin(this.udid) ?? '' : '';
                pinInput.style.cssText =
                    'width:100%;padding:6px 8px;box-sizing:border-box;font-size:15px;' +
                    'background:#1a1a1a;border:1px solid #444;color:#eee;border-radius:4px;';
                bodyWrap.appendChild(label);
                bodyWrap.appendChild(pinInput);

                actionRow.replaceChildren(unlockBtn);
                bodyWrap.appendChild(actionRow);
                return;
            }

            // ── Pattern tab: draw directly on the in-dialog grid ────────
            // Size selector (3x3 / 4x4 / 5x5), a draggable grid, a status
            // counter and "清空重绘 | 解锁". Drawing here never scrolls the
            // page behind it. When password saving is enabled, a previously
            // saved pattern is remembered for auto-unlock but NEVER drawn on
            // the grid — showing the connection line would leak the password.
            const savedPattern = isSavePasswordEnabled(this.udid) ? getSavedPattern(this.udid) : null;
            if (savedPattern) {
                this.patternSize = savedPattern.size;
                this.patternPoints = [];
                this.pendingPattern = { size: savedPattern.size, points: [...savedPattern.points] };
            }
            const sizeRow = document.createElement('div');
            sizeRow.style.cssText =
                'display:flex;gap:8px;justify-content:center;margin-bottom:8px;flex-wrap:wrap;';
            const sizeBtns = new Map<number, HTMLButtonElement>();
            for (const n of [3, 4, 5]) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'modal-button';
                btn.textContent = `${n}×${n}`;
                btn.style.cssText = 'min-height:40px;padding:2px 14px;';
                btn.addEventListener('click', () => {
                    this.patternSize = n;
                    this.patternPoints = [];
                    this.renderPatternGrid();
                    this.updatePatternStatus();
                    sizeBtns.forEach((b, key) => b.classList.toggle('modal-button-primary', key === n));
                });
                sizeBtns.set(n, btn);
                sizeRow.appendChild(btn);
            }
            bodyWrap.appendChild(sizeRow);

            // Grid area — created once per renderBody; rebuilt by
            // renderPatternGrid() when the size changes.
            this.patternArea = document.createElement('div');
            this.patternArea.style.cssText =
                'position:relative;background:#1a1a1a;border-radius:10px;' +
                'touch-action:none;user-select:none;cursor:crosshair;margin:0 auto;';
            bodyWrap.appendChild(this.patternArea);

            const pointHit = (px: number, py: number): number | null => {
                for (let i = 0; i < this.patternCenters.length; i++) {
                    const dx = px - this.patternCenters[i]!.x;
                    const dy = py - this.patternCenters[i]!.y;
                    const hitR = (PATTERN_PRESETS[this.patternSize]?.dot ?? 56) * 0.85;
                    if (dx * dx + dy * dy <= hitR * hitR) return i;
                }
                return null;
            };
            const areaPoint = (e: PointerEvent): { x: number; y: number } => {
                const rect = this.patternArea!.getBoundingClientRect();
                return { x: e.clientX - rect.left, y: e.clientY - rect.top };
            };
            this.patternArea.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                this.patternArea!.setPointerCapture(e.pointerId);
                const p = areaPoint(e);
                const hit = pointHit(p.x, p.y);
                if (hit === null) return;
                this.patternDrawing = true;
                this.patternPoints = [hit];
                this.renderPatternGrid();
                this.updatePatternStatus();
            });
            this.patternArea.addEventListener('pointermove', (e) => {
                if (!this.patternDrawing) return;
                const p = areaPoint(e);
                const hit = pointHit(p.x, p.y);
                if (hit === null) return;
                if (this.patternPoints.includes(hit)) return;
                this.patternPoints.push(hit);
                this.renderPatternGrid();
                this.updatePatternStatus();
            });
            this.patternArea.addEventListener('pointerup', () => {
                if (!this.patternDrawing) return;
                this.patternDrawing = false;
            });
            this.patternArea.addEventListener('pointercancel', () => {
                this.patternDrawing = false;
            });

            // Status counter ("已选 9/9 ✓")
            const patStatus = document.createElement('div');
            patStatus.style.cssText =
                'font-size:12px;color:#888;min-height:1.4em;text-align:center;margin-top:6px;';
            bodyWrap.appendChild(patStatus);
            this.patternStatusEl = patStatus;

            // Use position cache toggle (Screen-Remote style), centered
            const cacheRow = document.createElement('label');
            cacheRow.style.cssText =
                'display:flex;align-items:center;justify-content:center;gap:6px;font-size:13px;color:#aaa;margin-top:8px;cursor:pointer;flex-wrap:wrap;';
            const cacheCheck = document.createElement('input');
            cacheCheck.type = 'checkbox';
            cacheCheck.checked = getUsePatternCache(this.udid);
            cacheCheck.addEventListener('change', () => {
                setUsePatternCache(this.udid, cacheCheck.checked);
            });
            const cacheText = document.createElement('span');
            cacheText.textContent = t('unlock_use_cache');
            cacheRow.appendChild(cacheCheck);
            cacheRow.appendChild(cacheText);
            const clearCacheBtn = document.createElement('button');
            clearCacheBtn.type = 'button';
            clearCacheBtn.className = 'modal-button';
            clearCacheBtn.textContent = t('unlock_clear_cache');
            clearCacheBtn.style.cssText =
                'min-height:32px;padding:2px 10px;font-size:12px;color:#d08;';
            clearCacheBtn.addEventListener('click', () => {
                clearPatternAreaCache(this.udid);
                clearCacheBtn.textContent = t('unlock_cache_cleared');
            });
            cacheRow.appendChild(clearCacheBtn);
            bodyWrap.appendChild(cacheRow);

            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'modal-button';
            clearBtn.textContent = t('unlock_pattern_clear');
            clearBtn.style.cssText = 'min-height:44px;display:flex;align-items:center;justify-content:center;';
            clearBtn.addEventListener('click', () => {
                this.patternPoints = [];
                this.renderPatternGrid();
                this.updatePatternStatus();
            });

            // Restore whatever was drawn before a tab switch, and paint it.
            this.renderPatternGrid();
            this.updatePatternStatus();
            sizeBtns.forEach((b, key) => b.classList.toggle('modal-button-primary', key === this.patternSize));

            actionRow.replaceChildren(clearBtn, unlockBtn);
            bodyWrap.appendChild(actionRow);
        };

        renderTabStyles();
        renderBody();

        // ── Actions ─────────────────────────────────────────────────────
        unlockBtn.addEventListener('click', () => {
            unlockBtn.disabled = true;
            if (mode === 'pattern') {
                // A freshly drawn pattern wins; otherwise fall back to the
                // saved one, which is kept in memory and never drawn.
                if (this.patternPoints.length >= 4) {
                    this.pendingPattern = { size: this.patternSize, points: this.patternPoints };
                } else if (!this.pendingPattern) {
                    const saved = isSavePasswordEnabled(this.udid) ? getSavedPattern(this.udid) : null;
                    if (saved) this.pendingPattern = { size: saved.size, points: [...saved.points] };
                }
            }
            // Run in the background: hide the dialog, keep the in-video notice.
            this.minimize();
            void this.runUnlock(mode, pinInput?.value.trim() ?? null);
        });
    }

    // ------------------------------------------------------------------
    // Screen state + unlock execution (Screen-Remote flow)
    // ------------------------------------------------------------------

    /**
     * Ask the server for the screen state; the wake action itself re-wakes the
     * screen if it is off, and the response tells us whether it is awake now.
     */
    private async ensureAwake(): Promise<boolean> {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const res = await fetch('/api/devices/sleep-wake', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ udid: this.udid, action: 'wake' }),
                });
                const result = (await res.json()) as { awake?: boolean };
                if (result.awake) return true;
            } catch {
                // transient; retry
            }
            await delay(600);
        }
        return false;
    }

    private sendKey(keycode: number): void {
        this.client.sendMessage(new KeyCodeControlMessage(KeyEvent.ACTION_DOWN, keycode, 0, 0));
        this.client.sendMessage(new KeyCodeControlMessage(KeyEvent.ACTION_UP, keycode, 0, 0));
    }

    private touch(action: number, x: number, y: number): void {
        this.client.sendMessage(
            new TouchControlMessage(
                action,
                POINTER_ID,
                new Position(new Point(Math.round(x), Math.round(y)), new Size(this.screenWidth, this.screenHeight)),
                1,
                0,
                1,
            ),
        );
    }

    /** A continuous drag from (x1,y1) to (x2,y2) with interpolated moves. */
    private drag(x1: number, y1: number, x2: number, y2: number): Promise<void> {
        this.touch(MotionEvent.ACTION_DOWN, x1, y1);
        return this.dragMove(x1, y1, x2, y2).then(() => {
            this.touch(MotionEvent.ACTION_UP, x2, y2);
        });
    }

    private async dragMove(x1: number, y1: number, x2: number, y2: number): Promise<void> {
        for (let step = 1; step <= MOVE_STEPS; step++) {
            const x = x1 + ((x2 - x1) * step) / MOVE_STEPS;
            const y = y1 + ((y2 - y1) * step) / MOVE_STEPS;
            this.touch(MotionEvent.ACTION_MOVE, x, y);
            await delay(STEP_DELAY_MS);
        }
    }

    /**
     * One light tap on the middle of the picture, right before the unlock swipe.
     *
     * Measured on the T2S setup: a fresh connection needs about two seconds
     * before the first frame shows up, and the phone falls asleep in that gap.
     * Tapping is what brings it back — a tap is a touch event, so it cannot
     * switch anything off, and on builds with tap-to-wake it lights the panel.
     */
    private async tapScreen(): Promise<void> {
        const x = Math.round(this.screenWidth * 0.5);
        const y = Math.round(this.screenHeight * 0.5);
        this.touch(MotionEvent.ACTION_DOWN, x, y);
        await delay(60);
        this.touch(MotionEvent.ACTION_UP, x, y);
        await delay(350);
    }

    /** Check screen state; if off, wake it and swipe diagonally up. */
    private async wakeAndSwipeUp(): Promise<void> {
        this.showStatus(t('unlock_waking'));
        await this.ensureAwake();
        await delay(700);
        // Tap just before the swipe: a device that fell asleep during the
        // connection handshake only comes back on a touch, not on a key.
        await this.tapScreen();
        await this.drag(
            this.screenWidth * 0.85,
            this.screenHeight * 0.85,
            this.screenWidth * 0.15,
            this.screenHeight * 0.15,
        );
        await delay(700);
    }

    /**
     * Figure out what the lock screen is asking for right now. When the
     * position cache is on and a cached grid exists, verify it with a single
     * dump first (the screen may have switched to a numeric PIN prompt after
     * failed pattern attempts); otherwise poll until either appears.
     */
    private async detectUnlockTarget(): Promise<UnlockTarget> {
        const useCache = getUsePatternCache(this.udid);
        const cached = useCache ? getPatternAreaCache(this.udid) : null;
        if (cached) {
            const { xml, error } = await fetchUiHierarchy(this.udid);
            if (xml) {
                const display = detectDisplaySize(xml);
                const area = findPatternArea(xml);
                if (area) return { kind: 'pattern', area, display };
                const pinArea = findPinInputArea(xml);
                if (pinArea) return { kind: 'pin', area: pinArea, display };
            } else {
                this.showStatus(`${t('unlock_detect_error')}: ${error ?? ''}`);
                // The dump failed but we have a remembered grid: trust the
                // cached position instead of another long poll — the cache is
                // exactly what this is for. Its display size (when stored) lets
                // us still map it correctly onto a downscaled video frame.
                const display =
                    cached.displayWidth && cached.displayHeight
                        ? { width: cached.displayWidth, height: cached.displayHeight }
                        : null;
                return { kind: 'pattern', area: cached, display };
            }
        }
        this.showStatus(t('unlock_detecting'));
        return pollForUnlockTarget(this.udid, this.screenWidth, this.screenHeight, {
            onDetected: (detected, display) => {
                const area: PatternArea = { ...detected };
                if (display) {
                    area.displayWidth = display.width;
                    area.displayHeight = display.height;
                }
                setPatternAreaCache(this.udid, area);
            },
            // Probing can take tens of seconds; keep the screen awake.
            onKeepAwake: () => {
                void this.ensureAwake();
            },
            onError: (error) => this.showStatus(`${t('unlock_detect_error')}: ${error}`),
        });
    }

    /**
     * One dump to locate the numeric PIN field so it can be tapped before
     * typing. Returns null when the field is not visible (the unlock then falls
     * back to typing into whatever has focus, as before).
     */
    private async detectPinField(): Promise<{
        area: PatternArea;
        display: { width: number; height: number } | null;
    } | null> {
        for (let attempt = 0; attempt < 2; attempt++) {
            const { xml } = await fetchUiHierarchy(this.udid);
            if (xml) {
                const area = findPinInputArea(xml);
                if (area) return { area, display: detectDisplaySize(xml) };
            }
            await delay(400);
        }
        return null;
    }

    /** (Re)paint the pattern grid dots + connection line from patternPoints. */
    private renderPatternGrid(): void {
        const area = this.patternArea;
        if (!area) return;
        const n = this.patternSize;
        const p = PATTERN_PRESETS[n] ?? PATTERN_PRESETS[3]!;
        const size = p.pad * 2 + n * p.dot + (n - 1) * p.gap;
        area.style.width = `${size}px`;
        area.style.height = `${size}px`;
        area.replaceChildren();
        this.patternDots = [];
        this.patternCenters = [];

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', String(size));
        svg.setAttribute('height', String(size));
        svg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;';
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#0078d4');
        path.setAttribute('stroke-width', String(n === 5 ? 4 : 6));
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(path);
        area.appendChild(svg);

        const cell = p.dot + p.gap;
        const selectedSet = new Set(this.patternPoints);
        for (let i = 0; i < n * n; i++) {
            const row = Math.floor(i / n);
            const col = i % n;
            const cx = p.pad + col * cell + p.dot / 2;
            const cy = p.pad + row * cell + p.dot / 2;
            this.patternCenters.push({ x: cx, y: cy });
            const dot = document.createElement('div');
            dot.style.cssText =
                `position:absolute;left:${p.pad + col * cell}px;top:${p.pad + row * cell}px;` +
                `width:${p.dot}px;height:${p.dot}px;border-radius:50%;` +
                (selectedSet.has(i) ? 'background:#0078d4;' : 'background:#444;') +
                'box-shadow:inset 0 0 0 2px rgba(255,255,255,.08);';
            area.appendChild(dot);
            this.patternDots.push(dot);
        }

        const pts = this.patternPoints.map((idx) => this.patternCenters[idx]!);
        if (pts.length > 0) {
            path.setAttribute('d', 'M ' + pts.map((q) => `${q.x},${q.y}`).join(' L '));
        }
    }

    private updatePatternStatus(): void {
        if (!this.patternStatusEl) return;
        const n = this.patternPoints.length;
        const total = this.patternSize * this.patternSize;
        if (n === 0) {
            // A saved (invisible) pattern is armed: say so without drawing it.
            if (this.pendingPattern && this.pendingPattern.points.length >= 4) {
                this.patternStatusEl.textContent = t('unlock_using_saved');
            } else {
                this.patternStatusEl.textContent = t('unlock_pattern_hint');
            }
        } else if (n < 4) {
            this.patternStatusEl.textContent = `${t('unlock_pattern_selected')}${n}/${total}`;
        } else {
            this.patternStatusEl.textContent = `${t('unlock_pattern_selected')}${n}/${total} ✓`;
        }
    }

    private async unlockWithPattern(
        pattern: number[],
        area: PatternArea,
        gridSize: number = 3,
        display: { width: number; height: number } | null = null,
    ): Promise<void> {
        // uiautomator bounds are device pixels; touch events travel in the
        // video-frame space. Convert before mapping dots to coordinates.
        const videoArea = scaleAreaToVideo(area, display, this.screenWidth, this.screenHeight);
        const points = pattern.map((idx) => patternPointCoordinates(videoArea, idx, gridSize));
        const first = points[0]!;
        const last = points[points.length - 1]!;

        this.showStatus(t('unlock_injecting'));
        this.touch(MotionEvent.ACTION_DOWN, first.x, first.y);
        await delay(100);
        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1]!;
            const cur = points[i]!;
            await this.dragMove(prev.x, prev.y, cur.x, cur.y);
        }
        this.touch(MotionEvent.ACTION_UP, last.x, last.y);
        await delay(150);
    }

    private async unlockWithPin(
        pin: string,
        field: { area: PatternArea; display: { width: number; height: number } | null } | null = null,
    ): Promise<void> {
        this.showStatus(t('unlock_injecting'));
        if (field) {
            // Focus the field first: typing into an unfocused lock screen
            // lands in the wrong place (or nowhere at all).
            const videoArea = scaleAreaToVideo(field.area, field.display, this.screenWidth, this.screenHeight);
            const cx = Math.round(videoArea.left + videoArea.width / 2);
            const cy = Math.round(videoArea.top + videoArea.height / 2);
            this.touch(MotionEvent.ACTION_DOWN, cx, cy);
            await delay(60);
            this.touch(MotionEvent.ACTION_UP, cx, cy);
            await delay(400);
        }
        this.client.sendMessage(new TextControlMessage(pin));
        await delay(200);
        this.sendKey(KeyEvent.KEYCODE_ENTER);
        await delay(150);
    }

    private async runUnlock(mode: 'pin' | 'pattern', typedPin: string | null): Promise<void> {
        try {
            const pin = mode === 'pin' ? typedPin : null;
            const pending = mode === 'pattern' ? this.pendingPattern : null;
            const pattern = pending && pending.points.length >= 4 ? pending.points : null;
            const gridSize = pending?.size ?? 3;
            if (mode === 'pin' && !pin) {
                this.showStatus(t('unlock_need_pin'));
                return;
            }
            if (mode === 'pattern' && !pattern) {
                this.showStatus(t('unlock_need_pattern'));
                return;
            }
            await this.wakeAndSwipeUp();

            if (mode === 'pin') {
                // Wake the lock UI, find the PIN field, tap it (so the text
                // lands in the right place), then type.
                await this.ensureAwake();
                await delay(900);
                const pinField = await this.detectPinField();
                await this.unlockWithPin(pin!, pinField);
                // Persist or discard the PIN, per the "保存密码" toggle.
                if (isSavePasswordEnabled(this.udid)) {
                    setSavedPin(this.udid, pin!);
                } else {
                    clearSavedPin(this.udid);
                }
            } else {
                // Detect what the lock screen is showing now. If the pattern
                // grid is gone (e.g. too many failed attempts made Android ask
                // for the numeric PIN), tell the user to switch to PIN mode —
                // a saved PIN is never auto-injected from here.
                const target = await this.detectUnlockTarget();
                await this.ensureAwake();
                await delay(400);
                if (target.kind === 'pin') {
                    this.showStatus(t('unlock_pin_required'));
                    setTimeout(() => this.removeMiniStatus(), 6000);
                    return;
                }
                await this.unlockWithPattern(
                    pattern!,
                    target.area,
                    gridSize,
                    target.kind === 'pattern' ? target.display : null,
                );
                // Persist or discard the pattern, per the "保存密码" toggle.
                if (isSavePasswordEnabled(this.udid)) {
                    setSavedPattern(this.udid, gridSize, pattern!);
                } else {
                    clearSavedPattern(this.udid);
                }
            }
            this.showStatus(t('unlock_send_ok'));
            setTimeout(() => this.removeMiniStatus(), 3000);
        } catch (e) {
            this.showStatus(`${t('unlock_send_fail')}: ${(e as Error).message}`);
            setTimeout(() => this.removeMiniStatus(), 6000);
        }
    }
}
