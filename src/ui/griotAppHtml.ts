// ============================================================================
// GRIOT AI — RESPONSIVE WEB EXPERIENCE ("ASK GRIOT" & "BUILD WITH GRIOT")
// Dark, premium foundation with warm orange/amber gradients, subtle
// glassmorphism, soft glowing AI orb, and dedicated Guided Build Workspace.
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
      padding: 1.1rem 2rem;
      border-bottom: 1px solid var(--border-neutral);
      backdrop-filter: blur(16px);
      background: rgba(9, 9, 13, 0.75);
      position: sticky;
      top: 0;
      z-index: 40;
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
      font-weight: 500;
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
      background: rgba(255, 107, 43, 0.14);
      border: 1px solid var(--border-subtle);
      color: #fdba74;
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
      max-width: 1180px;
      margin: 0 auto;
      padding: 2rem 1.25rem 4rem;
    }

    /* Home Hero & Glowing AI Orb */
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
      max-width: 640px;
      margin: 0 auto 2rem;
      font-size: 1.02rem;
    }

    .primary-actions-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.5rem;
      max-width: 880px;
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
      margin-bottom: 0.6rem;
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
      padding: 0.65rem 1.15rem;
      font-size: 0.86rem;
      font-weight: 600;
      cursor: pointer;
    }

    .btn-secondary:hover {
      border-color: var(--accent-amber);
    }

    .view-panel {
      display: none;
      margin-top: 1.5rem;
    }

    .view-panel.active {
      display: block;
    }

    .glass-panel {
      background: var(--bg-surface);
      border: 1px solid var(--border-neutral);
      border-radius: 20px;
      padding: 1.65rem;
      backdrop-filter: blur(18px);
      margin-bottom: 1.5rem;
    }

    /* ASK GRIOT Chat Panel */
    .chat-messages {
      min-height: 300px;
      max-height: 480px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 0.5rem;
      margin-bottom: 1.1rem;
    }

    .msg-bubble {
      padding: 1rem 1.25rem;
      border-radius: 16px;
      max-width: 85%;
      font-size: 0.95rem;
      white-space: pre-wrap;
    }

    .msg-user {
      align-self: flex-end;
      background: linear-gradient(135deg, rgba(255, 107, 43, 0.24), rgba(245, 158, 11, 0.18));
      border: 1px solid var(--border-subtle);
    }

    .msg-assistant {
      align-self: flex-start;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border-neutral);
    }

    .input-row {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
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

    /* BUILD WITH GRIOT Dedicated Project Workspace */
    .workspace-grid {
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 1.5rem;
    }

    @media (max-width: 860px) {
      .workspace-grid {
        grid-template-columns: 1fr;
      }
      header {
        flex-direction: column;
        gap: 0.75rem;
      }
    }

    .step-item {
      padding: 0.85rem 1rem;
      border-radius: 14px;
      border: 1px solid var(--border-neutral);
      margin-bottom: 0.65rem;
      background: rgba(255, 255, 255, 0.02);
      font-size: 0.88rem;
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
      margin: 0.6rem 0 1.2rem;
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
      padding: 1.1rem;
      font-family: "Cascadia Code", Consolas, monospace;
      font-size: 0.86rem;
      white-space: pre-wrap;
      margin: 0.75rem 0 1rem;
      color: #fed7aa;
    }

    .meta-pill {
      display: inline-block;
      padding: 0.25rem 0.7rem;
      border-radius: 999px;
      font-size: 0.76rem;
      font-weight: 600;
      background: rgba(255, 255, 255, 0.07);
      margin-right: 0.4rem;
      margin-bottom: 0.4rem;
    }

    .section-label {
      font-size: 0.76rem;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--accent-amber);
      font-weight: 700;
      margin-top: 1rem;
      margin-bottom: 0.35rem;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="brand-orb-mini"></div>
      <span>GRIOT AI</span>
      <span class="brand-badge">Powered by Avantage</span>
    </div>
    <div class="nav-tabs">
      <button class="tab-btn active" onclick="switchMode('home')" id="tab-home">Home</button>
      <button class="tab-btn" onclick="switchMode('ask')" id="tab-ask">ASK GRIOT</button>
      <button class="tab-btn" onclick="switchMode('build')" id="tab-build">BUILD WITH GRIOT</button>
    </div>
  </header>

  <main>
    <!-- HOME SCREEN: Two Primary Actions Immediately Obvious -->
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
      <div class="glass-panel">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; flex-wrap:wrap; gap:0.5rem;">
          <div>
            <h2 style="font-size:1.35rem;">ASK GRIOT</h2>
            <p style="color:var(--text-secondary); font-size:0.88rem;">General AI Assistance &bull; Local-First Intelligence</p>
          </div>
          <select id="ask-module" style="width:auto;">
            <option value="griot_chat">GRIOT Chat (General Assistant)</option>
            <option value="griot_learn">GRIOT Learn (Entrepreneurship, Finance &amp; Tech)</option>
            <option value="griot_business">GRIOT Business (Strategy &amp; Operations)</option>
            <option value="griot_develop">GRIOT Develop (Coding Assistance)</option>
          </select>
        </div>

        <div class="chat-messages" id="chat-messages">
          <div class="msg-bubble msg-assistant">Welcome to <strong>ASK GRIOT</strong>. Ask me any question, request a summary or business draft, or explore a topic in entrepreneurship, finance, or technology.</div>
        </div>

        <div class="input-row">
          <textarea id="ask-input" rows="2" placeholder="Ask a question, request a lesson, or paste text to summarise..." style="flex:1;"></textarea>
          <button class="btn-primary" onclick="sendAskGriot()">Send</button>
        </div>
      </div>
    </section>

    <!-- VIEW B: BUILD WITH GRIOT -->
    <section id="view-build" class="view-panel">
      <!-- Project Creation Card -->
      <div class="glass-panel" id="builder-intake-card">
        <span class="action-tag">Guided Creation Engine</span>
        <h2 style="font-size:1.45rem; margin-bottom:0.4rem;">BUILD WITH GRIOT</h2>
        <p style="color:var(--text-secondary); font-size:0.92rem; margin-bottom:1.2rem;">Describe your idea in plain words. GRIOT will classify your project, recommend the simplest suitable creation tool (Lovable, Google Antigravity, Replit, or n8n/Make), and guide you step by step.</p>

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
            <button class="btn-primary" onclick="startGuidedProject()">Generate My Guided Build Plan &rarr;</button>
          </div>
        </div>
      </div>

      <!-- Dedicated Project Workspace -->
      <div id="builder-workspace" style="display:none;">
        <div class="workspace-grid">
          <!-- Left Sidebar: Project Overview & Build Plan Stepper -->
          <div>
            <div class="glass-panel">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="action-tag" id="ws-state-badge">ACTIVE_STEP</span>
                <button class="btn-secondary" style="padding:0.3rem 0.65rem; font-size:0.76rem;" onclick="resetIntakeView()">+ New Project</button>
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

  <script>
    let sessionToken = null;
    let activeProject = null;

    async function ensureDemoSession() {
      if (sessionToken) return sessionToken;
      const email = 'builder_' + Math.random().toString(36).slice(2, 8) + '@griot.africa';
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          displayName: 'GRIOT Builder',
          password: 'GriotBuilderPassword2026!'
        })
      });
      const json = await res.json();
      if (json.success && json.data && json.data.accessToken) {
        sessionToken = json.data.accessToken;
      }
      return sessionToken;
    }

    function switchMode(mode) {
      document.querySelectorAll('.view-panel').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
      document.getElementById('view-' + mode).classList.add('active');
      document.getElementById('tab-' + mode).classList.add('active');
    }

    async function sendAskGriot() {
      const inputEl = document.getElementById('ask-input');
      const prompt = inputEl.value.trim();
      if (!prompt) return;
      inputEl.value = '';

      const chatBox = document.getElementById('chat-messages');
      const userDiv = document.createElement('div');
      userDiv.className = 'msg-bubble msg-user';
      userDiv.textContent = prompt;
      chatBox.appendChild(userDiv);

      const token = await ensureDemoSession();
      const productModule = document.getElementById('ask-module').value;

      const res = await fetch('/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ prompt, productModule })
      });
      const json = await res.json();
      const botDiv = document.createElement('div');
      botDiv.className = 'msg-bubble msg-assistant';
      botDiv.textContent = json.success
        ? json.data.content
        : ('Error: ' + (json.error ? json.error.message : 'Request failed'));
      chatBox.appendChild(botDiv);
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    async function startGuidedProject() {
      const idea = document.getElementById('build-idea').value.trim();
      if (!idea) return alert('Please describe what you want to create.');
      const technicalExperience = document.getElementById('build-skill').value;
      const budgetConstraint = document.getElementById('build-budget').value;
      const token = await ensureDemoSession();

      const res = await fetch('/api/v1/builder/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({
          ideaDescription: idea,
          technicalExperience,
          budgetConstraint
        })
      });
      const json = await res.json();
      if (!json.success) {
        return alert(json.error ? json.error.message : 'Could not create project');
      }
      renderProjectWorkspace(json.data);
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
      document.getElementById('ws-title').textContent = proj.title;
      document.getElementById('ws-objective').textContent = proj.userObjective;
      document.getElementById('ws-category-pill').textContent = proj.projectCategory.replace(/_/g, ' ');
      document.getElementById('ws-tool-pill').textContent = proj.selectedTool ? proj.selectedTool.name : 'Tool';

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
      const token = await ensureDemoSession();
      const res = await fetch('/api/v1/builder/projects/' + activeProject.id + '/detail-level', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ detailLevel: nextLevel })
      });
      const json = await res.json();
      if (json.success) renderProjectWorkspace(json.data);
    }

    async function submitStepSuccess() {
      if (!activeProject) return;
      const obs = document.getElementById('step-feedback-input').value.trim() || 'Step completed and verified in preview.';
      document.getElementById('step-feedback-input').value = '';
      const token = await ensureDemoSession();
      const res = await fetch('/api/v1/builder/projects/' + activeProject.id + '/submit-result', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ userObservation: obs, markApproved: true })
      });
      const json = await res.json();
      if (json.success) renderProjectWorkspace(json.data);
    }

    async function submitStepTroubleshooting() {
      if (!activeProject) return;
      const errText = document.getElementById('step-feedback-input').value.trim();
      if (!errText) return alert('Please paste or describe the error you saw.');
      document.getElementById('step-feedback-input').value = '';
      const token = await ensureDemoSession();
      const res = await fetch('/api/v1/builder/projects/' + activeProject.id + '/report-error', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ errorMessage: errText })
      });
      const json = await res.json();
      if (json.success) renderProjectWorkspace(json.data);
    }
  </script>
</body>
</html>`;
}
