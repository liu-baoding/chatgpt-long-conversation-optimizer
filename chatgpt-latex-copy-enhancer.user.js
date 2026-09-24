// ==UserScript==
// @name         AI LaTeX 悬浮与复制增强
// @namespace    http://tampermonkey.net/
// @version      3.4.3
// @description  为 ChatGPT、Claude、DeepSeek、Gemini、AI Studio、豆包、知乎等网站增强 LaTeX 复制
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

    function normalizeMarkdownTableCell(cell) {
        return (
            cell.innerText ||
            cell.textContent ||
            ''
        )
            .replace(/\r\n?/g, '\n')
            .replace(/\n+/g, '<br>')
            .replace(/\|/g, '\\|')
            .trim();
    }

    function serializeMarkdownTableElement(table) {
        if (!table) return '';

        const clone =
            table.cloneNode(true);

        replaceFormulasInCopyRoot(clone);

        const rows =
            Array.from(
                clone.querySelectorAll('tr')
            )
                .map(row =>
                    Array.from(row.children)
                        .filter(cell =>
                            cell.matches('th, td')
                        )
                        .map(normalizeMarkdownTableCell)
                )
                .filter(row => row.length);

        if (!rows.length) return '';

        const columnCount =
            Math.max(
                ...rows.map(row => row.length)
            );

        const normalizedRows =
            rows.map(row => [
                ...row,
                ...Array(
                    Math.max(
                        0,
                        columnCount - row.length
                    )
                ).fill('')
            ]);

        const toLine = row =>
            `| ${row.join(' | ')} |`;

        return [
            toLine(normalizedRows[0]),
            toLine(
                Array(columnCount).fill('---')
            ),
            ...normalizedRows
                .slice(1)
                .map(toLine)
        ].join('\n');
    }

    function replaceTablesWithMarkdown(root) {
        if (!root) return 0;

        let count = 0;

        for (
            const table of Array.from(
                root.querySelectorAll('table')
            )
        ) {
            const markdown =
                serializeMarkdownTableElement(
                    table
                );

            if (!markdown) continue;

            const replacement =
                document.createElement('pre');

            replacement.setAttribute(
                'data-ai-markdown-table',
                'true'
            );
            replacement.textContent =
                markdown;

            table.replaceWith(
                replacement
            );
            count += 1;
        }

        return count;
    }

    function findChatGPTTableCopyContext(button) {
        if (
            ACTIVE_ADAPTER.id !== 'chatgpt' ||
            !button ||
            isCodeCopyButton(button) ||
            isReplyCopyButton(button)
        ) {
            return null;
        }

        const semanticText = [
            button.getAttribute('aria-label'),
            button.getAttribute('title'),
            button.getAttribute('data-testid'),
            button.textContent
        ]
            .filter(value =>
                typeof value === 'string'
            )
            .join(' ')
            .toLowerCase();

        if (
            !semanticText.includes('copy') &&
            !semanticText.includes('复制')
        ) {
            return null;
        }

        /*
         * ChatGPT 当前的表格复制按钮并不一定位于
         * data-markdown-text-style="assistant-message" 节点内部。
         * 这里只向上寻找局部祖先中的表格；绝不回退到整个
         * assistant turn，从结构上避免把回答底部复制按钮误判为表格复制。
         */
        const stopRoot =
            button.closest('[data-turn-key]') ||
            button.closest(
                '[data-content-search-unit-key$=":assistant"]'
            ) ||
            button.closest(
                '[data-message-author-role="assistant"]'
            );

        let current =
            button.parentElement;
        let depth = 0;

        while (
            current &&
            current !== stopRoot &&
            depth < 10
        ) {
            const tables =
                Array.from(
                    current.querySelectorAll('table')
                );

            if (tables.length === 1) {
                return {
                    button,
                    table: tables[0]
                };
            }

            if (tables.length > 1) {
                return null;
            }

            current =
                current.parentElement;
            depth += 1;
        }

        return null;
    }

    function handleChatGPTTableCopy(event) {
        if (ACTIVE_ADAPTER.id !== 'chatgpt') {
            return;
        }

        const target =
            elementFromNode(
                event.target
            );

        const button =
            target &&
            target.closest('button');

        const context =
            findChatGPTTableCopyContext(
                button
            );

        if (!context) return;

        const markdown =
            serializeMarkdownTableElement(
                context.table
            );

        if (!markdown) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        /*
         * 表格按钮只复制当前表格，因此直接序列化局部 table 最稳。
         * 回复底部复制继续走 ChatGPT 原生 Markdown + 公式定界符规范化。
         */
        pendingReplyCopy = null;

        const formulaCount =
            collectFormulas(
                context.table
            ).length;

        copyText(markdown).then(copied => {
            const suffix = formulaCount
                ? '，并格式化 ' + formulaCount + ' 个公式'
                : '';

            showToast(
                copied
                    ? '已复制 Markdown 表格' + suffix
                    : '复制 Markdown 表格失败',
                !copied
            );
        });
    }

    function getAssistantReplyRoot(button) {
        if (
            ACTIVE_ADAPTER.id !== 'chatgpt' ||
            !button
        ) {
            return null;
        }

        /*
         * 回复底部复制必须以整个 turn 为作用域。新版 ChatGPT 会把一条
         * assistant 回复拆成多个 content-search unit；若优先取按钮附近
         * 的 unit，会只拿到表格等局部内容。
         */
        const turn =
            button.closest('[data-turn-key]');

        if (turn) {
            return turn;
        }

        const directAssistant =
            button.closest(
                '[data-content-search-unit-key$=":assistant"]'
            );

        if (directAssistant) {
            return directAssistant;
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
                if (left > start && text[left - 1] === '[' && text[right] === ']') {
                    return { index: left - 1, length: right + 1 - (left - 1) };
                }
            } else {
                if (text.slice(Math.max(start, left - 2), left) === '\\(' &&
                    text.slice(right, right + 2) === '\\)') {
                    return { index: left - 2, length: right + 2 - (left - 2) };
                }
                if (left > start && text[left - 1] === '$' && text[right] === '$') {
                    const isDoubleDollar = (left >= 2 && text[left - 2] === '$') ||
                        text[right + 1] === '$';
                    if (!isDoubleDollar) {
                        return { index: left - 1, length: right + 1 - (left - 1) };
                    }
                }
                if (left > start && text[left - 1] === '(' && text[right] === ')') {
                    return { index: left - 1, length: right + 1 - (left - 1) };
                }
            }

            searchFrom = index + Math.max(latex.length, 1);
        }

        return firstLiteralRange;
    }

    function simplifyLatex(latex) {
        return latex
            .replace(/\\([a-zA-Z]+)\s*/g, '$1')
            .replace(/[{}]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function repairCopiedReply(text, formulas) {
        if (typeof text !== 'string' || formulas.length === 0) {
            return text;
        }

        let repaired = text.replace(/\r\n?/g, '\n');
        let cursor = 0;

        for (const formula of formulas) {
            const replacement = formula.display
                ? `$$\n${formula.latex}\n$$`
                : `$${formula.latex}$`;
            let range = null;

            if (formula.display) {
                range = findRegexAfter(
                    repaired,
                    cursor,
                    /^[ \t]*\[[ \t]*\n[\s\S]*?\n[ \t]*\][ \t]*$/gm
                );

                if (!range) {
                    range = findRegexAfter(
                        repaired,
                        cursor,
                        /^[ \t]*\\\[[ \t]*\n[\s\S]*?\n[ \t]*\\\][ \t]*$/gm
                    );
                }

                if (!range) {
                    range = findRegexAfter(repaired, cursor, /\$\$[\s\S]*?\$\$/g);
                }

                if (!range) {
                    range = findLiteralFormula(repaired, cursor, formula.latex, true);
                }
            } else {
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

    let pendingReplyCopy = null;
    let clipboardWriteInterceptorInstalled = false;

    function getMarkdownTableRows(table) {
        if (!table) return [];

        const clone =
            table.cloneNode(true);

        replaceFormulasInCopyRoot(clone);

        return Array.from(
            clone.querySelectorAll('tr')
        )
            .map(row =>
                Array.from(row.children)
                    .filter(cell =>
                        cell.matches('th, td')
                    )
                    .map(normalizeMarkdownTableCell)
            )
            .filter(row => row.length);
    }

    function serializePlainTableElement(table) {
        return getMarkdownTableRows(table)
            .map(row => row.join('\t'))
            .join('\n');
    }

    function repairMarkdownTablesInCopiedText(text, tables) {
        if (
            typeof text !== 'string' ||
            !tables ||
            !tables.length
        ) {
            return text;
        }

        let repaired = text;

        for (const table of tables) {
            const plain =
                serializePlainTableElement(table);
            const markdown =
                serializeMarkdownTableElement(table);

            if (!plain || !markdown) {
                continue;
            }

            const index =
                repaired.indexOf(plain);

            if (index === -1) {
                console.debug(
                    '[AI LaTeX] 未能在原生复制文本中精确定位表格，保留原生内容',
                    { plain }
                );
                continue;
            }

            repaired =
                repaired.slice(0, index) +
                markdown +
                repaired.slice(
                    index + plain.length
                );
        }

        return repaired;
    }

    function getReplyCopyContext(button) {
        let replyRoot = null;

        if (ACTIVE_ADAPTER.id === 'chatgpt') {
            replyRoot = getAssistantReplyRoot(button);
        } else if (ACTIVE_ADAPTER.id === 'deepseek') {
            replyRoot = getDeepSeekReplyRoot(button);
        } else {
            return null;
        }

        if (!replyRoot) return null;

        const formulas = collectFormulas(replyRoot);
        if (!formulas.length) return null;

        let contentRoot = replyRoot;

        if (ACTIVE_ADAPTER.id === 'chatgpt') {
            const markdownRoots =
                Array.from(
                    replyRoot.querySelectorAll(
                        '[data-markdown-text-style="assistant-message"]'
                    )
                );

            contentRoot =
                markdownRoots.length === 1
                    ? markdownRoots[0]
                    : replyRoot;
        }

        const tables =
            ACTIVE_ADAPTER.id === 'chatgpt'
                ? Array.from(
                    contentRoot.querySelectorAll('table')
                )
                : [];

        return {
            adapterId: ACTIVE_ADAPTER.id,
            replyRoot,
            contentRoot,
            formulas,
            tables,
            expiresAt: Date.now() + 1500
        };
    }

    function transformNativeReplyText(text, context) {
        if (
            !context ||
            typeof text !== 'string'
        ) {
            return text;
        }

        if (context.adapterId === 'chatgpt') {
            /*
             * ChatGPT already preserves Markdown tables, paragraphs, lists,
             * emphasis, etc. Keep that native structure untouched and only
             * normalize math delimiters.
             */
            return normalizeCopiedDelimiters(
                text
            );
        }

        let repaired = repairCopiedReply(
            text,
            context.formulas
        );

        if (context.adapterId === 'deepseek') {
            repaired =
                normalizeCopiedDelimiters(
                    repaired
                );
        }

        return repaired;
    }

    function installClipboardWriteInterceptor() {
        const clipboard = navigator.clipboard;
        if (!clipboard) return false;

        const proto =
            Object.getPrototypeOf(clipboard);

        if (!proto) return false;

        let installed = false;

        if (
            typeof proto.writeText === 'function' &&
            !proto.writeText.__aiLatexWriteTextInterceptor
        ) {
            const originalWriteText =
                proto.writeText;

            const wrappedWriteText =
                function (text) {
                    const context =
                        pendingReplyCopy;

                    if (
                        context &&
                        Date.now() <=
                            context.expiresAt &&
                        typeof text === 'string'
                    ) {
                        pendingReplyCopy = null;

                        const repaired =
                            transformNativeReplyText(
                                text,
                                context
                            );

                        const result =
                            originalWriteText.call(
                                this,
                                repaired
                            );

                        Promise.resolve(result)
                            .then(() => {
                                showToast(
                                    `已格式化复制内容中的 ${context.formulas.length} 个公式`,
                                    false
                                );
                            })
                            .catch(() => {});

                        return result;
                    }

                    return originalWriteText.call(
                        this,
                        text
                    );
                };

            Object.defineProperty(
                wrappedWriteText,
                '__aiLatexWriteTextInterceptor',
                { value: true }
            );

            try {
                Object.defineProperty(
                    proto,
                    'writeText',
                    {
                        configurable: true,
                        writable: true,
                        value: wrappedWriteText
                    }
                );
                installed = true;
            } catch (error) {
                console.debug(
                    '[AI LaTeX] cannot hook clipboard.writeText:',
                    error
                );
            }
        } else if (
            typeof proto.writeText === 'function'
        ) {
            installed = true;
        }

        if (
            typeof proto.write === 'function' &&
            !proto.write.__aiLatexWriteInterceptor
        ) {
            const originalWrite =
                proto.write;

            const wrappedWrite =
                async function (items) {
                    const context =
                        pendingReplyCopy;

                    if (
                        !context ||
                        Date.now() >
                            context.expiresAt ||
                        !Array.isArray(items)
                    ) {
                        return originalWrite.call(
                            this,
                            items
                        );
                    }

                    let transformedPlainText =
                        false;

                    const transformedItems =
                        await Promise.all(
                            items.map(
                                async item => {
                                    if (
                                        !item ||
                                        !Array.isArray(item.types)
                                    ) {
                                        return item;
                                    }

                                    const payload = {};

                                    for (
                                        const type of item.types
                                    ) {
                                        const blob =
                                            await item.getType(
                                                type
                                            );

                                        if (
                                            type === 'text/plain'
                                        ) {
                                            const text =
                                                await blob.text();
                                            const repaired =
                                                transformNativeReplyText(
                                                    text,
                                                    context
                                                );

                                            payload[type] =
                                                new Blob(
                                                    [repaired],
                                                    {
                                                        type:
                                                            'text/plain'
                                                    }
                                                );
                                            transformedPlainText =
                                                true;
                                        } else {
                                            payload[type] =
                                                blob;
                                        }
                                    }

                                    try {
                                        return new ClipboardItem(
                                            payload,
                                            {
                                                presentationStyle:
                                                    item.presentationStyle
                                            }
                                        );
                                    } catch (_) {
                                        return new ClipboardItem(
                                            payload
                                        );
                                    }
                                }
                            )
                        );

                    if (transformedPlainText) {
                        pendingReplyCopy = null;
                    }

                    const result =
                        originalWrite.call(
                            this,
                            transformedItems
                        );

                    Promise.resolve(result)
                        .then(() => {
                            if (
                                transformedPlainText
                            ) {
                                showToast(
                                    `已格式化复制内容中的 ${context.formulas.length} 个公式`,
                                    false
                                );
                            }
                        })
                        .catch(() => {});

                    return result;
                };

            Object.defineProperty(
                wrappedWrite,
                '__aiLatexWriteInterceptor',
                { value: true }
            );

            try {
                Object.defineProperty(
                    proto,
                    'write',
                    {
                        configurable: true,
                        writable: true,
                        value: wrappedWrite
                    }
                );
                installed = true;
            } catch (error) {
                console.debug(
                    '[AI LaTeX] cannot hook clipboard.write:',
                    error
                );
            }
        } else if (
            typeof proto.write === 'function'
        ) {
            installed = true;
        }

        clipboardWriteInterceptorInstalled =
            installed;

        return installed;
    }

    function replaceFormulasInCopyRoot(root) {
        if (!root) return 0;

        const candidates = [];

        if (
            root instanceof Element &&
            root.matches(
                ACTIVE_ADAPTER.selectionSelector
            )
        ) {
            candidates.push(root);
        }

        candidates.push(
            ...root.querySelectorAll(
                ACTIVE_ADAPTER.selectionSelector
            )
        );

        const replaced = new Set();

        for (const candidate of candidates) {
            const info =
                getFormulaInfo(candidate);

            if (
                !info ||
                !info.container ||
                !info.container.parentNode ||
                !root.contains(info.container) ||
                replaced.has(info.container)
            ) {
                continue;
            }

            const replacement =
                formatLatex(info);

            if (!replacement) continue;

            info.container.parentNode.replaceChild(
                document.createTextNode(
                    replacement
                ),
                info.container
            );

            replaced.add(info.container);
        }

        return replaced.size;
    }

    function buildReplyTextFromDom(context) {
        if (!context || !context.contentRoot) {
            return '';
        }

        const clone =
            context.contentRoot.cloneNode(true);

        /*
         * Convert tables before the remaining formulas: the table serializer
         * still needs the KaTeX source nodes in order to emit Markdown cells.
         */
        replaceTablesWithMarkdown(clone);
        replaceFormulasInCopyRoot(clone);

        const sandbox =
            document.createElement('div');

        sandbox.style.cssText =
            'position:fixed;' +
            'left:-100000px;' +
            'top:0;' +
            'width:900px;' +
            'opacity:0;' +
            'pointer-events:none;' +
            'white-space:normal;';

        sandbox.appendChild(clone);
        document.body.appendChild(sandbox);

        let text = '';

        try {
            text =
                sandbox.innerText ||
                sandbox.textContent ||
                '';
        } finally {
            sandbox.remove();
        }

        return text
            .replace(/\r\n?/g, '\n')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function scheduleReplyCopyFallback(context) {
        window.setTimeout(async () => {
            if (
                pendingReplyCopy !== context
            ) {
                return;
            }

            pendingReplyCopy = null;

            if (
                context.adapterId === 'chatgpt'
            ) {
                return;
            }

            const fallbackText =
                buildReplyTextFromDom(
                    context
                );

            if (!fallbackText) {
                return;
            }

            const copied =
                await copyText(
                    fallbackText
                );

            showToast(
                copied
                    ? `已从页面直接复制并格式化 ${context.formulas.length} 个公式`
                    : '回复复制失败',
                !copied
            );
        }, 450);
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

        const context =
            getReplyCopyContext(
                button
            );

        if (!context) {
            return;
        }

        pendingReplyCopy =
            context;

        installClipboardWriteInterceptor();
        scheduleReplyCopyFallback(
            context
        );
    }

    installClipboardWriteInterceptor();

    console.info(`[AI LaTeX] 已启用 ${ACTIVE_ADAPTER.name} 适配器`);

    document.addEventListener('mouseover', handleFormulaHover, true);
    document.addEventListener('mouseout', handleFormulaLeave, true);
    document.addEventListener('click', copySingleFormula, true);
    document.addEventListener('click', handleChatGPTTableCopy, true);
    document.addEventListener('click', handleReplyCopy, true);
    document.addEventListener('copy', handleSelectionCopy, { capture: true, passive: false });
    document.addEventListener('scroll', hidePreview, true);
    window.addEventListener('resize', hidePreview);
})();