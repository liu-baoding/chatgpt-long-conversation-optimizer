// ==UserScript==
// @name         ChatGPT LaTeX 悬浮与复制增强
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  为 ChatGPT 提供公式悬浮预览、单公式复制、选择复制和回复复制按钮修复
// @license      MIT
// @author       Liu Baoding; selection-copy strategy adapted from fanxing's AI网站公式复制Latex (MIT)
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @updateURL    https://raw.githubusercontent.com/liu-baoding/chatgpt-long-conversation-optimizer/main/chatgpt-latex-copy-enhancer.user.js
// @downloadURL  https://raw.githubusercontent.com/liu-baoding/chatgpt-long-conversation-optimizer/main/chatgpt-latex-copy-enhancer.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    if (window.__chatgptLatexEnhancerLoaded) return;
    window.__chatgptLatexEnhancerLoaded = true;

    const FORMULA_CONTAINER_SELECTOR = '[data-client-katex-layout][aria-label], [data-markdown-copy="math"][aria-label]';
    const FORMULA_SELECTOR = '.katex';
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
        const element = node instanceof Element ? node : node && node.parentElement;
        const katex = element && element.closest(FORMULA_SELECTOR);
        if (!katex) return null;

        const container = katex.closest(FORMULA_CONTAINER_SELECTOR);
        const annotation = katex.querySelector('annotation[encoding="application/x-tex"]');
        const latex =
            (container && container.getAttribute('aria-label')) ||
            (annotation && annotation.textContent);

        if (!latex || !latex.trim()) return null;

        return {
            katex,
            container: container || katex,
            latex: latex.trim(),
            display: Boolean(katex.closest('.katex-display')),
            visibleText: (katex.innerText || katex.textContent || '').trim()
        };
    }

    function formatLatex(info) {
        return info.display
            ? `\n$$\n${info.latex}\n$$\n`
            : `$${info.latex}$`;
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
        if (!button) return null;

        /*
         * 2026-09 新版 ChatGPT：
         * assistant 的回复正文和 action bar 位于同一个 :assistant unit 内。
         */
        const directAssistant = button.closest(
            '[data-content-search-unit-key$=":assistant"]'
        );
        if (directAssistant) return directAssistant;

        const turn = button.closest('[data-turn-key]');
        if (turn) {
            const assistantUnit = turn.querySelector(
                '[data-content-search-unit-key$=":assistant"]'
            );
            if (assistantUnit) return assistantUnit;

            const markdown = turn.querySelector(
                '[data-markdown-text-style="assistant-message"]'
            );
            if (markdown) {
                return markdown.closest('[data-content-search-unit-key]') || markdown;
            }
        }

        // 旧版兼容。
        const directMessage = button.closest('[data-message-author-role="assistant"]');
        if (directMessage) return directMessage;

        const oldTurn = button.closest(
            'article[data-testid^="conversation-turn-"], [data-testid^="conversation-turn-"]'
        );
        if (!oldTurn || !oldTurn.querySelector('[data-message-author-role="assistant"]')) {
            return null;
        }
        return oldTurn;
    }

    function isReplyCopyButton(button) {
        if (!button) return false;

        /*
         * 2026-09 新版回复级复制按钮：
         *   .turn-action-controls button[aria-label="复制"]
         *
         * 限定 action bar，避免误把代码块内部的“复制”按钮当作回复复制。
         */
        const actionBar = button.closest('.turn-action-controls');
        if (actionBar) {
            const label = (button.getAttribute('aria-label') || '').trim().toLowerCase();
            if (label === '复制' || label === 'copy') return true;
        }

        // 旧版兼容。
        const testId = button.getAttribute('data-testid') || '';
        return testId.includes('action-bar-copy') ||
            testId.includes('copy-turn') ||
            Boolean(button.querySelector(
                'svg[data-testid*="copy"], [data-testid*="action-bar-copy"]'
            ));
    }

    function collectFormulas(replyRoot) {
        if (!replyRoot) return [];

        const result = [];
        const seen = new Set();

        Array.from(replyRoot.querySelectorAll(FORMULA_CONTAINER_SELECTOR))
            .forEach(container => {
                const katex = container.querySelector(FORMULA_SELECTOR);
                const latex = container.getAttribute('aria-label');
                if (!katex || !latex || !latex.trim()) return;

                const key = container;
                if (seen.has(key)) return;
                seen.add(key);

                result.push({
                    katex,
                    container,
                    latex: latex.trim(),
                    display: Boolean(katex.closest('.katex-display')),
                    visibleText: (katex.innerText || katex.textContent || '').trim()
                });
            });

        /*
         * 如果当前 ChatGPT 又切回标准 KaTeX annotation，
         * 仍然能够正常收集公式。
         */
        if (result.length === 0) {
            Array.from(replyRoot.querySelectorAll(FORMULA_SELECTOR))
                .forEach(katex => {
                    const annotation = katex.querySelector(
                        'annotation[encoding="application/x-tex"]'
                    );
                    if (!annotation || !annotation.textContent.trim()) return;

                    result.push({
                        katex,
                        container: katex,
                        latex: annotation.textContent.trim(),
                        display: Boolean(katex.closest('.katex-display')),
                        visibleText: (katex.innerText || katex.textContent || '').trim()
                    });
                });
        }

        return result;
    }

    /*
     * 选择复制：沿用“克隆选区 DOM -> 将公式替换为 LaTeX -> 写入纯文本”
     * 这一在 AI网站公式复制Latex 中已验证可用的思路。
     */
    function processSelectedFragment(fragment) {
        const wrapper = document.createElement('div');
        wrapper.appendChild(fragment.cloneNode(true));

        const sourceContainers = Array.from(
            wrapper.querySelectorAll(FORMULA_CONTAINER_SELECTOR)
        );

        sourceContainers.forEach(container => {
            const katex = container.querySelector(FORMULA_SELECTOR);
            const latex = container.getAttribute('aria-label');
            if (!katex || !latex || !latex.trim() || !container.parentNode) return;

            const replacement = formatLatex({
                latex: latex.trim(),
                display: Boolean(katex.closest('.katex-display'))
            });

            container.parentNode.replaceChild(
                document.createTextNode(replacement),
                container
            );
        });

        /*
         * 兼容标准 KaTeX annotation；前一步已经替换掉的公式
         * 不会再出现在 wrapper 中，因此不会重复处理。
         */
        Array.from(wrapper.querySelectorAll(FORMULA_SELECTOR))
            .forEach(katex => {
                const annotation = katex.querySelector(
                    'annotation[encoding="application/x-tex"]'
                );
                if (!annotation || !annotation.textContent.trim()) return;

                const target = katex.closest('.katex-display') || katex;
                if (!target.parentNode) return;

                const replacement = formatLatex({
                    latex: annotation.textContent.trim(),
                    display: Boolean(katex.closest('.katex-display'))
                });

                target.parentNode.replaceChild(
                    document.createTextNode(replacement),
                    target
                );
            });

        return wrapper.textContent || '';
    }

    function handleSelectionCopy(event) {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const fragment = range.cloneContents();

        const probe = document.createElement('div');
        probe.appendChild(fragment.cloneNode(true));

        const hasFormula = Boolean(
            probe.querySelector(FORMULA_CONTAINER_SELECTOR) ||
            probe.querySelector(
                '.katex, annotation[encoding="application/x-tex"]'
            )
        );
        if (!hasFormula) return;

        const processedText = processSelectedFragment(fragment);
        if (!processedText) return;

        event.preventDefault();
        event.stopPropagation();

        if (event.clipboardData) {
            event.clipboardData.setData('text/plain', processedText);
            showToast('已格式化选中的公式内容', false);
            return;
        }

        copyText(processedText).then(copied => {
            showToast(
                copied ? '已格式化选中的公式内容' : '选择复制失败',
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

    async function repairClipboardAfterReplyCopy(button) {
        const replyRoot = getAssistantReplyRoot(button);
        const formulas = collectFormulas(replyRoot);
        if (formulas.length === 0) return;

        /*
         * 让 ChatGPT 先完成它自己的复制，再读取并修复本次剪贴板。
         * 原 GreasyFork 脚本也采用“按钮点击后延时读取剪贴板”的策略；
         * 这里额外利用 DOM 中的真实公式源码来恢复 () / [] 定界符。
         */
        await new Promise(resolve => setTimeout(resolve, 120));

        try {
            if (!navigator.clipboard || !navigator.clipboard.readText) {
                throw new Error('Clipboard readText API unavailable');
            }

            const originalText = await navigator.clipboard.readText();
            const repairedText = repairCopiedReply(originalText, formulas);

            if (repairedText === originalText) {
                showToast('未检测到需要修复的公式', false);
                return;
            }

            const copied = await copyText(repairedText);
            showToast(
                copied
                    ? `已修复回复中的 ${formulas.length} 个公式`
                    : '公式修复后写回剪贴板失败',
                !copied
            );
        } catch (error) {
            console.error('[ChatGPT LaTeX] 回复复制修复失败:', error);
            showToast('回复复制后处理失败，请查看控制台', true);
        }
    }

    function handleReplyCopy(event) {
        const target = event.target instanceof Element
            ? event.target
            : event.target && event.target.parentElement;
        const button = target && target.closest('button');
        if (!isReplyCopyButton(button)) return;

        /*
         * 新版 ChatGPT 的用户消息复制按钮 aria-label 为“复制消息”，
         * assistant 回复按钮为“复制”。这里只处理后者。
         */
        const label = (button.getAttribute('aria-label') || '').trim().toLowerCase();
        if (label === '复制消息' || label === 'copy message') return;

        void repairClipboardAfterReplyCopy(button);
    }

    document.addEventListener('mouseover', handleFormulaHover, true);
    document.addEventListener('mouseout', handleFormulaLeave, true);
    document.addEventListener('click', copySingleFormula, true);
    document.addEventListener('click', handleReplyCopy, true);
    document.addEventListener('copy', handleSelectionCopy, { capture: true, passive: false });
    document.addEventListener('scroll', hidePreview, true);
    window.addEventListener('resize', hidePreview);
})();
