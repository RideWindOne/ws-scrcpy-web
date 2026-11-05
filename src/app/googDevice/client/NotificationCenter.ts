import type { DeviceTracker } from './DeviceTracker';
import type { ParamsStreamScrcpy } from '../../../types/ParamsStreamScrcpy';
import { ACTION } from '../../../common/Action';

const PACKAGES_PREFIX = 'ws_notify_pkgs_';
const BEHAVIOR_PREFIX = 'behavior_';
const UNREAD_KEY = 'ws_unread_notify';
const SEEN_PREFIX = 'ws_notify_seen_';
const LAST_DEVICE_KEY = 'ws_notify_last_udid';
const POLL_INTERVAL_MS = 3000;
const UNREAD_CAP = 99;

interface NotifItem {
    key: string;
    package: string;
    title: string;
    text: string;
    category: string;
    time: number;
}

/**
 * Page-wide notification monitor. While any scrcpy page is open it polls the
 * apps the user selected in the notification window (per device), keeps an
 * unread badge next to the language toggle, and alerts on new notifications
 * with a browser notification plus a short chime.
 *
 * Unread semantics: the first sync (never seen this device's state before)
 * counts the notifications already on the phone as unread — no chime. Later
 * polls only chime and count keys that are genuinely new. The seen-key set is
 * persisted so reloads never re-alert or double-count.
 */
export class NotificationCenter {
    private static instance: NotificationCenter | null = null;

    public static getInstance(): NotificationCenter {
        if (!NotificationCenter.instance) {
            NotificationCenter.instance = new NotificationCenter();
        }
        return NotificationCenter.instance;
    }

    private timer: number | null = null;
    private tracker: DeviceTracker | null = null;
    private unread = new Map<string, number>();
    private badgeEl?: HTMLElement;
    private countEl?: HTMLElement;
    private panelEl?: HTMLElement;
    private lastUdid = '';
    private ticking = false;
    private audioCtx: AudioContext | null = null;

    public start(tracker: DeviceTracker | null = null): void {
        if (tracker) this.tracker = tracker;
        this.loadUnread();
        this.ensureBadge();
        // Nothing monitored (no app selected for any device): drop stale
        // unread counts from a previous session and do not poll.
        if (this.selectedDevices().length === 0) {
            this.unread.clear();
            this.persistUnread();
            this.updateBadge();
            return;
        }
        const alreadyRunning = this.timer !== null;
        if (!alreadyRunning) {
            this.timer = window.setInterval(() => void this.tick(), POLL_INTERVAL_MS);
            // Mobile browsers freeze timers in background tabs and while the
            // screen is off; coming back to the page must re-sync immediately
            // or the badge/alerts would only appear after a reload.
            document.addEventListener('visibilitychange', this.onVisibilityChange);
            window.addEventListener('focus', this.onFocus);
            // Unread counts changed in another tab (markRead / new alerts).
            window.addEventListener('storage', this.onStorage);
            // Browsers keep AudioContext suspended (and silent) until a user
            // gesture. Create/resume it inside the first gestures so chimes can
            // actually play from then on. Not `once` — the context may be
            // created after the first gesture, later gestures must re-unlock.
            window.addEventListener('pointerdown', this.unlockAudio);
            window.addEventListener('touchstart', this.unlockAudio);
        }
        void this.tick();
    }

    private unlockAudio = (): void => {
        const ctx = this.ensureAudio();
        if (ctx && ctx.state === 'suspended') void ctx.resume();
    };

    private onVisibilityChange = (): void => {
        if (!document.hidden) void this.tick();
    };

    private onFocus = (): void => {
        void this.tick();
    };

    private onStorage = (event: StorageEvent): void => {
        if (event.key === null || event.key === UNREAD_KEY || event.key === LAST_DEVICE_KEY) {
            this.loadUnread();
            this.updateBadge();
        }
    };

    public stop(): void {
        if (this.timer !== null) {
            window.clearInterval(this.timer);
            this.timer = null;
        }
    }

    /** Clear the unread count for a device (opened the notification window). */
    public markRead(udid: string): void {
        this.unread.set(udid, 0);
        this.persistUnread();
        this.updateBadge();
    }

