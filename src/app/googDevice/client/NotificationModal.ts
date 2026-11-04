import { t } from '../../client/i18n';
import { Modal } from '../../ui/Modal';
import { StreamClientScrcpy } from './StreamClientScrcpy';
import type { ParamsStreamScrcpy } from '../../../types/ParamsStreamScrcpy';
import { isMessagingPackage } from '../../../common/messaging';

const PACKAGES_PREFIX = 'ws_notify_pkgs_';
const POLL_INTERVAL_MS = 3000;

interface DeviceNotificationItem {
    key: string;
    package: string;
    title: string;
    text: string;
    category: string;
    time: number;
}

/**
 * Notification viewer + source-app picker (adb-polled, like Screen-Remote's
 * monitor). Polls only the apps the user selected, shows their notifications,
 * and offers a Reply entry on messaging-class notifications that opens the
 * device's connect flow.
 */
export class NotificationModal extends Modal {
    private readonly udid: string;
    private readonly params: ParamsStreamScrcpy;
    private readonly deviceKind: 'phone' | 'tablet' | 'tv' | undefined;
    private readonly label: string;
    private pollTimer: number | null = null;
    private appsCache: string[] | null = null;
    private appListWrap?: HTMLElement;
    private notifyListWrap?: HTMLElement;
    private redacted = false;

    constructor(
        udid: string,
        deviceKind: 'phone' | 'tablet' | 'tv' | undefined,
        label: string,
        params: ParamsStreamScrcpy,
    ) {
        super({ title: t('notifications_title') });
        this.dialog.classList.add('notification-modal');
        this.udid = udid;
        this.deviceKind = deviceKind;
        this.label = label;
        this.params = params;
        // Opening the window counts as reading: clear this device's unread badge.
        void import('./NotificationCenter').then(({ NotificationCenter }) => {
            NotificationCenter.getInstance().markRead(udid);
        });
        queueMicrotask(() => this.fillBody(this.bodyEl));
    }

    protected buildBody(_container: HTMLElement): void {
        // Rendered by fillBody() after super() completes.
    }

    private fillBody(container: HTMLElement): void {
        // ── Source-app picker ────────────────────────────────────────────
        const pickerRow = document.createElement('div');
        pickerRow.classList.add('notify-picker-row');

        const pickerBtn = document.createElement('button');
        pickerBtn.type = 'button';
        pickerBtn.className = 'modal-button';
        pickerBtn.textContent = t('notify_select_apps');
        pickerBtn.addEventListener('click', () => this.toggleAppPicker());
        pickerRow.appendChild(pickerBtn);

        const pickerCount = document.createElement('span');
        pickerCount.classList.add('notify-picker-count');
        pickerRow.appendChild(pickerCount);
        container.appendChild(pickerRow);

        const appListWrap = (this.appListWrap = document.createElement('div'));
        appListWrap.classList.add('notify-app-list');
        appListWrap.hidden = true;
        container.appendChild(appListWrap);

        // ── Notification list ────────────────────────────────────────────
        const listWrap = (this.notifyListWrap = document.createElement('div'));
        listWrap.classList.add('notify-list');
        listWrap.textContent = t('notify_loading');
        container.appendChild(listWrap);

        this.updatePickerCount();
        this.startPolling();
    }

    private selectedPackages(): string[] {
        const raw = localStorage.getItem(PACKAGES_PREFIX + this.udid);
        if (!raw) return [];
        return raw.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
    }

    private saveSelectedPackages(packages: string[]): void {
        localStorage.setItem(PACKAGES_PREFIX + this.udid, packages.join(','));
        this.updatePickerCount();
        // Re-evaluate the page badge: with apps selected the center starts
        // polling; with none left it clears stale unread counts.
        void import('./NotificationCenter').then(({ NotificationCenter }) => {
            NotificationCenter.getInstance().start();
        });
    }

    private updatePickerCount(): void {
        const countEl = this.bodyEl?.querySelector('.notify-picker-count') as HTMLElement | null;
        if (countEl) {
            const count = this.selectedPackages().length;
            countEl.textContent = count > 0 ? `${t('notify_selected_count')} ${count}` : t('notify_no_selected');
        }
    }

    private async toggleAppPicker(): Promise<void> {
        const wrap = this.appListWrap;
        if (!wrap) return;
        if (wrap.hidden) {
            wrap.hidden = false;
            if (!this.appsCache) {
                wrap.textContent = t('notify_loading');
                try {
                    const res = await fetch(`/api/devices/apps?udid=${encodeURIComponent(this.udid)}`);
                    const data = (await res.json()) as { packages?: string[] };
                    this.appsCache = data.packages || [];
                } catch {
                    this.appsCache = [];
                }
                this.renderAppPicker();
            } else {
                this.renderAppPicker();
            }
        } else {
            wrap.hidden = true;
        }
    }

