// ==UserScript==
// @name         ChatGPT 消息限高 + 离屏渲染休眠
// @namespace    https://tampermonkey.net/
// @version      3.3.0
// @description  独立控制助手/用户消息限高，降低离屏渲染开销，并为宽表格提供唯一横向滚动条
// @author       you
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const KEY = {
    assistantHeightEnabled: 'assistantHeightEnabled',
    assistantMaxHeight: 'assistantMaxHeight',

    userHeightEnabled: 'userHeightEnabled',
    userMaxHeight: 'userMaxHeight',

    renderSleepEnabled: 'conversationRenderSleepEnabled',
    intrinsicHeight: 'conversationIntrinsicHeight',
  };

  const DEFAULT = {
    assistantHeightEnabled: true,
    assistantMaxHeight: '400px',

    userHeightEnabled: true,
    userMaxHeight: '300px',

    renderSleepEnabled: true,
    intrinsicHeight: '600px',
  };

  const STYLE_ID =
    '__chatgpt_message_optimize_style__';

  const ROOT_CLASS = {
    assistantHeight:
      '__assistant_height_enabled__',

    userHeight:
      '__user_height_enabled__',

    renderSleep:
      '__conversation_render_sleep_enabled__',
  };

  const TABLE_CLASS = {
    host:
      '__cgpt_table_scroll_host__',

    reset:
      '__cgpt_table_scroll_reset__',

    table:
      '__cgpt_wide_table__',
  };

  function readBoolean(key, fallback) {
    const value =
      GM_getValue(key, fallback);

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      return (
        value.toLowerCase() !== 'false'
      );
    }

    return Boolean(value);
  }

  function validateCssLength(value) {
    const text =
      String(value ?? '').trim();

    if (
      !text ||
      /[;{}]/.test(text)
    ) {
      return null;
    }

    return CSS.supports(
      'height',
      text,
    )
      ? text
      : null;
  }

  const config = {
    assistantHeightEnabled:
      readBoolean(
        KEY.assistantHeightEnabled,
        DEFAULT.assistantHeightEnabled,
      ),

    assistantMaxHeight:
      validateCssLength(
        GM_getValue(
          KEY.assistantMaxHeight,
          DEFAULT.assistantMaxHeight,
        ),
      ) ||
      DEFAULT.assistantMaxHeight,

    userHeightEnabled:
      readBoolean(
        KEY.userHeightEnabled,
        DEFAULT.userHeightEnabled,
      ),

    userMaxHeight:
      validateCssLength(
        GM_getValue(
          KEY.userMaxHeight,
          DEFAULT.userMaxHeight,
        ),
      ) ||
      DEFAULT.userMaxHeight,

    renderSleepEnabled:
      readBoolean(
        KEY.renderSleepEnabled,
        DEFAULT.renderSleepEnabled,
      ),

    intrinsicHeight:
      validateCssLength(
        GM_getValue(
          KEY.intrinsicHeight,
          DEFAULT.intrinsicHeight,
        ),
      ) ||
      DEFAULT.intrinsicHeight,
  };

  function injectStyle() {
    if (
      document.getElementById(
        STYLE_ID,
      )
    ) {
      return;
    }

    const style =
      document.createElement('style');

    style.id = STYLE_ID;

    style.textContent = `
      /*
       * ========================================================
       * 1. 用户和助手消息：只负责纵向限高
       * ========================================================
       */

      html.${ROOT_CLASS.assistantHeight}
      [data-message-author-role="assistant"] {
        max-height:
          var(
            --assistant-max-height,
            ${DEFAULT.assistantMaxHeight}
          ) !important;

        min-width: 0 !important;

        overflow-y: auto !important;
        overflow-x: hidden !important;

        overscroll-behavior-y: contain;
        scrollbar-gutter: stable;

        scrollbar-width: thin !important;
        scrollbar-color:
          var(
            --text-token-text-tertiary,
            #777
          )
          var(
            --bg-token-surface-secondary,
            transparent
          ) !important;
      }

      html.${ROOT_CLASS.userHeight}
      [data-message-author-role="user"] {
        max-height:
          var(
            --user-max-height,
            ${DEFAULT.userMaxHeight}
          ) !important;

        min-width: 0 !important;

        overflow-y: auto !important;
        overflow-x: hidden !important;

        overscroll-behavior-y: contain;
        scrollbar-gutter: stable;

        scrollbar-width: thin !important;
        scrollbar-color:
          var(
            --text-token-text-tertiary,
            #777
          )
          var(
            --bg-token-surface-secondary,
            transparent
          ) !important;
      }

      html.${ROOT_CLASS.assistantHeight}
      [data-message-author-role="assistant"]::-webkit-scrollbar,
      html.${ROOT_CLASS.userHeight}
      [data-message-author-role="user"]::-webkit-scrollbar {
        display: block !important;

        width: 10px !important;
        height: 10px !important;
      }

      html.${ROOT_CLASS.assistantHeight}
      [data-message-author-role="assistant"]::-webkit-scrollbar-track,
      html.${ROOT_CLASS.userHeight}
      [data-message-author-role="user"]::-webkit-scrollbar-track {
        background:
          var(
            --bg-token-surface-secondary,
            rgba(127, 127, 127, 0.08)
          ) !important;

        border-radius:
          999px !important;
      }

      html.${ROOT_CLASS.assistantHeight}
      [data-message-author-role="assistant"]::-webkit-scrollbar-thumb,
      html.${ROOT_CLASS.userHeight}
      [data-message-author-role="user"]::-webkit-scrollbar-thumb {
        background:
          var(
            --text-token-text-tertiary,
            rgba(127, 127, 127, 0.65)
          ) !important;

        border:
          2px solid transparent !important;

        border-radius:
          999px !important;

        background-clip:
          padding-box !important;
      }

      html.${ROOT_CLASS.assistantHeight}
      [data-message-author-role="assistant"]::-webkit-scrollbar-thumb:hover,
      html.${ROOT_CLASS.userHeight}
      [data-message-author-role="user"]::-webkit-scrollbar-thumb:hover {
        background:
          var(
            --text-token-text-secondary,
            rgba(127, 127, 127, 0.9)
          ) !important;

        border:
          2px solid transparent !important;

        background-clip:
          padding-box !important;
      }

      html.${ROOT_CLASS.assistantHeight}
      [data-message-author-role="assistant"]::-webkit-scrollbar-corner,
      html.${ROOT_CLASS.userHeight}
      [data-message-author-role="user"]::-webkit-scrollbar-corner {
        background:
          transparent !important;
      }


      /*
       * ========================================================
       * 2. 宽表格：只保留一个横向滚动容器
       * ========================================================
       *
       * 不再将 table 改成 display:block。
       * 不再修改 thead、tbody、tfoot 的 display。
       * 因此各行会共享同一套列宽计算。
       */

      html.${ROOT_CLASS.assistantHeight}
      [data-message-author-role="assistant"]
      .markdown
      .${TABLE_CLASS.host} {
        display: block !important;

        box-sizing:
          border-box !important;

        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;

        overflow-x: auto !important;
        overflow-y: hidden !important;

        overscroll-behavior-x:
          contain;

        scrollbar-width:
          thin !important;

        scrollbar-color:
          var(
            --text-token-text-tertiary,
            #888
          )
          transparent !important;
      }

      /*
       * 表格更外层的包装元素取消横向滚动，
       * 避免出现第二条横向滚动条。
       */

      html.${ROOT_CLASS.assistantHeight}
      [data-message-author-role="assistant"]
      .markdown
      .${TABLE_CLASS.reset} {
        max-width: 100% !important;
        min-width: 0 !important;

        overflow-x:
          visible !important;

        overflow-y:
          visible !important;

        scrollbar-width:
          none !important;
      }

      html.${ROOT_CLASS.assistantHeight}
      [data-message-author-role="assistant"]
      .markdown
      .${TABLE_CLASS.reset}::-webkit-scrollbar {
        display: none !important;

        width: 0 !important;
        height: 0 !important;
      }

      /*
       * 保留浏览器原生 table 布局。
       * 宽度由完整内容决定，过宽部分由父级滚动。
       */

      html.${ROOT_CLASS.assistantHeight}
      [data-message-author-role="assistant"]
      .markdown
      table.${TABLE_CLASS.table} {
        display: table !important;

        width: max-content !important;
        min-width: 100% !important;
        max-width: none !important;

        table-layout:
          auto !important;

        overflow:
          visible !important;

        white-space:
          normal !important;
      }

      /*
       * 单元格不强制压缩或互相覆盖。
       */

      html.${ROOT_CLASS.assistantHeight}
      [data-message-author-role="assistant"]
      .markdown
      table.${TABLE_CLASS.table}
      :is(th, td) {
        white-space:
          nowrap !important;
      }

      /*
       * 唯一表格横向滚动条。
       */

      html.${ROOT_CLASS.assistantHeight}
      [data-message-author-role="assistant"]
      .markdown
      .${TABLE_CLASS.host}::-webkit-scrollbar {
        display: block !important;

        width: 9px !important;
        height: 9px !important;
      }

      html.${ROOT_CLASS.assistantHeight}
      [data-message-author-role="assistant"]
      .markdown
      .${TABLE_CLASS.host}::-webkit-scrollbar-track {
        background:
          var(
            --bg-token-surface-secondary,
            rgba(127, 127, 127, 0.08)
          ) !important;

        border-radius:
          999px !important;
      }

      html.${ROOT_CLASS.assistantHeight}
      [data-message-author-role="assistant"]
      .markdown
      .${TABLE_CLASS.host}::-webkit-scrollbar-thumb {
        background:
          var(
            --text-token-text-tertiary,
            rgba(127, 127, 127, 0.65)
          ) !important;

        border:
          2px solid transparent !important;

        border-radius:
          999px !important;

        background-clip:
          padding-box !important;
      }

      html.${ROOT_CLASS.assistantHeight}
      [data-message-author-role="assistant"]
      .markdown
      .${TABLE_CLASS.host}::-webkit-scrollbar-thumb:hover {
        background:
          var(
            --text-token-text-secondary,
            rgba(127, 127, 127, 0.9)
          ) !important;

        border:
          2px solid transparent !important;

        background-clip:
          padding-box !important;
      }


      /*
       * ========================================================
       * 3. 离屏渲染休眠
       * ========================================================
       */

      html.${ROOT_CLASS.renderSleep}
      #thread
      section[data-turn]
      [data-conversation-screenshot-content] {
        content-visibility:
          auto !important;

        contain-intrinsic-size:
          auto
          var(
            --conversation-intrinsic-height,
            ${DEFAULT.intrinsicHeight}
          ) !important;
      }
    `;

    (
      document.head ||
      document.documentElement
    ).appendChild(style);
  }

  function applyConfig() {
    const root =
      document.documentElement;

    root.style.setProperty(
      '--assistant-max-height',
      config.assistantMaxHeight,
    );

    root.style.setProperty(
      '--user-max-height',
      config.userMaxHeight,
    );

    root.style.setProperty(
      '--conversation-intrinsic-height',
      config.intrinsicHeight,
    );

    root.classList.toggle(
      ROOT_CLASS.assistantHeight,
      config.assistantHeightEnabled,
    );

    root.classList.toggle(
      ROOT_CLASS.userHeight,
      config.userHeightEnabled,
    );

    root.classList.toggle(
      ROOT_CLASS.renderSleep,
      config.renderSleepEnabled,
    );
  }

  /*
   * ============================================================
   * 4. 表格处理
   *
   * 只增加 CSS class：
   * - 不移动节点
   * - 不创建包装节点
   * - 不修改 React 的 DOM 层级
   * ============================================================
   */

  function processTable(table) {
    if (
      !(
        table instanceof
        HTMLTableElement
      )
    ) {
      return;
    }

    if (
      table.classList.contains(
        TABLE_CLASS.table,
      )
    ) {
      return;
    }

    const assistant =
      table.closest(
        '[data-message-author-role="assistant"]',
      );

    const markdown =
      table.closest('.markdown');

    if (
      !assistant ||
      !markdown ||
      !assistant.contains(table)
    ) {
      return;
    }

    /*
     * ChatGPT 当前表格通常已有专用父容器。
     * 直接使用该父容器作为唯一横向滚动区域。
     */

    const host =
      table.parentElement;

    if (
      !host ||
      host === markdown
    ) {
      return;
    }

    table.classList.add(
      TABLE_CLASS.table,
    );

    host.classList.add(
      TABLE_CLASS.host,
    );

    /*
     * host 与 markdown 之间的包装层全部取消横向滚动。
     */

    let ancestor =
      host.parentElement;

    while (
      ancestor &&
      ancestor !== markdown
    ) {
      ancestor.classList.add(
        TABLE_CLASS.reset,
      );

      ancestor =
        ancestor.parentElement;
    }
  }

  function cleanupTableMarkers() {
    document
      .querySelectorAll(
        `.${TABLE_CLASS.host}`,
      )
      .forEach((element) => {
        if (
          !element.querySelector(
            `:scope > table.${TABLE_CLASS.table}`,
          )
        ) {
          element.classList.remove(
            TABLE_CLASS.host,
          );
        }
      });

    document
      .querySelectorAll(
        `.${TABLE_CLASS.reset}`,
      )
      .forEach((element) => {
        if (
          !element.querySelector(
            `table.${TABLE_CLASS.table}`,
          )
        ) {
          element.classList.remove(
            TABLE_CLASS.reset,
          );
        }
      });
  }

  function scanTables(
    root = document,
  ) {
    if (
      root instanceof
      HTMLTableElement
    ) {
      processTable(root);
      return;
    }

    if (
      !(
        root instanceof Document ||
        root instanceof
          DocumentFragment ||
        root instanceof Element
      )
    ) {
      return;
    }

    root
      .querySelectorAll(
        [
          '[data-message-author-role="assistant"]',
          '.markdown',
          'table',
        ].join(' '),
      )
      .forEach(processTable);
  }

  let tableObserver = null;
  let cleanupTimer = null;

  function nodeContainsTable(node) {
    if (
      !(node instanceof Element)
    ) {
      return false;
    }

    return (
      node.matches(
        [
          '[data-message-author-role="assistant"]',
          '.markdown',
          'table',
        ].join(' '),
      ) ||
      Boolean(
        node.querySelector(
          [
            '[data-message-author-role="assistant"]',
            '.markdown',
            'table',
          ].join(' '),
        ),
      )
    );
  }

  function startTableObserver() {
    if (tableObserver) {
      return;
    }

    tableObserver =
      new MutationObserver(
        (mutations) => {
          let removedManagedNode =
            false;

          for (
            const mutation
            of mutations
          ) {
            for (
              const node
              of mutation.addedNodes
            ) {
              if (
                nodeContainsTable(node)
              ) {
                scanTables(node);
              }
            }

            for (
              const node
              of mutation.removedNodes
            ) {
              if (
                node instanceof Element &&
                (
                  node.matches(
                    [
                      `.${TABLE_CLASS.host}`,
                      `.${TABLE_CLASS.reset}`,
                      `table.${TABLE_CLASS.table}`,
                    ].join(','),
                  ) ||
                  node.querySelector(
                    [
                      `.${TABLE_CLASS.host}`,
                      `.${TABLE_CLASS.reset}`,
                      `table.${TABLE_CLASS.table}`,
                    ].join(','),
                  )
                )
              ) {
                removedManagedNode =
                  true;
              }
            }
          }

          if (removedManagedNode) {
            clearTimeout(
              cleanupTimer,
            );

            cleanupTimer =
              setTimeout(
                cleanupTableMarkers,
                100,
              );
          }
        },
      );

    tableObserver.observe(
      document.documentElement,
      {
        childList: true,
        subtree: true,
      },
    );
  }

  function toggleAssistantHeight() {
    config.assistantHeightEnabled =
      !config.assistantHeightEnabled;

    GM_setValue(
      KEY.assistantHeightEnabled,
      config.assistantHeightEnabled,
    );

    applyConfig();
  }

  function toggleUserHeight() {
    config.userHeightEnabled =
      !config.userHeightEnabled;

    GM_setValue(
      KEY.userHeightEnabled,
      config.userHeightEnabled,
    );

    applyConfig();
  }

  function toggleRenderSleep() {
    config.renderSleepEnabled =
      !config.renderSleepEnabled;

    GM_setValue(
      KEY.renderSleepEnabled,
      config.renderSleepEnabled,
    );

    applyConfig();
  }

  function setCssLength(
    key,
    configName,
    value,
  ) {
    const validated =
      validateCssLength(value);

    if (!validated) {
      return false;
    }

    config[configName] =
      validated;

    GM_setValue(
      key,
      validated,
    );

    applyConfig();

    return true;
  }

  function promptHeight(
    title,
    currentValue,
    callback,
  ) {
    const value = prompt(
      [
        title,
        '',
        '示例：',
        '300px',
        '40vh',
        '25rem',
      ].join('\n'),

      currentValue,
    );

    if (value === null) {
      return;
    }

    if (!callback(value)) {
      alert(
        '高度格式无效。\n' +
        '可使用 300px、40vh、25rem 等格式。',
      );
    }
  }

  function registerMenu() {
    if (
      typeof GM_registerMenuCommand !==
      'function'
    ) {
      return;
    }

    GM_registerMenuCommand(
      `切换助手消息限高（当前：${
        config.assistantHeightEnabled
          ? '开'
          : '关'
      }）`,

      toggleAssistantHeight,
    );

    GM_registerMenuCommand(
      '设置助手消息最大高度',

      () => {
        promptHeight(
          '请输入助手消息最大高度：',

          config.assistantMaxHeight,

          (value) =>
            setCssLength(
              KEY.assistantMaxHeight,
              'assistantMaxHeight',
              value,
            ),
        );
      },
    );

    GM_registerMenuCommand(
      `切换用户消息限高（当前：${
        config.userHeightEnabled
          ? '开'
          : '关'
      }）`,

      toggleUserHeight,
    );

    GM_registerMenuCommand(
      '设置用户消息最大高度',

      () => {
        promptHeight(
          '请输入用户消息最大高度：',

          config.userMaxHeight,

          (value) =>
            setCssLength(
              KEY.userMaxHeight,
              'userMaxHeight',
              value,
            ),
        );
      },
    );

    GM_registerMenuCommand(
      `切换离屏渲染休眠（当前：${
        config.renderSleepEnabled
          ? '开'
          : '关'
      }）`,

      toggleRenderSleep,
    );

    GM_registerMenuCommand(
      '设置离屏内容初始占位高度',

      () => {
        promptHeight(
          [
            '请输入离屏内容初始占位高度。',
            '建议范围：400px～1000px。',
          ].join('\n'),

          config.intrinsicHeight,

          (value) =>
            setCssLength(
              KEY.intrinsicHeight,
              'intrinsicHeight',
              value,
            ),
        );
      },
    );

    GM_registerMenuCommand(
      '显示当前配置',

      () => {
        alert(
          [
            'ChatGPT 消息优化配置',
            '',

            `助手消息限高：${
              config.assistantHeightEnabled
                ? '开启'
                : '关闭'
            }`,

            `助手最大高度：${
              config.assistantMaxHeight
            }`,

            '',

            `用户消息限高：${
              config.userHeightEnabled
                ? '开启'
                : '关闭'
            }`,

            `用户最大高度：${
              config.userMaxHeight
            }`,

            '',

            `离屏渲染休眠：${
              config.renderSleepEnabled
                ? '开启'
                : '关闭'
            }`,

            `初始占位高度：${
              config.intrinsicHeight
            }`,

            '',

            `content-visibility 支持：${
              CSS.supports(
                'content-visibility',
                'auto',
              )
                ? '是'
                : '否'
            }`,
          ].join('\n'),
        );
      },
    );
  }

  // ============================================================
  // 公式复制修复
  //
  // 将官方复制结果中的：
  //   (a>0)       -> $a>0$
  //   [ ... ]     -> $$ ... $$
  //
  // 公式源码取自 KaTeX annotation，而不是猜测普通括号。
  // ============================================================

  const FORMULA_COPY_FIX = {
    contextTtl: 4000,
    prototypeMarker: '__cgpt_formula_copy_fix_installed__',
  };

  let pendingFormulaCopy = null;
  let formulaCopyListenersInstalled = false;

  function escapeRegExp(value) {
    return String(value).replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    );
  }

  /*
   * 创建允许空白变化的匹配模式。
   */
  function makeLooseTextPattern(value) {
    const text =
      String(value || '').trim();

    if (!text) {
      return null;
    }

    return text
      .split(/\s+/)
      .map(escapeRegExp)
      .join(String.raw`\s*`);
  }

  function normalizeMathVisibleText(value) {
    return String(value || '')
      .replace(/\u200b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /*
   * 按 DOM 顺序收集公式。
   *
   * 注意：
   * 这里不能再按公式长度排序，
   * 因为行间公式需要按照出现顺序替换。
   */
  function collectMathFormulas(message) {
    const formulas = [];

    message
      .querySelectorAll(
        'annotation[encoding="application/x-tex"]',
      )
      .forEach((annotation) => {
        const tex = (
          annotation.textContent || ''
        ).trim();

        if (!tex) {
          return;
        }

        const katex =
          annotation.closest('.katex');

        const visibleText =
          normalizeMathVisibleText(
            katex
              ?.querySelector('.katex-html')
              ?.textContent,
          );

        formulas.push({
          tex,
          visibleText,

          display: Boolean(
            annotation.closest(
              '.katex-display',
            ),
          ),
        });
      });

    return formulas;
  }

  /*
   * 从原始 TeX 生成若干可能出现在官方复制结果中的形式。
   *
   * 主要用于行内公式和异常情况下的回退匹配。
   */
  function getFormulaTextCandidates(
    formula,
  ) {
    const candidates = new Set();

    const tex =
      formula.tex.trim();

    if (tex) {
      candidates.add(tex);

      /*
       * 官方复制可能删除部分转义和间距命令。
       */
      const simplified = tex
        .replace(/\\%/g, '%')
        .replace(
          /\\(?:,|;|:|!|quad|qquad)\b/g,
          ' ',
        )
        .replace(
          /\\text\{([^{}]*)\}/g,
          '$1',
        )
        .replace(
          /\\operatorname\{([^{}]*)\}/g,
          '$1',
        )
        .replace(/\s+/g, ' ')
        .trim();

      if (simplified) {
        candidates.add(simplified);
      }
    }

    if (formula.visibleText) {
      candidates.add(
        formula.visibleText,
      );
    }

    return [...candidates]
      .filter(Boolean)
      .sort(
        (a, b) =>
          b.length - a.length,
      );
  }

  /*
   * 暂时保护 fenced code block，防止代码中的：
   *
   * [
   * ...
   * ]
   *
   * 被误判为数学公式。
   */
  function protectFencedCodeBlocks(text) {
    const blocks = [];

    const masked = text.replace(
      /```[\s\S]*?```|~~~[\s\S]*?~~~/g,
      (block) => {
        const index =
          blocks.push(block) - 1;

        return (
          `\uE000CGPT_CODE_${index}\uE001`
        );
      },
    );

    return {
      masked,

      restore(value) {
        return value.replace(
          /\uE000CGPT_CODE_(\d+)\uE001/g,
          (_, index) =>
            blocks[Number(index)] || '',
        );
      },
    };
  }

  /*
   * 找到官方复制产生的独立行间公式块：
   *
   * [
   * ...
   * ]
   */
  function findDisplayPlaceholders(
    text,
  ) {
    const pattern =
      /(^|\n)([ \t]*)\[[ \t]*\n([\s\S]*?)\n[ \t]*\](?=\n|$)/g;

    return [
      ...text.matchAll(pattern),
    ];
  }

  /*
   * 如果占位块数量与 DOM 中的行间公式数量一致，
   * 按出现顺序直接替换。
   *
   * 不关心复制文本中的公式正文是否已被改坏。
   */
  function replaceDisplayByOrder(
    text,
    displayFormulas,
  ) {
    const matches =
      findDisplayPlaceholders(text);

    if (
      matches.length === 0 ||
      matches.length !==
        displayFormulas.length
    ) {
      return {
        text,
        replaced: false,
      };
    }

    let output = '';
    let cursor = 0;

    matches.forEach(
      (match, index) => {
        output += text.slice(
          cursor,
          match.index,
        );

        const prefix =
          match[1] || '';

        const indent =
          match[2] || '';

        const tex =
          displayFormulas[
            index
          ].tex.trim();

        output +=
          `${prefix}${indent}$$\n` +
          `${tex}\n` +
          `${indent}$$`;

        cursor =
          match.index +
          match[0].length;
      },
    );

    output += text.slice(cursor);

    return {
      text: output,
      replaced: true,
    };
  }

  /*
   * 行间公式的正文匹配回退。
   *
   * 仅当占位块数量与公式数量不一致时使用。
   */
  function replaceOneDisplayFormula(
    text,
    formula,
  ) {
    const tex =
      formula.tex.trim();

    for (
      const candidate
      of getFormulaTextCandidates(
        formula,
      )
    ) {
      const body =
        makeLooseTextPattern(
          candidate,
        );

      if (!body) {
        continue;
      }

      const pattern =
        new RegExp(
          String.raw`(^|\n)[ \t]*(?:\\\[|\[)[ \t]*\n?\s*${body}\s*\n?[ \t]*(?:\\\]|\])(?=\n|$)`,
          'm',
        );

      if (pattern.test(text)) {
        return text.replace(
          pattern,

          (_, prefix) =>
            `${prefix}$$\n${tex}\n$$`,
        );
      }
    }

    return text;
  }

  /*
   * 行内公式仍然通过内容匹配。
   *
   * 同时尝试：
   * - 原始 TeX；
   * - 简化后的 TeX；
   * - KaTeX 可见文本。
   */
  function replaceOneInlineFormula(
    text,
    formula,
  ) {
    const tex =
      formula.tex.trim();

    for (
      const candidate
      of getFormulaTextCandidates(
        formula,
      )
    ) {
      const body =
        makeLooseTextPattern(
          candidate,
        );

      if (!body) {
        continue;
      }

      /*
       * 匹配：
       * \(formula\)
       * 或：
       * (formula)
       */
      const pattern =
        new RegExp(
          String.raw`(?:\\\(|\()\s*${body}\s*(?:\\\)|\))`,
        );

      if (pattern.test(text)) {
        return text.replace(
          pattern,
          `$${tex}$`,
        );
      }
    }

    return text;
  }

  function rememberFormulaCopyTarget(event) {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    const button = target.closest(
      'button[data-testid="copy-turn-action-button"]',
    );

    if (!button) {
      return;
    }

    const turn = button.closest(
      'section[data-turn="assistant"]',
    );

    const message = turn?.querySelector(
      '[data-message-author-role="assistant"]',
    );

    if (!message) {
      pendingFormulaCopy = null;
      return;
    }

    pendingFormulaCopy = {
      expiresAt:
        Date.now() +
        FORMULA_COPY_FIX.contextTtl,

      formulas:
        collectMathFormulas(message),
    };
  }

  function getFormulaCopyContext() {
    if (!pendingFormulaCopy) {
      return null;
    }

    if (
      Date.now() >
      pendingFormulaCopy.expiresAt
    ) {
      pendingFormulaCopy = null;
      return null;
    }

    return pendingFormulaCopy;
  }

  function repairCopiedMath(
    text,
    formulas,
  ) {
    let result = String(text)
      .replace(/\r\n?/g, '\n');

    if (!formulas?.length) {
      return result;
    }

    const protectedText =
      protectFencedCodeBlocks(
        result,
      );

    result =
      protectedText.masked;

    const displayFormulas =
      formulas.filter(
        (formula) =>
          formula.display,
      );

    const inlineFormulas =
      formulas.filter(
        (formula) =>
          !formula.display,
      );

    /*
     * 优先按顺序修复所有行间公式。
     */
    const displayResult =
      replaceDisplayByOrder(
        result,
        displayFormulas,
      );

    result =
      displayResult.text;

    /*
     * 如果数量不一致，才退回正文匹配。
     */
    if (
      !displayResult.replaced
    ) {
      for (
        const formula
        of displayFormulas
      ) {
        result =
          replaceOneDisplayFormula(
            result,
            formula,
          );
      }
    }

    /*
     * 修复行内公式。
     */
    for (
      const formula
      of inlineFormulas
    ) {
      result =
        replaceOneInlineFormula(
          result,
          formula,
        );
    }

    return protectedText.restore(
      result,
    );
  }

  function installClipboardPrototypePatch() {
    /*
     * Tampermonkey 默认运行在隔离环境中。
     * 必须通过 unsafeWindow 修改网页主环境中的
     * Clipboard.prototype，否则官方按钮不会经过补丁。
     */
    const pageWindow =
      typeof unsafeWindow !== 'undefined'
        ? unsafeWindow
        : window;

    const clipboard =
      pageWindow.navigator?.clipboard;

    if (!clipboard) {
      console.warn(
        '[ChatGPT 优化] Clipboard API 不可用，公式复制修复未安装。',
      );

      return;
    }

    const prototype =
      Object.getPrototypeOf(clipboard);

    if (
      !prototype ||
      prototype[
        FORMULA_COPY_FIX.prototypeMarker
      ]
    ) {
      return;
    }

    const originalWriteText =
      prototype.writeText;

    const originalWrite =
      prototype.write;

    /*
     * 处理 navigator.clipboard.writeText(...)
     */
    if (
      typeof originalWriteText ===
      'function'
    ) {
      Object.defineProperty(
        prototype,
        'writeText',
        {
          configurable: true,
          writable: true,

          value: function patchedWriteText(
            text,
          ) {
            const context =
              getFormulaCopyContext();

            const fixedText = context
              ? repairCopiedMath(
                  text,
                  context.formulas,
                )
              : text;

            return originalWriteText.call(
              this,
              fixedText,
            );
          },
        },
      );
    }

    /*
     * 兼容 navigator.clipboard.write(...)
     * 仅修改 text/plain，不改变 text/html 等格式。
     */
    if (
      typeof originalWrite === 'function' &&
      typeof pageWindow.ClipboardItem ===
        'function'
    ) {
      Object.defineProperty(
        prototype,
        'write',
        {
          configurable: true,
          writable: true,

          value: function patchedWrite(
            items,
          ) {
            const context =
              getFormulaCopyContext();

            if (!context) {
              return originalWrite.call(
                this,
                items,
              );
            }

            try {
              const sourceItems =
                Array.from(items);

              const hasPlainText =
                sourceItems.some(
                  (item) =>
                    Array.from(
                      item.types || [],
                    ).includes(
                      'text/plain',
                    ),
                );

              if (!hasPlainText) {
                return originalWrite.call(
                  this,
                  items,
                );
              }

              const patchedItems =
                sourceItems.map((item) => {
                  const data = {};

                  for (
                    const type of
                    item.types || []
                  ) {
                    if (
                      type === 'text/plain'
                    ) {
                      data[type] =
                        item
                          .getType(type)
                          .then(
                            (blob) =>
                              blob.text(),
                          )
                          .then(
                            (plainText) =>
                              new pageWindow.Blob(
                                [
                                  repairCopiedMath(
                                    plainText,
                                    context.formulas,
                                  ),
                                ],
                                {
                                  type:
                                    'text/plain',
                                },
                              ),
                          );
                    } else {
                      data[type] =
                        item.getType(type);
                    }
                  }

                  return new pageWindow
                    .ClipboardItem(data);
                });

              return originalWrite.call(
                this,
                patchedItems,
              );
            } catch (error) {
              console.warn(
                '[ChatGPT 优化] ClipboardItem 修复失败，回退到原始复制。',
                error,
              );

              return originalWrite.call(
                this,
                items,
              );
            }
          },
        },
      );
    }

    Object.defineProperty(
      prototype,
      FORMULA_COPY_FIX.prototypeMarker,
      {
        configurable: false,
        enumerable: false,
        writable: false,
        value: true,
      },
    );

    console.info(
      '[ChatGPT 优化] 数学公式复制修复已安装。',
    );
  }

  function installFormulaCopyFix() {
    if (
      !formulaCopyListenersInstalled
    ) {
      /*
       * pointerdown 比官方 click 处理更早，
       * 确保写入剪贴板前已经取得本条回复公式。
       */
      document.addEventListener(
        'pointerdown',
        rememberFormulaCopyTarget,
        true,
      );

      document.addEventListener(
        'click',
        rememberFormulaCopyTarget,
        true,
      );

      formulaCopyListenersInstalled =
        true;
    }

    installClipboardPrototypePatch();
  }

  function init() {
    injectStyle();
    applyConfig();

    scanTables(document);
    startTableObserver();

    installFormulaCopyFix();

    registerMenu();

    if (
      !CSS.supports(
        'content-visibility',
        'auto',
      )
    ) {
      console.warn(
        '[ChatGPT 优化] 当前浏览器不支持 content-visibility。',
      );
    }
  }

  init();
})();