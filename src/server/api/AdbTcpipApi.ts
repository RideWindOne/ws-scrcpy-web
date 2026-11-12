import type { IncomingMessage, ServerResponse } from 'http';
import { AdbClient } from '../AdbClient';
import { requireAdmin } from '../auth/requireAdmin';
import { Config } from '../Config';
import { Logger } from '../Logger';
import { isValidSerial } from '../security/deviceInput';
import { BodyTooLargeError, InvalidJsonError, readJsonBodyStrict, sendInternalError } from './utils';

const log = Logger.for('AdbTcpipApi');

/** Every route this handler owns lives under here. */
const PREFIX = '/api/devices/tcpip';

/**
 * adbd runs as the shell user, so it cannot take a privileged port; anything
 * below 1024 is rejected with a message that says so rather than handed to adb
 * to fail on.
 */
const MIN_PORT = 1024;
const MAX_PORT = 65535;

/**
 * The HTTP surface for putting an already-connected device's adbd into TCP
 * mode (`adb tcpip <port>`), the step right after wireless-debugging pairing
 * that makes the phone reachable at `ip:port`.
 *
 * REGISTRATION ORDER IS LOAD-BEARING, for the same reason as `PairingApi`:
 * `DeviceDiscoveryApi` claims ANY url starting `/api/devices` and answers 404
 * when none of its own routes match, so this handler has to be registered
 * before it — see `src/server/index.ts`.
 *
 * Admin-scoped: this survives across sessions (the port stays open on the
 * phone after the browser closes), so it is a persistent change to a trusted
 * device, not a per-viewer preference.
 */
export class AdbTcpipApi {
    /**
     * Lazy by default, mirroring `PairingApi`: resolving eagerly would build an
     * `AdbClient` (and read `Config`) at construction time. Tests pass their own
     * factory instead of mutating the singleton.
     */
    constructor(private readonly getAdb: () => AdbClient = () => new AdbClient(Config.getInstance().adbPath)) {}

    async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
        let pathname: string;
        try {
            pathname = new URL(req.url || '', 'http://localhost').pathname;
        } catch {
            return false; // unparseable target — not ours to answer
        }
        // Exact match only: `.../tcpip` is the whole route, and a prefix test
        // would also claim paths this handler has no answer for.
        if (pathname !== PREFIX) {
            return false;
        }

        res.setHeader('Content-Type', 'application/json');

        // Gate after the ownership check, before any route work, so a route
        // added later cannot land ungated while a foreign URL still falls
        // through with `false`.
        if (!requireAdmin(req, res)) {
            return true;
        }

        if (req.method !== 'POST') {
            res.writeHead(405);
            res.end(JSON.stringify({ error: 'use POST' }));
            return true;
        }

        let body: { udid?: unknown; port?: unknown };
        try {
            body = await readJsonBodyStrict<{ udid?: unknown; port?: unknown }>(req);
        } catch (e) {
            if (e instanceof BodyTooLargeError) {
                res.writeHead(413);
                res.end(JSON.stringify({ error: 'request too large' }));
                return true;
            }
            if (e instanceof InvalidJsonError) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'invalid JSON body' }));
                return true;
            }
            log.warn(`body read failed: ${(e as Error)?.name ?? 'unknown'}`);
            sendInternalError(res);
            return true;
        }

        // The serial is the device's own id, as the device list shows it. It is
        // allowlisted here and again inside `AdbClient.exec`, which is what
        // keeps a leading `-` from being read as an adb option.
        const udid = body.udid;
        if (!isValidSerial(udid)) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'udid must be the serial of the connected device' }));
            return true;
        }

        // `Number()` rather than `parseInt`: "5555abc" must not slip through as
        // 5555 when the operator meant to type something else.
        const rawPort = body.port;
        const port = typeof rawPort === 'number' ? rawPort : Number(String(rawPort ?? ''));
        if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
            res.writeHead(400);
            res.end(
                JSON.stringify({
                    error: `port must be an integer between ${MIN_PORT} and ${MAX_PORT}`,
                }),
            );
            return true;
        }

        try {
            // adb's own stdout ("restarting in TCP mode port: 5555") is what the
            // operator sees: it confirms the port the phone actually took, which
            // the request alone cannot.
            const output = await this.getAdb().tcpip(udid, port);
            log.info(`tcpip ${udid} -> ${port}`);
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, port, output }));
            return true;
        } catch (e) {
            // The error carries argv (serial and port only, nothing secret), but
            // its message is not a wire format. The UI gets the failure kind and
            // says the rest in its own words.
            const kind = (e as { kind?: string })?.kind ?? 'unknown';
            log.warn(`tcpip ${udid} -> ${port} failed: ${kind}`);
            res.writeHead(502);
            res.end(JSON.stringify({ error: 'adb tcpip failed', kind }));
            return true;
        }
    }
}