    /** Whether this device's notification monitoring is switched on. */
    public static isEnabledFor(udid: string): boolean {
        try {
            const behavior = JSON.parse(localStorage.getItem(BEHAVIOR_PREFIX + udid) || '{}') as {
                notifications?: boolean;
            };
            // Default: on. The checkbox in ConfigureScrcpy writes 'false'.
            return behavior.notifications !== false;
        } catch {
            return true;
        }
    }

    private loadUnread(): void {
        try {
            const raw = JSON.parse(localStorage.getItem(UNREAD_KEY) || '{}') as Record<string, number>;
            for (const [udid, count] of Object.entries(raw)) {
                if (typeof count === 'number' && count > 0) this.unread.set(udid, count);
            }
        } catch {
            this.unread.clear();
        }
        this.lastUdid = localStorage.getItem(LAST_DEVICE_KEY) || '';
    }

    private persistUnread(): void {
        const obj: Record<string, number> = {};
        for (const [udid, count] of this.unread) {
            if (count > 0) obj[udid] = count;
        }
        localStorage.setItem(UNREAD_KEY, JSON.stringify(obj));
        if (this.lastUdid) localStorage.setItem(LAST_DEVICE_KEY, this.lastUdid);
    }

    private ensureBadge(): void {
        if (this.badgeEl) return;
        const badge = document.createElement('button');
        badge.type = 'button';
        badge.classList.add('notify-badge');
        badge.title = '未读通知';
        badge.addEventListener('click', () => void this.openWindow());

        const label = document.createElement('span');
        label.classList.add('notify-badge-label');
        // Material volume-up icon, same style as the other toolbar icons
        // (18px, fill=currentColor, Material path set).
        label.innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
        badge.appendChild(label);

        const count = document.createElement('span');
        count.classList.add('notify-badge-count');
        count.hidden = true;
        badge.appendChild(count);

        this.badgeEl = badge;
        this.countEl = count;
        document.body.appendChild(badge);
        this.buildDevicePanel();
        this.updateBadge();
    }

    /** Dropdown listing every monitored device with its unread count; shown
     * when more than one device is selected, so each device's notifications
     * can be opened independently. */
    private buildDevicePanel(): void {
        if (this.panelEl) return;
        const panel = document.createElement('div');
        panel.classList.add('notify-device-panel');
        panel.hidden = true;
        this.panelEl = panel;
        document.body.appendChild(panel);
        // Close when clicking/tapping anywhere outside the panel.
        window.addEventListener('pointerdown', (e) => {
            if (this.panelEl && !this.panelEl.hidden && !this.panelEl.contains(e.target as Node)) {
                this.hideDevicePanel();
            }
        });
    }

    private renderDevicePanel(devices: Array<{ udid: string; packages: string[] }>): void {
        const panel = this.panelEl;
        if (!panel) return;
        panel.replaceChildren();
        for (const { udid } of devices) {
            const item = document.createElement('button');
            item.type = 'button';
            item.classList.add('notify-device-panel-item');

            const tracker = this.tracker;
            const descriptor = tracker ? tracker.getDescriptorByUdid(udid) : undefined;
            const label = descriptor?.['ro.product.model'] || udid;

            const name = document.createElement('span');
            name.classList.add('notify-panel-name');
            name.textContent = label;
            name.title = udid;
            item.appendChild(name);

            const count = this.unread.get(udid) ?? 0;
            if (count > 0) {
                const badgeCount = document.createElement('span');
                badgeCount.classList.add('notify-panel-count');
                badgeCount.textContent = count > UNREAD_CAP ? `${UNREAD_CAP}+` : String(count);
                item.appendChild(badgeCount);
            }

            item.addEventListener('click', () => {
                this.hideDevicePanel();
                this.openDeviceWindow(udid);
            });
            panel.appendChild(item);
        }
        panel.hidden = false;
    }

    private hideDevicePanel(): void {
        if (this.panelEl) this.panelEl.hidden = true;
    }

