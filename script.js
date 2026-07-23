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

  function init() {
    injectStyle();
    applyConfig();

    scanTables(document);
    startTableObserver();

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