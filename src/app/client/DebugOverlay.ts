import { t } from './i18n';

/**
 * DebugOverlay — page-visible debug log overlay for diagnosing browsers that
 * cannot open DevTools (e.g. the WebView embedded in the fnOS client).
 *
 * Why this exists:
 *   When the bundled JS fails on an old engine — a SyntaxError on ES2020
 *   syntax, or a runtime API that is missing — the page silently half-works:
 *   no devices listed, "add device" does nothing. Console is unavailable in
 *   the embedded WebView, so the ONLY way to see what happened is to print it
 *   onto the page itself. This overlay:
 *     - catches window 'error' + 'unhandledrejection' and shows them,
 *     - exposes a global `dbg()` for step-by-step instrumentation,
 *     - renders the last N entries in a fixed corner panel,
 *     - never throws (a broken debugger must not break the app further).
 *
 * Deliberately written in conservative syntax (ES2017 after compilation):
 * no optional chaining, no nullish coalescing, no class fields.
 */

interface DebugEntry {
    level: 'info' | 'warn' | 'error';
    msg: string;
    time: string;
}

// Injected by webpack DefinePlugin (see webpack/ws-scrcpy-web.common.ts).
declare const __WSSCRCPY_VERSION__: string;
declare const __BUILD_TIME__: string;

const MAX_ENTRIES = 60;

// --- Polyfill for ES2023 "explicit resource management" ----------------------
// swc keeps `using` declarations / Symbol.dispose references in the ES2022
// build. WebViews older than Chromium 121 (e.g. the fnOS client's embedded
// browser) do not define Symbol.dispose, so the first `using` in the app
// throws "Symbol.dispose is not defined" and kills the page after boot.
// Defining them as ordinary symbols (when absent) is all the `using`
// machinery needs; this MUST run before any app code uses `using`.
function installDisposePolyfill(): void {
    try {
        const sym = Symbol as unknown as {
            dispose?: symbol;
            asyncDispose?: symbol;
        };
        if (typeof sym.dispose === 'undefined') {
            sym.dispose = Symbol('Symbol.dispose');
        }
        if (typeof sym.asyncDispose === 'undefined') {
            sym.asyncDispose = Symbol('Symbol.asyncDispose');
        }
    } catch {
        // Never throw from the installer itself.
    }
}
installDisposePolyfill();

let overlayEl: HTMLDivElement | null = null;
let logListEl: HTMLUListElement | null = null;
let hidden = false;
let entries: DebugEntry[] = [];
// Overlay visibility. Defaults to HIDDEN; the Settings toggle (global setting
// `debugOverlay`) flips it and the value survives page reloads.
let visible = false;

function pad(n: number): string {
    return n < 10 ? '0' + n : String(n);
}

