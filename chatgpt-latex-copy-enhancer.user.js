// ==UserScript==
// @name         AI LaTeX 悬浮与复制增强
// @namespace    http://tampermonkey.net/
// @version      3.0.2
// @description  为 ChatGPT、Claude、DeepSeek、Gemini、AI Studio、豆包、知乎等网站提供公式悬浮预览、单公式复制、选择复制和复制按钮修复
// @license      MIT
// @author       Liu Baoding; multi-site compatibility adapted from fanxing's AI网站公式复制Latex (MIT)
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        *://claude.ai/*
// @match        *://demo.fuclaude.oaifree.com/*
// @match        *://*.deepseek.com/*
// @match        *://chat.deepseek.com/*
// @match        *://gemini.google.com/*
// @match        *://aistudio.google.com/*
// @match        *://*.doubao.com/*
// @match        *://*.zhihu.com/*
// @match        *://*.wikipedia.org/*
// @match        *://*.x.liaox.ai/*
// @match        *://*.moonshot.cn/*
// @match        *://*.stackexchange.com/*
// @match        *://*.oi-wiki.org/*
// @match        *://*.luogu.com/*
// @match        *://*.yuanbao.tencent.com/*
// @updateURL    https://raw.githubusercontent.com/liu-baoding/chatgpt-webchat-helper/main/chatgpt-latex-copy-enhancer.user.js
// @downloadURL  https://raw.githubusercontent.com/liu-baoding/chatgpt-webchat-helper/main/chatgpt-latex-copy-enhancer.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    if (window.__aiLatexEnhancerLoaded) return;
    window.__aiLatexEnhancerLoaded = true;

    const CHATGPT_FORMULA_CONTAINER_SELECTOR =
        '[data-client-katex-layout][aria-label], [data-markdown-copy="math"][aria-label]';
    const TEX_ANNOTATION = 'annotation[encoding="application/x-tex"]';

    function elementFromNode(node) {
        if (node instanceof Element) return node;
        return node && node.parentElement instanceof Element ? node.parentElement : null;
    }

    function hostMatches(...domains) {
        const host = location.hostname.toLowerCase();
        return domains.some(domain => host === domain || host.endsWith('.' + domain));
    }

    function isDisplayFormula(element) {
        if (!element) return false;
        return Boolean(
            element.closest('.katex-display, .math-display, .math-block, .ds-markdown-math') ||
            element.matches('.katex-display, .math-display, .math-block, .ds-markdown-math') ||
            (element.tagName === 'MS-KATEX' && !element.classList.contains('inline')) ||
            (element.closest('ms-katex') &&
                !element.closest('ms-katex').classList.contains('inline'))
        );
    }

    function annotationFormulaInfo(node, options = {}) {
        const element = elementFromNode(node);
        if (!element) return null;

        const selector =
            options.selector ||
            '.katex, .math-inline, .math-display, ms-katex, span.math';

        let carrier = element.closest(selector);
        if (!carrier && element.matches(selector)) carrier = element;
        if (!carrier) return null;

        const annotation = carrier.querySelector(TEX_ANNOTATION);
        if (!annotation || !annotation.textContent.trim()) return null;

        const katex =
            carrier.matches('.katex')
                ? carrier
                : carrier.querySelector('.katex');

        const display =
            typeof options.display === 'function'
                ? options.display(carrier, katex)
                : isDisplayFormula(carrier);

        const container =
            typeof options.container === 'function'
                ? options.container(carrier, katex, display)
                : (
                    (display &&
                        carrier.closest(
                            '.katex-display, .math-display, .math-block, .ds-markdown-math'
                        )) ||
                    carrier
                );

        return {
            katex: katex || carrier,
            container: container || carrier,
            latex: annotation.textContent.trim(),
            display,
            visibleText:
                ((katex || carrier).innerText ||
                    (katex || carrier).textContent ||
                    '').trim()
        };
    }

    function chatgptFormulaInfo(node) {
        const element = elementFromNode(node);
        const katex = element && element.closest('.katex');
        if (!katex) return null;

        const container =
            katex.closest(CHATGPT_FORMULA_CONTAINER_SELECTOR);
        const annotation = katex.querySelector(TEX_ANNOTATION);
        const latex =
            (container && container.getAttribute('aria-label')) ||
            (annotation && annotation.textContent);

        if (!latex || !latex.trim()) return null;

        return {
            katex,
            container:
                container ||
                katex.closest('.katex-display') ||
                katex,
            latex: latex.trim(),
            display: Boolean(katex.closest('.katex-display')),
            visibleText:
                (katex.innerText || katex.textContent || '').trim()
        };
    }

    function doubaoFormulaInfo(node) {
        const element = elementFromNode(node);
        if (!element) return null;

        const container =
            element.closest('.container-rkuXQi') ||
            element.closest('.katex, .math-inline, .math-display');
        if (!container) return null;

        const customCopyText =
            container.getAttribute('data-custom-copy-text') ||
            element.getAttribute('data-custom-copy-text');

        if (customCopyText && customCopyText.trim()) {
            const katex =
                container.querySelector('.katex') ||
                container;
            const display = Boolean(
                container.querySelector('.katex-display') ||
                container.closest('.katex-display, .math-display') ||
                container.classList.contains('math-display') ||
                (
                    !container.classList.contains('math-inline') &&
                    !element.classList.contains('math-inline')
                )
            );

            return {
                katex,
                container,
                latex: customCopyText.trim(),
                display,
                visibleText:
                    (katex.innerText || katex.textContent || '').trim()
            };
        }

        return annotationFormulaInfo(element, {
            selector: '.katex, .math-inline, .math-display'
        });
    }

    function zhihuFormulaInfo(node) {
        const element = elementFromNode(node);
        const formula = element && element.closest('.ztext-math');
        if (!formula) return null;

        const latex = formula.getAttribute('data-tex');
        if (!latex || !latex.trim()) return null;

        return {
            katex: formula,
            container: formula,
            latex: latex.trim(),
            display: formula.classList.contains('ztext-math-block'),
            visibleText:
                (formula.innerText || formula.textContent || '').trim()
        };
    }

    const geminiKatexMap = new Map();
    let geminiHookInstalled = false;
    let geminiHookTimer = null;

    function hookGeminiKatexRender(katexObject) {
        if (!katexObject || typeof katexObject.render !== 'function') {
            return false;
        }

        if (katexObject.render.__aiLatexHooked) {
            geminiHookInstalled = true;
            return true;
        }

        const originalRender = katexObject.render;
        const wrappedRender = function (...args) {
            const result = originalRender.apply(this, args);

            try {
                const latex = args[0];
                const target = args[1];

                if (
                    typeof latex === 'string' &&
                    target instanceof Element
                ) {
                    const katexHtml =
                        target.querySelector('.katex-html');

                    if (katexHtml) {
                        geminiKatexMap.set(
                            katexHtml.outerHTML,
                            latex
                        );
                        katexHtml.setAttribute(
                            'data-ai-latex-source',
                            latex
                        );
                    }
                }
            } catch (_) {
                // Never interfere with the site's renderer.
            }

            return result;
        };

        try {
            Object.defineProperty(
                wrappedRender,
                '__aiLatexHooked',
                { value: true }
            );
            katexObject.render = wrappedRender;
            geminiHookInstalled = true;
            return true;
        } catch (_) {
            return false;
        }
    }

    function prepareGeminiHook() {
        const tryHook = () => {
            if (geminiHookInstalled) return true;
            return Boolean(
                window.katex &&
                hookGeminiKatexRender(window.katex)
            );
        };

        if (!tryHook()) {
            try {
                const descriptor =
                    Object.getOwnPropertyDescriptor(
                        window,
                        'katex'
                    );

                if (!descriptor || descriptor.configurable) {
                    let currentKatex = window.katex;

                    Object.defineProperty(
                        window,
                        'katex',
                        {
                            configurable: true,
                            get() {
                                return currentKatex;
                            },
                            set(value) {
                                currentKatex = value;
                                if (!geminiHookInstalled) {
                                    hookGeminiKatexRender(value);
                                }
                            }
                        }
                    );
                }
            } catch (_) {
                // Fall back to polling when the property cannot be wrapped.
            }
        }

        let attempts = 0;
        geminiHookTimer = window.setInterval(() => {
            attempts += 1;
            if (tryHook() || attempts >= 80) {
                clearInterval(geminiHookTimer);
                geminiHookTimer = null;
            }
        }, 250);
    }
    function geminiFormulaInfo(node) {
        const element = elementFromNode(node);
        if (!element) return null;

        const katexHtml =
            element.closest('.katex-html') ||
            element.querySelector?.('.katex-html');

        const katex =
            element.closest('.katex') ||
            (katexHtml && katexHtml.closest('.katex'));

        if (katex) {
            const annotation =
                katex.querySelector(TEX_ANNOTATION);

            if (
                annotation &&
                annotation.textContent &&
                annotation.textContent.trim()
            ) {
                return {
                    katex,
                    container:
                        katex.closest(
                            '.math-block, .katex-display'
                        ) ||
                        katex,
                    latex: annotation.textContent.trim(),
                    display: isDisplayFormula(katex),
                    visibleText:
                        (katex.innerText ||
                            katex.textContent ||
                            '').trim()
                };
            }
        }

        if (!katexHtml) return null;

        const latex =
            katexHtml.getAttribute('data-ai-latex-source') ||
            geminiKatexMap.get(katexHtml.outerHTML);

        if (!latex) return null;

        return {
            katex: katex || katexHtml,
            container:
                (katex || katexHtml).closest(
                    '.math-block, .katex-display'
                ) ||
                katex ||
                katexHtml,
            latex,
            display: isDisplayFormula(katex || katexHtml),
            visibleText:
                ((katex || katexHtml).innerText ||
                    (katex || katexHtml).textContent ||
                    '').trim()
        };
    }

    function isCodeCopyButton(button) {
        return Boolean(
            button &&
            button.closest(
                'pre, code, .code-block, [class*="code-block"], [class*="codeBlock"], [data-code-block]'
            )
        );
    }

    const SITE_ADAPTERS = [
        {
            id: 'chatgpt',
            name: 'ChatGPT',
            matches: () =>
                hostMatches('chatgpt.com', 'chat.openai.com'),
            selectionSelector:
                '[data-client-katex-layout][aria-label] .katex, ' +
                '[data-markdown-copy="math"][aria-label] .katex, .katex',
            getFormulaInfo: chatgptFormulaInfo,
            replyCopyMode: 'chatgpt'
        },
        {
            id: 'claude',
            name: 'Claude',
            matches: () =>
                hostMatches(
                    'claude.ai',
                    'fuclaude.oaifree.com'
                ),
            selectionSelector:
                '.katex, .math-inline, .math-display',
            getFormulaInfo: node =>
                annotationFormulaInfo(node, {
                    selector:
                        '.katex, .math-inline, .math-display'
                })
        },
        {
            id: 'deepseek',
            name: 'DeepSeek',
            matches: () => hostMatches('deepseek.com'),
            selectionSelector: '.katex',
            getFormulaInfo: node =>
                annotationFormulaInfo(node, {
                    selector: '.katex',
                    display: carrier =>
                        Boolean(
                            carrier.closest(
                                '.ds-markdown-math, .katex-display'
                            )
                        ),
                    container: carrier =>
                        carrier.closest(
                            '.ds-markdown-math, .katex-display'
                        ) ||
                        carrier
                }),
            replyCopyMode: 'deepseek'
        },
        {
            id: 'gemini',
            name: 'Google Gemini',
            matches: () =>
                hostMatches('gemini.google.com'),
            selectionSelector:
                '.katex, .katex-html, .math-inline, .math-display, .math-block',
            getFormulaInfo: geminiFormulaInfo,
            stopImmediateOnSelection: true,
            expandSelectionToFormula: true,
            beforeInit: prepareGeminiHook
        },
        {
            id: 'aistudio',
            name: 'Google AI Studio',
            matches: () =>
                hostMatches('aistudio.google.com'),
            selectionSelector:
                'ms-katex, .katex, .math-inline, .math-display',
            getFormulaInfo: node =>
                annotationFormulaInfo(node, {
                    selector:
                        'ms-katex, .katex, .math-inline, .math-display'
                })
        },
        {
            id: 'doubao',
            name: '豆包',
            matches: () => hostMatches('doubao.com'),
            selectionSelector:
                '.container-rkuXQi, .katex, .math-inline, .math-display',
            getFormulaInfo: doubaoFormulaInfo,
            replyCopyMode: 'normalize'
        },
        {
            id: 'zhihu',
            name: '知乎',
            matches: () => hostMatches('zhihu.com'),
            selectionSelector: '.ztext-math',
            getFormulaInfo: zhihuFormulaInfo
        },
        {
            id: 'generic-katex',
            name: 'KaTeX site',
            matches: () =>
                [
                    'wikipedia.org',
                    'x.liaox.ai',
                    'moonshot.cn',
                    'stackexchange.com',
                    'oi-wiki.org',
                    'luogu.com',
                    'yuanbao.tencent.com'
                ].some(domain => hostMatches(domain)),
            selectionSelector:
                '.katex, .math-inline, .math-display, span.math',
            getFormulaInfo: node =>
                annotationFormulaInfo(node, {
                    selector:
                        '.katex, .math-inline, .math-display, span.math'
                })
        }
    ];

    const ACTIVE_ADAPTER =
        SITE_ADAPTERS.find(adapter => adapter.matches());

    if (!ACTIVE_ADAPTER) return;

    if (typeof ACTIVE_ADAPTER.beforeInit === 'function') {
        ACTIVE_ADAPTER.beforeInit();
    }

        const HOVER_CLASS = 'chatgpt-latex-hover';
    let activeFormulaContainer = null;
    let previewTimer = null;

    const style = document.createElement('style');
    style.textContent = `
        .${HOVER_CLASS} {
            cursor: pointer !important;
            box-shadow: 0 0 0 1px #007bff !important;
            background-color: rgba(0, 123, 255, 0.10) !important;
            border-radius: 3px;
        }
        #chatgpt-latex-preview {
            position: fixed;
            display: none;
            max-width: min(420px, calc(100vw - 20px));
            padding: 8px 12px;
            color: #fff;
            background: #333;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
            font: 12px/1.4 monospace;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            pointer-events: none;
            z-index: 2147483647;
        }
        .chatgpt-latex-toast {
            position: fixed;
            right: 20px;
            bottom: 20px;
            padding: 10px 14px;
            border-radius: 4px;
            color: #fff;
            background: #333;
            font: 14px Arial, sans-serif;
            z-index: 2147483647;
        }
        .chatgpt-latex-toast.error { background: #c62828; }
    `;
    document.head.appendChild(style);

    const preview = document.createElement('div');
    preview.id = 'chatgpt-latex-preview';
    document.body.appendChild(preview);

    function showToast(message, isError) {
        const existing = document.querySelector('.chatgpt-latex-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `chatgpt-latex-toast${isError ? ' error' : ''}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 1800);
    }

    /**
     * 从 ChatGPT 的公开公式容器中读取源码。
     * 不扫描、不缓存，也不在 DOM 上写入任何处理标记。
     */
    function getFormulaInfo(node) {
        return ACTIVE_ADAPTER.getFormulaInfo(node);
    }

    function stripOuterDelimiters(input) {
        let latex = String(input || '').trim();
        if (!latex) return '';

        if (latex.startsWith('$$') && latex.endsWith('$$') && latex.length >= 4) {
            latex = latex.slice(2, -2).trim();
        } else if (latex.startsWith('$') && latex.endsWith('$') && latex.length >= 2) {
            latex = latex.slice(1, -1).trim();
        } else if (
            (latex.startsWith('\\(') && latex.endsWith('\\)')) ||
            (latex.startsWith('\\[') && latex.endsWith('\\]'))
        ) {
            latex = latex.slice(2, -2).trim();
        }

        return latex;
    }

    function formatLatex(info) {
        const latex = stripOuterDelimiters(info && info.latex);
        if (!latex) return '';
        return info.display
            ? '\n$$\n' + latex + '\n$$\n'
            : '$' + latex + '$';
    }

    function hidePreview() {
        clearTimeout(previewTimer);
        preview.style.display = 'none';
        if (activeFormulaContainer) {
            activeFormulaContainer.classList.remove(HOVER_CLASS);
            activeFormulaContainer = null;
        }
    }

    function showPreview(info) {
        preview.textContent = formatLatex(info);
        preview.style.display = 'block';

        const rect = info.container.getBoundingClientRect();
        const previewRect = preview.getBoundingClientRect();
        const left = Math.max(10, Math.min(rect.left, window.innerWidth - previewRect.width - 10));
        const top = rect.top > previewRect.height + 10
            ? rect.top - previewRect.height - 6
            : rect.bottom + 6;

        preview.style.left = `${left}px`;
        preview.style.top = `${Math.max(10, top)}px`;
    }

    function handleFormulaHover(event) {
        const info = getFormulaInfo(event.target);
        if (!info || activeFormulaContainer === info.container) return;

        hidePreview();
        activeFormulaContainer = info.container;
        info.container.classList.add(HOVER_CLASS);
        previewTimer = setTimeout(() => {
            if (activeFormulaContainer === info.container) showPreview(info);
        }, 300);
    }

    function handleFormulaLeave(event) {
        if (!activeFormulaContainer) return;
        const nextInfo = getFormulaInfo(event.relatedTarget);
        if (nextInfo && nextInfo.container === activeFormulaContainer) return;
        hidePreview();
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            try {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
                document.body.appendChild(textarea);
                textarea.select();
                const copied = document.execCommand('copy');
                textarea.remove();
                return copied;
            } catch (_) {
                return false;
            }
        }
    }

    async function copySingleFormula(event) {
        const info = getFormulaInfo(event.target);
        if (!info) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        const copied = await copyText(formatLatex(info));
        showToast(copied ? '已复制 LaTeX 公式' : '复制 LaTeX 公式失败', !copied);
    }

    function getAssistantReplyRoot(button) {
        if (
            ACTIVE_ADAPTER.id !== 'chatgpt' ||
            !button
        ) {
            return null;
        }

        const directAssistant =
            button.closest(
                '[data-content-search-unit-key$=":assistant"]'
            );

        if (directAssistant) {
            return directAssistant;
        }

        const turn =
            button.closest('[data-turn-key]');

        if (turn) {
            const assistantUnit =
                turn.querySelector(
                    '[data-content-search-unit-key$=":assistant"]'
                );

            if (assistantUnit) {
                return assistantUnit;
            }

            const markdown =
                turn.querySelector(
                    '[data-markdown-text-style="assistant-message"]'
                );

            if (markdown) {
                return (
                    markdown.closest(
                        '[data-content-search-unit-key]'
                    ) ||
                    markdown
                );
            }
        }

        const directMessage =
            button.closest(
                '[data-message-author-role="assistant"]'
            );

        if (directMessage) {
            return directMessage;
        }

        const oldTurn =
            button.closest(
                'article[data-testid^="conversation-turn-"], ' +
                '[data-testid^="conversation-turn-"]'
            );

        if (
            !oldTurn ||
            !oldTurn.querySelector(
                '[data-message-author-role="assistant"]'
            )
        ) {
            return null;
        }

        return oldTurn;
    }
    function getDeepSeekReplyRoot(button) {
        if (!button) return null;

        const item =
            button.closest(
                '[data-virtual-list-item-key]'
            );

        if (item) {
            const reply =
                item.querySelector(
                    '.ds-assistant-message-main-content'
                );

            if (reply) {
                return reply;
            }
        }

        const actionRow =
            button.closest('.ds-flex');

        const parent =
            actionRow &&
            actionRow.parentElement;

        return (
            parent &&
            parent.querySelector(
                '.ds-assistant-message-main-content'
            )
        ) || null;
    }


    function isReplyCopyButton(button) {
        if (!button) return false;

        if (ACTIVE_ADAPTER.id === 'chatgpt') {
            const actionBar =
                button.closest('.turn-action-controls');

            if (actionBar) {
                const label =
                    (
                        button.getAttribute(
                            'aria-label'
                        ) ||
                        ''
                    )
                        .trim()
                        .toLowerCase();

                if (
                    label === '复制' ||
                    label === 'copy'
                ) {
                    return true;
                }
            }

            const testId =
                button.getAttribute('data-testid') ||
                '';

            return (
                testId.includes('action-bar-copy') ||
                testId.includes('copy-turn') ||
                Boolean(
                    button.querySelector(
                        'svg[data-testid*="copy"], ' +
                        '[data-testid*="action-bar-copy"]'
                    )
                )
            );
        }

        if (
            ACTIVE_ADAPTER.id === 'deepseek'
        ) {
            if (
                isCodeCopyButton(button) ||
                button.closest(
                    '.ds-markdown-code-copy-button'
                )
            ) {
                return false;
            }

            const semanticText = [
                button.getAttribute('aria-label'),
                button.getAttribute('title'),
                button.getAttribute('data-tooltip'),
                button.getAttribute('data-tooltip-content'),
                button.getAttribute('data-testid'),
                button.textContent,
                button.className
            ]
                .filter(value => typeof value === 'string')
                .join(' ')
                .toLowerCase();

            if (
                semanticText.includes('copy') ||
                semanticText.includes('复制')
            ) {
                return true;
            }

            if (
                button.matches(
                    'button.copy-btn, .copy-btn'
                ) ||
                button.querySelector(
                    'svg[data-icon="copy"], ' +
                    '[data-testid*="copy"], ' +
                    '[aria-label*="copy" i], ' +
                    '[title*="copy" i]'
                )
            ) {
                return true;
            }

            /*
             * 2026-09 DeepSeek 当前回复操作栏：
             *   <div role="button" class="ds-button ...">
             *     <svg width="16" height="16" viewBox="0 0 16 16">
             *       <path d="M6.14929 4.02032 ...">
             *
             * 该复制图标没有 aria-label / title / data-testid，
             * 因此使用 SVG path 前缀作为稳定的最后回退。
             */
            const copyIconPath = Array.from(
                button.querySelectorAll(
                    'svg[viewBox="0 0 16 16"] path[d]'
                )
            ).find(path => {
                const d =
                    path.getAttribute('d') ||
                    '';

                return d.startsWith(
                    'M6.14929 4.02032'
                );
            });

            return Boolean(copyIconPath);
        }

        if (
            ACTIVE_ADAPTER.id === 'doubao'
        ) {
            return Boolean(
                !isCodeCopyButton(button) &&
                button.matches(
                    'button[data-testid="message_action_copy"]'
                )
            );
        }

        return false;
    }

    function collectFormulas(replyRoot) {
        if (!replyRoot) return [];

        const result = [];
        const seenContainers = new Set();
        const candidates = [];

        if (
            replyRoot instanceof Element &&
            replyRoot.matches(
                ACTIVE_ADAPTER.selectionSelector
            )
        ) {
            candidates.push(replyRoot);
        }

        candidates.push(
            ...replyRoot.querySelectorAll(
                ACTIVE_ADAPTER.selectionSelector
            )
        );

        for (const candidate of candidates) {
            const info =
                getFormulaInfo(candidate);

            if (
                !info ||
                !info.container ||
                !info.latex ||
                seenContainers.has(info.container)
            ) {
                continue;
            }

            seenContainers.add(info.container);
            result.push(info);
        }

        return result;
    }

    function processSelectedFragment(fragment) {
        const wrapper =
            document.createElement('div');

        wrapper.appendChild(
            fragment.cloneNode(true)
        );

        const candidates =
            Array.from(
                wrapper.querySelectorAll(
                    ACTIVE_ADAPTER.selectionSelector
                )
            );

        const replaced =
            new Set();

        for (const candidate of candidates) {
            const info =
                getFormulaInfo(candidate);

            if (
                !info ||
                !info.container ||
                !info.container.parentNode ||
                !wrapper.contains(info.container) ||
                replaced.has(info.container)
            ) {
                continue;
            }

            const replacement =
                formatLatex(info);

            if (!replacement) {
                continue;
            }

            info.container.parentNode.replaceChild(
                document.createTextNode(
                    replacement
                ),
                info.container
            );

            replaced.add(info.container);
        }

        return {
            text:
                wrapper.textContent ||
                '',
            formulaCount:
                replaced.size
        };
    }

    function handleSelectionCopy(event) {
        const selection =
            window.getSelection();

        if (
            !selection ||
            selection.isCollapsed ||
            selection.rangeCount === 0
        ) {
            return;
        }

        const range =
            selection
                .getRangeAt(0)
                .cloneRange();

        if (
            ACTIVE_ADAPTER
                .expandSelectionToFormula
        ) {
            const selector =
                '.katex, .katex-html, ' +
                '.math-inline, .math-display, ' +
                '.math-block';

            const startElement =
                elementFromNode(
                    range.startContainer
                );

            const startFormula =
                startElement &&
                startElement.closest(
                    selector
                );

            if (startFormula) {
                range.setStartBefore(
                    startFormula
                );
            }

            const endElement =
                elementFromNode(
                    range.endContainer
                );

            const endFormula =
                endElement &&
                endElement.closest(
                    selector
                );

            if (endFormula) {
                range.setEndAfter(
                    endFormula
                );
            }
        }

        const result =
            processSelectedFragment(
                range.cloneContents()
            );

        if (
            !result.formulaCount ||
            !result.text
        ) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (
            ACTIVE_ADAPTER
                .stopImmediateOnSelection
        ) {
            event.stopImmediatePropagation();
        }

        if (event.clipboardData) {
            event.clipboardData.setData(
                'text/plain',
                result.text
            );

            showToast(
                `已格式化选中的 ${result.formulaCount} 个公式`,
                false
            );

            return;
        }

        copyText(
            result.text
        ).then(copied => {
            showToast(
                copied
                    ? `已格式化选中的 ${result.formulaCount} 个公式`
                    : '选择复制失败',
                !copied
            );
        });
    }

    function findRegexAfter(text, start, expression) {
        expression.lastIndex = 0;
        const match = expression.exec(text.slice(start));
        if (!match) return null;
        return { index: start + match.index, length: match[0].length };
    }

    function replaceRange(text, range, replacement) {
        return text.slice(0, range.index) + replacement + text.slice(range.index + range.length);
    }

    /**
     * 在复制文本中定位一个已知公式，优先吞掉其外侧的定界符。
     * ChatGPT 会将 \(...\) 与 \[...\] 中的反斜杠丢失，分别变为 (...) 与 [...].
     */
    function findLiteralFormula(text, start, latex, display) {
        if (!latex) return null;

        let searchFrom = start;
        let firstLiteralRange = null;

        while (searchFrom <= text.length) {
            const index = text.indexOf(latex, searchFrom);
            if (index === -1) break;

            const contentEnd = index + latex.length;
            if (!firstLiteralRange) {
                firstLiteralRange = { index, length: latex.length };
            }

            // 允许公式与定界符之间存在水平空格。
            let left = index;
            let right = contentEnd;
            while (left > start && /[ \t]/.test(text[left - 1])) left -= 1;
            while (right < text.length && /[ \t]/.test(text[right])) right += 1;

            if (display) {
                if (text.slice(Math.max(start, left - 2), left) === '$$' &&
                    text.slice(right, right + 2) === '$$') {
                    return { index: left - 2, length: right + 2 - (left - 2) };
                }
                if (text.slice(Math.max(start, left - 2), left) === '\\[' &&
                    text.slice(right, right + 2) === '\\]') {
                    return { index: left - 2, length: right + 2 - (left - 2) };
                }
                // ChatGPT 将 \[formula\] 复制为 [formula]。
                if (left > start && text[left - 1] === '[' && text[right] === ']') {
                    return { index: left - 1, length: right + 1 - (left - 1) };
                }
            } else {
                if (text.slice(Math.max(start, left - 2), left) === '\\(' &&
                    text.slice(right, right + 2) === '\\)') {
                    return { index: left - 2, length: right + 2 - (left - 2) };
                }
                if (left > start && text[left - 1] === '$' && text[right] === '$') {
                    // 不将 $$...$$ 误判为行内公式。
                    const isDoubleDollar = (left >= 2 && text[left - 2] === '$') ||
                        text[right + 1] === '$';
                    if (!isDoubleDollar) {
                        return { index: left - 1, length: right + 1 - (left - 1) };
                    }
                }
                // ChatGPT 将 \(formula\) 复制为 (formula)。
                if (left > start && text[left - 1] === '(' && text[right] === ')') {
                    return { index: left - 1, length: right + 1 - (left - 1) };
                }
            }

            // 当前同源码出现位置没有完整定界符，继续寻找下一处。
            searchFrom = index + Math.max(latex.length, 1);
        }

        // 全部尝试失败后，才回退到仅替换公式正文。
        return firstLiteralRange;
    }

    function simplifyLatex(latex) {
        return latex
            .replace(/\\([a-zA-Z]+)\s*/g, '$1')
            .replace(/[{}]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * 修复官方“复制回复”生成的公式文本。
     *
     * 行间公式必须优先匹配完整的外层公式块，不能先替换块内正文，
     * 否则会遗留方括号。
     */
    function repairCopiedReply(text, formulas) {
        if (typeof text !== 'string' || formulas.length === 0) {
            return text;
        }

        let repaired = text.replace(/\r\n?/g, '\n');
        let cursor = 0;

        for (const formula of formulas) {
            // 回复内公式块保留原有段落边界，不额外添加首尾换行。
            const replacement = formula.display
                ? `$$\n${formula.latex}\n$$`
                : `$${formula.latex}$`;
            let range = null;

            if (formula.display) {
                // ChatGPT 当前复制结果：[\n ... \n]，必须整体优先替换。
                range = findRegexAfter(
                    repaired,
                    cursor,
                    /^[ \t]*\[[ \t]*\n[\s\S]*?\n[ \t]*\][ \t]*$/gm
                );

                // 标准 \[ ... \] 行间公式。
                if (!range) {
                    range = findRegexAfter(
                        repaired,
                        cursor,
                        /^[ \t]*\\\[[ \t]*\n[\s\S]*?\n[ \t]*\\\][ \t]*$/gm
                    );
                }

                // 已经采用 $$ ... $$ 包裹的公式。
                if (!range) {
                    range = findRegexAfter(repaired, cursor, /\$\$[\s\S]*?\$\$/g);
                }

                // 仅当完整公式块均不存在时，才回退为原始 TeX 匹配。
                if (!range) {
                    range = findLiteralFormula(repaired, cursor, formula.latex, true);
                }
            } else {
                // 行内公式：原始 TeX、可见文本、简化 TeX、官方括号格式。
                range = findLiteralFormula(repaired, cursor, formula.latex, false);

                if (!range && formula.visibleText) {
                    range = findLiteralFormula(repaired, cursor, formula.visibleText, false);
                }

                if (!range) {
                    const simplified = simplifyLatex(formula.latex);
                    if (simplified && simplified !== formula.latex) {
                        range = findLiteralFormula(repaired, cursor, simplified, false);
                    }
                }

                if (!range) {
                    range = findRegexAfter(repaired, cursor, /\\\([\s\S]*?\\\)/g) ||
                        findRegexAfter(repaired, cursor, /\((?=[^()\n]*[=+\-*/^_\\])[^()\n]*\)/g);
                }
            }

            if (!range) {
                console.warn('[ChatGPT LaTeX] 未能定位公式：', {
                    latex: formula.latex,
                    display: formula.display
                });
                continue;
            }

            repaired = replaceRange(repaired, range, replacement);
            cursor = range.index + replacement.length;
        }

        return repaired;
    }

    function normalizeCopiedDelimiters(text) {
        if (typeof text !== 'string') {
            return text;
        }

        let modified = text;

        modified = modified.replace(
            /\$\$(.*?)\$\$/gs,
            (_, formula) =>
                `\n$$\n${formula.trim()}\n$$\n`
        );

        modified = modified.replace(
            /\\\[(.*?)\\\]/gs,
            (_, formula) =>
                `\n$$\n${formula.trim()}\n$$\n`
        );

        modified = modified.replace(
            /\\\((.*?)\\\)/gs,
            (_, formula) =>
                `$${formula.trim()}$`
        );

        return modified;
    }

    async function repairClipboardAfterReplyCopy(button) {
        await new Promise(
            resolve =>
                setTimeout(resolve, 120)
        );

        try {
            if (
                !navigator.clipboard ||
                !navigator.clipboard.readText
            ) {
                throw new Error(
                    'Clipboard readText API unavailable'
                );
            }

            const originalText =
                await navigator.clipboard.readText();

            let repairedText =
                originalText;

            let formulaCount =
                0;

            if (
                ACTIVE_ADAPTER.replyCopyMode ===
                'chatgpt'
            ) {
                const label =
                    (
                        button.getAttribute(
                            'aria-label'
                        ) ||
                        ''
                    )
                        .trim()
                        .toLowerCase();

                if (
                    label === '复制消息' ||
                    label === 'copy message'
                ) {
                    return;
                }

                const replyRoot =
                    getAssistantReplyRoot(
                        button
                    );

                const formulas =
                    collectFormulas(
                        replyRoot
                    );

                formulaCount =
                    formulas.length;

                if (!formulaCount) {
                    return;
                }

                repairedText =
                    repairCopiedReply(
                        originalText,
                        formulas
                    );
            } else if (
                ACTIVE_ADAPTER.replyCopyMode ===
                'deepseek'
            ) {
                const replyRoot =
                    getDeepSeekReplyRoot(
                        button
                    );

                const formulas =
                    collectFormulas(
                        replyRoot
                    );

                formulaCount =
                    formulas.length;

                /*
                 * DeepSeek 的正文 DOM 中保留完整 application/x-tex，
                 * 因此优先按已知公式顺序修复原生复制结果。
                 * 如果当前复制结果只需要定界符规范化，再执行一次
                 * 轻量 normalize 作为回退。
                 */
                repairedText =
                    formulaCount
                        ? repairCopiedReply(
                            originalText,
                            formulas
                        )
                        : originalText;

                repairedText =
                    normalizeCopiedDelimiters(
                        repairedText
                    );
            } else if (
                ACTIVE_ADAPTER.replyCopyMode ===
                'normalize'
            ) {
                repairedText =
                    normalizeCopiedDelimiters(
                        originalText
                    );
            } else {
                return;
            }

            if (
                repairedText ===
                originalText
            ) {
                return;
            }

            const copied =
                await copyText(
                    repairedText
                );

            showToast(
                copied
                    ? (
                        formulaCount
                            ? `已修复回复中的 ${formulaCount} 个公式`
                            : '已格式化复制内容'
                    )
                    : '公式修复后写回剪贴板失败',
                !copied
            );
        } catch (error) {
            console.error(
                `[AI LaTeX][${ACTIVE_ADAPTER.name}] 复制后处理失败:`,
                error
            );

            showToast(
                '复制后处理失败，请查看控制台',
                true
            );
        }
    }

    function handleReplyCopy(event) {
        if (
            !ACTIVE_ADAPTER.replyCopyMode
        ) {
            return;
        }

        const target =
            elementFromNode(
                event.target
            );

        const button =
            target &&
            target.closest(
                ACTIVE_ADAPTER.id === 'deepseek'
                    ? 'button, [role="button"], .ds-icon-button'
                    : 'button'
            );

        if (
            !isReplyCopyButton(
                button
            )
        ) {
            return;
        }

        void repairClipboardAfterReplyCopy(
            button
        );
    }

    console.info(`[AI LaTeX] 已启用 ${ACTIVE_ADAPTER.name} 适配器`);

    document.addEventListener('mouseover', handleFormulaHover, true);
    document.addEventListener('mouseout', handleFormulaLeave, true);
    document.addEventListener('click', copySingleFormula, true);
    document.addEventListener('click', handleReplyCopy, true);
    document.addEventListener('copy', handleSelectionCopy, { capture: true, passive: false });
    document.addEventListener('scroll', hidePreview, true);
    window.addEventListener('resize', hidePreview);
})();