    private renderAppPicker(): void {
        const wrap = this.appListWrap;
        if (!wrap) return;
        wrap.textContent = '';

        const apps = this.appsCache || [];
        if (apps.length === 0) {
            const empty = document.createElement('div');
            empty.classList.add('notify-empty');
            empty.textContent = t('notify_no_apps');
            wrap.appendChild(empty);
            return;
        }

        const search = document.createElement('input');
        search.type = 'search';
        search.placeholder = t('notify_search_apps');
        search.classList.add('input');
        wrap.appendChild(search);

        const selected = new Set(this.selectedPackages());
        const listEl = document.createElement('div');
        listEl.classList.add('notify-app-list-items');

        const renderItems = (filter: string): void => {
            listEl.textContent = '';
            const needle = filter.trim().toLowerCase();
            for (const pkg of apps) {
                if (needle && !pkg.toLowerCase().includes(needle)) continue;
                const row = document.createElement('label');
                row.classList.add('notify-app-item');

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = selected.has(pkg);
                checkbox.addEventListener('change', () => {
                    if (checkbox.checked) {
                        selected.add(pkg);
                    } else {
                        selected.delete(pkg);
                    }
                    this.saveSelectedPackages([...selected]);
                });

                const name = document.createElement('span');
                name.textContent = pkg;
                name.classList.add('notify-app-name');

                row.appendChild(checkbox);
                row.appendChild(name);
                listEl.appendChild(row);
            }
        };

        search.addEventListener('input', () => renderItems(search.value));
        renderItems('');
        wrap.appendChild(listEl);
    }

    private async startPolling(): Promise<void> {
        this.stopPolling();
        this.pollTimer = window.setInterval(() => void this.poll(), POLL_INTERVAL_MS);
        await this.poll();
    }

    private stopPolling(): void {
        if (this.pollTimer !== null) {
            window.clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    private async poll(): Promise<void> {
        if (!this.notifyListWrap) return;
        const packages = this.selectedPackages();
        if (packages.length === 0) {
            this.notifyListWrap.textContent = t('notify_no_selected_hint');
            return;
        }
        try {
            const query = `udid=${encodeURIComponent(this.udid)}&packages=${encodeURIComponent(packages.join(','))}`;
            const res = await fetch(`/api/devices/notifications?${query}`);
            const data = (await res.json()) as { notifications?: DeviceNotificationItem[]; redacted?: boolean };
            this.redacted = !!data.redacted;
            this.renderNotifications(data.notifications || []);
        } catch {
            if (this.notifyListWrap) this.notifyListWrap.textContent = t('notify_error');
        }
    }

    private renderNotifications(items: DeviceNotificationItem[]): void {
        const wrap = this.notifyListWrap;
        if (!wrap) return;
        wrap.textContent = '';

        if (this.redacted) {
            const hint = document.createElement('div');
            hint.classList.add('notify-redacted-hint');
            hint.textContent = t('notify_redacted');
            wrap.appendChild(hint);
        }

        if (items.length === 0) {
            const empty = document.createElement('div');
            empty.classList.add('notify-empty');
            empty.textContent = t('notify_no_notifications');
            wrap.appendChild(empty);
            return;
        }

        for (const item of items) {
            const card = document.createElement('div');
            card.classList.add('notify-card');

            const pkg = document.createElement('div');
            pkg.classList.add('notify-card-pkg');
            pkg.textContent = item.package;
            card.appendChild(pkg);

            if (item.title) {
                const title = document.createElement('div');
                title.classList.add('notify-card-title');
                title.textContent = item.title;
                card.appendChild(title);
            }
            if (item.text) {
                const text = document.createElement('div');
                text.classList.add('notify-card-text');
                text.textContent = item.text;
                card.appendChild(text);
            }
            if (item.time > 0) {
                const time = document.createElement('div');
                time.classList.add('notify-card-time');
                time.textContent = new Date(item.time).toLocaleTimeString();
                card.appendChild(time);
            }

            if (isMessagingPackage(item.package, item.category)) {
                const reply = document.createElement('button');
                reply.type = 'button';
                reply.classList.add('modal-button', 'notify-reply-btn');
                reply.textContent = t('notify_reply');
                reply.addEventListener('click', () => void this.reply(item.package));
                card.appendChild(reply);
            }

            wrap.appendChild(card);
        }
    }

    /** Reply: bring the messaging app to the foreground, then open the
     * device's connect flow so the user can answer from the remote screen. */
    private async reply(pkg: string): Promise<void> {
        try {
            await fetch('/api/devices/launch-app', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ udid: this.udid, package: pkg }),
            });
        } catch {
            // App launch is best-effort; the connection still opens.
        }
        this.stopPolling();
        const playerClass = StreamClientScrcpy.getPlayers()[0];
        if (!playerClass) return;
        const player = StreamClientScrcpy.createPlayer(playerClass.playerFullName, this.udid);
        if (!player) return;
        const videoSettings = player.getVideoSettings();
        const fitToScreen = playerClass.getFitToScreenStatus(this.udid);
        player.setVideoSettings(videoSettings, fitToScreen, false);
        const { ConnectModal } = await import('./ConnectModal');
        new ConnectModal(this.params, player, fitToScreen, videoSettings, this.label, this.deviceKind);
        this.close(true);
    }

    protected override onBeforeClose(): void {
        this.stopPolling();
    }
}
