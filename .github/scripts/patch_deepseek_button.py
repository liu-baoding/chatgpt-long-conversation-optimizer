from pathlib import Path

SCRIPT = Path("chatgpt-latex-copy-enhancer.user.js")
README = Path("README.md")
WORKFLOW = Path(".github/workflows/one-shot-deepseek-collapse-button.yml")
SELF = Path(".github/scripts/patch_deepseek_button.py")

s = SCRIPT.read_text(encoding="utf-8")

old_version = "// @version      3.2.2"
new_version = "// @version      3.3.0"
if old_version not in s:
    raise SystemExit("Expected userscript version 3.2.2 not found")
s = s.replace(old_version, new_version, 1)

marker = "    function installDeepSeekThinkingAutoCollapse() {"
if marker not in s:
    raise SystemExit("DeepSeek auto-collapse install marker not found")

manual_code = r'''    function isDeepSeekDocumentScroller(scroller) {
        return Boolean(
            scroller &&
            (
                scroller === document.scrollingElement ||
                scroller === document.documentElement ||
                scroller === document.body
            )
        );
    }

    function captureDeepSeekManualCollapseScrollState(
        referenceElement
    ) {
        const scroller =
            getDeepSeekScrollContainer(
                referenceElement ||
                document.querySelector(
                    '.ds-virtual-list-items'
                ) ||
                document.body
            );

        if (!scroller) return null;

        const isDocumentScroller =
            isDeepSeekDocumentScroller(
                scroller
            );

        const viewportTop =
            isDocumentScroller
                ? 0
                : scroller
                    .getBoundingClientRect()
                    .top;

        const viewportBottom =
            isDocumentScroller
                ? window.innerHeight
                : scroller
                    .getBoundingClientRect()
                    .bottom;

        const items = Array.from(
            document.querySelectorAll(
                '[data-virtual-list-item-key]'
            )
        );

        const anchor =
            items.find(item => {
                const rect =
                    item.getBoundingClientRect();

                return (
                    rect.bottom >
                        viewportTop + 4 &&
                    rect.top <
                        viewportBottom - 4
                );
            }) || null;

        const anchorTop =
            anchor
                ? anchor
                    .getBoundingClientRect()
                    .top
                : null;

        const scrollTop =
            isDocumentScroller
                ? (
                    window.scrollY ||
                    document.documentElement
                        .scrollTop ||
                    document.body.scrollTop ||
                    0
                )
                : scroller.scrollTop;

        const viewportHeight =
            isDocumentScroller
                ? (
                    window.innerHeight ||
                    document.documentElement
                        .clientHeight ||
                    0
                )
                : scroller.clientHeight;

        const distanceFromBottom =
            scroller.scrollHeight -
            scrollTop -
            viewportHeight;

        return {
            scroller,
            isDocumentScroller,
            anchor,
            anchorTop,
            nearBottom:
                distanceFromBottom <= 120
        };
    }

    function restoreDeepSeekManualCollapseScrollState(
        state
    ) {
        if (!state || !state.scroller) {
            return;
        }

        const {
            scroller,
            isDocumentScroller,
            anchor,
            anchorTop,
            nearBottom
        } = state;

        if (nearBottom) {
            if (isDocumentScroller) {
                window.scrollTo(
                    0,
                    scroller.scrollHeight
                );
            } else {
                scroller.scrollTop =
                    scroller.scrollHeight;
            }
            return;
        }

        if (
            !anchor ||
            !anchor.isConnected ||
            !Number.isFinite(anchorTop)
        ) {
            return;
        }

        const currentTop =
            anchor
                .getBoundingClientRect()
                .top;

        const delta =
            currentTop - anchorTop;

        if (Math.abs(delta) < 0.5) {
            return;
        }

        if (isDocumentScroller) {
            window.scrollBy(
                0,
                delta
            );
        } else {
            scroller.scrollTop +=
                delta;
        }
    }

    function collapseAllLoadedDeepSeekThinking() {
        const expandedContents =
            Array.from(
                document.querySelectorAll(
                    '.ds-think-content'
                )
            ).filter(
                isDeepSeekThinkingExpanded
            );

        if (!expandedContents.length) {
            showToast(
                '当前已加载区域没有展开的思考块',
                false
            );
            return;
        }

        const scrollState =
            captureDeepSeekManualCollapseScrollState(
                expandedContents[0]
            );

        let collapsedCount = 0;

        for (
            const thinkContent of
            expandedContents
        ) {
            const title =
                getDeepSeekThinkingTitle(
                    thinkContent
                );

            if (!title) continue;

            const item =
                thinkContent.closest(
                    '[data-virtual-list-item-key]'
                );

            const rawKey =
                item &&
                item.getAttribute(
                    'data-virtual-list-item-key'
                );

            if (rawKey) {
                deepSeekThinkingCollapsedKeys.add(
                    rawKey
                );
            }

            title.dispatchEvent(
                new MouseEvent(
                    'click',
                    {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    }
                )
            );

            collapsedCount += 1;
        }

        const restore = () =>
            restoreDeepSeekManualCollapseScrollState(
                scrollState
            );

        requestAnimationFrame(() => {
            restore();
            window.setTimeout(
                restore,
                60
            );
            window.setTimeout(
                restore,
                180
            );
            window.setTimeout(
                restore,
                360
            );
        });

        showToast(
            collapsedCount
                ? `已折叠当前已加载的 ${collapsedCount} 个思考块`
                : '当前已加载区域没有可折叠的思考块',
            false
        );
    }

    function installDeepSeekThinkingManualButton() {
        const createButton = () => {
            if (
                document.getElementById(
                    'ai-deepseek-collapse-thinking'
                )
            ) {
                return;
            }

            const button =
                document.createElement(
                    'button'
                );

            button.id =
                'ai-deepseek-collapse-thinking';
            button.type = 'button';
            button.textContent =
                '折叠思考';
            button.title =
                '折叠当前已加载的所有 DeepSeek 思考过程；未挂载的历史消息不会被强制加载';

            button.addEventListener(
                'click',
                collapseAllLoadedDeepSeekThinking
            );

            document.body.appendChild(
                button
            );
        };

        if (document.body) {
            createButton();
        } else {
            document.addEventListener(
                'DOMContentLoaded',
                createButton,
                { once: true }
            );
        }
    }

'''

