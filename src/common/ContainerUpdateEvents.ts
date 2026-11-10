/**
 * Container self-update — API shapes shared by the server API and the
 * Settings → Updates tab (container mode).
 *
 * A container never runs the desktop updater (velopack): the image owns the
 * app. What a container CAN do is replace its own `dist/` tree between
 * restarts — the API stages a validated replacement under
 * <DATA_ROOT>/pending-update, exits 0, and the image entrypoint (running as
 * root) swaps it into /app/dist before the app starts again.
 */

/** One asset of a GitHub release, as the API cares about it. */
export interface ContainerReleaseAsset {
    name: string;
    size: number;
    url: string;
}

/** The interesting part of a GitHub `releases/latest` response. */
export interface ContainerGithubRelease {
    tag: string;
    publishedAt: string;
    assets: ContainerReleaseAsset[];
}

/** GET /api/container-update/status -> this (200, always when in a container). */
export interface ContainerUpdateStatusResponse {
    ok: true;
    currentVersion: string;
    container: boolean;
    /** "owner/repo" as configured, or null. */
    repo: string | null;
    /** GitHub acceleration prefix or HTTP proxy, or null for direct access. */
    proxy?: string | null;
    /** Latest release the last check found, if any. */
    available?: ContainerGithubRelease;
    lastCheckedAt?: string;
    /** Human-readable error from the last check, if any. */
    lastError?: string;
}

/** PATCH /api/container-update/repo body: { repo: "owner/repo" | "" }. */
export interface ContainerUpdateRepoRequest {
    repo: string;
}

/** POST /api/container-update/upload body: base64 of a dist .tar.gz. */
export interface ContainerUpdateUploadRequest {
    fileName: string;
    dataBase64: string;
}

/** Success body for check/apply/upload/repo. */
export interface ContainerUpdateActionResponse {
    ok: true;
    /** Present on apply/upload: the app is about to restart. */
    mode?: 'restart';
    message?: string;
    status?: ContainerUpdateStatusResponse;
}

/** Failure body. */
export interface ContainerUpdateErrorResponse {
    ok: false;
    error: string;
    reason?: string;
}