    private updateBadge(): void {
        if (!this.countEl || !this.badgeEl) return;
        const total = [...this.unread.values()].reduce((a, b) => a + b, 0);
        this.countEl.textContent = total > UNREAD_CAP ? `${UNREAD_CAP}+` : String(total);
        this.countEl.hidden = total === 0;
        this.badgeEl.classList.toggle('notify-badge-active', total > 0);
        // Tooltip shows per-device breakdown when several devices are monitored.
        const parts = [...this.unread.entries()]
            .filter(([, c]) => c > 0)
            .map(([udid, c]) => {
                const descriptor = this.tracker ? this.tracker.getDescriptorByUdid(udid) : undefined;
                const label = descriptor?.['ro.product.model'] || udid;
                return `${label} ${c > UNREAD_CAP ? `${UNREAD_CAP}+` : c}`;
            });
        this.badgeEl.title = parts.length > 0 ? `未读通知：${parts.join('，')}` : '未读通知';
    }

    private selectedDevices(): Array<{ udid: string; packages: string[] }> {
        const out: Array<{ udid: string; packages: string[] }> = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith(PACKAGES_PREFIX)) continue;
            const udid = key.slice(PACKAGES_PREFIX.length);
            const packages = (localStorage.getItem(key) || '')
                .split(',')
                .map((p) => p.trim())
                .filter((p) => p.length > 0);
            // Only devices with monitoring selected AND the notification
            // switch on belong in the picker.
            if (packages.length > 0 && NotificationCenter.isEnabledFor(udid)) {
                out.push({ udid, packages });
            }
        }
        // Only devices that are actually reachable belong in the picker:
        // a stale record for a device that is no longer connected (e.g. an
        // old USB connection whose serial was the udid) must not show up as
        // an opaque "black box" row in the device panel.
        const tracker = this.tracker;
        if (tracker) {
            return out.filter((d) => tracker.getDescriptorByUdid(d.udid) !== undefined);
        }
        // Stream page: no list tracker, so restrict to the streamed device.
        return this.lastUdid ? out.filter((d) => d.udid === this.lastUdid) : [];
    }

    private async tick(): Promise<void> {
        if (this.ticking) return;
        this.ticking = true;
        try {
            const devices = this.selectedDevices();
            if (devices.length === 0) {
                // All selections were removed: clear stale unread and stop
                // counting until the user picks apps again.
                this.unread.clear();
                this.persistUnread();
                this.updateBadge();
                return;
            }
            for (const { udid, packages } of devices) {
                if (!NotificationCenter.isEnabledFor(udid)) continue;
                try {
                    const query = `udid=${encodeURIComponent(udid)}&packages=${encodeURIComponent(packages.join(','))}`;
                    const res = await fetch(`/api/devices/notifications?${query}`);
                    if (!res.ok) continue;
                    const data = (await res.json()) as { notifications?: NotifItem[] };
                    const items = data.notifications || [];
                    const seen = this.loadSeen(udid);
                    const firstSync = !localStorage.getItem(SEEN_PREFIX + udid);
                    // A notification's key is stable across dumps, but messaging
                    // apps update the SAME key when new messages arrive (text /
                    // title change). Treat content changes as new messages too.
                    const fresh = firstSync
                        ? []
                        : items.filter((n) => {
                              const hash = this.notifHash(n);
                              return !seen.has(n.key) || seen.get(n.key) !== hash;
                          });
                    for (const n of items) seen.set(n.key, this.notifHash(n));
                    this.saveSeen(udid, seen);
                    if (fresh.length > 0 && fresh[0] !== undefined) {
                        const count = (this.unread.get(udid) ?? 0) + fresh.length;
                        this.unread.set(udid, Math.min(count, UNREAD_CAP));
                        this.lastUdid = udid;
                        this.notify(fresh[0]);
                    } else if (firstSync && items.length > 0) {
                        // First sync: notifications already on the phone count
                        // as unread (badge only, no chime) — the user has not
                        // seen them yet.
                        const count = (this.unread.get(udid) ?? 0) + items.length;
                        this.unread.set(udid, Math.min(count, UNREAD_CAP));
                        this.lastUdid = udid;
                    }
                } catch {
                    // Poll errors are transient (device offline, shell busy) — keep going.
                }
            }
            // Drop unread counts for devices that are no longer in the
            // selection (stale records for disconnected devices).
            for (const udid of [...this.unread.keys()]) {
                if (!devices.some((d) => d.udid === udid)) this.unread.delete(udid);
            }
            this.persistUnread();
            this.updateBadge();
        } finally {
            this.ticking = false;
        }
    }

    /** Content fingerprint for "is this a new message" — excludes time, which
     * can drift between dumps of the same notification. */
    private notifHash(n: NotifItem): string {
        return `${n.title}|${n.text}|${n.category}`;
    }

    private loadSeen(udid: string): Map<string, string> {
        try {
            const raw = JSON.parse(localStorage.getItem(SEEN_PREFIX + udid) || '{}') as unknown;
            if (Array.isArray(raw)) {
                // Legacy format: plain key list → keys seen with unknown hash.
                return new Map((raw as string[]).map((k) => [k, '']));
            }
            if (raw && typeof raw === 'object') {
                return new Map(Object.entries(raw as Record<string, string>));
            }
            return new Map();
        } catch {
            return new Map();
        }
    }

    private saveSeen(udid: string, keys: Map<string, string>): void {
        try {
            localStorage.setItem(SEEN_PREFIX + udid, JSON.stringify(Object.fromEntries(keys)));
        } catch {
            // Storage full / private mode — dedupe degrades to per-session only.
        }
    }

    /** Browser notification + a short chime for the newest item. */
    private notify(item: NotifItem): void {
        const title = item.title || item.package;
        const body = item.text || title;
        if ('Notification' in window && Notification.permission === 'granted') {
            try {
                new Notification(title, { body });
            } catch {
                // Some embedded browsers throw — notification is best-effort.
            }
        }
        this.playChime();
    }

    /** Get a live AudioContext, recreating it if it was ever closed. */
    private ensureAudio(): AudioContext | null {
        try {
            const Ctor =
                window.AudioContext ??
                (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!Ctor) return null;
            if (!this.audioCtx || this.audioCtx.state === 'closed') {
                this.audioCtx = new Ctor();
            }
            return this.audioCtx;
        } catch {
            return null;
        }
    }

    /** WebAudio chime — no speech, just a short alert tone. */
    private playChime(): void {
        const ctx = this.ensureAudio();
        if (!ctx) return;
        try {
            // The context may still be suspended before any user gesture; the
            // scheduled oscillator plays once the browser unlocks it.
            if (ctx.state === 'suspended') void ctx.resume();
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
            osc.connect(gain).connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.32);
            // Deliberately do NOT close the context — it stays alive for the
            // next chime (a closed context would throw on createOscillator).
        } catch {
            // Audio is best-effort (autoplay policy may keep it silent until
            // the user has interacted with the page once).
        }
    }

    /** Open the notification window for the most recently notified device.
     * With several monitored devices, show a picker first so each device's
     * notifications can be opened independently. */
    private openWindow(): void {
        const devices = this.selectedDevices();
        if (devices.length === 0) return;
        const only = devices[0];
        if (devices.length === 1 && only) {
            this.openDeviceWindow(only.udid);
            return;
        }
        this.renderDevicePanel(devices);
    }

    private openDeviceWindow(udid: string): void {
        const tracker = this.tracker;
        const descriptor = tracker ? tracker.getDescriptorByUdid(udid) : undefined;
        const label = descriptor?.['ro.product.model'] || udid;
        // On the stream page there is no list tracker — fall back to the
        // page's own connection parameters.
        const host = tracker ? tracker.getConnectionHost() : undefined;
        const secure = host?.secure ?? location.protocol === 'https:';
        const hostname = host?.hostname || location.hostname;
        const port = host?.port ?? Number(location.port || (secure ? 443 : 80));
        const params: ParamsStreamScrcpy = {
            udid,
            player: '',
            action: ACTION.STREAM_SCRCPY,
            secure,
            hostname,
            port,
            pathname: host?.pathname ?? location.pathname,
        };
        this.markRead(udid);
        void import('./NotificationModal').then(({ NotificationModal }) => {
            new NotificationModal(udid, descriptor?.deviceKind, label, params);
        });
    }
}
