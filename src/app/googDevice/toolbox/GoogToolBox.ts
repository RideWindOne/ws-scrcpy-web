import { CommandControlMessage } from '../../controlMessage/CommandControlMessage';
import { KeyCodeControlMessage } from '../../controlMessage/KeyCodeControlMessage';
import type { BasePlayer } from '../../player/BasePlayer';
import { ToolBox } from '../../toolbox/ToolBox';
import { ToolBoxButton } from '../../toolbox/ToolBoxButton';
import { ToolBoxCheckbox } from '../../toolbox/ToolBoxCheckbox';
import type { ToolBoxElement } from '../../toolbox/ToolBoxElement';
import SvgImage from '../../ui/SvgImage';
import KeyEvent from '../android/KeyEvent';
import type { StreamClientScrcpy } from '../client/StreamClientScrcpy';
import { t } from '../../client/i18n';
import { UnlockDialog } from './UnlockDialog';
import { EdgeZoneDialog } from './EdgeZoneDialog';

const BUTTONS = [
    {
        title: 'Power',
        code: KeyEvent.KEYCODE_POWER,
        icon: SvgImage.Icon.POWER,
    },
    {
        title: 'Volume up',
        code: KeyEvent.KEYCODE_VOLUME_UP,
        icon: SvgImage.Icon.VOLUME_UP,
    },
    {
        title: 'Volume down',
        code: KeyEvent.KEYCODE_VOLUME_DOWN,
        icon: SvgImage.Icon.VOLUME_DOWN,
    },
    {
        title: 'Back',
        code: KeyEvent.KEYCODE_BACK,
        icon: SvgImage.Icon.BACK,
    },
    {
        title: 'Home',
        code: KeyEvent.KEYCODE_HOME,
        icon: SvgImage.Icon.HOME,
    },
    {
        title: 'Overview',
        code: KeyEvent.KEYCODE_APP_SWITCH,
        icon: SvgImage.Icon.OVERVIEW,
    },
];

export class GoogToolBox extends ToolBox {
    protected constructor(list: ToolBoxElement<any>[]) {
        super(list);
    }

