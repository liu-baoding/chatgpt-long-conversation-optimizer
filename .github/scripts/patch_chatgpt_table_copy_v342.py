from pathlib import Path

p = Path('chatgpt-latex-copy-enhancer.user.js')
s = p.read_text(encoding='utf-8')
s = s.replace('// @version      3.4.1', '// @version      3.4.2', 1)


def replace_between(text, start_marker, end_marker, replacement):
    a = text.index(start_marker)
    b = text.index(end_marker, a)
    return text[:a] + replacement + text[b:]


new_table_context = r'''    function findChatGPTTableCopyContext(button) {
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

        const turn =
            button.closest('[data-turn-key]') ||
            button.closest(
                '[data-content-search-unit-key]'
            );

        if (!turn) return null;

        let current =
            button.parentElement;

        while (
            current &&
            current !== turn
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

            current =
                current.parentElement;
        }

        const tables =
            Array.from(
                turn.querySelectorAll('table')
            );

        if (tables.length === 1) {
            return {
                button,
                table: tables[0]
            };
        }

        if (tables.length > 1) {
            const buttonRect =
                button.getBoundingClientRect();
            const buttonY =
                buttonRect.top +
                buttonRect.height / 2;

            const table =
                tables
                    .map(table => {
                        const rect =
                            table.getBoundingClientRect();
                        const topDistance =
                            Math.abs(
                                buttonY - rect.top
                            );
                        const centerDistance =
                            Math.abs(
                                buttonY -
                                (
                                    rect.top +
                                    rect.height / 2
                                )
                            );

                        return {
                            table,
                            distance:
                                Math.min(
                                    topDistance,
                                    centerDistance
                                )
                        };
                    })
                    .sort(
                        (a, b) =>
                            a.distance -
                            b.distance
                    )[0];

            if (
                table &&
                table.distance <= 180
            ) {
                return {
                    button,
                    table: table.table
                };
            }
        }

        return null;
    }

'''
s = replace_between(
    s,
    '    function findChatGPTTableCopyContext(button) {',
    '    function handleChatGPTTableCopy(event) {',
    new_table_context,
)

new_table_handler = r'''    function handleChatGPTTableCopy(event) {
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

        const formulas =
            collectFormulas(
                context.table
            );

        if (!formulas.length) {
            return;
        }

        /*
         * Let ChatGPT perform its native Markdown copy. We only remember
         * which table is being copied and normalize formula delimiters when
         * the site actually writes text to the clipboard.
         */
        pendingReplyCopy = {
            adapterId: 'chatgpt',
            replyRoot: context.table,
            contentRoot: context.table,
            formulas,
            tables: [],
            expiresAt: Date.now() + 1500
        };

        installClipboardWriteInterceptor();
    }

'''
s = replace_between(
    s,
    '    function handleChatGPTTableCopy(event) {',
    '    function getAssistantReplyRoot(button) {',
    new_table_handler,
)

new_transform = r'''    function transformNativeReplyText(text, context) {
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

'''
s = replace_between(
    s,
    '    function transformNativeReplyText(text, context) {',
    '    function installClipboardWriteInterceptor() {',
    new_transform,
)

new_interceptor = r'''    function installClipboardWriteInterceptor() {
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

'''
s = replace_between(
    s,
    '    function installClipboardWriteInterceptor() {',
    '    function replaceFormulasInCopyRoot(root) {',
    new_interceptor,
)

p.write_text(s, encoding='utf-8')

rp = Path('README.md')
r = rp.read_text(encoding='utf-8')
r = r.replace(
    '  - v3.4.0 起保留回复中的 Markdown 表格结构；表格右上角复制按钮也会将公式统一为 `$...$` / `$$...$$`\n',
    '  - v3.4.2 起完全保留 ChatGPT 原生复制出的 Markdown 结构；回复级复制和表格右上角复制均只在写入剪贴板时将 `\\(...\\)` / `\\[...\\]` 规范化为 `$...$` / `$$...$$`\n',
    1,
)
rp.write_text(r, encoding='utf-8')
