// ==UserScript==
// @name         ChatGPT 用量监视器
// @namespace    https://tampermonkey.net/
// @version      1.2.0
// @description  在 ChatGPT 页面内显示用量、订阅周期和 PoW 风险提示，无需手工维护 Bearer Token
// @author       Liu Baoding
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @updateURL    https://raw.githubusercontent.com/liu-baoding/chatgpt-webchat-helper/main/chatgpt-usage-monitor.user.js
// @downloadURL  https://raw.githubusercontent.com/liu-baoding/chatgpt-webchat-helper/main/chatgpt-usage-monitor.user.js
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    if (window.__chatgptUsageMonitorLoaded) return;
    window.__chatgptUsageMonitorLoaded = true;

    const SESSION_URL = '/api/auth/session';
    const USAGE_URL = '/backend-api/wham/usage';
    const RESET_CREDITS_URL = '/backend-api/wham/rate-limit-reset-credits';
    const ACCOUNTS_CHECK_URL = '/backend-api/accounts/check/v4-2023-04-27';
    const SENTINEL_PATHS = [
        '/backend-api/sentinel/chat-requirements/prepare',
        '/backend-api/sentinel/chat-requirements',
        '/backend-anon/sentinel/chat-requirements',
    ];
    const POW_STORAGE_KEY = 'chatgpt-usage-monitor-pow-v1';

    const ROOT_ID = 'chatgpt-usage-monitor-root';
    const STYLE_ID = 'chatgpt-usage-monitor-style';
    const STALE_AFTER_MS = 60 * 1000;
    const INITIAL_REFRESH_DELAY_MS = 1200;
    const INITIAL_RETRY_DELAYS_MS = [1500, 3000, 6000];
    const BACKGROUND_REFRESH_MS = 5 * 60 * 1000;

    let lastLoadedAt = 0;
    let lastRawData = null;
    let lastPowInfo = loadPowInfo();
    let loading = false;

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;',
        })[char]);
    }

    function loadPowInfo() {
        try {
            const raw = sessionStorage.getItem(POW_STORAGE_KEY);
            if (!raw) return null;

            const value = JSON.parse(raw);
            if (!value || typeof value !== 'object') return null;

            return {
                difficulty: String(value.difficulty || ''),
                persona: String(value.persona || ''),
                required: value.required === true,
                capturedAt: Number(value.capturedAt || 0),
            };
        } catch (_) {
            return null;
        }
    }

    function savePowInfo(info) {
        lastPowInfo = info;

        try {
            sessionStorage.setItem(
                POW_STORAGE_KEY,
                JSON.stringify(info)
            );
        } catch (_) {
            // sessionStorage may be unavailable in hardened browser modes.
        }

        renderPowInfo();
        renderRawJson();
    }

    function classifyPowDifficulty(difficulty) {
        const raw = String(difficulty || '').trim();
        if (!raw) {
            return {
                key: 'unknown',
                label: '未知',
                workLabel: '—',
                color: '#8b8b8b',
                hexLength: 0,
            };
        }

        const cleaned =
            raw.replace(/^0x/i, '').replace(/^0+/, '') || '0';

        const hexLength = cleaned.length;

        if (hexLength <= 2) {
            return {
                key: 'high',
                label: '高风险',
                workLabel: '困难',
                color: '#dc4c43',
                hexLength,
            };
        }

        if (hexLength === 3) {
            return {
                key: 'medium',
                label: '中风险',
                workLabel: '中等',
                color: '#d99a20',
                hexLength,
            };
        }

        if (hexLength === 4) {
            return {
                key: 'low',
                label: '低风险',
                workLabel: '简单',
                color: '#7a9f2b',
                hexLength,
            };
        }

        return {
            key: 'normal',
            label: '正常',
            workLabel: '极易',
            color: '#10a37f',
            hexLength,
        };
    }

    function getFetchUrl(resource) {
        if (typeof resource === 'string') return resource;
        if (resource instanceof URL) return resource.href;
        if (typeof Request !== 'undefined' && resource instanceof Request) {
            return resource.url;
        }
        return '';
    }

    function getFetchMethod(resource, options) {
        if (options?.method) {
            return String(options.method).toUpperCase();
        }

        if (
            typeof Request !== 'undefined' &&
            resource instanceof Request
        ) {
            return String(resource.method || 'GET').toUpperCase();
        }

        return 'GET';
    }

    function isSentinelRequest(resource, options) {
        const url = getFetchUrl(resource);
        if (!url) return false;

        const method = getFetchMethod(resource, options);
        if (method !== 'POST') return false;

        return SENTINEL_PATHS.some(path => url.includes(path));
    }

    function capturePowResponse(data) {
        const pow = data?.proofofwork;
        if (!pow || typeof pow !== 'object') return;

        const difficulty =
            typeof pow.difficulty === 'string'
                ? pow.difficulty.trim()
                : '';

        if (!difficulty) return;

        savePowInfo({
            difficulty,
            persona:
                typeof data.persona === 'string'
                    ? data.persona
                    : '',
            required: pow.required === true,
            capturedAt: Date.now(),
        });
    }

    function installSentinelObserver() {
        const currentFetch = window.fetch;
        if (
            typeof currentFetch !== 'function' ||
            currentFetch.__cumSentinelObserver
        ) {
            return;
        }

        const wrappedFetch = async function (resource, options) {
            const response = await currentFetch.apply(this, arguments);

            if (isSentinelRequest(resource, options)) {
                try {
                    response
                        .clone()
                        .json()
                        .then(capturePowResponse)
                        .catch(() => {});
                } catch (_) {
                    // Never interfere with ChatGPT's own request lifecycle.
                }
            }

            return response;
        };

        try {
            Object.defineProperty(
                wrappedFetch,
                '__cumSentinelObserver',
                { value: true }
            );
        } catch (_) {
            // Non-critical marker only.
        }

        window.fetch = wrappedFetch;
    }

    function formatPercent(value) {
        const number = Number(value);
        return Number.isFinite(number) ? `${number.toFixed(1)}%` : '—';
    }

    function remainingPercent(windowInfo) {
        if (!windowInfo) return null;
        const used = Math.min(Math.max(Number(windowInfo.used_percent ?? 0), 0), 100);
        return 100 - used;
    }

    function formatDuration(seconds) {
        const value = Number(seconds);
        if (!Number.isFinite(value)) return '—';
        if (value <= 0) return '即将重置';

        const days = Math.floor(value / 86400);
        const hours = Math.floor((value % 86400) / 3600);
        const minutes = Math.floor((value % 3600) / 60);

        if (days > 0) return `${days} 天 ${hours} 小时 ${minutes} 分`;
        if (hours > 0) return `${hours} 小时 ${minutes} 分`;
        return `${minutes} 分`;
    }

    function formatDateTime(value) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleString('zh-CN', { hour12: false });
    }

    function formatDateOnly(value) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
    }

    function getCurrentAccountInfo(accountsCheck, accountId) {
        const accounts = accountsCheck?.accounts;
        if (!accounts || typeof accounts !== 'object') return null;

        const entry =
            (accountId && accounts[accountId]) ||
            accounts.default ||
            Object.values(accounts).find(value => value && typeof value === 'object');

        if (!entry) return null;

        const account = entry.account || {};
        const entitlement = entry.entitlement || {};
        const lastSubscription = entry.last_active_subscription || {};

        const willRenew = lastSubscription.will_renew === true;
        const active = entitlement.has_active_subscription === true;

        /*
         * ChatGPT 网页当前会把 renews_at 作为自动续费账户的
         * 当前订阅周期节点展示。若不会续费，则优先显示取消/失效时间。
         */
        const periodDate = willRenew
            ? entitlement.renews_at
            : (
                entitlement.cancels_at ||
                entitlement.expires_at ||
                entitlement.renews_at
            );

        return {
            plan:
                account.plan_display_name ||
                account.plan_type ||
                entitlement.subscription_plan ||
                '',
            active,
            willRenew,
            periodDate,
            periodLabel: willRenew ? '下次续费' : '订阅有效至',
            expiresAt: entitlement.expires_at || '',
            renewsAt: entitlement.renews_at || '',
            cancelsAt: entitlement.cancels_at || '',
            billingCurrency: entitlement.billing_currency || '',
            purchasePlatform: lastSubscription.purchase_origin_platform || '',
            delinquent: entitlement.is_delinquent === true,
        };
    }

    function formatPlan(plan) {
        if (!plan) return 'ChatGPT';
        const text = String(plan);
        return `ChatGPT ${text.charAt(0).toUpperCase()}${text.slice(1)}`;
    }

    function getAccessToken(session) {
        const candidates = [
            session?.accessToken,
            session?.access_token,
            session?.token?.access_token,
            session?.token?.accessToken,
        ];

        return candidates.find(
            value => typeof value === 'string' && value.trim()
        )?.trim() || '';
    }

    function getAccountId(session) {
        const candidates = [
            session?.account?.id,
            session?.accountId,
            session?.account_id,
            session?.user?.accountId,
            session?.user?.account_id,
        ];

        return candidates.find(
            value => typeof value === 'string' && value.trim()
        )?.trim() || '';
    }

    async function readSession() {
        const response = await fetch(SESSION_URL, {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
            headers: {
                Accept: 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`无法读取 ChatGPT 登录会话 (${response.status})`);
        }

        const session = await response.json();
        const accessToken = getAccessToken(session);

        if (!accessToken) {
            throw new Error('当前登录会话没有返回 accessToken');
        }

        return {
            session,
            accessToken,
            accountId: getAccountId(session),
        };
    }

    async function fetchWham(path, auth) {
        const headers = {
            Authorization: `Bearer ${auth.accessToken}`,
            Accept: 'application/json',
        };

        if (auth.accountId) {
            headers['ChatGPT-Account-Id'] = auth.accountId;
        }

        return fetch(path, {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
            redirect: 'error',
            headers,
        });
    }

    async function fetchJson(path, auth) {
        let response = await fetchWham(path, auth);

        /*
         * access token 可能在页面持续打开期间过期。
         * 401/403 时重新从当前 ChatGPT 会话获取一次，只重试一次。
         */
        if (response.status === 401 || response.status === 403) {
            const refreshed = await readSession();
            response = await fetchWham(path, refreshed);
        }

        if (!response.ok) {
            let detail = '';
            try {
                detail = (await response.text()).slice(0, 240);
            } catch (_) {
                // ignore
            }

            throw new Error(
                `${path} 请求失败 (${response.status})${detail ? `: ${detail}` : ''}`
            );
        }

        return response.json();
    }

    async function queryUsage() {
        const auth = await readSession();

        const [usageResult, resetResult, accountsResult] = await Promise.allSettled([
            fetchJson(USAGE_URL, auth),
            fetchJson(RESET_CREDITS_URL, auth),
            fetchJson(ACCOUNTS_CHECK_URL, auth),
        ]);

        if (usageResult.status === 'rejected') {
            throw usageResult.reason;
        }

        return {
            usage: usageResult.value,
            resetCredits:
                resetResult.status === 'fulfilled'
                    ? resetResult.value
                    : null,
            resetCreditsError:
                resetResult.status === 'rejected'
                    ? String(resetResult.reason?.message || resetResult.reason || '请求失败')
                    : '',
            accountsCheck:
                accountsResult.status === 'fulfilled'
                    ? accountsResult.value
                    : null,
            accountsCheckError:
                accountsResult.status === 'rejected'
                    ? String(accountsResult.reason?.message || accountsResult.reason || '请求失败')
                    : '',
            accountId: auth.accountId,
        };
    }

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${ROOT_ID} {
                --cum-bg: #ffffff;
                --cum-bg-soft: #f7f7f8;
                --cum-bg-strong: #ececf1;
                --cum-text: #202123;
                --cum-muted: #6b7280;
                --cum-border: rgba(0, 0, 0, 0.10);
                --cum-accent: #10a37f;
                --cum-danger: #c2413b;
                position: fixed;
                right: 22px;
                bottom: 118px;
                z-index: 2147483000;
                font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                color: var(--cum-text);
            }

            .dark #${ROOT_ID},
            html.dark #${ROOT_ID} {
                --cum-bg: #212121;
                --cum-bg-soft: #2f2f2f;
                --cum-bg-strong: #3a3a3a;
                --cum-text: #ececec;
                --cum-muted: #a7a7a7;
                --cum-border: rgba(255, 255, 255, 0.12);
            }

            #${ROOT_ID} * {
                box-sizing: border-box;
            }

            #cum-trigger {
                width: 52px;
                padding: 0;
                margin: 0;
                border: 0;
                background: transparent;
                color: var(--cum-text);
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
            }

            #cum-trigger:focus-visible {
                outline: 2px solid var(--cum-accent);
                outline-offset: 4px;
                border-radius: 18px;
            }

            .cum-limit-ring {
                --cum-ring-value: 0;
                --cum-ring-color: var(--cum-accent);
                position: relative;
                width: 48px;
                height: 48px;
                border-radius: 50%;
                display: grid;
                place-items: center;
                background:
                    conic-gradient(
                        var(--cum-ring-color) calc(var(--cum-ring-value) * 1%),
                        var(--cum-bg-strong) 0
                    );
                box-shadow:
                    0 5px 18px rgba(0, 0, 0, 0.14),
                    0 0 0 1px var(--cum-border);
                transition: transform 0.15s ease;
            }

            #cum-trigger:hover .cum-limit-ring {
                transform: translateX(-2px);
            }

            .cum-limit-ring::before {
                content: "";
                position: absolute;
                inset: 4px;
                border-radius: inherit;
                background: var(--cum-bg);
                box-shadow: inset 0 0 0 1px var(--cum-border);
            }

            .cum-limit-ring-content {
                position: relative;
                z-index: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                line-height: 1;
            }

            .cum-limit-ring-label {
                font-size: 11px;
                font-weight: 700;
                letter-spacing: -0.02em;
            }

            .cum-limit-ring-value {
                margin-top: 3px;
                color: var(--cum-muted);
                font-size: 8px;
                font-variant-numeric: tabular-nums;
            }

            #cum-panel {
                position: absolute;
                right: 64px;
                bottom: 0;
                width: min(400px, calc(100vw - 96px));
                max-height: min(690px, calc(100vh - 64px));
                display: none;
                flex-direction: column;
                overflow: hidden;
                border: 1px solid var(--cum-border);
                border-radius: 18px;
                background: var(--cum-bg);
                box-shadow: 0 18px 60px rgba(0, 0, 0, 0.22);
            }

            #cum-panel[data-open="true"] {
                display: flex;
            }

            .cum-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 15px 16px 12px;
                border-bottom: 1px solid var(--cum-border);
            }

            .cum-title {
                min-width: 0;
            }

            .cum-title-main {
                font-size: 15px;
                font-weight: 700;
            }

            .cum-title-sub {
                margin-top: 2px;
                color: var(--cum-muted);
                font-size: 11px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .cum-header-actions {
                display: flex;
                gap: 6px;
            }

            .cum-icon-button {
                width: 30px;
                height: 30px;
                border: 0;
                border-radius: 8px;
                background: transparent;
                color: var(--cum-muted);
                cursor: pointer;
                font-size: 16px;
            }

            .cum-icon-button:hover {
                background: var(--cum-bg-soft);
                color: var(--cum-text);
            }

            .cum-body {
                overflow: auto;
                padding: 14px;
            }

            .cum-status {
                min-height: 34px;
                padding: 9px 10px;
                border-radius: 10px;
                background: var(--cum-bg-soft);
                color: var(--cum-muted);
                font-size: 12px;
                line-height: 1.4;
                margin-bottom: 12px;
            }

            .cum-status.error {
                color: var(--cum-danger);
            }

            .cum-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
            }

            .cum-card {
                min-width: 0;
                border: 1px solid var(--cum-border);
                border-radius: 13px;
                padding: 12px;
                background: var(--cum-bg-soft);
            }

            .cum-card-label {
                color: var(--cum-muted);
                font-size: 11px;
                margin-bottom: 7px;
            }

            .cum-card-value {
                font-size: 22px;
                line-height: 1;
                font-weight: 700;
                letter-spacing: -0.02em;
            }

            .cum-card-sub {
                color: var(--cum-muted);
                font-size: 11px;
                line-height: 1.45;
                margin-top: 7px;
            }

            .cum-progress {
                height: 5px;
                margin-top: 9px;
                border-radius: 999px;
                overflow: hidden;
                background: var(--cum-bg-strong);
            }

            .cum-progress > span {
                display: block;
                height: 100%;
                background: var(--cum-accent);
                border-radius: inherit;
            }

            .cum-section {
                margin-top: 14px;
                border-top: 1px solid var(--cum-border);
                padding-top: 13px;
            }

            .cum-section-title {
                font-size: 12px;
                font-weight: 700;
                margin-bottom: 9px;
            }

            .cum-pow-card {
                border: 1px solid var(--cum-border);
                border-radius: 13px;
                padding: 12px;
                background: var(--cum-bg-soft);
            }

            .cum-pow-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                margin-bottom: 9px;
            }

            .cum-pow-title {
                font-size: 12px;
                font-weight: 700;
            }

            .cum-pow-badge {
                display: inline-flex;
                align-items: center;
                min-height: 22px;
                padding: 0 8px;
                border-radius: 999px;
                color: #fff;
                font-size: 11px;
                font-weight: 700;
            }

            .cum-pow-note {
                margin-top: 8px;
                color: var(--cum-muted);
                font-size: 10px;
                line-height: 1.5;
            }

            .cum-credit-list {
                display: grid;
                gap: 8px;
            }

            .cum-credit {
                border: 1px solid var(--cum-border);
                border-radius: 11px;
                padding: 10px;
                background: var(--cum-bg-soft);
                font-size: 11px;
                line-height: 1.5;
            }

            .cum-credit-top {
                display: flex;
                justify-content: space-between;
                gap: 8px;
                margin-bottom: 4px;
            }

            .cum-credit-name {
                font-weight: 700;
            }

            .cum-credit-status {
                color: var(--cum-accent);
                white-space: nowrap;
            }

            .cum-detail-row {
                display: flex;
                justify-content: space-between;
                gap: 12px;
                padding: 5px 0;
                font-size: 12px;
            }

            .cum-detail-row > span:first-child {
                color: var(--cum-muted);
            }

            .cum-detail-row > span:last-child {
                text-align: right;
                overflow-wrap: anywhere;
            }

            #cum-raw {
                margin-top: 8px;
                max-height: 220px;
                overflow: auto;
                border-radius: 10px;
                background: var(--cum-bg-soft);
                padding: 10px;
                white-space: pre-wrap;
                word-break: break-word;
                font: 10px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            }

            .cum-footer-note {
                margin-top: 12px;
                color: var(--cum-muted);
                font-size: 10px;
                line-height: 1.5;
            }

            @media (max-width: 700px) {
                #${ROOT_ID} {
                    right: 10px;
                    bottom: 108px;
                }

                #cum-panel {
                    right: 0;
                    bottom: 116px;
                    width: calc(100vw - 20px);
                    max-height: calc(100vh - 150px);
                }

                .cum-limit-ring {
                    width: 44px;
                    height: 44px;
                }
            }
        `;

        (document.head || document.documentElement).appendChild(style);
    }

    function createUi() {
        if (document.getElementById(ROOT_ID)) {
            return document.getElementById(ROOT_ID);
        }

        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.innerHTML = `
            <button id="cum-trigger" type="button" title="查看 ChatGPT 用量">
                <span class="cum-limit-ring" id="cum-ring-5h">
                    <span class="cum-limit-ring-content">
                        <span class="cum-limit-ring-label">5h</span>
                        <span class="cum-limit-ring-value" id="cum-ring-5h-value">—</span>
                    </span>
                </span>
                <span class="cum-limit-ring" id="cum-ring-week">
                    <span class="cum-limit-ring-content">
                        <span class="cum-limit-ring-label">周</span>
                        <span class="cum-limit-ring-value" id="cum-ring-week-value">—</span>
                    </span>
                </span>
            </button>

            <section id="cum-panel" data-open="false" aria-label="ChatGPT 用量">
                <header class="cum-header">
                    <div class="cum-title">
                        <div class="cum-title-main">ChatGPT 用量</div>
                        <div class="cum-title-sub" id="cum-account">读取当前登录会话</div>
                    </div>
                    <div class="cum-header-actions">
                        <button class="cum-icon-button" id="cum-refresh" type="button" title="刷新">↻</button>
                        <button class="cum-icon-button" id="cum-close" type="button" title="关闭">×</button>
                    </div>
                </header>

                <div class="cum-body">
                    <div class="cum-status" id="cum-status">正在读取当前 ChatGPT 会话。</div>
                    <div class="cum-grid" id="cum-grid"></div>

                    <section class="cum-section">
                        <div class="cum-section-title">PoW 风险提示</div>
                        <div id="cum-pow"></div>
                    </section>

                    <div id="cum-details"></div>

                    <details class="cum-section">
                        <summary class="cum-section-title" style="cursor:pointer;">原始 JSON</summary>
                        <pre id="cum-raw">{}</pre>
                    </details>

                    <div class="cum-footer-note">
                        Bearer Token 仅从当前 ChatGPT 登录会话读取并保存在内存中。PoW 区域只保存 difficulty、persona 和采样时间到当前标签页的 sessionStorage，不保存 challenge token、seed 或 dx。
                    </div>
                </div>
            </section>
        `;

        document.body.appendChild(root);

        const panel = root.querySelector('#cum-panel');
        const trigger = root.querySelector('#cum-trigger');
        const refresh = root.querySelector('#cum-refresh');
        const close = root.querySelector('#cum-close');

        trigger.addEventListener('click', () => {
            const willOpen = panel.dataset.open !== 'true';
            panel.dataset.open = willOpen ? 'true' : 'false';

            if (
                willOpen &&
                (
                    !lastLoadedAt ||
                    Date.now() - lastLoadedAt > STALE_AFTER_MS
                )
            ) {
                void refreshUsage();
            }
        });

        refresh.addEventListener('click', () => {
            void refreshUsage();
        });

        close.addEventListener('click', () => {
            panel.dataset.open = 'false';
        });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && panel.dataset.open === 'true') {
                panel.dataset.open = 'false';
            }
        });

        renderPowInfo();
        renderRawJson();

        return root;
    }

    function renderProgress(percent) {
        if (!Number.isFinite(percent)) return '';
        const value = Math.min(Math.max(percent, 0), 100);
        return `
            <div class="cum-progress" aria-label="剩余 ${value.toFixed(1)}%">
                <span style="width:${value}%"></span>
            </div>
        `;
    }

    function renderCard(label, value, sub, progress = null) {
        return `
            <article class="cum-card">
                <div class="cum-card-label">${escapeHtml(label)}</div>
                <div class="cum-card-value">${escapeHtml(value)}</div>
                ${Number.isFinite(progress) ? renderProgress(progress) : ''}
                <div class="cum-card-sub">${escapeHtml(sub)}</div>
            </article>
        `;
    }

    function updateLimitRing(id, value, fallback = '—') {
        const ring =
            document.getElementById(id);

        if (!ring) return;

        const label =
            ring.querySelector(
                '.cum-limit-ring-value'
            );

        if (!Number.isFinite(value)) {
            ring.style.setProperty(
                '--cum-ring-value',
                '0'
            );
            label.textContent = fallback;
            return;
        }

        const percent =
            Math.min(
                Math.max(value, 0),
                100
            );

        ring.style.setProperty(
            '--cum-ring-value',
            String(percent)
        );

        label.textContent =
            `${Math.round(percent)}%`;

        const color =
            percent <= 20
                ? '#dc4c43'
                : percent <= 50
                    ? '#d99a20'
                    : '#10a37f';

        ring.style.setProperty(
            '--cum-ring-color',
            color
        );
    }

    function renderPowInfo() {
        const container =
            document.getElementById(
                'cum-pow'
            );

        if (!container) return;

        if (
            !lastPowInfo ||
            !lastPowInfo.difficulty
        ) {
            container.innerHTML = `
                <div class="cum-pow-card">
                    <div class="cum-pow-head">
                        <div class="cum-pow-title">尚未观察到 PoW difficulty</div>
                        <span class="cum-pow-badge" style="background:#8b8b8b;">等待</span>
                    </div>
                    <div class="cum-pow-note">
                        本监视器不会主动重复调用 Sentinel prepare。发送下一条 ChatGPT 消息时，会被动读取网页自身 prepare 响应中的 difficulty。
                    </div>
                </div>
            `;
            return;
        }

        const risk =
            classifyPowDifficulty(
                lastPowInfo.difficulty
            );

        container.innerHTML = `
            <div class="cum-pow-card">
                <div class="cum-pow-head">
                    <div class="cum-pow-title">ChatGPT PoW 风险</div>
                    <span class="cum-pow-badge" style="background:${risk.color};">
                        ${escapeHtml(risk.label)}
                    </span>
                </div>

                <div class="cum-detail-row">
                    <span>PoW 难度</span>
                    <span>${escapeHtml(lastPowInfo.difficulty)} · ${escapeHtml(risk.workLabel)}</span>
                </div>

                <div class="cum-detail-row">
                    <span>有效十六进制位数</span>
                    <span>${risk.hexLength}</span>
                </div>

                <div class="cum-detail-row">
                    <span>Persona</span>
                    <span>${escapeHtml(lastPowInfo.persona || '—')}</span>
                </div>

                <div class="cum-detail-row">
                    <span>最近观测</span>
                    <span>${escapeHtml(
                        lastPowInfo.capturedAt
                            ? new Date(lastPowInfo.capturedAt).toLocaleString('zh-CN', { hour12: false })
                            : '—'
                    )}</span>
                </div>

                <div class="cum-pow-note">
                    该风险等级沿用社区插件的启发式规则：去掉前导 0 后，difficulty 的十六进制位数越少，通常意味着要求的 PoW 越困难。它只能作为 Sentinel 风控信号参考，不能单独证明模型发生了“降智”或路由降级。
                </div>
            </div>
        `;

        const trigger =
            document.getElementById(
                'cum-trigger'
            );

        if (trigger) {
            trigger.title =
                `5h / 周限额 · PoW ${lastPowInfo.difficulty} · ${risk.label}`;
        }
    }

    function renderRawJson() {
        const raw =
            document.getElementById(
                'cum-raw'
            );

        if (!raw) return;

        raw.textContent =
            JSON.stringify(
                {
                    usage:
                        lastRawData?.usage ||
                        null,
                    rate_limit_reset_credits:
                        lastRawData?.resetCredits ||
                        null,
                    accounts_check:
                        lastRawData?.accountsCheck ||
                        null,
                    pow_observation:
                        lastPowInfo ||
                        null,
                },
                null,
                2
            );
    }

    function renderData(data) {
        const root = document.getElementById(ROOT_ID);
        if (!root) return;

        const usage = data.usage || {};
        const rateLimit = usage.rate_limit || {};
        const primary = rateLimit.primary_window || null;
        const secondary = rateLimit.secondary_window || null;
        const primaryRemaining = remainingPercent(primary);
        const secondaryRemaining = remainingPercent(secondary);

        const resetCredits =
            data.resetCredits ||
            usage.rate_limit_reset_credits ||
            null;

        const availableResets =
            resetCredits?.available_count ??
            usage.rate_limit_reset_credits?.available_count ??
            0;

        const allowed =
            rateLimit.allowed === true &&
            rateLimit.limit_reached !== true;

        const grid = root.querySelector('#cum-grid');
        grid.innerHTML = [
            renderCard(
                '5 小时剩余',
                primary ? formatPercent(primaryRemaining) : '—',
                primary
                    ? `${formatDuration(primary.reset_after_seconds)} 后重置`
                    : '接口未返回 5 小时窗口',
                primaryRemaining,
            ),
            renderCard(
                '周限额剩余',
                secondary ? formatPercent(secondaryRemaining) : '无限制',
                secondary
                    ? `${formatDuration(secondary.reset_after_seconds)} 后重置`
                    : '当前账号未返回周窗口',
                secondaryRemaining,
            ),
            renderCard(
                '重置额度',
                `${availableResets} 次`,
                resetCredits?.total_earned_count === undefined
                    ? '当前可用次数'
                    : `累计获得 ${resetCredits.total_earned_count} 次`,
            ),
            renderCard(
                '使用状态',
                allowed ? '正常' : '受限',
                rateLimit.limit_reached
                    ? '已达到当前周期上限'
                    : '尚未达到使用上限',
            ),
        ].join('');

        const identity =
            usage.email ||
            usage.user_id ||
            usage.account_id ||
            '';

        root.querySelector('#cum-account').textContent =
            [formatPlan(usage.plan_type), identity]
                .filter(Boolean)
                .join(' · ') ||
            'ChatGPT 当前账号';

        const trigger = root.querySelector('#cum-trigger');
        trigger.dataset.state = allowed ? 'ok' : 'error';

        updateLimitRing(
            'cum-ring-5h',
            primaryRemaining
        );

        updateLimitRing(
            'cum-ring-week',
            secondary
                ? secondaryRemaining
                : null,
            secondary ? '—' : '∞'
        );

        if (!lastPowInfo) {
            trigger.title =
                `5 小时剩余 ${primary ? formatPercent(primaryRemaining) : '—'} · 周限额 ${secondary ? formatPercent(secondaryRemaining) : '∞'}`;
        }

        const status = root.querySelector('#cum-status');
        status.className = 'cum-status';

        const partialErrors = [];
        if (data.resetCreditsError) {
            partialErrors.push(`重置额度：${data.resetCreditsError}`);
        }
        if (data.accountsCheckError) {
            partialErrors.push(`订阅信息：${data.accountsCheckError}`);
        }

        status.textContent =
            `更新于 ${new Date().toLocaleString('zh-CN', { hour12: false })}` +
            (partialErrors.length ? `；${partialErrors.join('；')}` : '');

        const subscription = getCurrentAccountInfo(
            data.accountsCheck,
            data.accountId
        );

        const details = [];
        const credits = usage.credits;
        if (credits) {
            let creditValue = '未启用';
            if (credits.unlimited === true) {
                creditValue = '无限';
            } else if (credits.has_credits === true) {
                creditValue = Number(credits.balance ?? 0).toFixed(2);
            }

            details.push(`
                <div class="cum-detail-row">
                    <span>积分余额</span>
                    <span>${escapeHtml(creditValue)}</span>
                </div>
            `);
        }

        if (usage.spend_control) {
            details.push(`
                <div class="cum-detail-row">
                    <span>消费控制</span>
                    <span>${usage.spend_control.reached === true ? '已触发' : '正常'}</span>
                </div>
            `);
        }

        if (rateLimit.primary_window?.limit_window_seconds) {
            details.push(`
                <div class="cum-detail-row">
                    <span>5 小时窗口长度</span>
                    <span>${escapeHtml(formatDuration(rateLimit.primary_window.limit_window_seconds))}</span>
                </div>
            `);
        }

        if (rateLimit.secondary_window?.limit_window_seconds) {
            details.push(`
                <div class="cum-detail-row">
                    <span>周窗口长度</span>
                    <span>${escapeHtml(formatDuration(rateLimit.secondary_window.limit_window_seconds))}</span>
                </div>
            `);
        }

        let detailHtml = '';

        if (subscription) {
            const subscriptionStatus = subscription.active
                ? (subscription.delinquent ? '有效（账单异常）' : '有效')
                : '未激活';

            detailHtml += `
                <section class="cum-section">
                    <div class="cum-section-title">订阅信息</div>
                    <div class="cum-detail-row">
                        <span>套餐</span>
                        <span>${escapeHtml(subscription.plan || '—')}</span>
                    </div>
                    <div class="cum-detail-row">
                        <span>订阅状态</span>
                        <span>${escapeHtml(subscriptionStatus)}</span>
                    </div>
                    <div class="cum-detail-row">
                        <span>${escapeHtml(subscription.periodLabel)}</span>
                        <span>${escapeHtml(formatDateOnly(subscription.periodDate))}</span>
                    </div>
                    <div class="cum-detail-row">
                        <span>自动续费</span>
                        <span>${subscription.willRenew ? '是' : '否'}</span>
                    </div>
                    ${subscription.purchasePlatform ? `
                        <div class="cum-detail-row">
                            <span>购买平台</span>
                            <span>${escapeHtml(subscription.purchasePlatform)}</span>
                        </div>
                    ` : ''}
                </section>
            `;
        }

        if (details.length) {
            detailHtml += `
                <section class="cum-section">
                    <div class="cum-section-title">其他信息</div>
                    ${details.join('')}
                </section>
            `;
        }

        const creditItems = Array.isArray(resetCredits?.credits)
            ? resetCredits.credits
            : [];

        if (creditItems.length) {
            const statusText = {
                available: '可用',
                redeemed: '已使用',
                redeeming: '使用中',
                expired: '已过期',
            };

            detailHtml += `
                <section class="cum-section">
                    <div class="cum-section-title">重置额度明细</div>
                    <div class="cum-credit-list">
                        ${creditItems.map(credit => `
                            <article class="cum-credit">
                                <div class="cum-credit-top">
                                    <div class="cum-credit-name">${escapeHtml(credit.title || '重置额度')}</div>
                                    <div class="cum-credit-status">${escapeHtml(statusText[credit.status] || credit.status || '未知')}</div>
                                </div>
                                <div>${escapeHtml(credit.description || '达到限额后可使用此重置额度。')}</div>
                                <div style="margin-top:5px;color:var(--cum-muted);">
                                    到期：${escapeHtml(formatDateTime(credit.expires_at))}
                                    ${credit.is_supported_by_plan === false ? ' · 当前套餐不支持' : ''}
                                </div>
                            </article>
                        `).join('')}
                    </div>
                </section>
            `;
        }

        root.querySelector('#cum-details').innerHTML = detailHtml;
        renderPowInfo();
        renderRawJson();
    }

    function renderLoading() {
        const root = document.getElementById(ROOT_ID);
        if (!root) return;

        const status = root.querySelector('#cum-status');
        status.className = 'cum-status';
        status.textContent = '正在读取当前 ChatGPT 登录会话和用量数据…';

        root.querySelector('#cum-refresh').disabled = true;

        if (!lastRawData) {
            updateLimitRing(
                'cum-ring-5h',
                null,
                '…'
            );
            updateLimitRing(
                'cum-ring-week',
                null,
                '…'
            );
        }
    }

    function renderError(error) {
        const root = document.getElementById(ROOT_ID);
        if (!root) return;

        const message = String(error?.message || error || '未知错误');
        const status = root.querySelector('#cum-status');
        status.className = 'cum-status error';
        status.textContent = message;

        const trigger = root.querySelector('#cum-trigger');
        trigger.dataset.state = 'error';

        if (!lastRawData) {
            updateLimitRing(
                'cum-ring-5h',
                null,
                '!'
            );
            updateLimitRing(
                'cum-ring-week',
                null,
                '!'
            );
        }

        if (!lastRawData) {
            root.querySelector('#cum-grid').innerHTML = '';
            root.querySelector('#cum-details').innerHTML = '';
            renderRawJson();
        }
    }

    async function refreshUsage(options = {}) {
        if (loading) return false;

        const {
            showError = true,
        } = options;

        loading = true;
        renderLoading();

        try {
            const data = await queryUsage();
            lastRawData = data;
            lastLoadedAt = Date.now();
            renderData(data);
            return true;
        } catch (error) {
            if (showError) {
                console.error('[ChatGPT Usage Monitor]', error);
                renderError(error);
            } else {
                console.debug(
                    '[ChatGPT Usage Monitor] 自动刷新暂未成功，稍后重试：',
                    error?.message || error
                );
            }

            return false;
        } finally {
            loading = false;
            const root = document.getElementById(ROOT_ID);
            if (root) {
                root.querySelector('#cum-refresh').disabled = false;
            }
        }
    }

    function scheduleInitialRefresh() {
        setTimeout(async () => {
            const firstOk = await refreshUsage({ showError: false });
            if (firstOk) return;

            for (let index = 0; index < INITIAL_RETRY_DELAYS_MS.length; index += 1) {
                await new Promise(resolve => {
                    setTimeout(resolve, INITIAL_RETRY_DELAYS_MS[index]);
                });

                const isLastAttempt =
                    index === INITIAL_RETRY_DELAYS_MS.length - 1;

                const ok = await refreshUsage({
                    showError: isLastAttempt,
                });

                if (ok) return;
            }
        }, INITIAL_REFRESH_DELAY_MS);
    }

    function installAutoRefresh() {
        window.setInterval(() => {
            if (
                document.visibilityState === 'visible' &&
                (
                    !lastLoadedAt ||
                    Date.now() - lastLoadedAt >= BACKGROUND_REFRESH_MS
                )
            ) {
                void refreshUsage({ showError: false });
            }
        }, BACKGROUND_REFRESH_MS);

        document.addEventListener('visibilitychange', () => {
            if (
                document.visibilityState === 'visible' &&
                (
                    !lastLoadedAt ||
                    Date.now() - lastLoadedAt >= STALE_AFTER_MS
                )
            ) {
                void refreshUsage({ showError: false });
            }
        });
    }

    function startUi() {
        createUi();
        scheduleInitialRefresh();
        installAutoRefresh();
    }

    function init() {
        installSentinelObserver();
        injectStyle();

        if (document.body) {
            startUi();
            return;
        }

        document.addEventListener('DOMContentLoaded', startUi, { once: true });
    }

    init();
})();
