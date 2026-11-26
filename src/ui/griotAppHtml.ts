// ============================================================================
// GRIOT AI — RESPONSIVE WEB EXPERIENCE ("ASK GRIOT" & "BUILD WITH GRIOT")
// Dark, premium foundation with warm orange/amber gradients, subtle
// glassmorphism, soft glowing AI orb, persistent conversation history,
// saved project resumption, project specification & quality control view,
// and dedicated Guided Build Workspace.
// ============================================================================

export function renderGriotWebInterfaceHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GRIOT AI — Ask & Build with Guided Intelligence</title>
  <style>
    :root {
      --bg-deep: #09090d;
      --bg-surface: rgba(20, 20, 28, 0.78);
      --bg-card: rgba(27, 27, 38, 0.72);
      --border-subtle: rgba(255, 145, 77, 0.18);
      --border-neutral: rgba(255, 255, 255, 0.08);
      --accent-orange: #ff6b2b;
      --accent-amber: #f59e0b;
      --accent-glow: rgba(255, 107, 43, 0.35);
      --text-primary: #f8fafc;
      --text-secondary: #a1a1b5;
      --text-muted: #6e6e85;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background: radial-gradient(circle at 50% -10%, rgba(255, 107, 43, 0.16), transparent 55%),
                  radial-gradient(circle at 85% 20%, rgba(245, 158, 11, 0.09), transparent 45%),
                  var(--bg-deep);
      color: var(--text-primary);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
      min-height: 100vh;
      line-height: 1.55;
      overflow-x: hidden;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 2rem;
      border-bottom: 1px solid var(--border-neutral);
      backdrop-filter: blur(16px);
      background: rgba(9, 9, 13, 0.8);
      position: sticky;
      top: 0;
      z-index: 40;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-weight: 700;
      font-size: 1.15rem;
      letter-spacing: 0.04em;
    }

    .brand-orb-mini {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 35%, #fde047, var(--accent-amber), var(--accent-orange));
      box-shadow: 0 0 18px var(--accent-glow);
    }

    .brand-badge {
      font-size: 0.72rem;
      font-weight: 600;
      padding: 0.2rem 0.65rem;
      border-radius: 999px;
      background: rgba(255, 107, 43, 0.14);
      border: 1px solid var(--border-subtle);
      color: #fdba74;
      cursor: pointer;
    }

    .runtime-pill {
      font-size: 0.72rem;
      font-weight: 600;
      padding: 0.2rem 0.65rem;
      border-radius: 999px;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.35);
      color: #6ee7b7;
    }

    .nav-tabs {
      display: flex;
      gap: 0.5rem;
    }

    .tab-btn {
      background: rgba(255, 255, 255, 0.04);
      color: var(--text-secondary);
      border: 1px solid var(--border-neutral);
      padding: 0.5rem 1.1rem;
      border-radius: 999px;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .tab-btn.active, .tab-btn:hover {
      background: linear-gradient(135deg, var(--accent-orange), var(--accent-amber));
      color: #09090d;
      border-color: transparent;
      box-shadow: 0 4px 16px rgba(255, 107, 43, 0.28);
    }

    main {
      max-width: 1220px;
      margin: 0 auto;
      padding: 2rem 1.25rem 4rem;
    }

    .hero {
      text-align: center;
      padding: 2.2rem 1rem 2.8rem;
    }

    .ai-orb-container {
      display: flex;
      justify-content: center;
      margin-bottom: 1.5rem;
    }

    .ai-orb {
      width: 88px;
      height: 88px;
      border-radius: 50%;
      background: radial-gradient(circle at 30% 30%, #fff7ed, #fbbf24 35%, #ff6b2b 70%, #9a3412 100%);
      box-shadow: 0 0 42px rgba(255, 107, 43, 0.55), inset 0 0 18px rgba(255, 255, 255, 0.45);
      animation: pulseOrb 4s ease-in-out infinite;
    }

    @keyframes pulseOrb {
      0%, 100% { transform: scale(1); box-shadow: 0 0 40px rgba(255, 107, 43, 0.5); }
      50% { transform: scale(1.05); box-shadow: 0 0 60px rgba(245, 158, 11, 0.72); }
    }

    .hero h1 {
      font-size: clamp(1.85rem, 4vw, 2.75rem);
      font-weight: 800;
      letter-spacing: -0.02em;
      margin-bottom: 0.75rem;
      background: linear-gradient(135deg, #ffffff 30%, #fed7aa 70%, #fb923c 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .hero p {
      color: var(--text-secondary);
      max-width: 650px;
      margin: 0 auto 2rem;
      font-size: 1.02rem;
    }

    .primary-actions-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.5rem;
      max-width: 900px;
      margin: 0 auto;
    }

    .action-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 22px;
      padding: 1.85rem;
      text-align: left;
      backdrop-filter: blur(18px);
      cursor: pointer;
      transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
    }

    .action-card:hover {
      transform: translateY(-4px);
      border-color: var(--accent-amber);
      box-shadow: 0 14px 34px rgba(0, 0, 0, 0.45), 0 0 24px rgba(255, 107, 43, 0.18);
    }

    .action-tag {
      display: inline-block;
      font-size: 0.73rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent-amber);
      margin-bottom: 0.5rem;
    }

    .action-card h2 {
      font-size: 1.45rem;
      margin-bottom: 0.55rem;
      color: #fff;
    }

    .action-card p {
      color: var(--text-secondary);
      font-size: 0.93rem;
      margin-bottom: 1.35rem;
    }

    .btn-primary {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: linear-gradient(135deg, var(--accent-orange), var(--accent-amber));
      color: #09090d;
      font-weight: 700;
      font-size: 0.9rem;
      border: none;
      border-radius: 12px;
      padding: 0.7rem 1.25rem;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .btn-primary:hover {
      opacity: 0.92;
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.06);
      color: var(--text-primary);
      border: 1px solid var(--border-neutral);
      border-radius: 12px;
      padding: 0.6rem 1.1rem;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
    }

    .btn-secondary:hover {
      border-color: var(--accent-amber);
    }

    .view-panel {
      display: none;
      margin-top: 1.25rem;
    }

    .view-panel.active {
      display: block;
    }

    .glass-panel {
      background: var(--bg-surface);
      border: 1px solid var(--border-neutral);
      border-radius: 20px;
      padding: 1.55rem;
      backdrop-filter: blur(18px);
      margin-bottom: 1.35rem;
    }

    .ask-layout {
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 1.25rem;
      align-items: start;
    }

    .ask-sidebar {
      display: flex;
      flex-direction: column;
      max-height: calc(100vh - 150px);
      min-height: 460px;
    }

    .conv-sidebar-scroll {
      overflow-y: auto;
      flex: 1;
      padding-right: 0.15rem;
    }

    .ask-chat-panel {
      display: flex;
      flex-direction: column;
      min-height: 540px;
      max-height: calc(100vh - 150px);
    }

    .ask-chat-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 0.9rem;
      margin-bottom: 0.85rem;
      border-bottom: 1px solid var(--border-neutral);
      flex-wrap: wrap;
      gap: 0.65rem;
    }

    .ask-controls-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .ask-select-compact {
      width: auto;
      max-width: 240px;
      padding: 0.45rem 0.75rem;
      font-size: 0.8rem;
      border-radius: 10px;
      background: rgba(12, 12, 18, 0.9);
    }

    .workspace-grid {
      display: grid;
      grid-template-columns: 330px 1fr;
      gap: 1.5rem;
    }

    @media (max-width: 880px) {
      .ask-layout, .workspace-grid {
        grid-template-columns: 1fr;
      }
      .ask-sidebar {
        max-height: 260px;
        min-height: auto;
      }
      .ask-chat-panel {
        max-height: none;
        min-height: 460px;
      }
    }

    .chat-messages {
      flex: 1;
      min-height: 320px;
      max-height: 560px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1.05rem;
      padding: 0.65rem 0.5rem 1rem;
      margin-bottom: 0.9rem;
      width: 100%;
      max-width: 820px;
      margin-left: auto;
      margin-right: auto;
    }

    .chat-empty-state {
      margin: auto;
      text-align: center;
      padding: 2rem 1.25rem;
      max-width: 560px;
    }

    .chat-empty-state h3 {
      font-size: 1.25rem;
      font-weight: 700;
      margin-bottom: 0.45rem;
      color: var(--text-primary);
    }

    .chat-empty-state p {
      font-size: 0.9rem;
      color: var(--text-secondary);
      margin-bottom: 1.2rem;
    }

    .chat-suggestions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.55rem;
    }

    .chat-suggestion-btn {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border-neutral);
      color: var(--text-secondary);
      border-radius: 999px;
      padding: 0.48rem 0.9rem;
      font-size: 0.81rem;
      cursor: pointer;
      transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease;
    }

    .chat-suggestion-btn:hover {
      border-color: var(--accent-amber);
      color: var(--text-primary);
      background: rgba(255, 107, 43, 0.1);
    }

    .msg-bubble {
      padding: 0.95rem 1.2rem;
      border-radius: 16px;
      max-width: 86%;
      font-size: 0.94rem;
      line-height: 1.62;
      word-break: break-word;
    }

    .msg-user {
      align-self: flex-end;
      background: linear-gradient(135deg, rgba(255, 107, 43, 0.24), rgba(245, 158, 11, 0.18));
      border: 1px solid var(--border-subtle);
      white-space: pre-wrap;
    }

    .msg-assistant {
      align-self: flex-start;
      background: rgba(255, 255, 255, 0.035);
      border: 1px solid var(--border-neutral);
      max-width: 92%;
    }

    .msg-assistant.msg-error {
      border-color: rgba(239, 68, 68, 0.42);
      background: rgba(239, 68, 68, 0.09);
    }

    .msg-role-label {
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 0.35rem;
    }

    .msg-body p {
      margin: 0 0 0.65rem;
    }

    .msg-body p:last-child {
      margin-bottom: 0;
    }

    .msg-body h1, .msg-body h2, .msg-body h3 {
      margin: 0.8rem 0 0.4rem;
      font-weight: 700;
      color: #fff;
      line-height: 1.3;
    }

    .msg-body h1 { font-size: 1.18rem; }
    .msg-body h2 { font-size: 1.07rem; }
    .msg-body h3 { font-size: 0.98rem; }

    .msg-body ul, .msg-body ol {
      margin: 0.4rem 0 0.7rem 1.35rem;
    }

    .msg-body li {
      margin-bottom: 0.25rem;
    }

    .msg-body blockquote {
      border-left: 3px solid var(--accent-amber);
      padding-left: 0.85rem;
      margin: 0.55rem 0;
      color: var(--text-secondary);
    }

    .msg-body a {
      color: #fdba74;
      text-decoration: underline;
    }

    .msg-body code {
      font-family: "Cascadia Code", Consolas, "Courier New", monospace;
      font-size: 0.84em;
      background: rgba(255, 255, 255, 0.08);
      padding: 0.12rem 0.36rem;
      border-radius: 6px;
      color: #fed7aa;
    }

    .code-block-wrap {
      margin: 0.7rem 0;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: #07070b;
      overflow: hidden;
    }

    .code-block-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.38rem 0.75rem;
      background: rgba(255, 255, 255, 0.04);
      border-bottom: 1px solid rgba(255, 255, 255, 0.07);
      font-size: 0.72rem;
      color: var(--text-secondary);
    }

    .code-copy-btn {
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid var(--border-neutral);
      color: var(--text-primary);
      border-radius: 7px;
      padding: 0.18rem 0.55rem;
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
    }

    .code-copy-btn:hover {
      border-color: var(--accent-amber);
    }

    .code-block-pre {
      margin: 0;
      padding: 0.85rem;
      overflow-x: auto;
      font-family: "Cascadia Code", Consolas, "Courier New", monospace;
      font-size: 0.84rem;
      line-height: 1.5;
      color: #f1f5f9;
    }

    .code-block-pre code {
      background: transparent;
      padding: 0;
      color: inherit;
      font-size: inherit;
    }

    .msg-meta {
      margin-top: 0.55rem;
      padding-top: 0.45rem;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      font-size: 0.73rem;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.45rem;
    }

    .msg-status-tag {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.72rem;
      color: #fcd34d;
    }

    .generating-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--accent-amber);
      display: inline-block;
      animation: pulseGen 1.1s ease-in-out infinite;
    }

    @keyframes pulseGen {
      0%, 100% { opacity: 0.35; transform: scale(0.85); }
      50% { opacity: 1; transform: scale(1.15); }
    }

    .msg-error-actions {
      margin-top: 0.65rem;
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .chat-composer-wrap {
      width: 100%;
      max-width: 820px;
      margin: 0 auto;
    }

    .chat-status-bar {
      min-height: 1.2rem;
      margin-bottom: 0.4rem;
      font-size: 0.77rem;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .input-row {
      display: flex;
      gap: 0.65rem;
      align-items: flex-end;
    }

    .btn-stop {
      display: none;
      align-items: center;
      gap: 0.4rem;
      background: rgba(239, 68, 68, 0.16);
      color: #fecaca;
      border: 1px solid rgba(239, 68, 68, 0.45);
      border-radius: 12px;
      padding: 0.7rem 1.1rem;
      font-size: 0.88rem;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
    }

    .btn-stop:hover {
      background: rgba(239, 68, 68, 0.26);
      border-color: #f87171;
    }

    .btn-stop.visible {
      display: inline-flex;
    }

    input[type="text"], textarea, select {
      background: rgba(12, 12, 18, 0.85);
      border: 1px solid var(--border-neutral);
      color: var(--text-primary);
      border-radius: 12px;
      padding: 0.75rem 1rem;
      font-size: 0.93rem;
      font-family: inherit;
      width: 100%;
    }

    input:focus, textarea:focus, select:focus {
      outline: none;
      border-color: var(--accent-amber);
    }

    .step-item {
      padding: 0.82rem 0.95rem;
      border-radius: 14px;
      border: 1px solid var(--border-neutral);
      margin-bottom: 0.6rem;
      background: rgba(255, 255, 255, 0.02);
      font-size: 0.86rem;
    }

    .step-item.active {
      border-color: var(--accent-orange);
      background: rgba(255, 107, 43, 0.12);
    }

    .step-item.completed {
      border-color: rgba(16, 185, 129, 0.4);
      background: rgba(16, 185, 129, 0.08);
    }

    .progress-bar-track {
      width: 100%;
      height: 8px;
      background: rgba(255, 255, 255, 0.07);
      border-radius: 999px;
      overflow: hidden;
      margin: 0.55rem 0 1.15rem;
    }

    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent-orange), var(--accent-amber));
      transition: width 0.3s ease;
    }

    .copy-box {
      background: #07070a;
      border: 1px solid var(--border-subtle);
      border-radius: 14px;
      padding: 1.05rem;
      font-family: "Cascadia Code", Consolas, monospace;
      font-size: 0.85rem;
      white-space: pre-wrap;
      margin: 0.7rem 0 1rem;
      color: #fed7aa;
    }

    .meta-pill {
      display: inline-block;
      padding: 0.22rem 0.65rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      background: rgba(255, 255, 255, 0.07);
      margin-right: 0.35rem;
      margin-bottom: 0.35rem;
    }

    .section-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--accent-amber);
      font-weight: 700;
      margin-top: 0.95rem;
      margin-bottom: 0.3rem;
    }

    .conv-list-item {
      padding: 0.62rem 0.75rem;
      border-radius: 11px;
      border: 1px solid var(--border-neutral);
      margin-bottom: 0.45rem;
      font-size: 0.83rem;
      cursor: pointer;
      color: var(--text-secondary);
      background: rgba(255,255,255,0.02);
      transition: border-color 0.18s ease, background 0.18s ease;
    }

    .conv-list-item.active, .conv-list-item:hover {
      border-color: var(--accent-amber);
      color: var(--text-primary);
      background: rgba(255,107,43,0.1);
    }

    .conv-item-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.4rem;
    }

    .conv-item-title {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
    }

    .conv-item-meta {
      margin-top: 0.22rem;
      font-size: 0.71rem;
      color: var(--text-muted);
    }

    .conv-item-actions {
      display: flex;
      gap: 0.2rem;
      flex-shrink: 0;
      opacity: 0.75;
    }

    .conv-list-item:hover .conv-item-actions,
    .conv-list-item.active .conv-item-actions {
      opacity: 1;
    }

    .conv-icon-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid transparent;
      color: var(--text-secondary);
      border-radius: 6px;
      padding: 0.12rem 0.36rem;
      font-size: 0.72rem;
      cursor: pointer;
      line-height: 1.2;
    }

    .conv-icon-btn:hover {
      border-color: var(--accent-amber);
      color: var(--text-primary);
    }

    .conv-icon-btn.danger:hover {
      border-color: rgba(239, 68, 68, 0.55);
      color: #fca5a5;
    }

    .conv-inline-edit {
      display: flex;
      gap: 0.35rem;
      align-items: center;
    }

    .conv-inline-edit input {
      padding: 0.32rem 0.55rem;
      font-size: 0.8rem;
      border-radius: 8px;
    }

    .conv-confirm-box {
      margin-top: 0.45rem;
      padding-top: 0.45rem;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.35rem;
      font-size: 0.74rem;
      color: #fca5a5;
    }

    /* Stage 2: Authentication Modal & Header Account Menu */
    .header-right {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .auth-header-controls {
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }

    .account-menu-wrap {
      position: relative;
      display: none;
    }

    .account-menu-wrap.visible {
      display: inline-block;
    }

    .account-trigger {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-subtle);
      color: var(--text-primary);
      border-radius: 999px;
      padding: 0.4rem 0.85rem;
      font-size: 0.83rem;
      font-weight: 600;
      cursor: pointer;
      transition: border-color 0.2s ease, background 0.2s ease;
    }

    .account-trigger:hover {
      border-color: var(--accent-amber);
      background: rgba(255, 107, 43, 0.12);
    }

    .account-avatar-dot {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--accent-orange), var(--accent-amber));
      color: #09090d;
      font-size: 0.72rem;
      font-weight: 800;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .account-dropdown {
      display: none;
      position: absolute;
      right: 0;
      top: calc(100% + 0.5rem);
      width: 270px;
      background: rgba(16, 16, 24, 0.96);
      border: 1px solid var(--border-subtle);
      border-radius: 16px;
      padding: 1rem;
      backdrop-filter: blur(20px);
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.65);
      z-index: 60;
    }

    .account-dropdown.open {
      display: block;
    }

    .account-dropdown-name {
      font-size: 0.94rem;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 0.15rem;
      word-break: break-word;
    }

    .account-dropdown-email {
      font-size: 0.78rem;
      color: var(--text-secondary);
      margin-bottom: 0.65rem;
      word-break: break-all;
    }

    .account-dropdown-meta {
      padding: 0.55rem 0.7rem;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border-neutral);
      font-size: 0.78rem;
      color: var(--text-secondary);
      margin-bottom: 0.8rem;
    }

    .account-dropdown-actions {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
    }

    .auth-modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(5, 5, 10, 0.78);
      backdrop-filter: blur(10px);
      z-index: 100;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }

    .auth-modal-overlay.open {
      display: flex;
    }

    .auth-modal-card {
      width: 100%;
      max-width: 440px;
      max-height: 92vh;
      overflow-y: auto;
      background: rgba(18, 18, 27, 0.94);
      border: 1px solid var(--border-subtle);
      border-radius: 22px;
      padding: 1.65rem;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.68), 0 0 32px rgba(255, 107, 43, 0.14);
      position: relative;
    }

    .auth-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .auth-close-btn {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border-neutral);
      color: var(--text-secondary);
      width: 32px;
      height: 32px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 1rem;
      line-height: 1;
    }

    .auth-close-btn:hover {
      color: var(--text-primary);
      border-color: var(--accent-amber);
    }

    .auth-tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .auth-tab-btn {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border-neutral);
      color: var(--text-secondary);
      border-radius: 10px;
      padding: 0.55rem 0.75rem;
      font-size: 0.86rem;
      font-weight: 700;
      cursor: pointer;
    }

    .auth-tab-btn.active {
      background: linear-gradient(135deg, var(--accent-orange), var(--accent-amber));
      color: #09090d;
      border-color: transparent;
    }

    .auth-feedback {
      display: none;
      padding: 0.65rem 0.85rem;
      border-radius: 10px;
      font-size: 0.82rem;
      margin-bottom: 0.9rem;
      border: 1px solid rgba(239, 68, 68, 0.4);
      background: rgba(239, 68, 68, 0.12);
      color: #fca5a5;
    }

    .auth-feedback.visible {
      display: block;
    }

    .auth-feedback.info {
      border-color: rgba(245, 158, 11, 0.4);
      background: rgba(245, 158, 11, 0.12);
      color: #fde68a;
    }

    .auth-field {
      margin-bottom: 0.85rem;
    }

    .auth-field label {
      display: block;
      font-size: 0.76rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-secondary);
      font-weight: 700;
      margin-bottom: 0.32rem;
    }

    input[type="email"], input[type="password"] {
      background: rgba(12, 12, 18, 0.85);
      border: 1px solid var(--border-neutral);
      color: var(--text-primary);
      border-radius: 12px;
      padding: 0.72rem 0.95rem;
      font-size: 0.92rem;
      font-family: inherit;
      width: 100%;
    }

    .auth-divider {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin: 1.15rem 0 0.95rem;
      color: var(--text-muted);
      font-size: 0.76rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .auth-divider::before, .auth-divider::after {
      content: "";
      flex: 1;
      height: 1px;
      background: var(--border-neutral);
    }

    .auth-guest-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border-neutral);
      border-radius: 14px;
      padding: 0.9rem;
      text-align: center;
    }

    .auth-guest-card p {
      font-size: 0.8rem;
      color: var(--text-secondary);
      margin-bottom: 0.65rem;
    }

    @media (max-width: 640px) {
      header {
        padding: 0.85rem 1rem;
      }
      .auth-modal-card {
        padding: 1.2rem;
      }
      .account-dropdown {
        width: 245px;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="brand-orb-mini"></div>
      <span id="header-brand-title">GRIOT AI</span>
      <span class="brand-badge" onclick="toggleBrandMode()" id="header-brand-badge" title="Click to toggle standalone vs ecosystem branding">Powered by Avantage</span>
      <span class="runtime-pill" id="header-runtime-pill">Checking Backend Readiness...</span>
    </div>
    <div class="header-right">
      <div class="nav-tabs">
        <button class="tab-btn active" onclick="switchMode('home')" id="tab-home">Home</button>
        <button class="tab-btn" onclick="switchMode('ask')" id="tab-ask">ASK GRIOT</button>
        <button class="tab-btn" onclick="switchMode('build')" id="tab-build">BUILD WITH GRIOT</button>
      </div>
      <div class="auth-header-controls" id="header-auth-controls">
        <button class="btn-secondary" style="padding:0.45rem 0.9rem; font-size:0.82rem;" onclick="openAuthModal('login')" id="open-login-btn">Sign In</button>
        <button class="btn-primary" style="padding:0.45rem 0.95rem; font-size:0.82rem;" onclick="openAuthModal('register')" id="open-register-btn">Create Account</button>
      </div>
      <div class="account-menu-wrap" id="header-account-menu">
        <button class="account-trigger" onclick="toggleAccountDropdown()" id="account-menu-btn" type="button">
          <span class="account-avatar-dot" id="account-avatar-initial">G</span>
          <span id="account-trigger-label">Account</span>
          <span style="font-size:0.7rem; color:var(--text-secondary);">&#9662;</span>
        </button>
        <div class="account-dropdown" id="account-dropdown">
          <div class="account-dropdown-name" id="account-user-name">User</div>
          <div class="account-dropdown-email" id="account-user-email">user@griot.ai</div>
          <div class="account-dropdown-meta">
            <div><strong style="color:var(--text-primary);">Organisation:</strong> <span id="account-org-name">Personal Organisation</span></div>
            <div style="margin-top:0.25rem;"><strong style="color:var(--text-primary);">Session:</strong> <span id="account-mode-badge">Authenticated</span></div>
          </div>
          <div class="account-dropdown-actions">
            <button class="btn-primary" style="width:100%; justify-content:center; padding:0.55rem 0.9rem; font-size:0.82rem; display:none;" onclick="openAuthModal('register')" id="account-upgrade-btn" type="button">Sign In / Create Account</button>
            <button class="btn-secondary" style="width:100%; padding:0.55rem 0.9rem; font-size:0.82rem;" onclick="signOutUser()" id="sign-out-btn" type="button">Sign Out</button>
          </div>
        </div>
      </div>
    </div>
  </header>

  <main>
    <!-- HOME SCREEN -->
    <section id="view-home" class="view-panel active">
      <div class="hero">
        <div class="ai-orb-container">
          <div class="ai-orb"></div>
        </div>
        <h1>What would you like to create or learn today?</h1>
        <p>GRIOT makes you capable of answering questions, mastering business &amp; technology, and building real applications step by step — even with zero coding background.</p>

        <div class="primary-actions-grid">
          <div class="action-card" onclick="switchMode('ask')">
            <span class="action-tag">Conversational Intelligence</span>
            <h2>ASK GRIOT</h2>
            <p>Ask questions, draft professional writing, summarise documents, learn entrepreneurship &amp; finance, brainstorm plans, or get coding assistance.</p>
            <button class="btn-primary">Open Ask GRIOT &rarr;</button>
          </div>

          <div class="action-card" onclick="switchMode('build')">
            <span class="action-tag">Guided Project Builder</span>
            <h2>BUILD WITH GRIOT</h2>
            <p>Describe an app, website, automation, or business tool you want to create. GRIOT selects the right tool, writes your exact prompts, and guides you step by step.</p>
            <button class="btn-primary">Start Building &rarr;</button>
          </div>
        </div>
      </div>
    </section>

    <!-- VIEW A: ASK GRIOT -->
    <section id="view-ask" class="view-panel">
      <div class="ask-layout">
        <!-- Left Sidebar: Persistent Conversations -->
        <aside class="glass-panel ask-sidebar" aria-label="Conversation history">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.85rem;">
            <span class="action-tag" style="margin:0;">Conversations</span>
            <button class="btn-secondary" style="padding:0.28rem 0.65rem; font-size:0.76rem;" onclick="startNewConversation()" id="new-conv-btn" type="button">+ New Chat</button>
          </div>
          <div id="conv-sidebar-list" class="conv-sidebar-scroll">
            <div class="conv-list-item active">New Session</div>
          </div>
        </aside>

        <!-- Right Chat Area -->
        <div class="glass-panel ask-chat-panel">
          <div class="ask-chat-header">
            <div style="min-width:0;">
              <h2 id="ask-chat-title" style="font-size:1.2rem; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">ASK GRIOT</h2>
              <p id="ask-runtime-subtitle" style="color:var(--text-secondary); font-size:0.8rem;">Checking backend readiness &bull; Persistent Context</p>
            </div>
            <div class="ask-controls-row">
              <select id="ask-module" class="ask-select-compact" aria-label="GRIOT focus mode">
                <option value="griot_chat">GRIOT Chat</option>
                <option value="griot_learn">GRIOT Learn</option>
                <option value="griot_business">GRIOT Business</option>
                <option value="griot_develop">GRIOT Develop</option>
              </select>
              <select id="ask-model-select" class="ask-select-compact" aria-label="Model selection" style="display:none;">
                <option value="">Auto (Smart Routing)</option>
              </select>
            </div>
          </div>

          <div class="chat-messages" id="chat-messages" aria-live="polite">
            <div class="chat-empty-state" id="chat-empty-state">
              <h3>What would you like to explore?</h3>
              <p>Ask GRIOT a question, work through a business or technical problem, or draft content. Your conversations stay saved to your account.</p>
              <div class="chat-suggestions">
                <button class="chat-suggestion-btn" type="button" onclick="useChatSuggestion('Explain how to validate and price a new SaaS product in 5 clear steps.')">Validate &amp; price a SaaS idea</button>
                <button class="chat-suggestion-btn" type="button" onclick="useChatSuggestion('Write a clean TypeScript debounce utility with usage example.')">TypeScript debounce helper</button>
                <button class="chat-suggestion-btn" type="button" onclick="useChatSuggestion('Draft a concise monthly investor update email template.')">Draft an investor update</button>
              </div>
            </div>
          </div>

          <div class="chat-composer-wrap">
            <div class="chat-status-bar" id="ask-status-bar"></div>
            <div class="input-row">
              <textarea id="ask-input" rows="2" placeholder="Ask GRIOT anything... (Enter to send, Shift+Enter for new line)" style="flex:1; resize:vertical; min-height:48px; max-height:180px;" onkeydown="handleAskInputKeydown(event)"></textarea>
              <button class="btn-stop" onclick="stopAskGriot()" id="ask-stop-btn" type="button">Stop</button>
              <button class="btn-primary" onclick="sendAskGriot()" id="ask-send-btn" type="button">Send</button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- VIEW B: BUILD WITH GRIOT -->
    <section id="view-build" class="view-panel">
      <!-- Saved Projects Bar -->
      <div class="glass-panel" id="saved-projects-bar" style="display:none; padding:1rem 1.4rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;">
          <div>
            <span class="action-tag" style="margin:0;">Saved Guided Projects</span>
            <p style="font-size:0.84rem; color:var(--text-secondary);">Resume any project right where you left off without explaining everything again.</p>
          </div>
          <div style="display:flex; gap:0.5rem; align-items:center;">
            <select id="saved-projects-select" style="width:auto; min-width:240px;" onchange="resumeSelectedProject(this.value)"></select>
            <button class="btn-secondary" onclick="resetIntakeView()">+ New Idea</button>
          </div>
        </div>
      </div>

      <!-- Project Creation Card -->
      <div class="glass-panel" id="builder-intake-card">
        <span class="action-tag">Guided Creation Engine</span>
        <h2 style="font-size:1.45rem; margin-bottom:0.4rem;">BUILD WITH GRIOT</h2>
        <p style="color:var(--text-secondary); font-size:0.92rem; margin-bottom:1.2rem;">Describe your idea in plain words. GRIOT will classify your project, recommend the simplest suitable creation tool (Lovable, Google Antigravity, Replit, or n8n/Make), generate a quality-checked specification, and guide you step by step.</p>

        <div style="display:grid; gap:1rem;">
          <div>
            <label class="section-label">1. Describe what you want to create</label>
            <textarea id="build-idea" rows="3" placeholder="Example: I want to build a website for my Lagos bakery where customers can see our daily cakes and submit custom order bookings."></textarea>
          </div>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:1rem;">
            <div>
              <label class="section-label">2. Your Technical Experience</label>
              <select id="build-skill">
                <option value="complete_beginner">Complete Beginner (No coding)</option>
                <option value="some_experience">Some Experience (Used basic tools)</option>
                <option value="intermediate">Intermediate Builder</option>
                <option value="advanced">Advanced Developer</option>
              </select>
            </div>
            <div>
              <label class="section-label">3. Your Budget</label>
              <select id="build-budget">
                <option value="free_only">Start 100% Free ($0)</option>
                <option value="low_budget">Low Monthly Budget</option>
                <option value="flexible_budget">Flexible Commercial Budget</option>
              </select>
            </div>
          </div>
          <div>
            <button class="btn-primary" onclick="startGuidedProject()" id="start-build-btn">Generate My Guided Build Plan &rarr;</button>
          </div>
        </div>
      </div>

      <!-- Dedicated Project Workspace -->
      <div id="builder-workspace" style="display:none;">
        <div class="workspace-grid">
          <!-- Left Sidebar: Project Overview, Specification & Build Plan Stepper -->
          <div>
            <div class="glass-panel">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="action-tag" id="ws-state-badge">ACTIVE_STEP</span>
                <span class="runtime-pill" id="ws-qc-badge">QC Verified</span>
              </div>
              <h3 id="ws-title" style="font-size:1.15rem; margin:0.4rem 0;">Project Title</h3>
              <p id="ws-objective" style="color:var(--text-secondary); font-size:0.84rem; margin-bottom:0.8rem;"></p>

              <div>
                <span class="meta-pill" id="ws-category-pill">website</span>
                <span class="meta-pill" id="ws-tool-pill">Lovable</span>
              </div>

              <div class="section-label">Build Progress (<span id="ws-progress-text">0%</span>)</div>
              <div class="progress-bar-track">
                <div class="progress-bar-fill" id="ws-progress-fill" style="width: 10%;"></div>
              </div>

              <div class="section-label">Sequential Build Plan</div>
              <div id="ws-step-list"></div>

              <div class="section-label">MVP Specification &amp; Features</div>
              <ul id="ws-spec-features" style="padding-left:1.1rem; font-size:0.82rem; color:var(--text-secondary);"></ul>
            </div>
          </div>

          <!-- Right Main Column: Current Instruction, Copyable Prompt, Result & Error Submission -->
          <div>
            <div class="glass-panel">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
                <div>
                  <span class="action-tag" id="step-number-tag">STEP 1 OF 4</span>
                  <h2 id="step-stage-title" style="font-size:1.3rem;">Stage Title</h2>
                </div>
                <button class="btn-secondary" onclick="toggleDetailLevel()" id="detail-toggle-btn">Switch to Technical Detail</button>
              </div>

              <div class="section-label">What You Are Achieving</div>
              <p id="step-what" style="font-size:0.95rem;"></p>

              <div class="section-label">Why This Step Matters</div>
              <p id="step-why" style="color:var(--text-secondary); font-size:0.9rem;"></p>

              <div class="section-label">Platform &amp; Where to Navigate</div>
              <p id="step-platform" style="font-weight:600; font-size:0.92rem; margin-bottom:0.4rem;"></p>
              <ol id="step-nav-list" style="padding-left:1.25rem; color:var(--text-secondary); font-size:0.9rem;"></ol>

              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1.1rem;">
                <span class="section-label" style="margin:0;">Exact Copyable Prompt / Instruction</span>
                <button class="btn-secondary" style="padding:0.35rem 0.85rem; font-size:0.8rem;" onclick="copyActivePrompt()" id="copy-btn">Copy Prompt</button>
              </div>
              <div class="copy-box" id="step-prompt-box"></div>

              <div class="section-label">What Result to Expect</div>
              <p id="step-expected" style="font-size:0.9rem; color:var(--text-secondary);"></p>

              <div class="section-label">How to Verify Success</div>
              <ul id="step-verify-list" style="padding-left:1.25rem; font-size:0.9rem; color:var(--text-secondary);"></ul>

              <div class="section-label">What to Do If It Fails</div>
              <p id="step-fail-guide" style="font-size:0.88rem; color:#fca5a5;"></p>

              <div id="step-tech-box" style="display:none; margin-top:0.85rem; padding:0.75rem; border-radius:10px; background:rgba(255,255,255,0.04); font-size:0.84rem; color:var(--text-secondary);"></div>

              <p id="step-disclaimer" style="margin-top:1rem; font-size:0.78rem; color:var(--text-muted); font-style:italic;"></p>
            </div>

            <!-- Result Submission & Error Reporting Card -->
            <div class="glass-panel">
              <h3 style="font-size:1.05rem; margin-bottom:0.4rem;">Share Your Result or Report an Error</h3>
              <p style="color:var(--text-secondary); font-size:0.86rem; margin-bottom:0.85rem;">Tell GRIOT what happened after you ran the prompt above. If it worked, GRIOT approves the step and unlocks the next stage. If you hit an error, paste the message below and GRIOT will generate a corrective fix prompt.</p>

              <textarea id="step-feedback-input" rows="3" placeholder="Example: The home page and booking form appeared cleanly in the preview! OR paste any error message you saw..."></textarea>

              <div style="display:flex; gap:0.75rem; margin-top:0.85rem; flex-wrap:wrap;">
                <button class="btn-primary" onclick="submitStepSuccess()">It Worked — Approve &amp; Next Step &rarr;</button>
                <button class="btn-secondary" style="border-color:rgba(239,68,68,0.45); color:#fca5a5;" onclick="submitStepTroubleshooting()">I Hit an Error — Troubleshoot &amp; Fix</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>

  <!-- STAGE 2: GLASSMORPHIC AUTHENTICATION MODAL -->
  <div class="auth-modal-overlay" id="auth-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
    <div class="auth-modal-card">
      <div class="auth-modal-header">
        <div style="display:flex; align-items:center; gap:0.55rem;">
          <div class="brand-orb-mini" style="width:20px; height:20px;"></div>
          <h2 id="auth-modal-title" style="font-size:1.1rem; font-weight:700;">Sign in to GRIOT AI</h2>
        </div>
        <button class="auth-close-btn" type="button" onclick="closeAuthModal()" id="auth-close-btn" aria-label="Close authentication modal">&times;</button>
      </div>

      <div class="auth-tabs">
        <button class="auth-tab-btn active" type="button" onclick="setAuthModalMode('login')" id="auth-tab-login">Sign In</button>
        <button class="auth-tab-btn" type="button" onclick="setAuthModalMode('register')" id="auth-tab-register">Create Account</button>
      </div>

      <div class="auth-feedback" id="auth-feedback-banner" role="alert"></div>

      <!-- Sign In Form -->
      <form id="auth-form-login" onsubmit="submitLogin(event)" novalidate>
        <div class="auth-field">
          <label for="login-email">Email</label>
          <input type="email" id="login-email" autocomplete="email" placeholder="you@company.com" required />
        </div>
        <div class="auth-field">
          <label for="login-password">Password</label>
          <input type="password" id="login-password" autocomplete="current-password" placeholder="Enter your password" required />
        </div>
        <button class="btn-primary" type="submit" id="login-submit-btn" style="width:100%; justify-content:center; padding:0.75rem 1rem;">Sign In</button>
      </form>

      <!-- Create Account Form -->
      <form id="auth-form-register" onsubmit="submitRegister(event)" style="display:none;" novalidate>
        <div class="auth-field">
          <label for="register-name">Display Name</label>
          <input type="text" id="register-name" autocomplete="name" placeholder="Your full name" required />
        </div>
        <div class="auth-field">
          <label for="register-email">Email</label>
          <input type="email" id="register-email" autocomplete="email" placeholder="you@company.com" required />
        </div>
        <div class="auth-field">
          <label for="register-password">Password (min 8 characters)</label>
          <input type="password" id="register-password" autocomplete="new-password" placeholder="Create a strong password" required />
        </div>
        <div class="auth-field">
          <label for="register-confirm-password">Confirm Password</label>
          <input type="password" id="register-confirm-password" autocomplete="new-password" placeholder="Re-enter your password" required />
        </div>
        <button class="btn-primary" type="submit" id="register-submit-btn" style="width:100%; justify-content:center; padding:0.75rem 1rem;">Create Account</button>
      </form>

      <div class="auth-divider">or</div>

      <!-- Explicit Guest / Freemium Option -->
      <div class="auth-guest-card">
        <p>Want to try GRIOT first without creating a permanent account?</p>
        <button class="btn-secondary" type="button" onclick="continueAsGuest()" id="guest-access-btn" style="width:100%;">Continue as Guest &mdash; Explore GRIOT</button>
      </div>
    </div>
  </div>

  <script>
    const DEFAULT_REMOTE_API_BASE_URL = 'https://griot-ai.onrender.com/api/v1';
    const AUTH_SESSION_STORAGE_KEY = 'griot_auth_session_v2';
    const LEGACY_JWT_STORAGE_KEY = 'griot_v1_jwt';
    const ACTIVE_CONV_STORAGE_PREFIX = 'griot_active_conv_v3:';
    const ACTIVE_MODE_STORAGE_KEY = 'griot_active_mode_v3';

    let activeSession = null;
    let sessionToken = null;
    let activeMode = 'home';
    let activeConversationId = null;
    let activeConversationTitle = 'ASK GRIOT';
    let cachedConversations = [];
    let availableModels = [];
    let activeProject = null;
    let brandEcosystem = true;
    let authModalMode = 'login';
    let authSubmitting = false;
    let isGenerating = false;
    let activeStreamController = null;
    let generationCancelled = false;
    let editingConversationId = null;
    let pendingDeleteConversationId = null;
    let lastFailedPrompt = null;
    let codeBlockCopyMap = {};
    let codeBlockSeq = 0;

    const PROVIDER_LABELS = {
      gemini: 'Gemini',
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      mistral: 'Mistral',
      open_weight: 'Open-Weight'
    };

    function stripTrailingSlashes(value) {
      let out = String(value || '').trim();
      while (out.length > 1 && out.endsWith('/')) {
        out = out.slice(0, -1);
      }
      return out === '/' ? '' : out;
    }

    function resolveApiBaseUrl() {
      const winOverride =
        typeof window !== 'undefined' && typeof window.GRIOT_API_BASE_URL === 'string'
          ? stripTrailingSlashes(window.GRIOT_API_BASE_URL)
          : '';
      if (winOverride) {
        return winOverride;
      }
      try {
        const storedBase = localStorage.getItem('griot_api_base_url');
        if (storedBase && storedBase.trim()) {
          return stripTrailingSlashes(storedBase);
        }
      } catch {
        // Ignore storage read restrictions
      }
      if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
        return DEFAULT_REMOTE_API_BASE_URL;
      }
      return '/api/v1';
    }

    function buildApiUrl(endpoint) {
      const base = resolveApiBaseUrl();
      let cleanPath = String(endpoint || '').trim();
      if (cleanPath.startsWith('/api/v1/')) {
        cleanPath = cleanPath.slice(7);
      } else if (cleanPath === '/api/v1') {
        cleanPath = '';
      }
      if (cleanPath && !cleanPath.startsWith('/')) {
        cleanPath = '/' + cleanPath;
      }
      return base + cleanPath;
    }

    function isValidEmailFormat(email) {
      const s = String(email || '').trim();
      if (!s || s.indexOf(' ') !== -1) return false;
      const atIdx = s.indexOf('@');
      if (atIdx <= 0) return false;
      const domain = s.slice(atIdx + 1);
      const dotIdx = domain.lastIndexOf('.');
      return dotIdx > 0 && dotIdx < domain.length - 1;
    }

    function decodeJwtPayloadUnsafe(token) {
      if (typeof token !== 'string') return null;
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      try {
        let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4 !== 0) {
          base64 += '=';
        }
        if (typeof atob !== 'function') return null;
        return JSON.parse(atob(base64));
      } catch {
        return null;
      }
    }

    function isJwtExpired(token) {
      const payload = decodeJwtPayloadUnsafe(token);
      if (!payload || typeof payload.exp !== 'number') {
        return false;
      }
      const nowSec = Math.floor(Date.now() / 1000);
      return payload.exp <= nowSec + 5;
    }

    function persistAuthSession(session) {
      activeSession = session;
      sessionToken = session ? session.token : null;
      try {
        if (typeof sessionStorage !== 'undefined') {
          if (session) {
            sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
          } else {
            sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
          }
        }
      } catch {
        // Ignore storage errors
      }
      try {
        localStorage.removeItem(LEGACY_JWT_STORAGE_KEY);
      } catch {
        // Ignore storage errors
      }
      renderAuthHeader();
    }

    function clearStoredSessionToken() {
      activeSession = null;
      sessionToken = null;
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
        }
      } catch {
        // Ignore storage errors
      }
      try {
        localStorage.removeItem(LEGACY_JWT_STORAGE_KEY);
      } catch {
        // Ignore storage errors
      }
      renderAuthHeader();
    }

    function getActiveSession() {
      if (activeSession && activeSession.token) {
        return activeSession;
      }
      try {
        if (typeof sessionStorage !== 'undefined') {
          const raw = sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed.token === 'string' && parsed.token.trim()) {
              activeSession = parsed;
              sessionToken = parsed.token;
              return activeSession;
            }
          }
        }
      } catch {
        // Ignore malformed storage
      }
      // Backward-compatible migration of valid non-expired legacy token if present
      try {
        const legacyToken = localStorage.getItem(LEGACY_JWT_STORAGE_KEY);
        if (legacyToken && legacyToken.trim()) {
          if (isJwtExpired(legacyToken)) {
            localStorage.removeItem(LEGACY_JWT_STORAGE_KEY);
            return null;
          }
          const claims = decodeJwtPayloadUnsafe(legacyToken);
          const migrated = {
            token: legacyToken.trim(),
            mode: 'authenticated',
            user: {
              id: claims && claims.sub ? String(claims.sub) : 'session_user',
              displayName: 'GRIOT User',
              email: ''
            },
            org: {
              id: claims && claims.orgId ? String(claims.orgId) : null,
              name: ''
            }
          };
          persistAuthSession(migrated);
          return activeSession;
        }
      } catch {
        // Ignore storage errors
      }
      return null;
    }

    function getStoredSessionToken() {
      const sess = getActiveSession();
      return sess ? sess.token : null;
    }

    function resetAccountScopedUiState() {
      if (activeStreamController) {
        generationCancelled = true;
        try {
          activeStreamController.abort();
        } catch {
          // Ignore abort errors during reset
        }
        activeStreamController = null;
      }
      isGenerating = false;
      generationCancelled = false;
      activeConversationId = null;
      activeConversationTitle = 'ASK GRIOT';
      cachedConversations = [];
      availableModels = [];
      editingConversationId = null;
      pendingDeleteConversationId = null;
      lastFailedPrompt = null;
      activeProject = null;

      updateGenerationControls(false, '');

      const modelSelect = document.getElementById('ask-model-select');
      if (modelSelect) {
        modelSelect.innerHTML = '<option value="">Auto (Smart Routing)</option>';
        modelSelect.value = '';
        modelSelect.style.display = 'none';
      }

      const chatTitle = document.getElementById('ask-chat-title');
      if (chatTitle) chatTitle.textContent = 'ASK GRIOT';

      const convSidebar = document.getElementById('conv-sidebar-list');
      if (convSidebar) {
        convSidebar.innerHTML = '<div class="conv-list-item active">New Session</div>';
      }

      renderChatEmptyState();

      const savedBar = document.getElementById('saved-projects-bar');
      if (savedBar) savedBar.style.display = 'none';

      const savedSelect = document.getElementById('saved-projects-select');
      if (savedSelect) savedSelect.innerHTML = '';

      const intakeCard = document.getElementById('builder-intake-card');
      if (intakeCard) intakeCard.style.display = 'block';

      const workspace = document.getElementById('builder-workspace');
      if (workspace) workspace.style.display = 'none';

      const buildIdea = document.getElementById('build-idea');
      if (buildIdea) buildIdea.value = '';

      const feedbackInput = document.getElementById('step-feedback-input');
      if (feedbackInput) feedbackInput.value = '';

      const wsTitle = document.getElementById('ws-title');
      if (wsTitle) wsTitle.textContent = 'Project Title';

      const wsStepList = document.getElementById('ws-step-list');
      if (wsStepList) wsStepList.innerHTML = '';

      const wsSpec = document.getElementById('ws-spec-features');
      if (wsSpec) wsSpec.innerHTML = '';

      const promptBox = document.getElementById('step-prompt-box');
      if (promptBox) promptBox.textContent = '';
    }

    function handleUnauthorizedSession(noticeMessage, showModal = true) {
      clearStoredSessionToken();
      resetAccountScopedUiState();
      if (showModal) {
        openAuthModal(
          'login',
          noticeMessage || 'Your session expired or is no longer valid. Please sign in again.',
          'info'
        );
      }
    }

    async function griotFetch(endpoint, options = {}) {
      const method = (options.method || 'GET').toUpperCase();
      const skipAuth = Boolean(options.skipAuth);
      const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 35000;
      const headers = Object.assign({}, options.headers || {});

      if (!skipAuth) {
        const token = getStoredSessionToken();
        if (!token) {
          if (options.promptOnUnauth !== false) {
            openAuthModal('login', 'Sign in, create an account, or continue as Guest to use GRIOT.', 'info');
          }
          return {
            ok: false,
            status: 401,
            requestId: null,
            data: null,
            error: {
              code: 'AUTH_REQUIRED',
              message: 'Please sign in or continue as Guest to continue.',
              retryable: false
            }
          };
        }
        if (isJwtExpired(token)) {
          handleUnauthorizedSession(
            'Your session has expired. Please sign in again.',
            options.promptOnUnauth !== false
          );
          return {
            ok: false,
            status: 401,
            requestId: null,
            data: null,
            error: {
              code: 'SESSION_EXPIRED',
              message: 'Your session has expired. Please sign in again.',
              retryable: false
            }
          };
        }
        headers['Authorization'] = 'Bearer ' + token;
      }

      let requestBody = undefined;
      if (options.body !== undefined) {
        if (typeof options.body === 'string') {
          requestBody = options.body;
        } else {
          headers['Content-Type'] = headers['Content-Type'] || 'application/json';
          requestBody = JSON.stringify(options.body);
        }
      }

      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      const externalSignal = options.signal || null;
      const onExternalAbort = () => controller.abort();
      if (externalSignal) {
        if (externalSignal.aborted) {
          clearTimeout(timer);
          return {
            ok: false,
            status: 0,
            requestId: null,
            data: null,
            error: {
              code: 'USER_ABORTED',
              message: 'Generation stopped.',
              retryable: false
            }
          };
        }
        if (typeof externalSignal.addEventListener === 'function') {
          externalSignal.addEventListener('abort', onExternalAbort, { once: true });
        }
      }

      let res;
      try {
        res = await fetch(buildApiUrl(endpoint), {
          method,
          headers,
          body: requestBody,
          signal: controller.signal
        });
      } catch (err) {
        clearTimeout(timer);
        if (externalSignal && typeof externalSignal.removeEventListener === 'function') {
          externalSignal.removeEventListener('abort', onExternalAbort);
        }
        if (externalSignal && externalSignal.aborted) {
          return {
            ok: false,
            status: 0,
            requestId: null,
            data: null,
            error: {
              code: 'USER_ABORTED',
              message: 'Generation stopped.',
              retryable: false
            }
          };
        }
        const isAbort =
          timedOut ||
          controller.signal.aborted ||
          (err && (err.name === 'AbortError' || /aborted|timeout/i.test(String(err.message || ''))));
        if (isAbort) {
          return {
            ok: false,
            status: 504,
            requestId: null,
            data: null,
            error: {
              code: 'REQUEST_TIMEOUT',
              message: 'Request timed out while waiting for GRIOT backend. Please try again.',
              retryable: true
            }
          };
        }
        return {
          ok: false,
          status: 0,
          requestId: null,
          data: null,
          error: {
            code: 'NETWORK_ERROR',
            message: 'Unable to reach GRIOT backend. Check your connection and try again.',
            retryable: true
          }
        };
      } finally {
        clearTimeout(timer);
        if (externalSignal && typeof externalSignal.removeEventListener === 'function') {
          externalSignal.removeEventListener('abort', onExternalAbort);
        }
      }

      if (options.rawStream && res.ok) {
        const streamRequestId =
          res.headers && typeof res.headers.get === 'function'
            ? res.headers.get('x-griot-request-id')
            : null;
        return {
          ok: true,
          status: res.status,
          requestId: streamRequestId,
          data: null,
          response: res,
          error: null
        };
      }

      let envelope = null;
      try {
        envelope = await res.json();
      } catch {
        envelope = null;
      }

      const requestId =
        (envelope && typeof envelope.requestId === 'string' ? envelope.requestId : null) ||
        (res.headers && typeof res.headers.get === 'function' ? res.headers.get('x-griot-request-id') : null);

      if (res.status === 401) {
        const errCode = (envelope && envelope.error && envelope.error.code) || 'UNAUTHENTICATED';
        if (skipAuth) {
          return {
            ok: false,
            status: 401,
            requestId,
            data: null,
            error: {
              code: errCode,
              message:
                (envelope && envelope.error && envelope.error.message) ||
                'Invalid email or password.',
              retryable: false
            }
          };
        }
        // Authoritative 401 on authenticated route: clear credentials immediately, never retry expired token
        handleUnauthorizedSession(
          'Your session expired or could not be verified. Please sign in again.',
          options.promptOnUnauth !== false
        );
        return {
          ok: false,
          status: 401,
          requestId,
          data: null,
          error: {
            code: errCode,
            message: 'Your session expired or could not be authenticated. Please sign in again.',
            retryable: false
          }
        };
      }

      if (res.status === 429) {
        return {
          ok: false,
          status: 429,
          requestId,
          data: null,
          error: {
            code: (envelope && envelope.error && envelope.error.code) || 'RATE_LIMITED',
            message: 'Rate limit or model quota reached (HTTP 429). Please wait a moment and try again.',
            retryable: true
          }
        };
      }

      if (res.status === 503) {
        return {
          ok: false,
          status: 503,
          requestId,
          data: null,
          error: {
            code: (envelope && envelope.error && envelope.error.code) || 'SERVICE_UNAVAILABLE',
            message: 'The AI service is temporarily experiencing high demand (HTTP 503). Please try again shortly.',
            retryable: true
          }
        };
      }

      if (res.ok && envelope && envelope.success === true) {
        return {
          ok: true,
          status: res.status,
          requestId,
          data: envelope.data,
          error: null
        };
      }

      const rawErrCode = (envelope && envelope.error && envelope.error.code) || 'API_ERROR';
      const rawErrMsg =
        (envelope && envelope.error && envelope.error.message) ||
        ('Request failed with HTTP ' + res.status);

      return {
        ok: false,
        status: res.status,
        requestId,
        data: envelope ? envelope.data : null,
        error: {
          code: rawErrCode,
          message: rawErrMsg,
          retryable: res.status >= 500
        }
      };
    }

    function setRuntimePillStyle(pill, tone) {
      if (!pill || !pill.style) return;
      if (tone === 'ready') {
        pill.style.background = 'rgba(16, 185, 129, 0.12)';
        pill.style.borderColor = 'rgba(16, 185, 129, 0.35)';
        pill.style.color = '#6ee7b7';
      } else if (tone === 'warning') {
        pill.style.background = 'rgba(245, 158, 11, 0.14)';
        pill.style.borderColor = 'rgba(245, 158, 11, 0.38)';
        pill.style.color = '#fcd34d';
      } else {
        pill.style.background = 'rgba(239, 68, 68, 0.14)';
        pill.style.borderColor = 'rgba(239, 68, 68, 0.38)';
        pill.style.color = '#fca5a5';
      }
    }

    async function inspectBackendRuntime() {
      const pill = document.getElementById('header-runtime-pill');
      const askSubtitle = document.getElementById('ask-runtime-subtitle');

      const [healthRes, localRes] = await Promise.all([
        griotFetch('/health', { method: 'GET', skipAuth: true, timeoutMs: 8000 }),
        griotFetch('/local-runtime', { method: 'GET', skipAuth: true, timeoutMs: 8000 })
      ]);

      if (!healthRes.ok || !healthRes.data) {
        if (pill) {
          pill.textContent = 'Backend Unreachable';
          setRuntimePillStyle(pill, 'danger');
        }
        if (askSubtitle) {
          askSubtitle.textContent = 'Backend Unreachable • Check API Connection';
        }
        return { reachable: false, mode: 'unreachable' };
      }

      const healthData = healthRes.data;
      const dbReady =
        !healthData.readiness ||
        !healthData.readiness.database ||
        Boolean(healthData.readiness.database.ready);
      const isHealthy = healthData.status === 'healthy' && dbReady;

      const providersCfg = healthData.providersConfigured || {};
      const liveCloudProviders = ['gemini', 'openai', 'anthropic', 'mistral']
        .filter(p => providersCfg[p] && providersCfg[p].mode === 'live')
        .map(p => PROVIDER_LABELS[p] || p);

      const hasMockFallback = Object.keys(providersCfg).some(
        p => providersCfg[p] && providersCfg[p].mode === 'mock_fallback'
      );

      const ollamaInfo =
        localRes.ok && localRes.data && localRes.data.ollama ? localRes.data.ollama : null;
      const ollamaReachable = Boolean(ollamaInfo && ollamaInfo.apiReachable);
      const installedLocalModels =
        ollamaInfo && Array.isArray(ollamaInfo.installedModels) ? ollamaInfo.installedModels : [];
      const firstLocalModel = installedLocalModels.length > 0 ? installedLocalModels[0].name : null;

      let pillText = '';
      let subtitleText = '';
      let tone = isHealthy ? 'ready' : 'warning';
      let mode = 'unconfigured';

      if (liveCloudProviders.length > 0 && ollamaReachable && firstLocalModel) {
        mode = 'hybrid_cloud_and_local';
        pillText =
          (isHealthy ? 'Backend Ready' : 'Backend Degraded') +
          ' • ' +
          liveCloudProviders.join(', ') +
          ' Cloud + Local Ollama (' +
          firstLocalModel +
          ')';
        subtitleText =
          'Cloud (' +
          liveCloudProviders.join(', ') +
          ') & Local Ollama (' +
          firstLocalModel +
          ') Configured • Persistent Context';
      } else if (liveCloudProviders.length > 0) {
        mode = 'cloud';
        pillText =
          (isHealthy ? 'Backend Ready' : 'Backend Degraded') +
          ' • ' +
          liveCloudProviders.join(', ') +
          ' Cloud Configured';
        subtitleText =
          'Cloud Inference Configured (' +
          liveCloudProviders.join(', ') +
          ') • Persistent Context';
      } else if (ollamaReachable && firstLocalModel) {
        mode = 'local_ollama';
        pillText =
          (isHealthy ? 'Backend Ready' : 'Backend Degraded') +
          ' • Local Ollama (' +
          firstLocalModel +
          ') Configured';
        subtitleText =
          'Local Ollama Configured (' +
          firstLocalModel +
          ') • Persistent Context';
      } else if (ollamaReachable && !firstLocalModel) {
        mode = 'local_ollama_empty';
        tone = 'warning';
        pillText = 'Backend Ready • Local Ollama (No Model Pulled)';
        subtitleText = 'Local Ollama Connected (No Model Pulled) • Persistent Context';
      } else if (hasMockFallback) {
        mode = 'mock_fallback';
        tone = 'warning';
        pillText = 'Backend Ready • Dev Fallback Mode';
        subtitleText = 'Development Fallback Mode Configured • Persistent Context';
      } else {
        mode = 'unconfigured';
        tone = 'warning';
        pillText = 'Backend Degraded • No Provider Configured';
        subtitleText = 'Backend Ready • No Inference Provider Configured';
      }

      if (pill) {
        pill.textContent = pillText;
        setRuntimePillStyle(pill, tone);
      }
      if (askSubtitle) {
        askSubtitle.textContent = subtitleText;
      }

      return {
        reachable: true,
        healthy: isHealthy,
        mode,
        liveCloudProviders,
        ollamaReachable,
        firstLocalModel
      };
    }

    // Preserve legacy function alias
    const checkLocalRuntime = inspectBackendRuntime;

    function toggleBrandMode() {
      brandEcosystem = !brandEcosystem;
      const badge = document.getElementById('header-brand-badge');
      badge.textContent = brandEcosystem ? 'Powered by Avantage' : 'Standalone Global';
    }

    function setAuthSubmitting(submitting, activeButtonId, loadingText) {
      authSubmitting = submitting;
      const loginBtn = document.getElementById('login-submit-btn');
      const regBtn = document.getElementById('register-submit-btn');
      const guestBtn = document.getElementById('guest-access-btn');

      if (loginBtn) {
        loginBtn.disabled = submitting;
        loginBtn.textContent =
          submitting && activeButtonId === 'login-submit-btn' ? loadingText : 'Sign In';
      }
      if (regBtn) {
        regBtn.disabled = submitting;
        regBtn.textContent =
          submitting && activeButtonId === 'register-submit-btn' ? loadingText : 'Create Account';
      }
      if (guestBtn) {
        guestBtn.disabled = submitting;
        guestBtn.textContent =
          submitting && activeButtonId === 'guest-access-btn'
            ? loadingText
            : 'Continue as Guest — Explore GRIOT';
      }
    }

    function showAuthFeedback(message, type = 'error') {
      const banner = document.getElementById('auth-feedback-banner');
      if (!banner) return;
      if (!message) {
        banner.textContent = '';
        banner.className = 'auth-feedback';
        return;
      }
      banner.textContent = message;
      banner.className = 'auth-feedback visible' + (type === 'info' ? ' info' : '');
    }

    function setAuthModalMode(mode) {
      authModalMode = mode === 'register' ? 'register' : 'login';
      const titleEl = document.getElementById('auth-modal-title');
      const loginForm = document.getElementById('auth-form-login');
      const regForm = document.getElementById('auth-form-register');
      const loginTab = document.getElementById('auth-tab-login');
      const regTab = document.getElementById('auth-tab-register');

      if (titleEl) {
        titleEl.textContent =
          authModalMode === 'register' ? 'Create your GRIOT account' : 'Sign in to GRIOT AI';
      }
      if (loginForm) loginForm.style.display = authModalMode === 'login' ? 'block' : 'none';
      if (regForm) regForm.style.display = authModalMode === 'register' ? 'block' : 'none';
      if (loginTab) loginTab.className = 'auth-tab-btn' + (authModalMode === 'login' ? ' active' : '');
      if (regTab) regTab.className = 'auth-tab-btn' + (authModalMode === 'register' ? ' active' : '');
      showAuthFeedback('');
    }

    function openAuthModal(mode = 'login', noticeMessage = '', noticeType = 'info') {
      closeAccountDropdown();
      setAuthModalMode(mode);
      if (noticeMessage) {
        showAuthFeedback(noticeMessage, noticeType);
      }
      const overlay = document.getElementById('auth-modal-overlay');
      if (overlay) {
        overlay.classList.add('open');
      }
    }

    function closeAuthModal() {
      const overlay = document.getElementById('auth-modal-overlay');
      if (overlay) {
        overlay.classList.remove('open');
      }
      showAuthFeedback('');
    }

    function closeAccountDropdown() {
      const dd = document.getElementById('account-dropdown');
      if (dd) dd.classList.remove('open');
    }

    function toggleAccountDropdown() {
      const dd = document.getElementById('account-dropdown');
      if (!dd) return;
      dd.classList.toggle('open');
    }

    function renderAuthHeader() {
      const authControls = document.getElementById('header-auth-controls');
      const accountWrap = document.getElementById('header-account-menu');
      const avatarEl = document.getElementById('account-avatar-initial');
      const triggerLabel = document.getElementById('account-trigger-label');
      const nameEl = document.getElementById('account-user-name');
      const emailEl = document.getElementById('account-user-email');
      const orgEl = document.getElementById('account-org-name');
      const modeBadge = document.getElementById('account-mode-badge');
      const upgradeBtn = document.getElementById('account-upgrade-btn');
      const signOutBtn = document.getElementById('sign-out-btn');

      const sess = activeSession && activeSession.token ? activeSession : null;
      if (!sess) {
        if (authControls) authControls.style.display = 'flex';
        if (accountWrap) accountWrap.classList.remove('visible');
        closeAccountDropdown();
        return;
      }

      if (authControls) authControls.style.display = 'none';
      if (accountWrap) accountWrap.classList.add('visible');

      const isGuest = sess.mode === 'guest';
      const displayName =
        (sess.user && sess.user.displayName) || (isGuest ? 'Guest Explorer' : 'GRIOT User');
      const emailText = isGuest
        ? 'Temporary Guest Session (Freemium)'
        : (sess.user && sess.user.email) || '';
      const orgName =
        (sess.org && sess.org.name) ||
        (isGuest ? 'Guest Freemium Workspace' : 'Personal Organisation');

      if (avatarEl) avatarEl.textContent = displayName.trim().charAt(0).toUpperCase() || 'G';
      if (triggerLabel) triggerLabel.textContent = isGuest ? 'Guest' : displayName;
      if (nameEl) nameEl.textContent = displayName;
      if (emailEl) emailEl.textContent = emailText;
      if (orgEl) orgEl.textContent = orgName;
      if (modeBadge) modeBadge.textContent = isGuest ? 'Guest Access (Freemium)' : 'Authenticated Account';
      if (upgradeBtn) upgradeBtn.style.display = isGuest ? 'inline-flex' : 'none';
      if (signOutBtn) signOutBtn.textContent = isGuest ? 'End Guest Session' : 'Sign Out';
    }

    async function hydrateOrganisationContext(silent = true) {
      const res = await griotFetch('/organisations/current', {
        method: 'GET',
        promptOnUnauth: !silent
      });
      if (!res.ok || !res.data || !res.data.organisation) {
        return false;
      }
      if (activeSession) {
        const org = res.data.organisation;
        activeSession.org = {
          id: org.id,
          name: org.name,
          accessModel: org.accessModel || 'public_freemium',
          brandingMode: org.brandingMode || 'griot_standalone'
        };
        persistAuthSession(activeSession);
      }
      return true;
    }

    async function completeAuthenticationTransition(newSession) {
      resetAccountScopedUiState();
      persistAuthSession(newSession);
      closeAuthModal();

      // Clear password inputs so credentials never linger in DOM inputs
      const loginPw = document.getElementById('login-password');
      const regPw = document.getElementById('register-password');
      const regConfirm = document.getElementById('register-confirm-password');
      if (loginPw) loginPw.value = '';
      if (regPw) regPw.value = '';
      if (regConfirm) regConfirm.value = '';

      if (!newSession.org || !newSession.org.name) {
        await hydrateOrganisationContext(true);
      }

      if (activeMode === 'ask') {
        await Promise.all([
          loadAvailableModels(),
          loadConversationsSidebar({ restoreSaved: true })
        ]);
      } else if (activeMode === 'build') {
        await loadSavedProjectsBar();
      }
    }

    async function submitLogin(event) {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      if (authSubmitting) return { ok: false, error: { code: 'IN_PROGRESS', message: 'Sign in already in progress.' } };

      const emailEl = document.getElementById('login-email');
      const passwordEl = document.getElementById('login-password');
      const email = emailEl ? emailEl.value.trim() : '';
      const password = passwordEl ? passwordEl.value : '';

      if (!isValidEmailFormat(email)) {
        showAuthFeedback('Please enter a valid email address.');
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid email address.' } };
      }
      if (!password) {
        showAuthFeedback('Please enter your password.');
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Password is required.' } };
      }

      showAuthFeedback('');
      setAuthSubmitting(true, 'login-submit-btn', 'Signing in...');

      try {
        const res = await griotFetch('/auth/login', {
          method: 'POST',
          skipAuth: true,
          body: { email, password }
        });
        if (!res.ok || !res.data || !res.data.accessToken) {
          const msg =
            res.status === 401
              ? 'Invalid email or password. Please check your credentials and try again.'
              : (res.error && res.error.message) || 'Unable to sign in. Please try again.';
          showAuthFeedback(msg);
          return res;
        }

        const user = res.data.user || {};
        await completeAuthenticationTransition({
          token: res.data.accessToken,
          mode: 'authenticated',
          user: {
            id: user.id || '',
            displayName: user.displayName || email,
            email: user.email || email
          },
          org: {
            id: res.data.orgId || user.personalOrgId || null,
            name: ''
          }
        });
        return res;
      } finally {
        setAuthSubmitting(false);
      }
    }

    async function submitRegister(event) {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      if (authSubmitting) return { ok: false, error: { code: 'IN_PROGRESS', message: 'Registration already in progress.' } };

      const nameEl = document.getElementById('register-name');
      const emailEl = document.getElementById('register-email');
      const pwEl = document.getElementById('register-password');
      const confirmEl = document.getElementById('register-confirm-password');

      const displayName = nameEl ? nameEl.value.trim() : '';
      const email = emailEl ? emailEl.value.trim() : '';
      const password = pwEl ? pwEl.value : '';
      const confirmPassword = confirmEl ? confirmEl.value : '';

      if (displayName.length < 2) {
        showAuthFeedback('Please enter your display name (at least 2 characters).');
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Display name is required.' } };
      }
      if (!isValidEmailFormat(email)) {
        showAuthFeedback('Please enter a valid email address.');
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Valid email is required.' } };
      }
      if (password.length < 8) {
        showAuthFeedback('Password must be at least 8 characters long.');
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters.' } };
      }
      if (password !== confirmPassword) {
        showAuthFeedback('Passwords do not match. Please confirm your password.');
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Passwords do not match.' } };
      }

      showAuthFeedback('');
      setAuthSubmitting(true, 'register-submit-btn', 'Creating account...');

      try {
        const res = await griotFetch('/auth/register', {
          method: 'POST',
          skipAuth: true,
          body: {
            displayName,
            email,
            password,
            createPersonalOrg: true
          }
        });
        if (!res.ok || !res.data || !res.data.accessToken) {
          const rawMsg = (res.error && res.error.message) || 'Could not create account.';
          const friendlyMsg = /unique|duplicate|already exists/i.test(rawMsg)
            ? 'An account with this email already exists. Please sign in instead.'
            : rawMsg;
          showAuthFeedback(friendlyMsg);
          return res;
        }

        const user = res.data.user || {};
        const org = res.data.personalOrg || null;
        await completeAuthenticationTransition({
          token: res.data.accessToken,
          mode: 'authenticated',
          user: {
            id: user.id || '',
            displayName: user.displayName || displayName,
            email: user.email || email
          },
          org: {
            id: org ? org.id : user.personalOrgId || null,
            name: org ? org.name : ''
          }
        });
        return res;
      } finally {
        setAuthSubmitting(false);
      }
    }

    async function continueAsGuest() {
      if (authSubmitting) return { ok: false, error: { code: 'IN_PROGRESS', message: 'Guest setup already in progress.' } };

      showAuthFeedback('');
      setAuthSubmitting(true, 'guest-access-btn', 'Starting guest session...');

      try {
        const guestSuffix =
          Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
        const guestEmail = 'guest_' + guestSuffix + '@guest.griot.local';
        const guestPassword =
          'Guest_' + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);

        const res = await griotFetch('/auth/register', {
          method: 'POST',
          skipAuth: true,
          body: {
            displayName: 'Guest Explorer',
            email: guestEmail,
            password: guestPassword,
            createPersonalOrg: true
          }
        });
        if (!res.ok || !res.data || !res.data.accessToken) {
          showAuthFeedback(
            (res.error && res.error.message) || 'Could not start guest session. Please try again.'
          );
          return res;
        }

        const user = res.data.user || {};
        const org = res.data.personalOrg || null;
        await completeAuthenticationTransition({
          token: res.data.accessToken,
          mode: 'guest',
          user: {
            id: user.id || '',
            displayName: 'Guest Explorer',
            email: null
          },
          org: {
            id: org ? org.id : user.personalOrgId || null,
            name: 'Guest Freemium Workspace',
            accessModel: org ? org.accessModel : 'public_freemium'
          }
        });
        return res;
      } finally {
        setAuthSubmitting(false);
      }
    }

    function getUserConversationStorageKey() {
      const sess = getActiveSession();
      const uid = sess && sess.user && sess.user.id ? String(sess.user.id) : '';
      return uid ? ACTIVE_CONV_STORAGE_PREFIX + uid : null;
    }

    function saveActiveConversationForSession(convId) {
      const key = getUserConversationStorageKey();
      if (!key) return;
      try {
        if (typeof sessionStorage !== 'undefined') {
          if (convId) {
            sessionStorage.setItem(key, String(convId));
          } else {
            sessionStorage.removeItem(key);
          }
        }
      } catch {
        // Ignore storage errors
      }
    }

    function getSavedConversationForSession() {
      const key = getUserConversationStorageKey();
      if (!key) return null;
      try {
        if (typeof sessionStorage !== 'undefined') {
          return sessionStorage.getItem(key) || null;
        }
      } catch {
        // Ignore storage errors
      }
      return null;
    }

    function clearSavedConversationForSession() {
      const key = getUserConversationStorageKey();
      try {
        if (typeof sessionStorage !== 'undefined') {
          if (key) sessionStorage.removeItem(key);
          sessionStorage.removeItem(ACTIVE_MODE_STORAGE_KEY);
        }
      } catch {
        // Ignore storage errors
      }
    }

    function signOutUser() {
      clearSavedConversationForSession();
      clearStoredSessionToken();
      resetAccountScopedUiState();
      closeAccountDropdown();
      if (activeMode !== 'home') {
        switchMode('home');
      }
    }

    async function restoreExistingSession() {
      const existing = getActiveSession();
      if (!existing) {
        renderAuthHeader();
        return false;
      }
      if (isJwtExpired(existing.token)) {
        clearStoredSessionToken();
        resetAccountScopedUiState();
        return false;
      }
      renderAuthHeader();
      // Validate persisted session silently against backend /organisations/current
      const valid = await hydrateOrganisationContext(true);
      if (!valid) {
        clearStoredSessionToken();
        resetAccountScopedUiState();
        return false;
      }
      let savedMode = null;
      try {
        if (typeof sessionStorage !== 'undefined') {
          savedMode = sessionStorage.getItem(ACTIVE_MODE_STORAGE_KEY);
        }
      } catch {
        savedMode = null;
      }
      if (savedMode === 'ask') {
        await switchMode('ask');
      }
      return true;
    }

    async function switchMode(mode) {
      activeMode = mode;
      try {
        if (typeof sessionStorage !== 'undefined') {
          if (mode === 'ask' || mode === 'build') {
            sessionStorage.setItem(ACTIVE_MODE_STORAGE_KEY, mode);
          } else {
            sessionStorage.removeItem(ACTIVE_MODE_STORAGE_KEY);
          }
        }
      } catch {
        // Ignore storage errors
      }
      closeAccountDropdown();
      document.querySelectorAll('.view-panel').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
      const viewEl = document.getElementById('view-' + mode);
      const tabEl = document.getElementById('tab-' + mode);
      if (viewEl) viewEl.classList.add('active');
      if (tabEl) tabEl.classList.add('active');

      if (mode === 'ask') {
        if (getStoredSessionToken()) {
          await Promise.all([
            loadAvailableModels(),
            loadConversationsSidebar({ restoreSaved: true })
          ]);
        } else {
          openAuthModal('login', 'Sign in, create an account, or continue as Guest to use ASK GRIOT.', 'info');
        }
      }
      if (mode === 'build') {
        if (getStoredSessionToken()) {
          await loadSavedProjectsBar();
        } else {
          openAuthModal('login', 'Sign in, create an account, or continue as Guest to start a guided project.', 'info');
        }
      }
    }

    // ---- STAGE 3: SAFE MARKDOWN RENDERER, MODEL VISIBILITY, STREAMING & CONVERSATION MANAGEMENT ----

    function escapeHtml(raw) {
      return String(raw || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function formatInlineMarkdown(escapedLine) {
      let s = escapedLine;
      const inlineCodes = [];
      s = s.replace(/\`([^\`]+)\`/g, function (_m, code) {
        const idx = inlineCodes.length;
        inlineCodes.push('<code>' + code + '</code>');
        return '%%GRIOT_ICODE_' + idx + '%%';
      });
      s = s.replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)/g, function (_m, label, url) {
        return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
      });
      s = s.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
      s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
      s = s.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
      s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
      s = s.replace(/%%GRIOT_ICODE_(\\d+)%%/g, function (_m, idx) {
        return inlineCodes[Number(idx)] || '';
      });
      return s;
    }

    function renderSafeMarkdown(markdownText) {
      const normalized = String(markdownText || '').replace(/\\r\\n/g, '\\n');
      if (!normalized.trim()) return '';

      const segments = [];
      const fenceRegex = /\`\`\`([a-zA-Z0-9_+-]*)\\n?([\\s\\S]*?)(?:\`\`\`|$)/g;
      let lastIndex = 0;
      let match;
      while ((match = fenceRegex.exec(normalized)) !== null) {
        if (match.index > lastIndex) {
          segments.push({ type: 'text', value: normalized.slice(lastIndex, match.index) });
        }
        segments.push({
          type: 'code',
          lang: (match[1] || '').trim(),
          value: (match[2] || '').replace(/\\n$/, '')
        });
        lastIndex = fenceRegex.lastIndex;
      }
      if (lastIndex < normalized.length) {
        segments.push({ type: 'text', value: normalized.slice(lastIndex) });
      }

      const htmlParts = [];
      for (let sIdx = 0; sIdx < segments.length; sIdx++) {
        const seg = segments[sIdx];
        if (seg.type === 'code') {
          const blockId = 'griot_code_' + (++codeBlockSeq);
          codeBlockCopyMap[blockId] = seg.value;
          const langLabel = seg.lang ? escapeHtml(seg.lang) : 'code';
          htmlParts.push(
            '<div class="code-block-wrap">' +
              '<div class="code-block-header">' +
                '<span>' + langLabel + '</span>' +
                '<button type="button" class="code-copy-btn" onclick="copyCodeBlock(\\'' + blockId + '\\', this)">Copy</button>' +
              '</div>' +
              '<pre class="code-block-pre"><code>' + escapeHtml(seg.value) + '</code></pre>' +
            '</div>'
          );
          continue;
        }

        const lines = seg.value.split('\\n');
        let inUl = false;
        let inOl = false;
        let paragraphLines = [];

        const flushParagraph = () => {
          if (paragraphLines.length === 0) return;
          htmlParts.push('<p>' + paragraphLines.join('<br />') + '</p>');
          paragraphLines = [];
        };
        const closeLists = () => {
          if (inUl) { htmlParts.push('</ul>'); inUl = false; }
          if (inOl) { htmlParts.push('</ol>'); inOl = false; }
        };

        for (let i = 0; i < lines.length; i++) {
          const rawLine = lines[i];
          const trimmed = rawLine.trim();
          if (!trimmed) {
            flushParagraph();
            closeLists();
            continue;
          }

          const headingMatch = trimmed.match(/^(#{1,3})\\s+(.+)$/);
          if (headingMatch) {
            flushParagraph();
            closeLists();
            const level = headingMatch[1].length;
            htmlParts.push('<h' + level + '>' + formatInlineMarkdown(escapeHtml(headingMatch[2])) + '</h' + level + '>');
            continue;
          }

          const quoteMatch = trimmed.match(/^>\\s?(.*)$/);
          if (quoteMatch) {
            flushParagraph();
            closeLists();
            htmlParts.push('<blockquote>' + formatInlineMarkdown(escapeHtml(quoteMatch[1])) + '</blockquote>');
            continue;
          }

          const ulMatch = trimmed.match(/^[-*]\\s+(.+)$/);
          if (ulMatch) {
            flushParagraph();
            if (inOl) { htmlParts.push('</ol>'); inOl = false; }
            if (!inUl) { htmlParts.push('<ul>'); inUl = true; }
            htmlParts.push('<li>' + formatInlineMarkdown(escapeHtml(ulMatch[1])) + '</li>');
            continue;
          }

          const olMatch = trimmed.match(/^\\d+\\.\\s+(.+)$/);
          if (olMatch) {
            flushParagraph();
            if (inUl) { htmlParts.push('</ul>'); inUl = false; }
            if (!inOl) { htmlParts.push('<ol>'); inOl = true; }
            htmlParts.push('<li>' + formatInlineMarkdown(escapeHtml(olMatch[1])) + '</li>');
            continue;
          }

          closeLists();
          paragraphLines.push(formatInlineMarkdown(escapeHtml(rawLine)));
        }

        flushParagraph();
        closeLists();
      }

      return htmlParts.join('');
    }

    function copyCodeBlock(blockId, btnEl) {
      const codeText = codeBlockCopyMap[blockId];
      if (typeof codeText !== 'string') return;
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(codeText).catch(() => {});
      }
      if (btnEl) {
        const prev = btnEl.textContent;
        btnEl.textContent = 'Copied';
        setTimeout(() => { btnEl.textContent = prev || 'Copy'; }, 1600);
      }
    }

    function formatRelativeTime(isoString) {
      if (!isoString) return '';
      const ts = Date.parse(isoString);
      if (isNaN(ts)) return '';
      const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
      if (diffSec < 60) return 'Just now';
      if (diffSec < 3600) return Math.floor(diffSec / 60) + 'm ago';
      if (diffSec < 86400) return Math.floor(diffSec / 3600) + 'h ago';
      if (diffSec < 604800) return Math.floor(diffSec / 86400) + 'd ago';
      const d = new Date(ts);
      return d.toLocaleDateString ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : isoString.slice(0, 10);
    }

    function formatProviderLabel(provider) {
      if (!provider) return '';
      return PROVIDER_LABELS[provider] || String(provider);
    }

    function lookupModelDisplayName(modelId, fallbackName) {
      if (fallbackName) return fallbackName;
      if (!modelId) return '';
      for (let i = 0; i < availableModels.length; i++) {
        if (availableModels[i].id === modelId) {
          return availableModels[i].displayName || modelId;
        }
      }
      return modelId;
    }

    function formatMessageModelMeta(info) {
      if (!info) return '';
      const parts = [];
      const executedName = lookupModelDisplayName(info.modelId, info.modelDisplayName);
      if (executedName) parts.push(executedName);
      const provLabel = formatProviderLabel(info.provider);
      if (provLabel) parts.push(provLabel);

      if (info.fallbackUsed) {
        const selectedName = lookupModelDisplayName(info.selectedModelId, info.selectedModelDisplayName);
        if (selectedName && selectedName !== executedName) {
          parts.push('Fallback from ' + selectedName);
        } else {
          parts.push('Fallback model');
        }
      }
      if (info.executionMode === 'mock') {
        parts.push('Dev Mock');
      }
      if (info.status === 'interrupted') {
        parts.push('Stopped');
      }
      return parts.join(' • ');
    }

    function formatChatError(errObj, statusCode) {
      const code = (errObj && (errObj.code || errObj.errorCode) ? String(errObj.code || errObj.errorCode) : '').toUpperCase();
      const rawMsg = errObj && (errObj.message || errObj.error) ? String(errObj.message || errObj.error) : '';
      const status = typeof statusCode === 'number' ? statusCode : (errObj && typeof errObj.statusCode === 'number' ? errObj.statusCode : 0);

      if (status === 401 || code === 'AUTH_REQUIRED' || code === 'SESSION_EXPIRED' || code === 'INVALID_JWT' || code === 'UNAUTHENTICATED') {
        return {
          title: 'Session Expired',
          message: 'Your session is no longer active. Please sign in again to continue chatting.',
          retryable: false,
          requiresAuth: true
        };
      }
      if (code === 'PROVIDER_QUOTA_EXCEEDED' || (status === 429 && /quota|credit|billing/i.test(rawMsg))) {
        return {
          title: 'Model Quota Reached',
          message: 'The active AI provider quota has been exhausted (HTTP 429). Wait a moment and try again, or choose Auto / another available model.',
          retryable: true,
          requiresAuth: false
        };
      }
      if (status === 429 || code === 'PROVIDER_RATE_LIMIT' || code === 'RATE_LIMIT_EXCEEDED' || code === 'RATE_LIMITED') {
        return {
          title: 'Rate Limit Reached',
          message: 'Too many requests were sent in a short window (HTTP 429). Please wait a few seconds and retry.',
          retryable: true,
          requiresAuth: false
        };
      }
      if (status === 503 || code === 'PROVIDER_PROVIDER_UNAVAILABLE' || code === 'SERVICE_UNAVAILABLE') {
        return {
          title: 'Provider Temporarily Unavailable',
          message: 'The AI service is temporarily experiencing high demand (HTTP 503). Please try again shortly.',
          retryable: true,
          requiresAuth: false
        };
      }
      if (status === 504 || code === 'REQUEST_TIMEOUT' || code === 'PROVIDER_TIMEOUT') {
        return {
          title: 'Request Timed Out',
          message: 'GRIOT took too long to receive a response. Please try again or shorten your prompt.',
          retryable: true,
          requiresAuth: false
        };
      }
      if (status === 0 || code === 'NETWORK_ERROR' || code === 'PROVIDER_NETWORK_ERROR') {
        return {
          title: 'Connection Interrupted',
          message: 'Could not reach GRIOT due to a network interruption. Check your connection and try again.',
          retryable: true,
          requiresAuth: false
        };
      }
      if (status === 400 || status === 422 || code === 'VALIDATION_ERROR' || code === 'ROUTING_CONSTRAINT_UNSATISFIED' || code === 'UNSAFE_PROMPT') {
        const cleanDetail = rawMsg && rawMsg.length <= 220 && !/stack|at\\s+\\w+\\s+\\(/i.test(rawMsg)
          ? rawMsg
          : 'The request could not be processed with the current parameters.';
        return {
          title: 'Request Could Not Be Processed',
          message: cleanDetail + ' Adjust your prompt or select Auto routing and try again.',
          retryable: false,
          requiresAuth: false
        };
      }
      return {
        title: 'Response Failed',
        message: 'GRIOT could not complete this response. Please try again.',
        retryable: true,
        requiresAuth: false
      };
    }

    function renderChatEmptyState() {
      const chatBox = document.getElementById('chat-messages');
      if (!chatBox) return;
      chatBox.innerHTML =
        '<div class="chat-empty-state" id="chat-empty-state">' +
          '<h3>What would you like to explore?</h3>' +
          '<p>Ask GRIOT a question, work through a business or technical problem, or draft content. Your conversations stay saved to your account.</p>' +
          '<div class="chat-suggestions">' +
            '<button class="chat-suggestion-btn" type="button" onclick="useChatSuggestion(\\'Explain how to validate and price a new SaaS product in 5 clear steps.\\')">Validate &amp; price a SaaS idea</button>' +
            '<button class="chat-suggestion-btn" type="button" onclick="useChatSuggestion(\\'Write a clean TypeScript debounce utility with usage example.\\')">TypeScript debounce helper</button>' +
            '<button class="chat-suggestion-btn" type="button" onclick="useChatSuggestion(\\'Draft a concise monthly investor update email template.\\')">Draft an investor update</button>' +
          '</div>' +
        '</div>';
    }

    function useChatSuggestion(text) {
      const inputEl = document.getElementById('ask-input');
      if (!inputEl) return;
      inputEl.value = text;
      if (typeof inputEl.focus === 'function') {
        inputEl.focus();
      }
    }

    function handleAskInputKeydown(event) {
      if (!event) return;
      if (event.key === 'Enter' && !event.shiftKey) {
        if (typeof event.preventDefault === 'function') {
          event.preventDefault();
        }
        if (!isGenerating) {
          sendAskGriot();
        }
      }
    }

    function updateGenerationControls(generating, statusText) {
      isGenerating = Boolean(generating);
      const sendBtn = document.getElementById('ask-send-btn');
      const stopBtn = document.getElementById('ask-stop-btn');
      const statusBar = document.getElementById('ask-status-bar');

      if (sendBtn) {
        sendBtn.disabled = isGenerating;
        sendBtn.textContent = isGenerating ? 'Generating...' : 'Send';
      }
      if (stopBtn) {
        if (isGenerating) {
          stopBtn.classList.add('visible');
          stopBtn.disabled = false;
        } else {
          stopBtn.classList.remove('visible');
          stopBtn.disabled = true;
        }
      }
      if (statusBar) {
        if (isGenerating && statusText) {
          statusBar.innerHTML = '<span class="msg-status-tag"><span class="generating-dot"></span>' + escapeHtml(statusText) + '</span>';
        } else {
          statusBar.textContent = statusText || '';
        }
      }
    }

    function getSelectedModelId() {
      const sel = document.getElementById('ask-model-select');
      if (!sel || !sel.value) return '';
      return String(sel.value).trim();
    }

    async function loadAvailableModels() {
      const sel = document.getElementById('ask-model-select');
      const res = await griotFetch('/models?onlyAvailable=true', {
        method: 'GET',
        promptOnUnauth: false
      });
      if (!res.ok || !res.data || !Array.isArray(res.data.models)) {
        return [];
      }
      const chatModels = res.data.models.filter(function (m) {
        if (!m || !Array.isArray(m.capabilities)) return false;
        const supportsChat = m.capabilities.indexOf('chat') !== -1 && m.capabilities.indexOf('streaming') !== -1;
        const available = m.providerAvailable !== false;
        return supportsChat && available;
      });
      availableModels = chatModels;

      if (sel) {
        const previousVal = sel.value || '';
        sel.innerHTML = '';
        const autoOpt = document.createElement('option');
        autoOpt.value = '';
        autoOpt.textContent = 'Auto (Smart Routing)';
        sel.appendChild(autoOpt);

        chatModels.forEach(function (m) {
          const opt = document.createElement('option');
          opt.value = m.id;
          opt.textContent = (m.displayName || m.id) + ' (' + formatProviderLabel(m.provider) + ')';
          sel.appendChild(opt);
        });

        const stillExists = chatModels.some(function (m) { return m.id === previousVal; });
        sel.value = stillExists ? previousVal : '';
        sel.style.display = chatModels.length > 0 ? 'inline-block' : 'none';
      }
      return chatModels;
    }

    function renderConversationsSidebarList() {
      const container = document.getElementById('conv-sidebar-list');
      if (!container) return;
      container.innerHTML = '';

      if (!cachedConversations || cachedConversations.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'conv-list-item active';
        empty.textContent = 'New Session';
        container.appendChild(empty);
        return;
      }

      cachedConversations.forEach(function (c) {
        const item = document.createElement('div');
        item.className = 'conv-list-item' + (c.id === activeConversationId ? ' active' : '');

        if (editingConversationId === c.id) {
          const editWrap = document.createElement('div');
          editWrap.className = 'conv-inline-edit';
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.value = c.title || '';
          inp.id = 'conv-rename-input-' + c.id;
          inp.onclick = function (ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); };
          inp.onkeydown = function (ev) {
            if (!ev) return;
            if (ev.key === 'Enter') {
              renameConversation(c.id, inp.value);
            } else if (ev.key === 'Escape') {
              editingConversationId = null;
              renderConversationsSidebarList();
            }
          };

          const saveBtn = document.createElement('button');
          saveBtn.className = 'conv-icon-btn';
          saveBtn.textContent = 'Save';
          saveBtn.onclick = function (ev) {
            if (ev && ev.stopPropagation) ev.stopPropagation();
            renameConversation(c.id, inp.value);
          };

          const cancelBtn = document.createElement('button');
          cancelBtn.className = 'conv-icon-btn';
          cancelBtn.textContent = 'Cancel';
          cancelBtn.onclick = function (ev) {
            if (ev && ev.stopPropagation) ev.stopPropagation();
            editingConversationId = null;
            renderConversationsSidebarList();
          };

          editWrap.appendChild(inp);
          editWrap.appendChild(saveBtn);
          editWrap.appendChild(cancelBtn);
          item.appendChild(editWrap);
          container.appendChild(item);
          return;
        }

        const row = document.createElement('div');
        row.className = 'conv-item-row';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'conv-item-title';
        titleSpan.textContent = c.title || 'Untitled Conversation';

        const actions = document.createElement('div');
        actions.className = 'conv-item-actions';

        const renameBtn = document.createElement('button');
        renameBtn.className = 'conv-icon-btn';
        renameBtn.textContent = 'Rename';
        renameBtn.onclick = function (ev) {
          if (ev && ev.stopPropagation) ev.stopPropagation();
          beginInlineRename(c.id);
        };

        const delBtn = document.createElement('button');
        delBtn.className = 'conv-icon-btn danger';
        delBtn.textContent = 'Delete';
        delBtn.onclick = function (ev) {
          if (ev && ev.stopPropagation) ev.stopPropagation();
          requestDeleteConfirmation(c.id);
        };

        actions.appendChild(renameBtn);
        actions.appendChild(delBtn);
        row.appendChild(titleSpan);
        row.appendChild(actions);
        item.appendChild(row);

        const meta = document.createElement('div');
        meta.className = 'conv-item-meta';
        meta.textContent = formatRelativeTime(c.updatedAt || c.createdAt);
        item.appendChild(meta);

        if (pendingDeleteConversationId === c.id) {
          const confirmBox = document.createElement('div');
          confirmBox.className = 'conv-confirm-box';

          const label = document.createElement('span');
          label.textContent = 'Delete chat?';

          const btnGroup = document.createElement('div');
          btnGroup.style.display = 'flex';
          btnGroup.style.gap = '0.3rem';

          const yesBtn = document.createElement('button');
          yesBtn.className = 'conv-icon-btn danger';
          yesBtn.textContent = 'Confirm';
          yesBtn.onclick = function (ev) {
            if (ev && ev.stopPropagation) ev.stopPropagation();
            deleteConversation(c.id);
          };

          const noBtn = document.createElement('button');
          noBtn.className = 'conv-icon-btn';
          noBtn.textContent = 'Cancel';
          noBtn.onclick = function (ev) {
            if (ev && ev.stopPropagation) ev.stopPropagation();
            pendingDeleteConversationId = null;
            renderConversationsSidebarList();
          };

          btnGroup.appendChild(yesBtn);
          btnGroup.appendChild(noBtn);
          confirmBox.appendChild(label);
          confirmBox.appendChild(btnGroup);
          item.appendChild(confirmBox);
        }

        item.onclick = function () {
          if (isGenerating) return;
          loadConversationHistory(c.id);
        };
        container.appendChild(item);
      });
    }

    async function loadConversationsSidebar(options = {}) {
      const res = await griotFetch('/conversations', { method: 'GET' });
      if (!res.ok || !res.data) return [];
      cachedConversations = res.data.conversations || [];

      if (options.restoreSaved && !activeConversationId) {
        const savedId = getSavedConversationForSession();
        if (savedId && cachedConversations.some(function (c) { return c.id === savedId; })) {
          renderConversationsSidebarList();
          await loadConversationHistory(savedId);
          return cachedConversations;
        }
      }

      if (activeConversationId) {
        const match = cachedConversations.find(function (c) { return c.id === activeConversationId; });
        if (match) {
          activeConversationTitle = match.title;
          const titleEl = document.getElementById('ask-chat-title');
          if (titleEl) titleEl.textContent = match.title;
        }
      }

      renderConversationsSidebarList();
      return cachedConversations;
    }

    function beginInlineRename(convId) {
      pendingDeleteConversationId = null;
      editingConversationId = convId;
      renderConversationsSidebarList();
      const inp = document.getElementById('conv-rename-input-' + convId);
      if (inp && typeof inp.focus === 'function') {
        inp.focus();
      }
    }

    function requestDeleteConfirmation(convId) {
      editingConversationId = null;
      pendingDeleteConversationId = convId;
      renderConversationsSidebarList();
    }

    async function renameConversation(convId, newTitle) {
      const cleaned = String(newTitle || '').trim();
      if (!cleaned) {
        editingConversationId = null;
        renderConversationsSidebarList();
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Title cannot be empty.' } };
      }
      const res = await griotFetch('/conversations/' + encodeURIComponent(convId), {
        method: 'PATCH',
        body: { title: cleaned }
      });
      editingConversationId = null;
      if (res.ok && res.data) {
        cachedConversations = cachedConversations.map(function (c) {
          return c.id === convId ? Object.assign({}, c, { title: res.data.title, updatedAt: res.data.updatedAt }) : c;
        });
        if (activeConversationId === convId) {
          activeConversationTitle = res.data.title;
          const titleEl = document.getElementById('ask-chat-title');
          if (titleEl) titleEl.textContent = res.data.title;
        }
      }
      renderConversationsSidebarList();
      return res;
    }

    async function deleteConversation(convId) {
      const res = await griotFetch('/conversations/' + encodeURIComponent(convId), {
        method: 'DELETE'
      });
      pendingDeleteConversationId = null;
      if (res.ok) {
        cachedConversations = cachedConversations.filter(function (c) { return c.id !== convId; });
        if (activeConversationId === convId) {
          activeConversationId = null;
          activeConversationTitle = 'ASK GRIOT';
          saveActiveConversationForSession(null);
          const titleEl = document.getElementById('ask-chat-title');
          if (titleEl) titleEl.textContent = 'ASK GRIOT';
          renderChatEmptyState();
        }
      }
      renderConversationsSidebarList();
      return res;
    }

    function startNewConversation() {
      if (isGenerating) {
        stopAskGriot();
      }
      activeConversationId = null;
      activeConversationTitle = 'ASK GRIOT';
      editingConversationId = null;
      pendingDeleteConversationId = null;
      saveActiveConversationForSession(null);
      const titleEl = document.getElementById('ask-chat-title');
      if (titleEl) titleEl.textContent = 'ASK GRIOT';
      renderChatEmptyState();
      renderConversationsSidebarList();
      const inputEl = document.getElementById('ask-input');
      if (inputEl && typeof inputEl.focus === 'function') {
        inputEl.focus();
      }
    }

    function appendMessageBubbleToDom(msg) {
      const chatBox = document.getElementById('chat-messages');
      if (!chatBox) return null;

      const bubble = document.createElement('div');
      const isUser = msg.role === 'user';
      bubble.className = 'msg-bubble ' + (isUser ? 'msg-user' : 'msg-assistant');

      const roleLabel = document.createElement('div');
      roleLabel.className = 'msg-role-label';
      roleLabel.textContent = isUser ? 'You' : 'GRIOT';
      bubble.appendChild(roleLabel);

      const bodyEl = document.createElement('div');
      bodyEl.className = 'msg-body';
      if (isUser) {
        bodyEl.textContent = msg.content || '';
      } else {
        bodyEl.innerHTML = renderSafeMarkdown(msg.content || '');
      }
      bubble.appendChild(bodyEl);

      if (!isUser) {
        const metaInfo = {
          modelId: msg.modelId || null,
          modelDisplayName: msg.metadata && msg.metadata.modelDisplayName ? msg.metadata.modelDisplayName : null,
          provider: msg.provider || null,
          selectedModelId: msg.metadata && msg.metadata.selectedModelId ? msg.metadata.selectedModelId : null,
          selectedModelDisplayName: msg.metadata && msg.metadata.selectedModelDisplayName ? msg.metadata.selectedModelDisplayName : null,
          fallbackUsed: Boolean(msg.metadata && msg.metadata.fallbackUsed),
          executionMode: msg.metadata && msg.metadata.executionMode ? msg.metadata.executionMode : null,
          status: msg.status || 'completed'
        };
        const metaText = formatMessageModelMeta(metaInfo);
        if (metaText) {
          const metaEl = document.createElement('div');
          metaEl.className = 'msg-meta';
          metaEl.textContent = metaText;
          bubble.appendChild(metaEl);
        }
      }

      chatBox.appendChild(bubble);
      return { bubble, bodyEl };
    }

    async function loadConversationHistory(convId) {
      if (!convId) return { ok: false };
      activeConversationId = convId;
      saveActiveConversationForSession(convId);

      const match = cachedConversations.find(function (c) { return c.id === convId; });
      if (match) {
        activeConversationTitle = match.title;
        const titleEl = document.getElementById('ask-chat-title');
        if (titleEl) titleEl.textContent = match.title;
      }

      const res = await griotFetch('/conversations/' + encodeURIComponent(convId) + '/messages', {
        method: 'GET'
      });
      if (!res.ok || !res.data) {
        renderConversationsSidebarList();
        return res;
      }

      const chatBox = document.getElementById('chat-messages');
      if (chatBox) {
        chatBox.innerHTML = '';
        const messages = res.data.messages || [];
        if (messages.length === 0) {
          renderChatEmptyState();
        } else {
          messages.forEach(function (m) {
            appendMessageBubbleToDom(m);
          });
        }
        chatBox.scrollTop = chatBox.scrollHeight;
      }
      renderConversationsSidebarList();
      return res;
    }

    function stopAskGriot() {
      if (!isGenerating) return false;
      generationCancelled = true;
      if (activeStreamController) {
        try {
          activeStreamController.abort();
        } catch {
          // Ignore abort errors
        }
        activeStreamController = null;
      }
      updateGenerationControls(false, 'Generation stopped.');
      return true;
    }

    function renderErrorInsideBubble(bubble, bodyEl, metaEl, formattedErr, retryPrompt) {
      bubble.className = 'msg-bubble msg-assistant msg-error';
      bodyEl.innerHTML =
        '<p><strong>' + escapeHtml(formattedErr.title) + '</strong></p>' +
        '<p>' + escapeHtml(formattedErr.message) + '</p>';

      const actions = document.createElement('div');
      actions.className = 'msg-error-actions';
      if (formattedErr.requiresAuth) {
        const signInBtn = document.createElement('button');
        signInBtn.className = 'btn-primary';
        signInBtn.style.padding = '0.42rem 0.85rem';
        signInBtn.style.fontSize = '0.8rem';
        signInBtn.textContent = 'Sign In';
        signInBtn.onclick = function () { openAuthModal('login', formattedErr.message, 'info'); };
        actions.appendChild(signInBtn);
      } else if (formattedErr.retryable && retryPrompt) {
        lastFailedPrompt = retryPrompt;
        const retryBtn = document.createElement('button');
        retryBtn.className = 'btn-secondary';
        retryBtn.style.padding = '0.42rem 0.85rem';
        retryBtn.style.fontSize = '0.8rem';
        retryBtn.textContent = 'Retry';
        retryBtn.onclick = function () {
          const inp = document.getElementById('ask-input');
          if (inp && !isGenerating) {
            inp.value = retryPrompt;
            sendAskGriot();
          }
        };
        actions.appendChild(retryBtn);
      }
      if (actions.children.length > 0) {
        bodyEl.appendChild(actions);
      }
      if (metaEl) {
        metaEl.textContent = '';
      }
    }

    async function sendAskGriot(overridePrompt) {
      if (isGenerating) {
        return { ok: false, error: { code: 'GENERATION_IN_PROGRESS', message: 'A response is already being generated.' } };
      }

      const inputEl = document.getElementById('ask-input');
      const prompt = typeof overridePrompt === 'string'
        ? overridePrompt.trim()
        : (inputEl ? inputEl.value.trim() : '');
      if (!prompt) {
        return { ok: false, error: { code: 'EMPTY_PROMPT', message: 'Please enter a message.' } };
      }

      const token = getStoredSessionToken();
      if (!token) {
        openAuthModal('login', 'Sign in, create an account, or continue as Guest to send a message.', 'info');
        return { ok: false, status: 401, error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } };
      }
      if (isJwtExpired(token)) {
        handleUnauthorizedSession('Your session has expired. Please sign in again.', true);
        return { ok: false, status: 401, error: { code: 'SESSION_EXPIRED', message: 'Session expired.' } };
      }

      if (inputEl && typeof overridePrompt !== 'string') {
        inputEl.value = '';
      }

      const chatBox = document.getElementById('chat-messages');
      if (chatBox) {
        if (chatBox.innerHTML.indexOf('chat-empty-state') !== -1) {
          chatBox.innerHTML = '';
        }
      }

      appendMessageBubbleToDom({ role: 'user', content: prompt });

      // Create progressive assistant message bubble
      const botBubble = document.createElement('div');
      botBubble.className = 'msg-bubble msg-assistant';
      const botRole = document.createElement('div');
      botRole.className = 'msg-role-label';
      botRole.textContent = 'GRIOT';
      const botBody = document.createElement('div');
      botBody.className = 'msg-body';
      botBody.innerHTML = '<span class="msg-status-tag"><span class="generating-dot"></span>Thinking...</span>';
      const botMeta = document.createElement('div');
      botMeta.className = 'msg-meta';
      botBubble.appendChild(botRole);
      botBubble.appendChild(botBody);
      botBubble.appendChild(botMeta);
      if (chatBox) {
        chatBox.appendChild(botBubble);
        chatBox.scrollTop = chatBox.scrollHeight;
      }

      generationCancelled = false;
      activeStreamController = new AbortController();
      updateGenerationControls(true, 'GRIOT is generating...');

      const productModuleEl = document.getElementById('ask-module');
      const productModule = productModuleEl && productModuleEl.value ? productModuleEl.value : 'griot_chat';
      const selectedModelId = getSelectedModelId();

      const requestPayload = {
        prompt,
        productModule,
        conversationId: activeConversationId || undefined,
        createConversationIfMissing: true,
        stream: true
      };
      if (selectedModelId) {
        requestPayload.routingHints = { requestedModelId: selectedModelId };
      }

      let accumulatedText = '';
      let streamMeta = {
        modelId: null,
        modelDisplayName: null,
        provider: null,
        selectedModelId: selectedModelId || null,
        selectedModelDisplayName: selectedModelId ? lookupModelDisplayName(selectedModelId) : null,
        fallbackUsed: false,
        executionMode: null,
        status: 'streaming'
      };
      let terminalEventType = null;
      let terminalError = null;
      let reader = null;

      try {
        const res = await griotFetch('/chat/completions', {
          method: 'POST',
          timeoutMs: 90000,
          rawStream: true,
          signal: activeStreamController.signal,
          body: requestPayload
        });

        if (!res.ok) {
          if (res.error && res.error.code === 'USER_ABORTED') {
            terminalEventType = 'interrupted';
            botBody.innerHTML = '<p style="color:var(--text-secondary);"><em>Generation stopped before output arrived.</em></p>';
            botMeta.textContent = 'Stopped';
            return { ok: true, interrupted: true, conversationId: activeConversationId, content: '' };
          }
          const formatted = formatChatError(res.error, res.status);
          renderErrorInsideBubble(botBubble, botBody, botMeta, formatted, prompt);
          return { ok: false, status: res.status, error: res.error };
        }

        const httpRes = res.response;
        if (!httpRes || !httpRes.body || typeof httpRes.body.getReader !== 'function') {
          const formatted = formatChatError({ code: 'EMPTY_RESPONSE', message: 'Empty stream response.' }, 502);
          renderErrorInsideBubble(botBubble, botBody, botMeta, formatted, prompt);
          return { ok: false, error: { code: 'EMPTY_RESPONSE', message: formatted.message } };
        }

        reader = httpRes.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let sseBuffer = '';

        const processSseFrame = function (frameText) {
          if (generationCancelled) return;
          const lines = frameText.split(/\\r?\\n/);
          let eventType = '';
          const dataLines = [];
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('event:')) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              dataLines.push(line.slice(5).trim());
            }
          }
          const dataRaw = dataLines.join('\\n').trim();
          if (!dataRaw || dataRaw === '[DONE]') return;

          let evt;
          try {
            evt = JSON.parse(dataRaw);
          } catch {
            return;
          }

          const resolvedType = evt.type || eventType;
          if (evt.conversationId) {
            activeConversationId = evt.conversationId;
            saveActiveConversationForSession(activeConversationId);
          }
          if (evt.modelId) streamMeta.modelId = evt.modelId;
          if (evt.modelDisplayName) streamMeta.modelDisplayName = evt.modelDisplayName;
          if (evt.provider) streamMeta.provider = evt.provider;
          if (evt.selectedModelId) streamMeta.selectedModelId = evt.selectedModelId;
          if (evt.selectedModelDisplayName) streamMeta.selectedModelDisplayName = evt.selectedModelDisplayName;
          if (typeof evt.fallbackUsed === 'boolean') streamMeta.fallbackUsed = evt.fallbackUsed;
          if (evt.executionMode) streamMeta.executionMode = evt.executionMode;

          if (resolvedType === 'routing') {
            const routingLabel = formatMessageModelMeta(streamMeta);
            updateGenerationControls(true, routingLabel ? 'Responding with ' + routingLabel + '...' : 'GRIOT is responding...');
            if (routingLabel) {
              botMeta.textContent = routingLabel;
            }
          } else if (resolvedType === 'delta') {
            if (generationCancelled) return;
            if (typeof evt.deltaText === 'string' && evt.deltaText.length > 0) {
              accumulatedText += evt.deltaText;
              botBody.innerHTML = renderSafeMarkdown(accumulatedText);
              if (chatBox) {
                chatBox.scrollTop = chatBox.scrollHeight;
              }
            }
          } else if (resolvedType === 'completed') {
            terminalEventType = 'completed';
            streamMeta.status = 'completed';
            if (evt.assistantMessage && typeof evt.assistantMessage.content === 'string' && !accumulatedText) {
              accumulatedText = evt.assistantMessage.content;
            }
            botBody.innerHTML = accumulatedText
              ? renderSafeMarkdown(accumulatedText)
              : '<p style="color:var(--text-secondary);"><em>GRIOT returned an empty response.</em></p>';
            botMeta.textContent = formatMessageModelMeta(streamMeta);
          } else if (resolvedType === 'interrupted') {
            terminalEventType = 'interrupted';
            streamMeta.status = 'interrupted';
            if (accumulatedText) {
              botBody.innerHTML = renderSafeMarkdown(accumulatedText);
            } else {
              botBody.innerHTML = '<p style="color:var(--text-secondary);"><em>Generation stopped.</em></p>';
            }
            botMeta.textContent = formatMessageModelMeta(streamMeta) || 'Stopped';
          } else if (resolvedType === 'error') {
            terminalEventType = 'error';
            terminalError = evt;
            const formatted = formatChatError(
              {
                code: evt.errorCode || 'STREAM_ERROR',
                message: evt.error || 'Stream error',
                statusCode: evt.statusCode
              },
              evt.statusCode
            );
            renderErrorInsideBubble(botBubble, botBody, botMeta, formatted, prompt);
          }
        };

        while (true) {
          if (generationCancelled) {
            try { await reader.cancel(); } catch {}
            break;
          }
          const readResult = await reader.read();
          if (readResult.done) break;
          if (generationCancelled) {
            try { await reader.cancel(); } catch {}
            break;
          }
          sseBuffer += decoder.decode(readResult.value, { stream: true });
          let boundaryIdx;
          while ((boundaryIdx = sseBuffer.search(/\\r?\\n\\r?\\n/)) !== -1) {
            const frame = sseBuffer.slice(0, boundaryIdx);
            const sepMatch = sseBuffer.slice(boundaryIdx).match(/^\\r?\\n\\r?\\n/);
            const sepLen = sepMatch ? sepMatch[0].length : 2;
            sseBuffer = sseBuffer.slice(boundaryIdx + sepLen);
            if (frame.trim()) {
              processSseFrame(frame);
            }
          }
        }

        if (!generationCancelled && sseBuffer.trim()) {
          processSseFrame(sseBuffer.trim());
        }

        if (generationCancelled) {
          terminalEventType = 'interrupted';
          streamMeta.status = 'interrupted';
          if (accumulatedText) {
            botBody.innerHTML = renderSafeMarkdown(accumulatedText);
          } else {
            botBody.innerHTML = '<p style="color:var(--text-secondary);"><em>Generation stopped.</em></p>';
          }
          botMeta.textContent = formatMessageModelMeta(streamMeta) || 'Stopped';
        } else if (!terminalEventType) {
          if (accumulatedText) {
            streamMeta.status = 'interrupted';
            botBody.innerHTML = renderSafeMarkdown(accumulatedText);
            botMeta.textContent = (formatMessageModelMeta(streamMeta) || 'Interrupted') + ' • Connection ended early';
          } else {
            const formatted = formatChatError({ code: 'NETWORK_ERROR', message: 'Stream ended unexpectedly.' }, 0);
            renderErrorInsideBubble(botBubble, botBody, botMeta, formatted, prompt);
            return { ok: false, error: { code: 'NETWORK_ERROR', message: formatted.message } };
          }
        }

        if (chatBox) {
          chatBox.scrollTop = chatBox.scrollHeight;
        }
        if (activeConversationId) {
          await loadConversationsSidebar();
        }
        if (terminalEventType === 'error') {
          return {
            ok: false,
            conversationId: activeConversationId,
            error: {
              code: (terminalError && terminalError.errorCode) || 'STREAM_ERROR',
              message: (terminalError && terminalError.error) || 'Stream error'
            }
          };
        }
        return {
          ok: true,
          conversationId: activeConversationId,
          content: accumulatedText,
          interrupted: terminalEventType === 'interrupted' || generationCancelled,
          meta: streamMeta
        };
      } catch (err) {
        if (generationCancelled || (activeStreamController && activeStreamController.signal.aborted)) {
          streamMeta.status = 'interrupted';
          if (accumulatedText) {
            botBody.innerHTML = renderSafeMarkdown(accumulatedText);
          } else {
            botBody.innerHTML = '<p style="color:var(--text-secondary);"><em>Generation stopped.</em></p>';
          }
          botMeta.textContent = formatMessageModelMeta(streamMeta) || 'Stopped';
          if (activeConversationId) {
            await loadConversationsSidebar();
          }
          return {
            ok: true,
            conversationId: activeConversationId,
            content: accumulatedText,
            interrupted: true,
            meta: streamMeta
          };
        }
        if (accumulatedText) {
          streamMeta.status = 'interrupted';
          botBody.innerHTML = renderSafeMarkdown(accumulatedText);
          botMeta.textContent = (formatMessageModelMeta(streamMeta) || 'Interrupted') + ' • Connection interrupted';
          if (activeConversationId) {
            await loadConversationsSidebar();
          }
          return {
            ok: false,
            conversationId: activeConversationId,
            content: accumulatedText,
            interrupted: true,
            error: { code: 'NETWORK_ERROR', message: 'Connection interrupted during streaming.' }
          };
        }
        const formatted = formatChatError({ code: 'NETWORK_ERROR', message: (err && err.message) || 'Network interruption' }, 0);
        renderErrorInsideBubble(botBubble, botBody, botMeta, formatted, prompt);
        return { ok: false, error: { code: 'NETWORK_ERROR', message: formatted.message } };
      } finally {
        if (reader && typeof reader.releaseLock === 'function') {
          try { reader.releaseLock(); } catch {}
        }
        activeStreamController = null;
        updateGenerationControls(false, '');
      }
    }

    async function loadSavedProjectsBar() {
      const res = await griotFetch('/builder/projects', { method: 'GET' });
      if (!res.ok || !res.data) return;
      const projects = res.data.projects || [];
      const bar = document.getElementById('saved-projects-bar');
      const select = document.getElementById('saved-projects-select');
      if (projects.length === 0) {
        bar.style.display = 'none';
        return;
      }
      bar.style.display = 'block';
      select.innerHTML = '<option value="">-- Select a saved project to resume --</option>';
      projects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.title + ' (' + p.workflowState + ')';
        if (activeProject && activeProject.id === p.id) opt.selected = true;
        select.appendChild(opt);
      });
    }

    async function resumeSelectedProject(projectId) {
      if (!projectId) return;
      const res = await griotFetch('/builder/projects/' + encodeURIComponent(projectId), {
        method: 'GET'
      });
      if (res.ok && res.data) {
        renderProjectWorkspace(res.data);
      }
    }

    async function startGuidedProject() {
      const idea = document.getElementById('build-idea').value.trim();
      if (!idea) return alert('Please describe what you want to create.');
      const token = getStoredSessionToken();
      if (!token) {
        openAuthModal('login', 'Sign in, create an account, or continue as Guest to start a guided project.', 'info');
        return;
      }
      if (isJwtExpired(token)) {
        handleUnauthorizedSession('Your session has expired. Please sign in again.', true);
        return;
      }
      const technicalExperience = document.getElementById('build-skill').value;
      const budgetConstraint = document.getElementById('build-budget').value;
      const btn = document.getElementById('start-build-btn');
      btn.disabled = true;
      btn.textContent = 'Generating Build Plan...';

      try {
        const res = await griotFetch('/builder/projects', {
          method: 'POST',
          timeoutMs: 45000,
          body: {
            ideaDescription: idea,
            technicalExperience,
            budgetConstraint
          }
        });
        if (!res.ok || !res.data) {
          return alert(res.error ? res.error.message : 'Could not create project');
        }
        await loadSavedProjectsBar();
        renderProjectWorkspace(res.data);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Generate My Guided Build Plan →';
      }
    }

    function resetIntakeView() {
      document.getElementById('builder-intake-card').style.display = 'block';
      document.getElementById('builder-workspace').style.display = 'none';
    }

    function renderProjectWorkspace(proj) {
      activeProject = proj;
      document.getElementById('builder-intake-card').style.display = 'none';
      document.getElementById('builder-workspace').style.display = 'block';

      document.getElementById('ws-state-badge').textContent = proj.workflowState;
      document.getElementById('ws-qc-badge').textContent =
        proj.qualityCheck && proj.qualityCheck.passed ? 'QC Passed (8/8)' : 'QC Checked';
      document.getElementById('ws-title').textContent = proj.title;
      document.getElementById('ws-objective').textContent = proj.userObjective;
      document.getElementById('ws-category-pill').textContent = proj.projectCategory.replace(/_/g, ' ');
      document.getElementById('ws-tool-pill').textContent = proj.selectedTool ? proj.selectedTool.name : 'Tool';

      const specList = document.getElementById('ws-spec-features');
      specList.innerHTML = '';
      if (proj.specification && proj.specification.mvpFeatures) {
        proj.specification.mvpFeatures.forEach(f => {
          const li = document.createElement('li');
          li.textContent = f;
          specList.appendChild(li);
        });
      }

      const total = proj.orderedSteps.length || 1;
      const doneCount = proj.completedSteps.length;
      const pct = Math.round((doneCount / total) * 100);
      document.getElementById('ws-progress-text').textContent = pct + '%';
      document.getElementById('ws-progress-fill').style.width = Math.max(8, pct) + '%';

      const stepListEl = document.getElementById('ws-step-list');
      stepListEl.innerHTML = '';
      proj.orderedSteps.forEach((st, idx) => {
        const div = document.createElement('div');
        const isDone = proj.completedSteps.includes(idx);
        const isCurr = idx === proj.currentStepIndex && proj.workflowState !== 'PROJECT_COMPLETION';
        div.className = 'step-item' + (isDone ? ' completed' : isCurr ? ' active' : '');
        div.innerHTML = '<strong>Step ' + st.stepNumber + ':</strong> ' + st.stageTitle;
        stepListEl.appendChild(div);
      });

      const currentStep = proj.orderedSteps[proj.currentStepIndex] || proj.orderedSteps[0];
      if (!currentStep) return;

      document.getElementById('step-number-tag').textContent =
        proj.workflowState === 'PROJECT_COMPLETION'
          ? 'PROJECT COMPLETED'
          : ('STEP ' + currentStep.stepNumber + ' OF ' + total);
      document.getElementById('step-stage-title').textContent = currentStep.stageTitle;
      document.getElementById('step-what').textContent = currentStep.whatToAchieve;
      document.getElementById('step-why').textContent = currentStep.whyItMatters;
      document.getElementById('step-platform').textContent = 'Open Platform: ' + currentStep.platformToOpen;

      const navList = document.getElementById('step-nav-list');
      navList.innerHTML = '';
      currentStep.navigationSteps.forEach(n => {
        const li = document.createElement('li');
        li.textContent = n;
        navList.appendChild(li);
      });

      document.getElementById('step-prompt-box').textContent = currentStep.exactPromptOrCode;
      document.getElementById('step-expected').textContent = currentStep.expectedResult;

      const verifyList = document.getElementById('step-verify-list');
      verifyList.innerHTML = '';
      currentStep.howToVerify.forEach(v => {
        const li = document.createElement('li');
        li.textContent = v;
        verifyList.appendChild(li);
      });

      document.getElementById('step-fail-guide').textContent = currentStep.ifItFails;
      const techBox = document.getElementById('step-tech-box');
      if (proj.detailLevel === 'technical') {
        techBox.style.display = 'block';
        techBox.textContent = 'Technical Architecture Note: ' + currentStep.technicalDeepDive;
        document.getElementById('detail-toggle-btn').textContent = 'Switch to Beginner Mode';
      } else {
        techBox.style.display = 'none';
        document.getElementById('detail-toggle-btn').textContent = 'Switch to Technical Detail';
      }
      document.getElementById('step-disclaimer').textContent = currentStep.transparencyDisclaimer;
    }

    function copyActivePrompt() {
      const text = document.getElementById('step-prompt-box').textContent;
      navigator.clipboard.writeText(text);
      const btn = document.getElementById('copy-btn');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy Prompt'; }, 1800);
    }

    async function toggleDetailLevel() {
      if (!activeProject) return;
      const nextLevel = activeProject.detailLevel === 'beginner' ? 'technical' : 'beginner';
      const res = await griotFetch(
        '/builder/projects/' + encodeURIComponent(activeProject.id) + '/detail-level',
        {
          method: 'PATCH',
          body: { detailLevel: nextLevel }
        }
      );
      if (res.ok && res.data) renderProjectWorkspace(res.data);
    }

    async function submitStepSuccess() {
      if (!activeProject) return;
      const obs = document.getElementById('step-feedback-input').value.trim() || 'Step completed and verified in preview.';
      document.getElementById('step-feedback-input').value = '';
      const res = await griotFetch(
        '/builder/projects/' + encodeURIComponent(activeProject.id) + '/submit-result',
        {
          method: 'POST',
          body: { userObservation: obs, markApproved: true }
        }
      );
      if (res.ok && res.data) {
        await loadSavedProjectsBar();
        renderProjectWorkspace(res.data);
      }
    }

    async function submitStepTroubleshooting() {
      if (!activeProject) return;
      const errText = document.getElementById('step-feedback-input').value.trim();
      if (!errText) return alert('Please paste or describe the error you saw.');
      document.getElementById('step-feedback-input').value = '';
      const res = await griotFetch(
        '/builder/projects/' + encodeURIComponent(activeProject.id) + '/report-error',
        {
          method: 'POST',
          body: { errorMessage: errText }
        }
      );
      if (res.ok && res.data) {
        await loadSavedProjectsBar();
        renderProjectWorkspace(res.data);
      }
    }

    async function initializeApp() {
      renderAuthHeader();
      await Promise.all([
        inspectBackendRuntime(),
        restoreExistingSession()
      ]);
    }

    initializeApp();
  </script>
</body>
</html>`;
}