    public static createToolBox(
        udid: string,
        player: BasePlayer,
        client: StreamClientScrcpy,
        deviceKind?: 'phone' | 'tablet' | 'tv',
    ): GoogToolBox {
        const playerName = player.getName();
        const list = BUTTONS.slice();
        const handler = <K extends keyof HTMLElementEventMap, T extends HTMLElement>(
            type: K,
            element: ToolBoxElement<T>,
        ) => {
            if (!element.optional?.['code']) {
                return;
            }
            const { code } = element.optional;
            const action = type === 'mousedown' ? KeyEvent.ACTION_DOWN : KeyEvent.ACTION_UP;
            const event = new KeyCodeControlMessage(action, code, 0, 0);
            client.sendMessage(event);
        };
        const elements: ToolBoxElement<any>[] = list.map((item) => {
            const button = new ToolBoxButton(item.title, item.icon, {
                code: item.code,
            });
            button.addEventListener('mousedown', handler);
            button.addEventListener('mouseup', handler);
            return button;
        });
        if (player.supportsScreenshot) {
            const screenshot = new ToolBoxButton('Take screenshot', SvgImage.Icon.CAMERA);
            screenshot.addEventListener('click', () => {
                player.createScreenshot(client.getDeviceName());
            });
            elements.push(screenshot);
        }

        const keyboard = new ToolBoxCheckbox(
            'Capture keyboard',
            SvgImage.Icon.KEYBOARD,
            `capture_keyboard_${udid}_${playerName}`,
        );
        keyboard.getElement().checked = true;
        keyboard.addEventListener('click', (_, el) => {
            const element = el.getElement();
            client.setHandleKeyboardEvents(element.checked);
        });
        elements.push(keyboard);

        // Enter lock-screen password: works even when the lock screen is a
        // black surface on the stream (unrooted device), because it injects
        // over the scrcpy control channel and locates the pattern grid via the
        // uiautomator dump — the Screen-Remote approach.
        const unlock = new ToolBoxButton(t('unlock_title'), SvgImage.Icon.PATTERN_LOCK);
        unlock.addEventListener('click', () => {
            const screenInfo = player.getScreenInfo();
            const videoSize = screenInfo?.videoSize;
            if (!videoSize) {
                return;
            }
            new UnlockDialog(client, udid, videoSize, player.getParentElement());
        });
        elements.push(unlock);

        const uhid = new ToolBoxCheckbox(
            'UHID Input (keyboard + mouse)',
            SvgImage.Icon.KEYBOARD,
            `uhid_input_${udid}_${playerName}`,
        );
        uhid.addEventListener('click', (_, el) => {
            const element = el.getElement();
            client.toggleUhid(element.checked);
        });
        elements.push(uhid);

        const stats = new ToolBoxCheckbox(
            'Display quality stats',
            SvgImage.Icon.BAR_CHART,
            `quality_stats_${udid}_${playerName}`,
        );
        stats.addEventListener('click', (_, el) => {
            player.setShowQualityStats(el.getElement().checked);
        });
        elements.push(stats);

        // D-pad mode (default/unchecked) vs Touch mode (checked)
        const DPAD_TITLE = 'D-pad mode (click for Touch mode)';
        const TOUCH_TITLE = 'Touch mode (click for D-pad mode)';
        const inputMode = new ToolBoxCheckbox(
            DPAD_TITLE,
            { off: SvgImage.Icon.DPAD, on: SvgImage.Icon.TOUCH_HAND },
            `input_mode_${udid}_${playerName}`,
        );
        const inputModeLabel = inputMode.getAllElements()[1]!;

        // Seed default from deviceKind: phone/tablet → Touch; tv/undefined → D-pad.
        const startInTouch = deviceKind === 'phone' || deviceKind === 'tablet';
        if (startInTouch) {
            inputMode.getElement().checked = true;
            client.setDpadMode(false);
            inputModeLabel.title = TOUCH_TITLE;
        }

        inputMode.addEventListener('click', (_, el) => {
            const touchMode = el.getElement().checked;
            client.setDpadMode(!touchMode);
            inputModeLabel.title = touchMode ? TOUCH_TITLE : DPAD_TITLE;
        });
        elements.push(inputMode);

        const refresh = new ToolBoxButton('Refresh stream', SvgImage.Icon.REFRESH);
        refresh.addEventListener('click', () => {
            client.refreshStream();
        });
        elements.push(refresh);

        const disconnect = new ToolBoxButton('Disconnect', SvgImage.Icon.CANCEL);
        disconnect.addEventListener('click', () => {
            client.stopStream();
        });
        // Added last, on top of the list (see the unshifts at the end).

        let screenOn = true;
        const powerScreen = new ToolBoxButton('Turn screen off', SvgImage.Icon.SCREEN_OFF);
        powerScreen.addEventListener('click', () => {
            screenOn = !screenOn;
            const msg = CommandControlMessage.createSetScreenPowerModeCommand(screenOn);
            client.sendMessage(msg);
            powerScreen.getElement().title = screenOn ? 'Turn screen off' : 'Turn screen on';
        });
        elements.push(powerScreen);

        // GET: copy the device's selection to the host clipboard. This is what
        // upstream scrcpy sends for its MOD+c shortcut (input_manager.c,
        // SC_COPY_KEY_COPY; MOD is scrcpy's shortcut modifier, and a plain
        // Ctrl+C is forwarded to the device as keys): the device presses COPY
        // on its current selection, and the clipboard autosync we leave on
        // carries the new text back as a CLIPBOARD device message. With
        // copy_key NONE the device stays silent while autosync is on
        // (Controller.getClipboard only replies when it is off), so the button
        // did nothing at all.
        //
        // It still does nothing when there is no selection, and on Android 5
        // and 6: the server injects KEYCODE_COPY only from Android 7 (API 24),
        // and with autosync on it sends no reply of its own.
        const clipGet = new ToolBoxButton('copy device selection to host clipboard', SvgImage.Icon.CLIPBOARD_GET);
        clipGet.addEventListener('click', () => {
            client.sendMessage(CommandControlMessage.createGetClipboardCommand(CommandControlMessage.COPY_KEY_COPY));
        });
        elements.push(clipGet);

        // SET: push host clipboard to device
        const clipSet = new ToolBoxButton('push host clipboard to device', SvgImage.Icon.CLIPBOARD_SET);
        clipSet.addEventListener('click', async () => {
            if (!navigator.clipboard?.readText) {
                console.error('[GoogToolBox] navigator.clipboard.readText unavailable');
                return;
            }
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    client.sendMessage(CommandControlMessage.createSetClipboardCommand(text));
                }
            } catch (err) {
                console.error('[GoogToolBox] clipboard read failed:', err);
            }
        });
        elements.push(clipSet);

        const fullscreen = new ToolBoxButton('Toggle fullscreen', SvgImage.Icon.FULLSCREEN);
        /** The element that owns the stream (the .device-view wrapper). */
        const streamHost = (): HTMLElement => {
            let target: HTMLElement | null = player.getTouchableElement();
            while (target && !target.classList?.contains('device-view')) {
                target = target.parentElement;
            }
            return target ?? document.body;
        };
        /**
         * Mobile browsers keep the fullscreen frame at the pre-fullscreen size
         * unless the stream containers are stretched explicitly.
         */
        const fitFullscreenFrame = (target: HTMLElement): void => {
            const videoContainer = target.querySelector('.video') as HTMLElement | null;
            if (videoContainer) {
                videoContainer.style.width = '100%';
                videoContainer.style.height = '100%';
            }
            const videoLayer = target.querySelector('.video-layer') as HTMLElement | null;
            if (videoLayer) {
                videoLayer.style.maxWidth = '100%';
                videoLayer.style.maxHeight = '100%';
            }
            setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
        };
        fullscreen.addEventListener('click', () => {
            const target = streamHost();
            if (document.fullscreenElement) {
                document.exitFullscreen();
                setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
            } else {
                target.requestFullscreen().then(() => {
                    // 通过 UA 识别移动端：移动端手动撑满容器，桌面端保持“之前”的原生全屏行为
                    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
                        navigator.userAgent
                    );
                    document.body.dataset['uaMobile'] = isMobile ? 'true' : 'false';
                    if (!isMobile) {
                        setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
                        return;
                    }
                    fitFullscreenFrame(target);
                }).catch((err) => {
                    console.error('[GoogToolBox] fullscreen request failed:', err);
                });
            }
        });

        // Landscape view: phones in portrait show a landscape device in a tiny
        // strip, and the usual workaround is enabling the phone's auto-rotate.
        // This button enters fullscreen and asks the browser to lock the
        // orientation, so the stream fills the screen without touching any
        // device setting. Tapping it again unlocks and leaves fullscreen.
        const landscape = new ToolBoxButton(t('rotate_landscape'), SvgImage.Icon.ROTATE_SCREEN);
        landscape.getElement().title = t('rotate_landscape_hint');
        landscape.addEventListener('click', () => {
            // Orientation lock/unlock are not in every TS lib.dom build, so use
            // a local shape instead of casting ScreenOrientation around.
            const orientation = window.screen.orientation as unknown as
                | { lock?: (o: string) => Promise<void>; unlock?: () => void }
                | undefined;
            const unlock = (): void => {
                try {
                    orientation?.unlock?.();
                } catch {
                    // unlock is not supported / not locked
                }
            };

            if (document.fullscreenElement) {
                unlock();
                void document.exitFullscreen().catch(() => {});
                setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
                return;
            }
            const target = streamHost();
            const request = target.requestFullscreen?.();
            if (!request) {
                // iOS Safari cannot fullscreen a container, so nothing to lock.
                landscape.getElement().title = t('rotate_landscape_unsupported');
                return;
            }
            request
                .then(async () => {
                    // Same mobile fullscreen CSS contract the fullscreen button
                    // relies on (body[data-ua-mobile="true"] .device-view:fullscreen).
                    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
                        navigator.userAgent
                    );
                    document.body.dataset['uaMobile'] = isMobile ? 'true' : 'false';
                    fitFullscreenFrame(target);
                    if (!orientation || typeof orientation.lock !== 'function') {
                        landscape.getElement().title = t('rotate_landscape_unsupported');
                        return;
                    }
                    try {
                        await orientation.lock('landscape');
                    } catch {
                        // Some browsers refuse the lock outside a video-only or
                        // otherwise restricted fullscreen context.
                        landscape.getElement().title = t('rotate_landscape_unsupported');
                    }
                    setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
                })
                .catch((err) => {
                    console.error('[GoogToolBox] landscape request failed:', err);
                });
        });
        // Settings for the fullscreen edge strip: side, length, thickness.
        const edgeZone = new ToolBoxButton(t('edge_zone_button'), SvgImage.Icon.SETTINGS);
        edgeZone.addEventListener('click', () => {
            new EdgeZoneDialog();
        });
        elements.push(edgeZone);

        // 放到最前面（横屏按钮紧随全屏）
        elements.unshift(fullscreen);
        elements.unshift(landscape);
        // Close/disconnect goes on top: in fullscreen the toolbox column is
        // centred vertically, and the way out must be the easiest to find.
        elements.unshift(disconnect);

        return new GoogToolBox(elements);
    }
}