function stamp(): string {
    const d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

function colorFor(level: DebugEntry['level']): string {
    if (level === 'error') return '#ff6b6b';
    if (level === 'warn') return '#ffa94d';
    return '#69db7c';
}

/** Log a step. Safe to call from anywhere; never throws. */
export function dbg(msg: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    try {
        const entry: DebugEntry = { level, msg, time: stamp() };
        entries.push(entry);
        if (entries.length > MAX_ENTRIES) {
            entries.shift();
        }
        if (logListEl) {
            const li = document.createElement('li');
            li.textContent = '[' + entry.time + '] ' + msg;
            li.style.color = colorFor(level);
            logListEl.appendChild(li);
            while (logListEl.childNodes.length > MAX_ENTRIES) {
                const first = logListEl.firstChild;
                if (first) logListEl.removeChild(first);
            }
        }
        // Also mirror to console when it exists (harmless if not).
        if (level === 'error') {
            // eslint-disable-next-line no-console
            console.error('[dbg]', msg);
        } else if (level === 'warn') {
            // eslint-disable-next-line no-console
            console.warn('[dbg]', msg);
        } else {
            // eslint-disable-next-line no-console
            console.log('[dbg]', msg);
        }
    } catch {
        // The debugger must never break the app.
    }
}

/** Install the corner overlay + global error capture. Call once, early. */
export function installDebugOverlay(): void {
    try {
        // Capture uncaught errors/rejections first, before any DOM work.
        window.addEventListener('error', (e) => {
            let detail = 'window.onerror';
            const ev = e as ErrorEvent;
            if (ev && ev.message) detail = detail + ': ' + ev.message;
            if (ev && ev.filename) detail = detail + ' @ ' + ev.filename + ':' + (ev.lineno || 0);
            dbg(detail, 'error');
        });
        window.addEventListener('unhandledrejection', (e) => {
            let detail = 'unhandledrejection';
            const reason = (e as unknown as { reason?: unknown }).reason;
            if (reason) {
                const msg =
                    typeof reason === 'object' && reason !== null && typeof (reason as { message?: unknown }).message === 'string'
                        ? (reason as { message: string }).message
                        : String(reason);
                detail = detail + ': ' + msg;
            }
            dbg(detail, 'error');
        });

        overlayEl = document.createElement('div');
        overlayEl.setAttribute('data-dbg-overlay', '1');
        overlayEl.style.cssText =
            'position:fixed;right:8px;bottom:8px;z-index:2147483647;width:360px;max-height:240px;' +
            'background:rgba(0,0,0,0.85);color:#eee;font:11px/1.5 Menlo,Consolas,monospace;' +
            'border:1px solid #666;border-radius:6px;padding:6px;overflow:hidden;';

        const header = document.createElement('div');
        header.textContent =
            '🐞 ws-scrcpy 调试日志 v' +
            __WSSCRCPY_VERSION__ +
            ' @ ' +
            __BUILD_TIME__ +
            '（点击收起/展开）';
        header.style.cssText =
            'font-weight:bold;padding:2px 4px 4px;border-bottom:1px solid #555;cursor:pointer;user-select:none;';
        header.addEventListener('click', () => {
            hidden = !hidden;
            if (logListEl) {
                logListEl.style.display = hidden ? 'none' : 'block';
            }
        });

        // Show the page URL the overlay is running on — for diagnosing cases
        // where the WebView's proxy/VPN rewrites the Host (403 vs OK differs
        // between browsers on the same page).
        const urlLine = document.createElement('div');
        urlLine.textContent = t('debug_url') + (typeof location !== 'undefined' ? location.href : '(no location)');
        urlLine.style.cssText =
            'padding:2px 4px;border-bottom:1px solid #555;word-break:break-all;color:#9cf;';
        overlayEl.appendChild(urlLine);

        logListEl = document.createElement('ul');
        logListEl.style.cssText =
            'margin:4px 0 0;padding:0;list-style:none;max-height:185px;overflow-y:auto;word-break:break-all;';

        overlayEl.appendChild(header);
        overlayEl.appendChild(urlLine);
        overlayEl.appendChild(logListEl);

        // Prepend existing entries that were logged before DOM was ready.
        if (entries.length > 0) {
            for (const entry of entries) {
                const li = document.createElement('li');
                li.textContent = '[' + entry.time + '] ' + entry.msg;
                li.style.color = colorFor(entry.level);
                logListEl.appendChild(li);
            }
        }

        const attach = (): void => {
            if (document.body && !document.body.contains(overlayEl as Node)) {
                document.body.appendChild(overlayEl as Node);
            }
        };
        if (document.body) {
            attach();
        } else {
            document.addEventListener('DOMContentLoaded', attach);
        }

        dbg('调试浮层已安装 v1');
        // Apply any visibility flag recorded before the overlay existed.
        if (!visible) {
            overlayEl.style.display = 'none';
        }
    } catch {
        // Never throw from the installer itself.
    }
}

/**
 * Show/hide the debug overlay. Safe to call before installDebugOverlay() ran:
 * the flag is recorded and applied on install. Errors are swallowed — a broken
 * toggle must never break the app.
 */
export function setDebugOverlayVisible(enabled: boolean): void {
    try {
        visible = !!enabled;
        if (overlayEl) {
            overlayEl.style.display = visible ? '' : 'none';
        }
    } catch {
        // noop
    }
}

/** Whether the overlay is currently visible (for building the settings toggle). */
export function isDebugOverlayVisible(): boolean {
    return visible;
}

/** Try to expose dbg() on window so a DevTools-less page can call it. */
export function exposeGlobalDebug(): void {
    try {
        const w = window as unknown as { dbg?: (m: string, l?: 'info' | 'warn' | 'error') => void };
        if (!w.dbg) {
            w.dbg = (m, l) => dbg(m, l);
        }
    } catch {
        // noop
    }
}
