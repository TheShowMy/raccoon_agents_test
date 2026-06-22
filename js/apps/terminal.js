/**
 * macOS Web Simulator — Terminal 应用
 * ============================================================
 * 模拟终端：深色背景、等宽字体、绿色提示符、预设命令支持。
 * 通过 macOS.dock / macOS.menu 系统集成。
 */

;(function () {
  "use strict";

  const macOS = window.__macOS;
  if (!macOS) return;

  const { STATE } = macOS;

  /* ==========================================================
   *  状态
   * ========================================================== */

  let termWindow = null;
  let commandHistory = [];
  let historyIndex = -1;

  const VFS = {
    "~": {
      type: "dir",
      children: {
        "Desktop": { type: "dir", children: {} },
        "Documents": { type: "dir", children: { "readme.txt": { type: "file", content: "Welcome to macOS Terminal Simulator!\n\nTry commands: help, ls, cd, cat, echo, whoami, date, neofetch" }, "notes.md": { type: "file", content: "# Notes\n- Built with pure HTML/CSS/JS\n- macOS style" } } },
        "Downloads": { type: "dir", children: {} },
        ".bashrc": { type: "file", content: "export PS1='%n@%m %~ %% '" },
        ".zshrc": { type: "file", content: "alias ll='ls -la'\nalias cls='clear'" },
      },
    },
  };

  let cwd = "~";
  let cwdPath = ["~"];

  function resolvePath(seg) {
    if (seg === "~" || !seg) return ["~"];
    let parts = [...cwdPath];
    if (seg.startsWith("/")) { parts = ["~"]; seg = seg.slice(1); }
    const segs = seg.split("/").filter(Boolean);
    for (const s of segs) {
      if (s === "..") { if (parts.length > 1) parts.pop(); }
      else if (s !== ".") parts.push(s);
    }
    return parts;
  }

  function getNode(pathArr) {
    let node = VFS;
    for (let i = 0; i < pathArr.length; i++) {
      if (node.type !== "dir" || !node.children) return null;
      node = node.children[pathArr[i]];
      if (!node) return null;
    }
    return node;
  }

  /* ==========================================================
   *  命令定义
   * ========================================================== */

  const COMMANDS = {
    help() {
      return [
        '<span class="term-highlight">可用命令：</span>',
        "  help       — 显示此帮助",
        "  clear      — 清除屏幕",
        "  echo       — 回显文字",
        "  date       — 显示日期时间",
        "  whoami     — 显示当前用户",
        "  ls [-a]    — 列出目录内容",
        "  pwd        — 显示当前目录",
        "  cd [dir]   — 切换目录",
        "  cat [file] — 查看文件内容",
        "  uname      — 显示系统信息",
        "  neofetch   — 显示系统信息（ASCII art）",
        "  history    — 显示命令历史",
      ].join("\n");
    },

    clear() {
      return "__CLEAR__";
    },

    echo(args) {
      return args.join(" ");
    },

    date() {
      return new Date().toString();
    },

    whoami() {
      return "theshow";
    },

    ls(args) {
      const showAll = args.includes("-a");
      const node = getNode(cwdPath);
      if (!node || node.type !== "dir") return "ls: not a directory";
      const names = Object.keys(node.children || {});
      const list = showAll ? names : names.filter(n => !n.startsWith("."));
      if (list.length === 0) return "";
      return list.sort().join("  ");
    },

    pwd() {
      return "/" + cwdPath.slice(1).join("/");
    },

    cd(args) {
      const target = args[0] || "~";
      const newPath = resolvePath(target);
      const node = getNode(newPath);
      if (!node || node.type !== "dir") return `cd: no such directory: ${target}`;
      cwdPath = newPath;
      cwd = "/" + newPath.slice(1).join("/") || "~";
      return "";
    },

    cat(args) {
      if (!args[0]) return "cat: missing operand";
      const path = resolvePath(args[0]);
      const node = getNode(path);
      if (!node) return `cat: ${args[0]}: No such file or directory`;
      if (node.type !== "file") return `cat: ${args[0]}: Is a directory`;
      return node.content || "(empty)";
    },

    uname() {
      return "Darwin Kernel Version 24.0.0: macOS Sequoia 15.0";
    },

    neofetch() {
      const user = "theshow";
      const host = "MacBook-Pro";
      return [
        '      <span class="term-info">               ####                   </span>  <span class="term-highlight">' + user + '</span>@<span class="term-highlight">' + host + '</span>',
        '      <span class="term-info">         ############                 </span>  <span class="term-info">---------------</span>',
        '      <span class="term-info">       #####/#/##/####               </span>  <span class="term-info">OS:</span> macOS Sequoia 15.0',
        '      <span class="term-info">    ######/##/####/######            </span>  <span class="term-info">Host:</span> MacBook Pro (16-inch, 2023)',
        '      <span class="term-info">   ######/########/######           </span>  <span class="term-info">Kernel:</span> Darwin 24.0.0',
        '      <span class="term-info">  #####/ ##/##/##/ #####           </span>  <span class="term-info">Shell:</span> zsh 5.9',
        '      <span class="term-info"> #####/  ########/ #####            </span>  <span class="term-info">Resolution:</span> 3456x2234',
        '      <span class="term-info">######/   ######/ ######            </span>  <span class="term-info">CPU:</span> Apple M3 Pro',
        '      <span class="term-info">#####/     #####/ #####             </span>  <span class="term-info">Memory:</span> 36 GB',
        '      <span class="term-info">           ###                      </span>',
        '      <span class="term-info">           #                       </span>',
      ].join("\n");
    },

    history() {
      if (commandHistory.length === 0) return "(empty)";
      return commandHistory.map((cmd, i) => `  ${i + 1}  ${cmd}`).join("\n");
    },

    open(args) {
      if (!args[0]) return "open: missing file operand";
      return `Opening ${args[0]}... (simulated)`;
    },
  };

  /* ==========================================================
   *  构建终端 HTML
   * ========================================================== */

  function buildHtml() {
    return `
<div class="terminal-window">
  <div class="terminal-output" id="term-output">
    <div class="term-welcome">
      <pre>Last login: ${new Date().toLocaleString()} on ttys000</pre>
      <pre>
   _____                    _             _
  |_   _|__ _ __ _ __ ___  | |_ ___ _ __ | |
    | |/ _ \\ '__| '_ \` _ \\ | __/ _ \\ '_ \\| |
    | |  __/ |  | | | | | || |_  __/ | | | |
    |_|\\___|_|  |_| |_| |_(_)__\\___|_| |_|_|

      </pre>
      <pre>Welcome to macOS Terminal Simulator!</pre>
      <pre>Type '<span class="term-highlight">help</span>' to see available commands.</pre>
    </div>
  </div>
  <div class="terminal-input-line">
    <span class="terminal-prompt" id="term-prompt">theshow@MacBook-Pro ~ % </span>
    <input type="text" class="terminal-input" id="term-input" autofocus spellcheck="false" autocomplete="off" />
  </div>
</div>`;
  }

  /* ==========================================================
   *  打开 / 聚焦 Terminal
   * ========================================================== */

  function openTerminal() {
    if (termWindow) {
      const wm = macOS.windowManager;
      const existing = wm.getByAppId("terminal");
      if (existing) {
        if (existing.minimized) existing._restoreMinimized();
        wm.focus(existing);
        return;
      }
      termWindow = null;
    }

    const wm = macOS.windowManager;

    termWindow = wm.create({
      title: "Terminal — zsh — 80×24",
      appId: "terminal",
      width: 680,
      height: 450,
      x: 200,
      y: 100,
      content: buildHtml(),
    });

    // 添加深色标题栏 class
    const titlebar = termWindow._el.querySelector(".window-titlebar");
    if (titlebar) titlebar.classList.add("terminal-titlebar");

    requestAnimationFrame(() => {
      bindInput();
    });
  }

  function bindInput() {
    if (!termWindow) return;
    const input = termWindow._el.querySelector("#term-input");
    const output = termWindow._el.querySelector("#term-output");
    if (!input || !output) return;

    const focusInput = () => {
      if (termWindow && termWindow._focused) input.focus();
    };

    termWindow._el.addEventListener("mousedown", (e) => {
      if (!e.target.closest(".window-traffic-lights")) {
        setTimeout(focusInput, 10);
      }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const cmd = input.value.trim();
        input.value = "";
        if (cmd) {
          commandHistory.push(cmd);
          historyIndex = commandHistory.length;
          executeCommand(cmd, output);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (historyIndex > 0) {
          historyIndex--;
          input.value = commandHistory[historyIndex] || "";
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (historyIndex < commandHistory.length - 1) {
          historyIndex++;
          input.value = commandHistory[historyIndex] || "";
        } else {
          historyIndex = commandHistory.length;
          input.value = "";
        }
      }
    });

    input.focus();
  }

  function executeCommand(cmd, output) {
    // 回显提示符 + 命令
    const promptHtml = `<div class="term-command"><span class="term-prompt-text">theshow@MacBook-Pro ${cwd} % </span>${escapeHtml(cmd)}</div>`;
    output.insertAdjacentHTML("beforeend", promptHtml);

    // 解析命令（支持引号参数）
    const args = [];
    let current = "";
    let inQuote = false;
    let quoteChar = "";
    for (let i = 0; i < cmd.length; i++) {
      const ch = cmd[i];
      if (!inQuote && (ch === '"' || ch === "'")) {
        inQuote = true;
        quoteChar = ch;
      } else if (inQuote && ch === quoteChar) {
        inQuote = false;
      } else if (!inQuote && ch === " ") {
        if (current) { args.push(current); current = ""; }
      } else {
        current += ch;
      }
    }
    if (current) args.push(current);

    const cmdName = args[0] || "";
    const cmdArgs = args.slice(1);

    if (!cmdName) return;

    if (COMMANDS[cmdName]) {
      const result = COMMANDS[cmdName](cmdArgs);
      if (result === "__CLEAR__") {
        output.innerHTML = "";
        return;
      }
      if (result) {
        output.insertAdjacentHTML("beforeend", `<div class="term-output">${result}</div>`);
      }
    } else {
      output.insertAdjacentHTML("beforeend", `<div class="term-error">zsh: command not found: ${escapeHtml(cmdName)}</div>`);
    }

    // 滚动到底部
    output.scrollTop = output.scrollHeight;

    // 更新提示符
    const promptEl = termWindow._el.querySelector("#term-prompt");
    if (promptEl) promptEl.textContent = `theshow@MacBook-Pro ${cwd} % `;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* ==========================================================
   *  注册应用
   * ========================================================== */

  function registerApp() {
    STATE.apps["terminal"] = {
      name: "Terminal",
      icon: "terminal",
      open: openTerminal,
    };
  }

  /* ==========================================================
   *  暴露 API
   * ========================================================== */

  macOS.terminalApp = {
    open: openTerminal,
    clear() {
      if (termWindow) {
        const output = termWindow._el.querySelector("#term-output");
        if (output) output.innerHTML = "";
      }
    },
  };

  /* ==========================================================
   *  初始化
   * ========================================================== */

  function init() {
    registerApp();
    console.log("Terminal app registered");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