s = s.replace(marker, manual_code + marker, 1)

old_init = '''    if (
        ACTIVE_ADAPTER.autoCollapseThinking &&
        ACTIVE_ADAPTER.id === 'deepseek'
    ) {
        installDeepSeekThinkingAutoCollapse();
    }
'''
new_init = '''    if (
        ACTIVE_ADAPTER.autoCollapseThinking &&
        ACTIVE_ADAPTER.id === 'deepseek'
    ) {
        installDeepSeekThinkingAutoCollapse();
        installDeepSeekThinkingManualButton();
    }
'''
if old_init not in s:
    raise SystemExit("DeepSeek adapter init block not found")
s = s.replace(old_init, new_init, 1)

css_marker = "        .chatgpt-latex-toast.error { background: #c62828; }\n"
css_extra = r'''        #ai-deepseek-collapse-thinking {
            position: fixed;
            right: 20px;
            bottom: 112px;
            z-index: 2147483000;
            padding: 7px 11px;
            border: 1px solid rgba(127, 127, 127, 0.32);
            border-radius: 999px;
            color: inherit;
            background: rgba(127, 127, 127, 0.12);
            -webkit-backdrop-filter: blur(10px);
            backdrop-filter: blur(10px);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.10);
            font: 12px/1.2 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            cursor: pointer;
            opacity: 0.82;
            transition: opacity 0.15s ease, transform 0.15s ease, background 0.15s ease;
        }
        #ai-deepseek-collapse-thinking:hover {
            opacity: 1;
            transform: translateY(-1px);
            background: rgba(127, 127, 127, 0.18);
        }
        #ai-deepseek-collapse-thinking:active {
            transform: translateY(0);
        }
        #ai-deepseek-collapse-thinking:focus-visible {
            outline: 2px solid #4d8dff;
            outline-offset: 2px;
        }
'''
if css_marker not in s:
    raise SystemExit("CSS insertion marker not found")
s = s.replace(css_marker, css_marker + css_extra, 1)

SCRIPT.write_text(s, encoding="utf-8")

r = README.read_text(encoding="utf-8")
readme_marker = "  - 用户仍可手动重新展开已自动折叠的思考过程\n"
readme_extra = (
    "  - 提供 DeepSeek 专用“折叠思考”浮动按钮，可手动折叠当前虚拟列表已加载的全部展开思考块；批量折叠时会尽量保持当前滚动锚点\n"
    "  - DeepSeek 使用虚拟列表，未挂载的历史消息不会为了“一键折叠”被强制加载，以避免重新引入历史滚动跳转\n"
)
if readme_marker not in r:
    raise SystemExit("README DeepSeek marker not found")
r = r.replace(readme_marker, readme_marker + readme_extra, 1)
README.write_text(r, encoding="utf-8")

WORKFLOW.unlink(missing_ok=True)
SELF.unlink(missing_ok=True)
