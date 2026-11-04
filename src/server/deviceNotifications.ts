/**
 * Active-device notifications, read through `dumpsys notification`.
 *
 * This mirrors how Screen-Remote polls notifications over adb (its
 * NotificationMonitorManager): `dumpsys notification --noredact` is parsed into
 * one record per NotificationRecord block, keeping pkg / key / title / text /
 * category / timestamp. The full dumpsys payload is filtered *on the device*
 * (grep) so only the fields we need cross the wire.
 *
 * Android redacts notification text by default; `--noredact` is what makes
 * message bodies readable. It is refused on some stock builds — when that
 * happens the caller falls back to plain `dumpsys notification` and titles may
 * still be readable while bodies show as `[text]`.
 */

export interface DeviceNotification {
    key: string;
    package: string;
    title: string;
    text: string;
    /** Notification category: msg / email / call / … (empty when unknown). */
    category: string;
    /** postTime in ms when present, else 0. */
    time: number;
}

/** Notification commands: prefer --noredact, fall back to the redacted dump. */
export const NOTIFICATION_COMMAND_NOREDACT =
    `dumpsys notification --noredact 2>/dev/null | sed -n '/Notification List:/,/^  [A-Z]/p' | ` +
    `grep -E 'NotificationRecord\\(|pkg=|key=|android\\.title|android\\.subText|android\\.text|android\\.bigText|android\\.summaryText|android\\.category|postTime='`;
export const NOTIFICATION_COMMAND_REDACT =
    `dumpsys notification 2>/dev/null | sed -n '/Notification List:/,/^  [A-Z]/p' | ` +
    `grep -E 'NotificationRecord\\(|pkg=|key=|android\\.title|android\\.subText|android\\.text|android\\.bigText|android\\.summaryText|android\\.category|postTime='`;

/** System services whose notifications are never user messages (from
 * Screen-Remote's monitor: clipboard mirroring etc.). */
const BLOCKED_PACKAGE_KEYWORDS = ['clipboard', 'universalclipboard'];

export { isMessagingPackage, MESSAGING_PACKAGE_MARKERS } from '../common/messaging';

/**
 * Parse the filtered `dumpsys notification` output into notification records.
 * @param output filtered dump (see {@link NOTIFICATION_COMMAND_NOREDACT})
 * @param packages when non-empty, keep only notifications from these packages
 */
export function parseDeviceNotifications(output: string, packages?: readonly string[]): DeviceNotification[] {
    const pkgFilter = packages && packages.length > 0 ? new Set(packages) : null;
    const notifications: DeviceNotification[] = [];
    const records = output.split('NotificationRecord(');

    for (const record of records) {
        if (record.trim().length === 0) continue;

        const packageName = extractField(record, 'pkg=');
        if (!packageName) continue;
        if (BLOCKED_PACKAGE_KEYWORDS.some((k) => packageName.includes(k))) continue;
        if (pkgFilter && !pkgFilter.has(packageName)) continue;

        const key = extractField(record, 'key=') || `${packageName}-${notifications.length}`;
        const title = extractExtrasField(record, 'android.title') ?? '';
        const text =
            extractExtrasField(record, 'android.text') ??
            extractExtrasField(record, 'android.bigText') ??
            extractExtrasField(record, 'android.subText') ??
            extractExtrasField(record, 'android.summaryText') ??
            '';
        const category = extractExtrasField(record, 'android.category') ?? '';
        const time = Number.parseInt(extractField(record, 'postTime=') ?? '0', 10) || 0;

        // Skip progress/ongoing notifications with no readable payload.
        if (title.length === 0 && text.length === 0) continue;

        notifications.push({ key, package: packageName, title, text, category, time });
    }
    return notifications;
}

/** Parse `pm list packages -3` output into package names. */
export function parsePackageList(output: string): string[] {
    const packages: string[] = [];
    for (const line of output.split('\n')) {
        const match = /^package:(.+)$/.exec(line.trim());
        if (match && match[1] !== undefined) packages.push(match[1]);
    }
    return packages;
}

function extractField(record: string, fieldName: string): string | null {
    const startIndex = record.indexOf(fieldName);
    if (startIndex === -1) return null;
    const valueStart = startIndex + fieldName.length;
    let valueEnd = valueStart;
    while (
        valueEnd < record.length &&
        record[valueEnd] !== ' ' &&
        record[valueEnd] !== '\n' &&
        record[valueEnd] !== '\r'
    ) {
        valueEnd++;
    }
    const value = record.substring(valueStart, valueEnd).trim();
    return value.length > 0 ? value : null;
}

/**
 * Pull a typed field from a NotificationRecord block. Both formats are
 * supported: `android.title=String (Ride_Wind)` and
 * `extras=Bundle[{android.title=String (Ride_Wind), …}]`.
 */
function extractExtrasField(record: string, fieldName: string): string | null {
    // Bundle[{...}] form — the common dumpsys layout. When present, it is the
    // authoritative source: falling through to the line regex would grab the
    // whole `android.title=…, android.progress=…` tail as the value.
    const bundleMatch = /Bundle\[\{(.+?)\}\]/.exec(record);
    if (bundleMatch) {
        const bundleContent = bundleMatch[1];
        if (bundleContent !== undefined) {
            return extractTyped(bundleContent, fieldName);
        }
    }
    // Line form: android.title=String (value)
    const lineMatch = new RegExp(`${fieldName}\\s*=\\s*(.+?)(?:\\n\\s*\\w|\\n\\s*$|$)`).exec(record);
    if (!lineMatch) return null;
    const raw = (lineMatch[1] ?? '').trim().replace(/^Bundle\[/, '').replace(/\]$/, '').trim();
    return parseTypedValue(raw);
}

function extractTyped(bundleContent: string, fieldName: string): string | null {
    const match = new RegExp(`${fieldName}\\s*=\\s*([^,}]+)`).exec(bundleContent);
    if (!match) return null;
    const value = match[1];
    if (value === undefined) return null;
    return parseTypedValue(value.trim());
}

function parseTypedValue(rawValue: string): string | null {
    if (rawValue.length === 0 || rawValue === 'null') return null;
    // "String (value)" | "Integer (123)" → the parenthesised content.
    const typed = /^\w+\s*\(([^)]*)\)$/.exec(rawValue);
    if (typed) {
        const value = typed[1];
        if (value === undefined) return null;
        const trimmed = value.trim();
        return trimmed.length > 0 && trimmed !== 'null' ? trimmed : null;
    }
    return rawValue;
}
