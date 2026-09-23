// ==UserScript==
// @name         DeepSeek 思考折叠（CSS 优先）
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  通过 document-start CSS 默认隐藏 DeepSeek 思考正文，避免虚拟列表滚动时反复触发原生折叠造成跳转
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
    const STYLE_ID = 'dstc-style';
    const BUTTON_ID = 'dstc-toggle';

    /*
     * 核心原则：
     * 1. 不点击 DeepSeek 原生折叠按钮；
     * 2. 不扫描虚拟列表；
     * 3. 不使用 MutationObserver；
     * 4. 不修改 scrollTop / scrollBy；
     * 5. 在 document-start 就注入 CSS，让思考正文第一次参与布局时就是隐藏状态。
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

            html.${ROOT_SHOW_CLASS} .ds-think-content {
                display: block !important;
            }

            #${BUTTON_ID} {
                position: fixed;
                right: 18px;
                bottom: 18px;
                z-index: 2147483000;
                min-width: 86px;
                height: 34px;
                padding: 0 12px;
                border: 1px solid rgba(127, 127, 127, 0.28);
                border-radius: 999px;
                color: inherit;
                background: color-mix(in srgb, currentColor 8%, transparent);
                -webkit-backdrop-filter: blur(10px);
                backdrop-filter: blur(10px);
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.10);
                font: 12px/1 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                cursor: pointer;
                opacity: 0.82;
                transition: opacity 0.15s ease, transform 0.15s ease;
            }

            #${BUTTON_ID}:hover {
                opacity: 1;
                transform: translateY(-1px);
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
                    min-width: 76px;
                    height: 32px;
                    padding: 0 10px;
                }
            }
        `;

        (document.head || document.documentElement).appendChild(style);
    }

    function isShowingThinking() {
        return document.documentElement.classList.contains(ROOT_SHOW_CLASS);
    }

    function updateButton(button) {
        if (!button) return;

        const showing = isShowingThinking();
        button.textContent = showing ? '隐藏思考' : '显示思考';
        button.title = showing
            ? '重新隐藏当前页面已挂载的思考正文（Alt+T）'
            : '临时显示当前页面已挂载的思考正文（Alt+T）';
        button.setAttribute('aria-pressed', showing ? 'true' : 'false');
    }

    function toggleThinkingVisibility() {
        document.documentElement.classList.toggle(ROOT_SHOW_CLASS);
        updateButton(document.getElementById(BUTTON_ID));
    }

    function installButton() {
        if (!document.body || document.getElementById(BUTTON_ID)) return;

        const button = document.createElement('button');
        button.id = BUTTON_ID;
        button.type = 'button';
        button.addEventListener('click', toggleThinkingVisibility);
        updateButton(button);
        document.body.appendChild(button);
    }

    installStyle();

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
})();
