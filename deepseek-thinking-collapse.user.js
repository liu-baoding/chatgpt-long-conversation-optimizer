// ==UserScript==
// @name         DeepSeek 思考折叠（CSS 优先）
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  通过 document-start CSS 默认隐藏 DeepSeek 思考正文，并支持逐条手动展开/折叠，避免虚拟列表滚动时反复触发原生折叠造成跳转
// @license      MIT
// @author       Liu Baoding
// @match        https://chat.deepseek.com/*
// @match        *://*.deepseek.com/*
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/liu-baoding/chatgpt-webchat-helper/main/deepseek-thinking-collapse.user.js
// @downloadURL  https://raw.githubusercontent.com/liu-baoding/chatgpt-webchat-helper/main/deepseek-thinking-collapse.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    if (window.__deepSeekThinkingCollapseLoaded) return;
    window.__deepSeekThinkingCollapseLoaded = true;

    const ROOT_SHOW_CLASS = 'dstc-show-thinking';
    const BLOCK_OPEN_CLASS = 'dstc-manual-open';
    const BLOCK_CLOSED_CLASS = 'dstc-manual-closed';
    const DARK_BUTTON_CLASS = 'dstc-dark-mode';
    const STYLE_ID = 'dstc-style';
    const BUTTON_ID = 'dstc-toggle';
    const THINK_TITLE_PATTERN = /^(?:已思考|思考中|正在思考|thinking|thought)/i;

    /*
     * 核心原则：
     * 1. 默认不点击 DeepSeek 原生折叠按钮；
     * 2. 不扫描或轮询虚拟列表；
     * 3. 不使用 MutationObserver 追踪历史消息；
     * 4. 不修改 scrollTop / scrollBy；
     * 5. 在 document-start 就注入 CSS，让思考正文第一次参与布局时就是隐藏状态；
     * 6. 只有用户主动点击某条“已思考/思考中”标题时，才切换该条消息的 CSS 展示状态。
     *
     * DeepSeek 当前展开的思考正文带有 .ds-think-content。
     * 即便同一历史消息被虚拟列表反复 unmount / remount，CSS 也会直接生效，
     * 不会发生“先展开 -> 脚本再点击折叠 -> 消息高度突变”的过程。
     */
    function installStyle() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            html:not(.${ROOT_SHOW_CLASS}) .ds-think-content {
                display: none !important;
            }

            html:not(.${ROOT_SHOW_CLASS}) .${BLOCK_OPEN_CLASS} .ds-think-content {
                display: block !important;
            }

            html.${ROOT_SHOW_CLASS} .ds-think-content {
                display: block !important;
            }

            html.${ROOT_SHOW_CLASS} .${BLOCK_CLOSED_CLASS} .ds-think-content {
                display: none !important;
            }

            #${BUTTON_ID} {
                position: fixed;
                right: 18px;
                bottom: 18px;
                z-index: 2147483000;
                min-width: 88px;
                height: 34px;
                padding: 0 13px;
                border: 1px solid rgba(17, 24, 39, 0.14);
                border-radius: 999px;
                color: #374151;
                background: rgba(255, 255, 255, 0.94);
                -webkit-backdrop-filter: blur(12px);
                backdrop-filter: blur(12px);
                box-shadow: 0 4px 18px rgba(0, 0, 0, 0.10);
                font: 12px/1 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                font-weight: 500;
                cursor: pointer;
                opacity: 0.92;
                transition: opacity 0.15s ease, transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
            }

            #${BUTTON_ID}.${DARK_BUTTON_CLASS} {
                color: #e8edf5;
                background: rgba(39, 40, 45, 0.94);
                border-color: rgba(255, 255, 255, 0.15);
                box-shadow: 0 4px 18px rgba(0, 0, 0, 0.28);
            }

            #${BUTTON_ID}:hover {
                opacity: 1;
                transform: translateY(-1px);
                background: rgba(248, 250, 252, 0.98);
                border-color: rgba(17, 24, 39, 0.22);
            }

            #${BUTTON_ID}.${DARK_BUTTON_CLASS}:hover {
                background: rgba(55, 57, 63, 0.98);
                border-color: rgba(255, 255, 255, 0.24);
            }

            #${BUTTON_ID}:active {
                transform: translateY(0);
            }

            #${BUTTON_ID}:focus-visible {
                outline: 2px solid #4d8dff;
                outline-offset: 2px;
            }

            @media (max-width: 700px) {
                #${BUTTON_ID} {
                    right: 10px;
                    bottom: 10px;
                    min-width: 78px;
                    height: 32px;
                    padding: 0 11px;
                }
            }
        `;

        (document.head || document.documentElement).appendChild(style);
    }

    function isShowingThinking() {
        return document.documentElement.classList.contains(ROOT_SHOW_CLASS);
    }

    function parseRgb(color) {
        const match = String(color || '').match(
            /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/i
        );
        if (!match) return null;

        return {
            r: Number(match[1]),
            g: Number(match[2]),
            b: Number(match[3]),
            a: match[4] == null ? 1 : Number(match[4])
        };
    }

    function channelLuminance(value) {
        const channel = value / 255;
        return channel <= 0.04045
            ? channel / 12.92
            : Math.pow((channel + 0.055) / 1.055, 2.4);
    }

    function getPageLuminance() {
        const candidates = [document.body, document.documentElement].filter(Boolean);

        for (const element of candidates) {
            const rgb = parseRgb(getComputedStyle(element).backgroundColor);
            if (!rgb || rgb.a <= 0.05) continue;

            return (
                0.2126 * channelLuminance(rgb.r) +
                0.7152 * channelLuminance(rgb.g) +
                0.0722 * channelLuminance(rgb.b)
            );
        }

        return null;
    }

    function syncButtonTheme() {
        const button = document.getElementById(BUTTON_ID);
        if (!button) return;

        const luminance = getPageLuminance();
        const dark = luminance == null
            ? window.matchMedia('(prefers-color-scheme: dark)').matches
            : luminance < 0.42;

        button.classList.toggle(DARK_BUTTON_CLASS, dark);
    }

    function updateButton(button) {
        if (!button) return;

        const showing = isShowingThinking();
        button.textContent = showing ? '隐藏全部思考' : '显示全部思考';
        button.title = showing
            ? '重新隐藏当前页面已挂载的全部思考正文（Alt+T）'
            : '临时显示当前页面已挂载的全部思考正文（Alt+T）';
        button.setAttribute('aria-pressed', showing ? 'true' : 'false');
        syncButtonTheme();
    }

    function clearManualOverrides() {
        document.querySelectorAll(
            `.${BLOCK_OPEN_CLASS}, .${BLOCK_CLOSED_CLASS}`
        ).forEach(element => {
            element.classList.remove(BLOCK_OPEN_CLASS, BLOCK_CLOSED_CLASS);
        });
    }

    function toggleThinkingVisibility() {
        clearManualOverrides();
        document.documentElement.classList.toggle(ROOT_SHOW_CLASS);
        updateButton(document.getElementById(BUTTON_ID));
    }

    function findThinkingPartsFromClick(target) {
        const element = target instanceof Element
            ? target
            : target && target.parentElement;
        if (!element) return null;

        const message = element.closest(
            '.ds-message, [data-virtual-list-item-key]'
        );
        if (!message) return null;

        const title = Array.from(message.querySelectorAll('span')).find(span => {
            const text = (span.textContent || '').trim();
            const header = span.parentElement;
            return (
                THINK_TITLE_PATTERN.test(text) &&
                header &&
                header.contains(element)
            );
        });

        if (!title) return null;

        const content = message.querySelector('.ds-think-content');
        if (!content) return null;

        return {
            content,
            container: content.parentElement || message
        };
    }

    function handleNativeThinkingClick(event) {
        const parts = findThinkingPartsFromClick(event.target);
        if (!parts) return;

        /*
         * DeepSeek 自己的折叠点击会改变 React 内部状态，并可能让当前隐藏的正文
         * 进入真正的“折叠”状态。这里截获用户主动点击，仅切换我们的 CSS class，
         * 从而既能逐条展开/折叠，又不重新引入虚拟列表自动滚动问题。
         */
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const { container } = parts;

        if (isShowingThinking()) {
            const shouldClose = !container.classList.contains(BLOCK_CLOSED_CLASS);
            container.classList.remove(BLOCK_OPEN_CLASS, BLOCK_CLOSED_CLASS);
            if (shouldClose) container.classList.add(BLOCK_CLOSED_CLASS);
        } else {
            const shouldOpen = !container.classList.contains(BLOCK_OPEN_CLASS);
            container.classList.remove(BLOCK_OPEN_CLASS, BLOCK_CLOSED_CLASS);
            if (shouldOpen) container.classList.add(BLOCK_OPEN_CLASS);
        }
    }

    function installButton() {
        if (!document.body || document.getElementById(BUTTON_ID)) return;

        const button = document.createElement('button');
        button.id = BUTTON_ID;
        button.type = 'button';
        button.addEventListener('click', toggleThinkingVisibility);
        button.addEventListener('pointerenter', syncButtonTheme);
        updateButton(button);
        document.body.appendChild(button);
        syncButtonTheme();
    }

    installStyle();

    /*
     * capture 阶段拦截 DeepSeek 思考标题的原生点击；只处理用户主动操作，
     * 不会因为虚拟列表 mount / unmount 自动触发。
     */
    document.addEventListener('click', handleNativeThinkingClick, true);

    if (document.body) {
        installButton();
    } else {
        document.addEventListener('DOMContentLoaded', installButton, { once: true });
    }

    document.addEventListener('keydown', event => {
        if (
            event.altKey &&
            !event.ctrlKey &&
            !event.metaKey &&
            event.key.toLowerCase() === 't'
        ) {
            event.preventDefault();
            toggleThinkingVisibility();
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) syncButtonTheme();
    });
    window.addEventListener('focus', syncButtonTheme);
})();