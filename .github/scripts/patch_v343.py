from pathlib import Path

p = Path('chatgpt-latex-copy-enhancer.user.js')
s = p.read_text(encoding='utf-8')
s = s.replace('// @version      3.4.2', '// @version      3.4.3', 1)

def replace_between(text, start_marker, end_marker, replacement):
    a = text.index(start_marker)
    b = text.index(end_marker, a)
    return text[:a] + replacement + text[b:]

new_context = r'''    function findChatGPTTableCopyContext(button) {
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

'''
s = replace_between(
    s,
    '    function findChatGPTTableCopyContext(button) {',
    '    function handleChatGPTTableCopy(event) {',
    new_context,
)

new_handler = r'''    function handleChatGPTTableCopy(event) {
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

'''
s = replace_between(
    s,
    '    function handleChatGPTTableCopy(event) {',
    '    function getAssistantReplyRoot(button) {',
    new_handler,
)

p.write_text(s, encoding='utf-8')

rp = Path('README.md')
r = rp.read_text(encoding='utf-8')
old = '  - v3.4.2 起完全保留 ChatGPT 原生复制出的 Markdown 结构；回复级复制和表格右上角复制均只在写入剪贴板时将 `\\(...\\)` / `\\[...\\]` 规范化为 `$...$` / `$$...$$`\n'
new = '  - v3.4.3：回复底部复制继续保留 ChatGPT 原生完整 Markdown 并仅规范化公式；表格右上角复制只在局部表格容器内识别按钮，并直接生成该表格的 Markdown + `$...$` 公式，避免与整条回复复制的作用域互相污染\n'
if old in r:
    r = r.replace(old, new, 1)
elif '  - v3.4.0 起保留回复中的 Markdown 表格结构；表格右上角复制按钮也会将公式统一为 `$...$` / `$$...$$`\n' in r:
    r = r.replace(
        '  - v3.4.0 起保留回复中的 Markdown 表格结构；表格右上角复制按钮也会将公式统一为 `$...$` / `$$...$$`\n',
        new,
        1,
    )
rp.write_text(r, encoding='utf-8')
