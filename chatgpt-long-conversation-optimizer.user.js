// ==UserScript==
// @name         ChatGPT 长对话性能优化器
// @namespace    https://tampermonkey.net/
// @version      4.1.0
// @description  兼容新版 ChatGPT DOM 的用户/助手消息限高，并在旧版结构上保留离屏渲染优化
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
    '__chatgpt_message_optimize_style_clean__';

  const ROOT_CLASS = {
    assistantHeight:
      '__assistant_height_enabled__',

    userHeight:
      '__user_height_enabled__',

    renderSleep:
      '__conversation_render_sleep_enabled__',
  };

  /*
   * 同时兼容旧版与 2026-09 新版 ChatGPT DOM。
   *
   * 新版：
   *   [data-content-search-unit-key$=":assistant"]
   *     [data-markdown-text-style="assistant-message"]
   *
   *   [data-content-search-unit-key$=":user"]
   *     [data-user-message-bubble="true"]
   */
  const MESSAGE_SELECTOR = {
    assistant: [
      '[data-message-author-role="assistant"]',
      '[data-content-search-unit-key$=":assistant"] [data-markdown-text-style="assistant-message"]',
    ].join(', '),

    user: [
      '[data-message-author-role="user"]',
      '[data-content-search-unit-key$=":user"] [data-user-message-bubble="true"]',
    ].join(', '),
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

    const parent =
      document.head ||
      document.documentElement;

    if (!parent) {
      document.addEventListener(
        'readystatechange',
        injectStyle,
        {
          once: true,
        },
      );

      return;
    }

    const style =
      document.createElement('style');

    style.id = STYLE_ID;

    style.textContent = `
      /*
       * 助手消息限高。
       *
       * 只限制纵向高度，不修改公式、表格或 DOM。
       */
      html.${ROOT_CLASS.assistantHeight}
      :is(${MESSAGE_SELECTOR.assistant}) {
        max-height:
          var(
            --assistant-max-height,
            ${DEFAULT.assistantMaxHeight}
          ) !important;

        min-width: 0 !important;

        overflow-y: auto !important;

        overscroll-behavior-y:
          contain;

        scrollbar-gutter:
          stable;

        scrollbar-width:
          thin !important;

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

      /*
       * 用户消息限高。
       *
       * 适用于包含大量附件的用户消息。
       */
      html.${ROOT_CLASS.userHeight}
      :is(${MESSAGE_SELECTOR.user}) {
        max-height:
          var(
            --user-max-height,
            ${DEFAULT.userMaxHeight}
          ) !important;

        min-width: 0 !important;

        overflow-y: auto !important;

        overscroll-behavior-y:
          contain;

        scrollbar-gutter:
          stable;

        scrollbar-width:
          thin !important;

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

      /*
       * Chromium / Edge 滚动条。
       */
      html.${ROOT_CLASS.assistantHeight}
      :is(${MESSAGE_SELECTOR.assistant})::-webkit-scrollbar,

      html.${ROOT_CLASS.userHeight}
      :is(${MESSAGE_SELECTOR.user})::-webkit-scrollbar {
        display:
          block !important;

        width:
          10px !important;

        height:
          10px !important;
      }

      html.${ROOT_CLASS.assistantHeight}
      :is(${MESSAGE_SELECTOR.assistant})::-webkit-scrollbar-track,

      html.${ROOT_CLASS.userHeight}
      :is(${MESSAGE_SELECTOR.user})::-webkit-scrollbar-track {
        background:
          var(
            --bg-token-surface-secondary,
            rgba(127, 127, 127, 0.08)
          ) !important;

        border-radius:
          999px !important;
      }

      html.${ROOT_CLASS.assistantHeight}
      :is(${MESSAGE_SELECTOR.assistant})::-webkit-scrollbar-thumb,

      html.${ROOT_CLASS.userHeight}
      :is(${MESSAGE_SELECTOR.user})::-webkit-scrollbar-thumb {
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
      :is(${MESSAGE_SELECTOR.assistant})::-webkit-scrollbar-thumb:hover,

      html.${ROOT_CLASS.userHeight}
      :is(${MESSAGE_SELECTOR.user})::-webkit-scrollbar-thumb:hover {
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
      :is(${MESSAGE_SELECTOR.assistant})::-webkit-scrollbar-corner,

      html.${ROOT_CLASS.userHeight}
      :is(${MESSAGE_SELECTOR.user})::-webkit-scrollbar-corner {
        background:
          transparent !important;
      }

      /*
       * 离屏渲染休眠（仅旧版 DOM）。
       *
       * 2026-09 新版 ChatGPT 已使用 [data-turn-key] + 显式高度占位
       * 进行官方虚拟化。这里不对新版虚拟列表追加 content-visibility，
       * 避免与官方高度测量发生冲突。
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

    parent.appendChild(style);
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

  function promptCssLength(
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
        promptCssLength(
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
        promptCssLength(
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
        promptCssLength(
          '请输入离屏内容初始占位高度：',

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
    registerMenu();

    if (
      !CSS.supports(
        'content-visibility',
        'auto',
      )
    ) {
      console.warn(
        '[ChatGPT 消息优化] 当前浏览器不支持 content-visibility。',
      );
    }
  }

  init();
})();