import type { IncomingMessage, ServerResponse } from 'http';
import { AdbClient, parseSerialFromMdnsName } from '../AdbClient';
import { resolveUserId } from '../auth/currentUser';
import { Config } from '../Config';
import { parseScreenState, SCREEN_STATE_COMMAND } from '../deviceScreenState';
import {
    NOTIFICATION_COMMAND_NOREDACT,
    NOTIFICATION_COMMAND_REDACT,
    parseDeviceNotifications,
    parsePackageList,
} from '../deviceNotifications';
import { Logger } from '../Logger';
import { lookupIpv4 } from '../network/lookupIpv4';
import { resolveMac } from '../network/MacResolver';
import { detectSubnet } from '../network/SubnetDetector';
import { hostOf, isProbeAddressSerial, scanAddressFor } from '../network/scanIdentity';
import { assertDeletablePaths, isConnectAddress, shArg } from '../security/deviceInput';
import { inContainer } from './containerGuard';
import { upsertObservedDevices } from './deviceObserved';
import { applyPendingLabels, forgetPendingLabels, rememberPendingLabel, serialReadOn } from './pendingLabels';
import { BodyTooLargeError, InvalidJsonError, readJsonBodyStrict, sendInternalError } from './utils';

const log = Logger.for('DeviceDiscoveryApi');

export type DisconnectOutcome = { status: number; success: boolean; message: string };

/**
 * adb prints `disconnected <addr>` when it tore a connection down, and
 * `error: no such device '<addr>'` when the address was not connected in the
 * first place. Only the first used to count as success, so a disconnect whose
 * outcome was already true answered 500 — a caller could not tell a real
 * failure from a cleanup or arrange step running against an already-clean
 * state. Treat "not connected" as the no-op it is and answer 200, mirroring
 * how connect already treats "already connected" as success.
 */
export function classifyDisconnectResult(result: string): DisconnectOutcome {
    const message = result.trim();
    if (message.includes('disconnected')) return { status: 200, success: true, message };
    if (/no such device/i.test(message)) return { status: 200, success: true, message: 'not connected' };
    return { status: 500, success: false, message };
}

export class DeviceDiscoveryApi {
    private adbClient: AdbClient;

    constructor() {
        this.adbClient = new AdbClient(Config.getInstance().adbPath);
    }

    async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
        const url = req.url || '';
        if (!url.startsWith('/api/devices')) return false;

        res.setHeader('Content-Type', 'application/json');

