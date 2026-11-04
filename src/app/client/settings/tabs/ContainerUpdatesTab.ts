import { localizeServerError, t } from '../../i18n';
import { addCard, buildItem, buildRow, buildSection, buildTabAlert } from '../settingsLayout';
import type {
    ContainerGithubRelease,
    ContainerUpdateStatusResponse,
} from '../../../../common/ContainerUpdateEvents';

/**
 * Container-mode Updates tab.
 *
 * A container never runs the desktop updater: the image owns the app, and the
 * classic Updates tab is replaced by the "pull a newer image" note. THIS tab is
 * what replaces it (SettingsModal's `applyDockerGating`). It offers the two
 * things a container can actually do without rebuilding the image:
 *
 *   1. GitHub — point it at an `owner/repo` whose Releases carry a
 *      `dist-*.tar.gz` asset, check, then download & apply.
 *   2. Manual — upload a `dist-*.tar.gz` package and apply it.
 *
 * Either way the API stages a validated dist/ tree under
 * <DATA_ROOT>/pending-update and exits 0; the image entrypoint (root) swaps it
 * into /app/dist on the next boot and the container restarts by its own
 * `--restart unless-stopped`. Only dist/ is ever replaced.
 *
 * Self-contained: unlike the host tabs there is no SettingsModal-held read —
 * the container probe has already resolved before this body replaces the note,
 * and the API answers from inside the container by design.
 */
