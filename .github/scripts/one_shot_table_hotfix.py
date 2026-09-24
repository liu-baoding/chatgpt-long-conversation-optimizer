from pathlib import Path

p = Path('chatgpt-latex-copy-enhancer.user.js')
s = p.read_text(encoding='utf-8')
s = s.replace('// @version      3.4.0', '// @version      3.4.1', 1)

old_table_context = '''    function findChatGPTTableCopyContext(button) {
        if (
            ACTIVE_ADAPTER.id !== 'chatgpt' ||
            !button ||
            button.closest('.turn-action-controls') ||
            isCodeCopyButton(button)
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

        let current =
            button.parentElement;

        for (
            let depth = 0;
            current && depth < 7;
            depth += 1,
            current = current.parentElement
        ) {
            const table =
                current.querySelector('table');

            if (table) {
                return {
                    button,
                    table
                };
            }

            if (
                current.matches(
                    '[data-markdown-text-style="assistant-message"]'
                )
            ) {
                break;
            }
        }

        return null;
    }
'''

new_table_context = '''    function findChatGPTTableCopyContext(button) {
        if (
            ACTIVE_ADAPTER.id !== 'chatgpt' ||
            !button ||
            isCodeCopyButton(button)
        ) {
            return null;
        }

        /*
         * 表格复制按钮必须位于 assistant Markdown 正文内部。
         * 回复底部 action bar 在正文外，因此绝不会被本逻辑接管。
         */
        const markdownRoot =
            button.closest(
                '[data-markdown-text-style="assistant-message"]'
            );

        if (!markdownRoot) {
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

        let current =
            button.parentElement;

        while (
            current &&
            current !== markdownRoot
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

        return null;
    }
'''

if old_table_context not in s:
    raise SystemExit('table context block not found')
s = s.replace(old_table_context, new_table_context, 1)

old_root_prefix = '''        const directAssistant =
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
'''

new_root_prefix = '''        /*
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
'''

if old_root_prefix not in s:
    raise SystemExit('assistant root prefix not found')
s = s.replace(old_root_prefix, new_root_prefix, 1)

marker = '    function getReplyCopyContext(button) {'
if marker not in s:
    raise SystemExit('reply context marker not found')

helper = r'''    function getMarkdownTableRows(table) {
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

'''
s = s.replace(marker, helper + marker, 1)

old_content_root = '''        if (ACTIVE_ADAPTER.id === 'chatgpt') {
            contentRoot =
                replyRoot.querySelector(
                    '[data-markdown-text-style="assistant-message"]'
                ) ||
                replyRoot.querySelector('.markdown') ||
                replyRoot;
        }

        return {
            adapterId: ACTIVE_ADAPTER.id,
            replyRoot,
            contentRoot,
            formulas,
            hasTables:
                ACTIVE_ADAPTER.id === 'chatgpt' &&
                Boolean(
                    contentRoot.querySelector('table')
                ),
            expiresAt: Date.now() + 1500
        };'''

new_content_root = '''        if (ACTIVE_ADAPTER.id === 'chatgpt') {
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
        };'''

if old_content_root not in s:
    raise SystemExit('reply context return block not found')
s = s.replace(old_content_root, new_content_root, 1)

old_transform = '''        if (
            context.adapterId === 'chatgpt' &&
            context.hasTables
        ) {
            const domMarkdown =
                buildReplyTextFromDom(
                    context
                );

            if (domMarkdown) {
                return domMarkdown;
            }
        }

        let repaired = repairCopiedReply(
            text,
            context.formulas
        );

        if (context.adapterId === 'deepseek') {'''

new_transform = '''        let repaired = repairCopiedReply(
            text,
            context.formulas
        );

        if (
            context.adapterId === 'chatgpt' &&
            context.tables &&
            context.tables.length
        ) {
            /*
             * 保留 ChatGPT 原生整条回复复制出的 Markdown，只把其中
             * 被拍平为 TSV 的表格片段替换回 Markdown 表格。
             */
            repaired =
                repairMarkdownTablesInCopiedText(
                    repaired,
                    context.tables
                );
        }

        if (context.adapterId === 'deepseek') {'''

if old_transform not in s:
    raise SystemExit('transform block not found')
s = s.replace(old_transform, new_transform, 1)

old_fallback = '''            const fallbackText =
                buildReplyTextFromDom(
                    context
                );'''
new_fallback = '''            if (
                context.adapterId === 'chatgpt'
            ) {
                return;
            }

            const fallbackText =
                buildReplyTextFromDom(
                    context
                );'''
if old_fallback not in s:
    raise SystemExit('fallback block not found')
s = s.replace(old_fallback, new_fallback, 1)

p.write_text(s, encoding='utf-8')

rp = Path('README.md')
r = rp.read_text(encoding='utf-8')
r = r.replace(
    '  - v3.4.0 起保留回复中 Markdown 表格结构；表格右上角复制按钮也会将公式统一为 `$...$` / `$$...$$`\n',
    '  - v3.4.1 起表格修复只作用于当前回复/当前表格：整条回复复制保留原生 Markdown，并仅将其中被拍平的表格恢复为 Markdown；表格右上角复制只处理其所属表格\n',
    1,
)
rp.write_text(r, encoding='utf-8')