        try {
            if (req.method === 'POST' && url === '/api/devices/scan') {
                const discovered = await this.adbClient.mdnsServices();
                const connectable = discovered.filter(
                    (d) => d.service.includes('_adb') && !d.service.includes('pairing'),
                );
                const connected = await this.adbClient.devices();
                const connectedAddresses = new Set(connected.map((d) => d.serial));
                const db = Config.getInstance().db;
                const userId = resolveUserId(req);
                const available = connectable
                    .filter((d) => {
                        const addr = `${d.address}:${d.port}`;
                        return !connectedAddresses.has(addr);
                    })
                    .map((d) => {
                        const serial = parseSerialFromMdnsName(d.name, d.service);
                        // Enrich with the remembered model from a prior observation
                        // (read before the sighting upsert below).
                        const observed = db.devices.getDevice(serial);
                        return {
                            ...d,
                            serial,
                            label: db.devices.getLabel(userId, serial) || '',
                            model: observed?.model ?? null,
                        };
                    });
                // Record this sighting in the shared observed table.
                upsertObservedDevices(
                    db,
                    available.map((d) => ({
                        serial: d.serial,
                        address: `${d.address}:${d.port}`,
                        lastSeenAt: Date.now(),
                    })),
                );
                res.writeHead(200);
                res.end(JSON.stringify(available));
                return true;
            }

            if (req.method === 'GET' && url === '/api/devices/scan/subnet') {
                // In a container the only interface is docker's (172.17.0.0/16 on
                // the default bridge: 65,534 hosts and never the user's phones), and
                // the image has no `ip` to ask for a gateway. Say so instead of
                // proposing it; the scan dialog then asks for the LAN subnet
                // (item 11, row 20.20).
                if (inContainer()) {
                    res.writeHead(200);
                    res.end(JSON.stringify({ container: true }));
                    return true;
                }
                const detected = await detectSubnet();
                res.writeHead(200);
                res.end(JSON.stringify(detected));
                return true;
            }

            if (req.method === 'POST' && url === '/api/devices/connect') {
                const { address, serial, label } = await readJsonBodyStrict<{
                    address?: string;
                    serial?: string;
                    label?: string;
                }>(req);
                if (!address) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'address is required' }));
                    return true;
                }
                // `address` reaches adb as an argv element of `adb connect`, and
                // below as the device selector for `adb shell <address>`. Until
                // this check existed the presence test above was the only gate,
                // so a leading '-' went straight through — `-H` points adb at
                // another server entirely. The message deliberately does not
                // echo the input: it is attacker-controlled and would land in
                // the caller's DOM.
                //
                // THE ADMIN GATE, decided rather than overlooked (2026-09-18):
                // this route stays UNGATED while the neighbouring
                // `/api/devices/pair/*` routes sit behind `requireAdmin`. The
                // asymmetry IS the decision. Pairing establishes a PERSISTENT
                // trust relationship with a NEW device on behalf of the whole
                // server; connect only attaches to a device the server already
                // trusts, which is ordinary day-to-day use. See the matching
                // note in `PairingApi.handle` — one story, told from both sides.
                if (!isConnectAddress(address)) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'address must be a host or host:port' }));
                    return true;
                }
                const db = Config.getInstance().db;
                const userId = resolveUserId(req);
                // A subnet-scan (TCP-probe) hit posts its probe address as
                // `serial`. That is not the device's identity: the card reads
                // labels by `ro.serialno`, so it is looked up below instead
                // (row 19.5). Only a real serial (an mDNS hit's) is trusted.
                const knownSerial = serial && !isProbeAddressSerial(serial, address) ? serial : undefined;
                // mDNS path: serial is known upfront, save the label before connecting.
                if (knownSerial && label) {
                    db.devices.setLabel(userId, knownSerial, label);
                }
                const result = await this.adbClient.connect(address);
                const success = result.includes('connected');
                log.info(`connect ${address} → ${success ? 'OK' : 'FAIL'}: ${result.trim().replace(/\s+/g, ' ')}`);
                if (success) {
                    // Persist the label under the device's real serial AND its MAC.
                    // Storing under both keys lets future scans (which may only have
                    // MAC from ARP — no serial without racing adb) still rehydrate
                    // the label.
                    //
                    // Every connect, named or not, also records the address the
                    // device answered at against its real serial. A rescan hit
                    // carries only that address (and, off a container, a MAC), so
                    // this is the join that lets it read the serial's CURRENT
                    // label, including a rename made later on the card (rows
                    // 19.4 and 19.5).
                    //
                    // The MAC is recorded against the serial too, so a rename or
                    // clear on the card can keep the MAC copy in step.
                    //
                    // A device still unauthorized, or slow, fails or answers
                    // empty to the serial lookup. A typed name is then held
                    // against the transport (`pendingLabels`) and filed under the
                    // serial once the device tracker or a later connect learns
                    // it, rather than under the address, which would go stale.
                    try {
                        let realSerial = knownSerial;
                        if (!realSerial) {
                            const lookedUp = (
                                await this.adbClient.shell(address, 'getprop ro.serialno').catch(() => '')
                            ).trim();
                            if (lookedUp) realSerial = lookedUp;
                        }
                        const ip = hostOf(address);
                        // No MAC in a container: `ip neigh` is not in the image, and
                        // through docker's NAT it could not see a LAN device anyway.
                        const mac = (label || realSerial) && !inContainer() ? await resolveMac(ip) : null;
                        const scanAddress = await scanAddressFor(address, lookupIpv4);
                        // The device tracker may have read the serial while the
                        // lookups above were awaited. Asked after the last await,
                        // so its read cannot land between this check and the hold.
                        realSerial ??= serialReadOn(address);
                        if (realSerial) {
                            // A name held from an earlier connect first, so one typed now wins.
                            applyPendingLabels(db, address, realSerial);
                            if (label) db.devices.setLabel(userId, realSerial, label);
                            db.devices.claimAddress(realSerial, scanAddress, Date.now());
                            if (mac) db.devices.recordMac(realSerial, mac);
                        } else if (label) {
                            rememberPendingLabel(address, userId, { label, mac, scanAddress });
                        }
                        if (label && mac) {
                            db.devices.setLabel(userId, mac, label);
                        }
                    } catch {
                        // Serial or MAC lookup failed — partial persist is OK;
                        // user can edit label later from the card.
                    }
                }
                res.writeHead(success ? 200 : 500);
                res.end(JSON.stringify({ success, message: result.trim() }));
                return true;
            }

            if (req.method === 'POST' && url === '/api/devices/disconnect') {
                const { address } = await readJsonBodyStrict<{ address?: string }>(req);
                if (!address) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'address is required' }));
                    return true;
                }
                // Same hazard as `/connect` above, same shape: this value is an
                // argv element of `adb disconnect`. Validated here too rather
                // than left as the one unguarded neighbour of the route that
                // prompted the check.
                if (!isConnectAddress(address)) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'address must be a host or host:port' }));
                    return true;
                }
                const result = await this.adbClient.disconnect(address);
                const outcome = classifyDisconnectResult(result);
                if (outcome.success) forgetPendingLabels(address);
                res.writeHead(outcome.status);
                res.end(JSON.stringify({ success: outcome.success, message: outcome.message }));
                return true;
            }

            if (req.method === 'GET' && url.startsWith('/api/devices/screen-state')) {
                const parsedUrl = new URL(url, `http://${req.headers.host}`);
                const udid = parsedUrl.searchParams.get('udid');
                if (!udid) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'udid is required' }));
                    return true;
                }
                // Also reports `locked`: while the keyguard is up Android hands
                // scrcpy a black surface, so a locked phone is otherwise
                // indistinguishable from a broken stream (see issue #498).
                const output = await this.adbClient.shell(udid, SCREEN_STATE_COMMAND);
                res.writeHead(200);
                res.end(JSON.stringify(parseScreenState(output)));
                return true;
            }

            if (req.method === 'POST' && url === '/api/devices/sleep-wake') {
                const { udid, action } = await readJsonBodyStrict<{ udid?: string; action?: string }>(req);
                if (!udid || !action) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'udid and action are required' }));
                    return true;
                }
                const keyevent = action === 'sleep' ? 223 : 224;
                await this.adbClient.shell(udid, `input keyevent ${keyevent}`);
                // Re-check state after a brief delay for the device to respond
                await new Promise((r) => setTimeout(r, 500));
                const output = await this.adbClient.shell(udid, 'dumpsys power 2>/dev/null | grep mWakefulness');
                const awake = output.includes('Awake');
                res.writeHead(200);
                res.end(JSON.stringify({ awake }));
                return true;
            }

            if (req.method === 'POST' && url === '/api/devices/input-text') {
                const { udid, text, enter } = await readJsonBodyStrict<{ udid?: string; text?: string; enter?: boolean }>(req);
                if (!udid || !text) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'udid and text are required' }));
                    return true;
                }
                // Escape single quotes for shell safety
                const escapedText = text.replace(/'/g, `'\\''`);
                await this.adbClient.shell(udid, `input text '${escapedText}'`);
                // Press enter if requested
                if (enter) {
                    await new Promise((r) => setTimeout(r, 200));
                    await this.adbClient.shell(udid, 'input keyevent 66'); // KEYCODE_ENTER
                }
                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
                return true;
            }

            if (req.method === 'POST' && url === '/api/devices/input-swipe') {
                const { udid, x1, y1, x2, y2, duration } = await readJsonBodyStrict<{ 
                    udid?: string; 
                    x1?: number; 
                    y1?: number; 
                    x2?: number; 
                    y2?: number; 
                    duration?: number 
                }>(req);
                if (!udid || x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'udid, x1, y1, x2, y2 are required' }));
                    return true;
                }
                const dur = duration || 300;
                await this.adbClient.shell(udid, `input swipe ${x1} ${y1} ${x2} ${y2} ${dur}`);
                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
                return true;
            }

            if (req.method === 'POST' && url === '/api/devices/input-tap') {
                const { udid, x, y } = await readJsonBodyStrict<{ udid?: string; x?: number; y?: number }>(req);
                if (!udid || x === undefined || y === undefined) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'udid, x, y are required' }));
                    return true;
                }
                await this.adbClient.shell(udid, `input tap ${x} ${y}`);
                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
                return true;
            }

            if (req.method === 'POST' && url === '/api/devices/launch-app') {
                const { udid, package: pkg } = await readJsonBodyStrict<{ udid?: string; package?: string }>(req);
                if (!udid || !pkg) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'udid and package are required' }));
                    return true;
                }
                if (!/^[a-zA-Z0-9._-]+$/.test(pkg)) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'invalid package name' }));
                    return true;
                }
                // monkey launches the package's launcher activity without us
                // having to resolve a specific activity component.
                const output = await this.adbClient.shell(udid, `monkey -p ${pkg} -c android.intent.category.LAUNCHER 1 2>/dev/null`);
                const ok = /Events injected:\s*1/.test(output) || output.includes('injected: 1');
                res.writeHead(200);
                res.end(JSON.stringify({ success: ok }));
                return true;
            }

            if (req.method === 'GET' && url.startsWith('/api/devices/apps')) {
                const parsedUrl = new URL(url, `http://${req.headers.host}`);
                const udid = parsedUrl.searchParams.get('udid');
                if (!udid) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'udid is required' }));
                    return true;
                }
                // Third-party packages only: system packages are never picked as
                // notification sources in the UI.
                const output = await this.adbClient.shell(udid, 'pm list packages -3 2>/dev/null');
                const packages = parsePackageList(output);
                res.writeHead(200);
                res.end(JSON.stringify({ packages }));
                return true;
            }

            if (req.method === 'GET' && url.startsWith('/api/devices/notifications')) {
                const parsedUrl = new URL(url, `http://${req.headers.host}`);
                const udid = parsedUrl.searchParams.get('udid');
                const packages = (parsedUrl.searchParams.get('packages') || '')
                    .split(',')
                    .map((p) => p.trim())
                    .filter((p) => p.length > 0);
                if (!udid) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'udid is required' }));
                    return true;
                }
                try {
                    let output = await this.adbClient.shell(udid, NOTIFICATION_COMMAND_NOREDACT);
                    let redacted = false;
                    // --noredact is refused on some stock builds; the dump then
                    // contains no NotificationRecord lines. Fall back to the
                    // redacted dump (titles usually survive, bodies may not).
                    if (!output.includes('NotificationRecord(')) {
                        output = await this.adbClient.shell(udid, NOTIFICATION_COMMAND_REDACT);
                        redacted = true;
                    }
                    const notifications = parseDeviceNotifications(output, packages);
                    res.writeHead(200);
                    res.end(JSON.stringify({ notifications, redacted }));
                    return true;
                } catch (e) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: (e as Error).message }));
                    return true;
                }
            }

            if (req.method === 'GET' && url.startsWith('/api/devices/ui-hierarchy')) {                const parsedUrl = new URL(url, `http://${req.headers.host}`);
                const udid = parsedUrl.searchParams.get('udid');
                if (!udid) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'udid is required' }));
                    return true;
                }
                // Dump the UI hierarchy. Some devices take longer than 500 ms to
                // write the file, and a failed dump must not be returned as a
                // "successful" non-XML body (the client would only see an empty
                // detection). Retry the cat until real <hierarchy> XML shows up,
                // and surface the adb error text when it never does.
                try {
                    await this.adbClient.shell(udid, 'uiautomator dump /sdcard/window_dump.xml');
                } catch (e) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: `uiautomator dump failed: ${(e as Error).message}` }));
                    return true;
                }
                let xml = '';
                for (let attempt = 0; attempt < 5; attempt++) {
                    await new Promise((r) => setTimeout(r, 600));
                    try {
                        xml = await this.adbClient.shell(udid, 'cat /sdcard/window_dump.xml');
                    } catch (e) {
                        xml = '';
                    }
                    if (xml.includes('<hierarchy')) break;
                }
                if (!xml.includes('<hierarchy')) {
                    res.writeHead(500);
                    res.end(
                        JSON.stringify({
                            error: 'ui hierarchy dump produced no valid XML',
                            detail: xml.slice(0, 300),
                        }),
                    );
                    return true;
                }
                res.writeHead(200, { 'Content-Type': 'application/xml' });
                res.end(xml);
                return true;
            }

            if (req.method === 'GET' && url === '/api/devices/labels') {
                const labels = Config.getInstance().db.devices.getAllLabels(resolveUserId(req));
                res.writeHead(200);
                res.end(JSON.stringify(labels));
                return true;
            }

            if (req.method === 'PUT' && url === '/api/devices/labels') {
                const { serial, label } = await readJsonBodyStrict<{ serial?: string; label?: string }>(req);
                if (!serial) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'serial is required' }));
                    return true;
                }
                const db = Config.getInstance().db;
                const userId = resolveUserId(req);
                // The copy a connect filed under the device's MAC follows the
                // serial: left alone, a rescan that reaches the device by MAC
                // would bring a cleared or old name back (row 19.5 follow-up).
                const mac = db.devices.getMac(serial);
                for (const key of mac ? [serial, mac] : [serial]) {
                    if (label) {
                        db.devices.setLabel(userId, key, label);
                    } else {
                        db.devices.deleteLabel(userId, key);
                    }
                }
                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
                return true;
            }

            if (req.method === 'POST' && url === '/api/devices/files/delete') {
                const { udid, paths } = await readJsonBodyStrict<{ udid?: string; paths?: unknown }>(req);
                if (!udid) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'udid is required' }));
                    return true;
                }
                let safePaths: string[];
                try {
                    // Bound + validate the targets before any privileged delete:
                    // refuses unbounded lists, traversal, and catastrophic roots
                    // (/sdcard, /data, …). udid is serial-checked by adbClient.
                    safePaths = assertDeletablePaths(paths);
                } catch (e) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: (e as Error).message }));
                    return true;
                }
                const errors: { path: string; error: string }[] = [];
                for (const filePath of safePaths) {
                    try {
                        await this.adbClient.shell(udid, `rm -rf ${shArg(filePath)}`);
                    } catch (err) {
                        errors.push({ path: filePath, error: (err as Error).message });
                    }
                }
                const success = errors.length === 0;
                res.writeHead(success ? 200 : 207);
                res.end(JSON.stringify({ success, errors: errors.length > 0 ? errors : undefined }));
                return true;
            }

            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
            return true;
        } catch (err: any) {
            if (err instanceof BodyTooLargeError) {
                res.writeHead(413);
                res.end(JSON.stringify({ error: 'request body too large' }));
                return true;
            }
            if (err instanceof InvalidJsonError) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'invalid JSON body' }));
                return true;
            }
            log.error(`${req.method} ${req.url} threw: ${err?.message ?? String(err)}`);
            sendInternalError(res);
            return true;
        }
    }
}
