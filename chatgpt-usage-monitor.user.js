// ==UserScript==
// @name         ChatGPT 用量监视器
// @namespace    https://tampermonkey.net/
// @version      1.0.0
// @description  在 ChatGPT 页面内直接读取当前登录会话并显示 5 小时/周限额、重置额度和使用状态，无需手工维护 Bearer Token
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

    const ROOT_ID = 'chatgpt-usage-monitor-root';
    const STYLE_ID = 'chatgpt-usage-monitor-style';
    const STALE_AFTER_MS = 60 * 1000;

    let lastLoadedAt = 0;
    let lastRawData = null;
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

        const [usageResult, resetResult] = await Promise.allSettled([
            fetchJson(USAGE_URL, auth),
            fetchJson(RESET_CREDITS_URL, auth),
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
                right: 18px;
                bottom: 72px;
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
                min-width: 126px;
                height: 38px;
                border: 1px solid var(--cum-border);
                border-radius: 999px;
                background: var(--cum-bg);
                color: var(--cum-text);
                box-shadow: 0 8px 26px rgba(0, 0, 0, 0.14);
                padding: 0 14px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 7px;
            }

            #cum-trigger:hover {
                background: var(--cum-bg-soft);
            }

            #cum-trigger[data-state="error"] {
                color: var(--cum-danger);
            }

            #cum-trigger-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: var(--cum-accent);
                flex: none;
            }

            #cum-panel {
                position: absolute;
                right: 0;
                bottom: 48px;
                width: min(390px, calc(100vw - 24px));
                max-height: min(660px, calc(100vh - 130px));
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

            @media (max-width: 520px) {
                #${ROOT_ID} {
                    right: 12px;
                    bottom: 68px;
                }

                #cum-panel {
                    width: calc(100vw - 24px);
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
                <span id="cum-trigger-dot"></span>
                <span id="cum-trigger-text">Usage · —</span>
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
                    <div class="cum-status" id="cum-status">打开面板后自动读取当前 ChatGPT 会话。</div>
                    <div class="cum-grid" id="cum-grid"></div>
                    <div id="cum-details"></div>

                    <details class="cum-section">
                        <summary class="cum-section-title" style="cursor:pointer;">原始 JSON</summary>
                        <pre id="cum-raw">{}</pre>
                    </details>

                    <div class="cum-footer-note">
                        Bearer Token 仅从当前 ChatGPT 登录会话读取并保存在内存中，不写入 localStorage、Tampermonkey 存储或本地文件。
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
        const triggerText = root.querySelector('#cum-trigger-text');

        trigger.dataset.state = allowed ? 'ok' : 'error';
        triggerText.textContent = primary
            ? `5h ${formatPercent(primaryRemaining)} · Week ${secondary ? formatPercent(secondaryRemaining) : '∞'}`
            : 'Usage · 已更新';

        const status = root.querySelector('#cum-status');
        status.className = 'cum-status';
        status.textContent =
            `更新于 ${new Date().toLocaleString('zh-CN', { hour12: false })}` +
            (data.resetCreditsError ? `；重置额度详情：${data.resetCreditsError}` : '');

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
        root.querySelector('#cum-raw').textContent = JSON.stringify({
            usage: data.usage,
            rate_limit_reset_credits: data.resetCredits,
        }, null, 2);
    }

    function renderLoading() {
        const root = document.getElementById(ROOT_ID);
        if (!root) return;

        const status = root.querySelector('#cum-status');
        status.className = 'cum-status';
        status.textContent = '正在读取当前 ChatGPT 登录会话和用量数据…';

        root.querySelector('#cum-refresh').disabled = true;
        root.querySelector('#cum-trigger-text').textContent = 'Usage · …';
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
        root.querySelector('#cum-trigger-text').textContent = 'Usage · Error';

        if (!lastRawData) {
            root.querySelector('#cum-grid').innerHTML = '';
            root.querySelector('#cum-details').innerHTML = '';
            root.querySelector('#cum-raw').textContent = JSON.stringify({
                error: message,
            }, null, 2);
        }
    }

    async function refreshUsage() {
        if (loading) return;

        loading = true;
        renderLoading();

        try {
            const data = await queryUsage();
            lastRawData = data;
            lastLoadedAt = Date.now();
            renderData(data);
        } catch (error) {
            console.error('[ChatGPT Usage Monitor]', error);
            renderError(error);
        } finally {
            loading = false;
            const root = document.getElementById(ROOT_ID);
            if (root) {
                root.querySelector('#cum-refresh').disabled = false;
            }
        }
    }

    function init() {
        injectStyle();

        if (document.body) {
            createUi();
            return;
        }

        document.addEventListener('DOMContentLoaded', createUi, { once: true });
    }

    init();
})();