export function buildContainerUpdatesTab(): HTMLElement {
    const { section, card: card1 } = buildSection(t('tab_updates'));
    section.dataset['settingsTab'] = 'container-updates';
    const tabAlert = buildTabAlert(section);

    // ── Card 1: current version + GitHub update ─────────────────────────
    const versionValue = document.createElement('span');
    versionValue.textContent = '—';
    card1.appendChild(buildItem(buildRow(t('cont_update_current_version'), versionValue)));

    const repoInput = document.createElement('input');
    repoInput.className = 'settings-input';
    repoInput.type = 'text';
    repoInput.placeholder = t('cont_update_repo_placeholder');
    repoInput.autocomplete = 'off';
    repoInput.spellcheck = false;
    const saveRepoBtn = document.createElement('button');
    saveRepoBtn.className = 'settings-btn settings-btn-primary';
    saveRepoBtn.textContent = t('cont_update_save_repo');
    const repoField = document.createElement('span');
    repoField.appendChild(repoInput);
    repoField.appendChild(saveRepoBtn);
    card1.appendChild(buildItem(buildRow(t('cont_update_github_repo'), repoField)));

    const checkBtn = document.createElement('button');
    checkBtn.className = 'settings-btn settings-btn-primary';
    checkBtn.textContent = t('cont_update_check');
    card1.appendChild(buildItem(buildRow('', checkBtn)));

    // The "an update is available" block, created lazily once a check finds a
    // release with a dist asset.
    const resultRow = document.createElement('div');
    resultRow.style.gridColumn = '1 / -1';
    resultRow.style.display = 'none';
    card1.appendChild(buildItem(resultRow));

    // ── Card 2: manual upload ────────────────────────────────────────────
    const card2 = addCard(section, t('cont_update_upload_title'));
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.tar.gz,.tgz,application/gzip';
    fileInput.className = 'settings-input';
    fileInput.style.width = 'auto';
    const uploadBtn = document.createElement('button');
    uploadBtn.className = 'settings-btn settings-btn-primary';
    uploadBtn.textContent = t('cont_update_upload');
    uploadBtn.disabled = true;
    const uploadField = document.createElement('span');
    uploadField.appendChild(fileInput);
    uploadField.appendChild(uploadBtn);
    card2.appendChild(buildItem(buildRow(t('cont_update_choose_file'), uploadField)));
    const uploadHint = document.createElement('p');
    uploadHint.className = 'settings-status';
    uploadHint.style.gridColumn = '1 / -1';
    uploadHint.textContent = t('cont_update_upload_desc');
    card2.appendChild(buildItem(uploadHint));

    // ── Wiring ───────────────────────────────────────────────────────────
    let currentVersion = '—';
    let applying = false;

    function setBusy(btn: HTMLButtonElement, busy: boolean, busyText?: string): void {
        btn.disabled = busy || applying;
        if (busy && busyText) btn.textContent = busyText;
        else if (btn === checkBtn) btn.textContent = t('cont_update_check');
        else if (btn === uploadBtn) btn.textContent = t('cont_update_upload');
        else if (btn === applyBtn) btn.textContent = t('cont_update_apply');
        else if (btn === saveRepoBtn) btn.textContent = t('cont_update_save_repo');
    }

    let applyBtn: HTMLButtonElement | null = null;

    function renderAvailable(release: ContainerGithubRelease): void {
        const asset = release.assets.find((a) => /^dist[-_].*\.tar\.gz$/i.test(a.name));
        resultRow.replaceChildren();
        resultRow.style.display = '';
        if (!asset) {
            const p = document.createElement('p');
            p.className = 'settings-status';
            p.textContent = `${release.tag} — ${t('cont_update_no_asset')}`;
            resultRow.appendChild(p);
            return;
        }
        const sizeMb = (asset.size / (1024 * 1024)).toFixed(1);
        const line = document.createElement('span');
        line.style.display = 'inline-flex';
        line.style.alignItems = 'center';
        line.style.gap = '0.6rem';
        line.style.flexWrap = 'wrap';
        line.textContent = `${release.tag} · ${t('cont_update_published')} ${release.publishedAt.slice(0, 10)} · ${asset.name} (${sizeMb} MB)`;
        if (applyBtn) {
            line.appendChild(applyBtn);
        } else {
            applyBtn = document.createElement('button');
            applyBtn.className = 'settings-btn settings-btn-primary';
            applyBtn.textContent = t('cont_update_apply');
            applyBtn.addEventListener('click', () => {
                void runGithubApply();
            });
            line.appendChild(applyBtn);
        }
        resultRow.appendChild(line);
    }

    async function runStatus(): Promise<void> {
        try {
            const res = await fetch('/api/container-update/status');
            const data = (await res.json()) as ContainerUpdateStatusResponse;
            if (data.ok) {
                currentVersion = data.currentVersion;
                versionValue.textContent = `v${data.currentVersion}`;
                if (data.repo) repoInput.value = data.repo;
            }
        } catch {
            versionValue.textContent = `v${currentVersion}`;
        }
    }

    async function runCheck(): Promise<void> {
        if (applying) return;
        setBusy(checkBtn, true, t('cont_update_checking'));
        tabAlert.clear();
        try {
            const res = await fetch('/api/container-update/github-check', { method: 'POST' });
            const text = await res.text();
            let data:
                | ContainerUpdateStatusResponse
                | { ok: false; error: string }
                | null = null;
            try {
                data = JSON.parse(text) as
                    | ContainerUpdateStatusResponse
                    | { ok: false; error: string };
            } catch {
                data = null;
            }
            if (!data) {
                tabAlert.show('error', text.trim() || 'unexpected server response');
                resultRow.style.display = 'none';
                return;
            }
            if (!data.ok) {
                tabAlert.show('error', localizeServerError((data as { error: string }).error));
                resultRow.style.display = 'none';
                return;
            }
            const status = data as ContainerUpdateStatusResponse;
            const release = status.available;
            if (!release) {
                tabAlert.show('error', t('cont_update_no_release'));
                return;
            }
            const asset = release.assets.find((a) => /^dist[-_].*\.tar\.gz$/i.test(a.name));
            if (!asset) {
                tabAlert.show('error', t('cont_update_no_asset'));
                return;
            }
            renderAvailable(release);
            // Compare against the running version: "up to date" is a friendly
            // confirmation, not an error.
            const newer = compareTags(release.tag, `v${currentVersion}`);
            if (newer <= 0) {
                tabAlert.show('success', `${t('cont_update_up_to_date')} (${release.tag})`);
            } else {
                tabAlert.show('success', `${t('cont_update_found')} ${release.tag}`);
            }
        } catch (err) {
            tabAlert.show('error', (err as Error).message);
        } finally {
            setBusy(checkBtn, false);
        }
    }

    async function runGithubApply(): Promise<void> {
        if (applying || !applyBtn) return;
        applying = true;
        setBusy(applyBtn, true, t('cont_update_downloading'));
        tabAlert.clear();
        try {
            const res = await fetch('/api/container-update/github-apply', { method: 'POST' });
            const text = await res.text();
            let data: { ok?: boolean; error?: string; mode?: string } | null = null;
            try {
                data = JSON.parse(text) as { ok?: boolean; error?: string; mode?: string };
            } catch {
                data = null;
            }
            if (data && !data.ok) {
                tabAlert.show('error', localizeServerError(data.error ?? 'update failed'));
                applying = false;
                setBusy(applyBtn, false);
                return;
            }
            if (!data) {
                // Non-JSON body. It CAN be the reverse proxy answering while
                // the container is already restarting, but far more often it is
                // a proxy failure (e.g. the upload body exceeded a tunnel
                // limit). Never report success on an unreadable response —
                // show the raw text so the user can tell which one it was.
                tabAlert.show('error', `${t('cont_update_bad_response')}${text.trim().slice(0, 200)}`);
                applying = false;
                setBusy(applyBtn, false);
                return;
            }
            tabAlert.show('success', t('cont_update_applying'));
            setBusy(applyBtn, true, t('cont_update_applying'));
        } catch (err) {
            tabAlert.show('error', (err as Error).message);
            applying = false;
            setBusy(applyBtn, false);
        }
    }

    async function runUpload(): Promise<void> {
        if (applying) return;
        const file = fileInput.files?.[0];
        if (!file) return;
        applying = true;
        setBusy(uploadBtn, true, t('cont_update_uploading'));
        tabAlert.clear();
        try {
            // Raw binary upload: keeps the request body at the package size.
            // Base64 JSON would inflate a ~1 MB tarball to ~1.4 MB, which some
            // reverse proxies (the user's tunnel) reject before the API runs.
            const buf = await file.arrayBuffer();
            const res = await fetch('/api/container-update/upload', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'X-File-Name': encodeURIComponent(file.name),
                },
                body: buf,
            });
            const text = await res.text();
            let data: { ok?: boolean; error?: string } | null = null;
            try {
                data = JSON.parse(text) as { ok?: boolean; error?: string };
            } catch {
                data = null;
            }
            if (data && !data.ok) {
                tabAlert.show('error', localizeServerError(data.error ?? 'upload failed'));
                applying = false;
                setBusy(uploadBtn, false);
                return;
            }
            if (!data) {
                // Non-JSON body — almost always a proxy failure (e.g. the
                // upload body exceeded a tunnel limit), not a restart. Show the
                // raw text instead of reporting success.
                tabAlert.show('error', `${t('cont_update_bad_response')}${text.trim().slice(0, 200)}`);
                applying = false;
                setBusy(uploadBtn, false);
                return;
            }
            tabAlert.show('success', t('cont_update_applying'));
            setBusy(uploadBtn, true, t('cont_update_applying'));
        } catch (err) {
            tabAlert.show('error', (err as Error).message);
            applying = false;
            setBusy(uploadBtn, false);
        }
    }

    saveRepoBtn.addEventListener('click', () => {
        const repo = repoInput.value.trim();
        void (async () => {
            setBusy(saveRepoBtn, true);
            try {
                const res = await fetch('/api/container-update/repo', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ repo }),
                });
                const data = (await res.json()) as { ok?: boolean; error?: string };
                if (!data.ok) {
                    tabAlert.show('error', localizeServerError(data.error ?? 'save failed'));
                } else {
                    tabAlert.show('success', t('cont_update_repo_saved'));
                }
            } catch (err) {
                tabAlert.show('error', (err as Error).message);
            } finally {
                setBusy(saveRepoBtn, false);
            }
        })();
    });

    checkBtn.addEventListener('click', () => {
        void runCheck();
    });

    fileInput.addEventListener('change', () => {
        uploadBtn.disabled = !fileInput.files?.length;
    });

    uploadBtn.addEventListener('click', () => {
        void runUpload();
    });

    void runStatus();
    return section;
}

/** 'v0.6.0' vs 'v0.5.11' — numeric segment compare; -1/0/1. */
function compareTags(a: string, b: string): number {
    const pa = a.replace(/^v/i, '').split('.').map((s) => parseInt(s, 10) || 0);
    const pb = b.replace(/^v/i, '').split('.').map((s) => parseInt(s, 10) || 0);
    const n = Math.max(pa.length, pb.length);
    for (let i = 0; i < n; i++) {
        const da = pa[i] ?? 0;
        const db = pb[i] ?? 0;
        if (da !== db) return da < db ? -1 : 1;
    }
    return 0;
}
