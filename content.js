// ============================================================
// TOC For Medium By BMB — content.js v3
// Approach: floating overlay panel, triggered via popup message.
// No hooking into Medium's internal + menu (too fragile).
// ============================================================

(function () {
  'use strict';

  const TAG = '[BMB-TOC]';

  // ── Edit-page guard ──────────────────────────────────────────────────────────
  function isEditPage() {
    const url = location.href;
    const result = url.includes('/edit') || url.includes('medium.com/p/');
    console.log(TAG, 'isEditPage?', result, '| URL:', url);
    return result;
  }

  console.log(TAG, 'Content script loaded on:', location.href);

  // ── Listen for messages from popup ──────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    console.log(TAG, 'Message received:', msg);

    if (msg.action === 'OPEN_TOC_PANEL') {
      openPanel();
      sendResponse({ ok: true });
    }
    if (msg.action === 'GET_STATUS') {
      sendResponse({ editPage: isEditPage(), url: location.href });
    }
    return true; // keep channel open
  });

  // ── Keyboard shortcut: Alt+T ─────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === 't') {
      console.log(TAG, 'Alt+T triggered');
      openPanel();
    }
  });

  // ── Heading collection ───────────────────────────────────────────────────────
  function collectHeadings() {
    console.log(TAG, 'Collecting headings...');

    // Medium editor uses .graf--h3 / .graf--h4 inside .section-inner
    // Standard tags h1-h4 as fallback
    const selectors = [
      '.graf--h3',
      '.graf--h4',
      '.graf--h2',
      'h1', 'h2', 'h3', 'h4'
    ];

    const allEls = [];
    const seen = new WeakSet();

    // First try Medium-specific selectors (most reliable in editor)
    const mediumEls = document.querySelectorAll('.graf--h3, .graf--h4, .graf--h2');
    console.log(TAG, 'Medium graf heading elements found:', mediumEls.length);
    mediumEls.forEach(el => {
      if (!seen.has(el)) { seen.add(el); allEls.push(el); }
    });

    // Fallback: standard heading tags (in case Medium updated their classes)
    const standardEls = document.querySelectorAll('h1, h2, h3, h4');
    console.log(TAG, 'Standard h1-h4 elements found:', standardEls.length);
    standardEls.forEach(el => {
      if (!seen.has(el)) { seen.add(el); allEls.push(el); }
    });

    // Sort by DOM order
    allEls.sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    const headings = [];
    allEls.forEach((el, idx) => {
      const text = el.textContent.trim();
      if (!text || text.length < 2) return;

      // Extract Medium's own anchor — it uses a `name` attribute (4-char hex like "c0c6")
      const mediumName = el.getAttribute('name');
      let anchorId = '';
      if (mediumName) {
        anchorId = mediumName;
      } else if (el.id) {
        anchorId = el.id;
      } else {
        // Check child anchors
        const childAnchor = el.querySelector('a[name], a[id]');
        if (childAnchor && (childAnchor.name || childAnchor.id)) {
          anchorId = childAnchor.name || childAnchor.id;
        } else {
          // Fallback for non-Medium pages
          const slug = text.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .trim()
            .replace(/\s+/g, '-')
            .slice(0, 50);
          anchorId = `bmb-${idx}-${slug}`;
        }
      }
      console.log(TAG, `Anchor="${anchorId}" for:`, text);

      // Determine level
      let level = 2;
      const cls = el.className || '';
      const tag = el.tagName.toLowerCase();
      if (cls.includes('graf--h3') || tag === 'h1') level = 1;
      else if (cls.includes('graf--h4') || tag === 'h2') level = 2;
      else if (tag === 'h3') level = 3;
      else level = 4;

      headings.push({ el, text, level, id: anchorId });
    });

    console.log(TAG, 'Final headings collected:', headings.length, headings.map(h => `[H${h.level}] ${h.text}`));
    return headings;
  }

  // ── Build TOC text for the mini-editor ───────────────────────────────────────
  function buildTOCLines(headings, settings) {
    const minLevel = Math.min(...headings.map(h => h.level));
    const counters = {};

    return headings.map((h, idx) => {
      const rel = h.level - minLevel;
      const indent = '  '.repeat(rel);
      const isMain = rel === 0;
      const style = isMain ? settings.mainListStyle : settings.subListStyle;

      if (!counters[h.level]) counters[h.level] = 0;
      counters[h.level]++;
      for (let l = h.level + 1; l <= 6; l++) counters[l] = 0;

      let prefix = '';
      if (style === 'numbered') {
        const parts = [];
        for (let l = minLevel; l <= h.level; l++) { if (counters[l]) parts.push(counters[l]); }
        prefix = parts.join('.') + '. ';
      } else if (style === 'bullet') {
        prefix = settings.bulletChar + ' ';
      }

      return { text: `${indent}${prefix}${h.text}`, id: h.id, level: h.level, rel };
    });
  }

  // ── Build TOC HTML for clipboard ──────────────────────────────────────────────
  function buildCopyHTML(headings, settings) {
    if (settings.useNativeList) {
      return buildCopyHTML_NativeList(headings, settings);
    }
    return buildCopyHTML_Paragraphs(headings, settings);
  }

  // Option 1: <p> per item — custom numbering, full control
  function buildCopyHTML_Paragraphs(headings, settings) {
    const lines = buildTOCLines(headings, settings);
    const minLevel = Math.min(...headings.map(h => h.level));
    const tocParts = [];

    if (settings.showTitle && settings.tocTitle) {
      tocParts.push(`<p><strong>${escHtml(settings.tocTitle)}</strong></p>`);
    }

    lines.forEach((line, idx) => {
      const h = headings[idx];
      const rel = h.level - minLevel;
      const indent = '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0'.repeat(rel);
      const prefix = escHtml(line.text.substring(0, line.text.length - h.text.length));
      const linkText = escHtml(h.text);

      let entry = `${indent}${prefix}<a href="#${line.id}">${linkText}</a>`;
      const isSub = rel > 0;
      if (isSub ? settings.subBold : settings.bold) entry = `<strong>${entry}</strong>`;
      if (isSub ? settings.subItalic : settings.italic) entry = `<em>${entry}</em>`;
      tocParts.push(`<p>${entry}</p>`);
    });

    return tocParts.join('\n');
  }

  // Option 2: <ol>/<li> — Medium's native numbered list
  // Sub-headings go as <br> inside same <li> (shift-enter behavior:
  // tight spacing, stays indented under the parent list item).
  function buildCopyHTML_NativeList(headings, settings) {
    const minLevel = Math.min(...headings.map(h => h.level));
    const lines = buildTOCLines(headings, settings);
    let html = '';

    if (settings.showTitle && settings.tocTitle) {
      html += `<p><strong>${escHtml(settings.tocTitle)}</strong></p>\n`;
    }

    // Group: each main heading starts a new <li>, sub-headings append via <br>
    const groups = [];
    lines.forEach((line, idx) => {
      const h = headings[idx];
      const rel = h.level - minLevel;
      if (rel === 0) {
        groups.push({ main: { line, heading: h }, subs: [] });
      } else if (groups.length > 0) {
        groups[groups.length - 1].subs.push({ line, heading: h });
      }
    });

    html += '<ol>\n';
    groups.forEach(group => {
      const { line, heading } = group.main;
      let mainEntry = `<a href="#${line.id}">${escHtml(heading.text)}</a>`;
      if (settings.bold) mainEntry = `<strong>${mainEntry}</strong>`;
      if (settings.italic) mainEntry = `<em>${mainEntry}</em>`;

      let liContent = mainEntry;

      group.subs.forEach(sub => {
        const subRel = sub.heading.level - minLevel;
        const indent = '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0'.repeat(subRel);
        const prefix = escHtml(sub.line.text.substring(0, sub.line.text.length - sub.heading.text.length));
        let subEntry = `${indent}${prefix}<a href="#${sub.line.id}">${escHtml(sub.heading.text)}</a>`;
        if (settings.subBold) subEntry = `<strong>${subEntry}</strong>`;
        if (settings.subItalic) subEntry = `<em>${subEntry}</em>`;
        liContent += `<br>${subEntry}`;
      });

      html += `<li>${liContent}</li>\n`;
    });
    html += '</ol>';

    return html;
  }

  // ── Copy TOC to clipboard as rich HTML ─────────────────────────────────────
  function copyTOCToClipboard(settings, headings) {
    const html = buildCopyHTML(headings, settings);
    const plainLines = buildTOCLines(headings, settings);
    const plainText = (settings.showTitle && settings.tocTitle ? settings.tocTitle + '\n' : '')
      + plainLines.map(l => l.text).join('\n');

    const blob = new Blob([html], { type: 'text/html' });
    const textBlob = new Blob([plainText], { type: 'text/plain' });

    navigator.clipboard.write([
      new ClipboardItem({
        'text/html': blob,
        'text/plain': textBlob,
      })
    ]).then(() => {
      console.log(TAG, 'TOC copied to clipboard');
      return true;
    }).catch(err => {
      console.error(TAG, 'Clipboard write failed:', err);
      // Fallback: plain text copy
      navigator.clipboard.writeText(plainText).then(() => {
        console.log(TAG, 'TOC copied as plain text (fallback)');
      });
    });

    return true;
  }

  // ── Floating Panel ───────────────────────────────────────────────────────────
  let panelEl = null;
  let currentHeadings = [];
  let settings = {
    mainListStyle: 'numbered',
    subListStyle: 'bullet',
    bulletChar: '•',
    bold: false,
    italic: false,
    subBold: false,
    subItalic: true,
    showTitle: true,
    tocTitle: 'Table of Contents',
    useNativeList: false,
  };

  function openPanel() {
    console.log(TAG, 'Opening TOC panel');

    if (panelEl) {
      console.log(TAG, 'Panel already open — toggling close');
      closePanel();
      return;
    }

    if (!isEditPage()) {
      console.warn(TAG, 'Not an edit page. Panel will still open for preview but insert may not work.');
    }

    currentHeadings = collectHeadings();

    // Load saved settings then build panel
    chrome.storage.sync.get(settings, (saved) => {
      settings = { ...settings, ...saved };
      console.log(TAG, 'Settings loaded:', settings);
      buildAndShowPanel();
    });
  }

  function closePanel() {
    if (panelEl) {
      panelEl.remove();
      panelEl = null;
      console.log(TAG, 'Panel closed');
    }
  }

  function buildAndShowPanel() {
    // Remove any stale panel
    document.getElementById('bmb-toc-panel')?.remove();

    const panel = document.createElement('div');
    panel.id = 'bmb-toc-panel';
    panel.style.cssText = `
      position: fixed;
      top: 50%;
      right: 24px;
      transform: translateY(-50%);
      z-index: 999999;
      width: 320px;
      max-height: 80vh;
      background: #ffffff;
      border: 1px solid rgba(0,0,0,0.12);
      border-radius: 12px;
      box-shadow: 0 12px 48px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 13px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;

    panel.innerHTML = buildPanelHTML();
    document.body.appendChild(panel);
    panelEl = panel;

    // Bind events
    panel.querySelector('#bmb-close').addEventListener('click', closePanel);
    panel.querySelector('#bmb-insert-btn').addEventListener('click', handleCopy);
    panel.querySelector('#bmb-refresh').addEventListener('click', () => {
      currentHeadings = collectHeadings();
      updatePreview();
    });

    // Settings controls
    const showBulletRow = () => {
      const show = settings.mainListStyle === 'bullet' || settings.subListStyle === 'bullet';
      panel.querySelector('#bmb-bullet-row').style.display = show ? 'flex' : 'none';
    };
    panel.querySelector('#bmb-main-style').addEventListener('change', (e) => {
      settings.mainListStyle = e.target.value;
      showBulletRow(); saveSettings(); updatePreview();
    });
    panel.querySelector('#bmb-sub-style').addEventListener('change', (e) => {
      settings.subListStyle = e.target.value;
      showBulletRow(); saveSettings(); updatePreview();
    });

    panel.querySelectorAll('.bmb-bullet-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        settings.bulletChar = btn.dataset.char;
        panel.querySelectorAll('.bmb-bullet-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        saveSettings(); updatePreview();
      });
    });

    panel.querySelector('#bmb-show-title').addEventListener('change', (e) => {
      settings.showTitle = e.target.checked;
      panel.querySelector('#bmb-title-input').style.opacity = e.target.checked ? '1' : '0.4';
      saveSettings(); updatePreview();
    });

    panel.querySelector('#bmb-title-input').addEventListener('input', (e) => {
      settings.tocTitle = e.target.value || 'Table of Contents';
      saveSettings(); updatePreview();
    });

    panel.querySelector('#bmb-bold').addEventListener('change', (e) => {
      settings.bold = e.target.checked;
      saveSettings(); updatePreview();
    });

    panel.querySelector('#bmb-italic').addEventListener('change', (e) => {
      settings.italic = e.target.checked;
      saveSettings(); updatePreview();
    });

    panel.querySelector('#bmb-sub-bold').addEventListener('change', (e) => {
      settings.subBold = e.target.checked;
      saveSettings(); updatePreview();
    });

    panel.querySelector('#bmb-sub-italic').addEventListener('change', (e) => {
      settings.subItalic = e.target.checked;
      saveSettings(); updatePreview();
    });

    panel.querySelector('#bmb-native-list').addEventListener('change', (e) => {
      settings.useNativeList = e.target.checked;
      // When native list is on, main style is handled by <ol> so hide the main style selector
      panel.querySelector('#bmb-main-style').closest('div').style.display = e.target.checked ? 'none' : 'flex';
      saveSettings(); updatePreview();
    });
    // Init visibility
    if (settings.useNativeList) {
      panel.querySelector('#bmb-main-style').closest('div').style.display = 'none';
    }

    // Draggable
    makeDraggable(panel, panel.querySelector('#bmb-header'));

    // Initial preview
    updatePreview();

    console.log(TAG, 'Panel built and shown');
  }

  function buildPanelHTML() {
    const bullets = ['•', '–', '—', '◆', '▸', '›', '○', '★'];
    const bulletBtns = bullets.map(c =>
      `<button class="bmb-bullet-opt${settings.bulletChar === c ? ' active' : ''}" data-char="${c}" style="
        width:28px;height:28px;border:1px solid #e0e0e0;border-radius:6px;
        background:${settings.bulletChar === c ? '#1a1a1a' : '#fff'};
        color:${settings.bulletChar === c ? '#e8ff6b' : '#333'};
        font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;
        transition:all 0.15s;
      ">${c}</button>`
    ).join('');

    const headingCount = currentHeadings.length;

    return `
    <!-- Header -->
    <div id="bmb-header" style="
      background:#1a1a1a;padding:12px 16px;
      display:flex;align-items:center;justify-content:space-between;
      cursor:move;user-select:none;flex-shrink:0;
    ">
      <div style="display:flex;align-items:center;gap:10px;">
        <img src="${chrome.runtime.getURL('icons/bmblogo.png')}" style="width:28px;height:28px;border-radius:6px;" />
        <div>
          <div style="font-size:13px;font-weight:600;color:#fff;">Medium TOC — by BMB</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.4);font-family:monospace;">
            ${headingCount} heading${headingCount !== 1 ? 's' : ''} found
          </div>
        </div>
      </div>
      <div style="display:flex;gap:6px;">
        <button id="bmb-refresh" title="Rescan headings" style="
          background:rgba(255,255,255,0.1);border:none;border-radius:6px;
          width:28px;height:28px;cursor:pointer;color:#fff;font-size:14px;
          display:flex;align-items:center;justify-content:center;
        ">↺</button>
        <button id="bmb-close" style="
          background:rgba(255,255,255,0.1);border:none;border-radius:6px;
          width:28px;height:28px;cursor:pointer;color:#fff;font-size:16px;
          display:flex;align-items:center;justify-content:center;
        ">×</button>
      </div>
    </div>

    <!-- Settings -->
    <div style="padding:14px 16px;border-bottom:1px solid #f0f0f0;flex-shrink:0;">

      <!-- Main heading style -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <label style="font-size:12px;color:#666;">Main headings</label>
        <select id="bmb-main-style" style="
          background:#f5f5f5;border:1px solid #e0e0e0;border-radius:6px;
          font-size:11px;padding:5px 8px;outline:none;cursor:pointer;
          font-family:monospace;color:#333;
        ">
          <option value="numbered" ${settings.mainListStyle==='numbered'?'selected':''}>Numbered  1. 2. 3.</option>
          <option value="bullet"   ${settings.mainListStyle==='bullet'?'selected':''}>Bullet points</option>
          <option value="none"     ${settings.mainListStyle==='none'?'selected':''}>Plain</option>
        </select>
      </div>

      <!-- Sub heading style -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <label style="font-size:12px;color:#666;">Sub headings</label>
        <select id="bmb-sub-style" style="
          background:#f5f5f5;border:1px solid #e0e0e0;border-radius:6px;
          font-size:11px;padding:5px 8px;outline:none;cursor:pointer;
          font-family:monospace;color:#333;
        ">
          <option value="numbered" ${settings.subListStyle==='numbered'?'selected':''}>Numbered  1.1. 1.2.</option>
          <option value="bullet"   ${settings.subListStyle==='bullet'?'selected':''}>Bullet points</option>
          <option value="none"     ${settings.subListStyle==='none'?'selected':''}>Plain</option>
        </select>
      </div>

      <!-- Bullet chars -->
      <div id="bmb-bullet-row" style="
        display:${(settings.mainListStyle==='bullet'||settings.subListStyle==='bullet')?'flex':'none'};
        align-items:center;gap:4px;margin-bottom:10px;flex-wrap:wrap;
      ">
        <span style="font-size:11px;color:#999;margin-right:4px;font-family:monospace;">Bullet:</span>
        ${bulletBtns}
      </div>

      <!-- Toggles -->
      <div style="display:flex;gap:16px;flex-wrap:wrap;">
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#666;cursor:pointer;">
          <input type="checkbox" id="bmb-show-title" ${settings.showTitle?'checked':''} style="cursor:pointer;" />
          Title
        </label>
      </div>
      <div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap;">
        <span style="font-size:11px;color:#999;font-family:monospace;min-width:42px;">Main:</span>
        <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#666;cursor:pointer;">
          <input type="checkbox" id="bmb-bold" ${settings.bold?'checked':''} style="cursor:pointer;" />
          <strong>Bold</strong>
        </label>
        <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#666;cursor:pointer;">
          <input type="checkbox" id="bmb-italic" ${settings.italic?'checked':''} style="cursor:pointer;" />
          <em>Italic</em>
        </label>
      </div>
      <div style="display:flex;gap:10px;margin-top:4px;flex-wrap:wrap;">
        <span style="font-size:11px;color:#999;font-family:monospace;min-width:42px;">Sub:</span>
        <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#666;cursor:pointer;">
          <input type="checkbox" id="bmb-sub-bold" ${settings.subBold?'checked':''} style="cursor:pointer;" />
          <strong>Bold</strong>
        </label>
        <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#666;cursor:pointer;">
          <input type="checkbox" id="bmb-sub-italic" ${settings.subItalic?'checked':''} style="cursor:pointer;" />
          <em>Italic</em>
        </label>
      </div>

      <!-- Native list toggle -->
      <div style="margin-top:10px;">
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#666;cursor:pointer;">
          <input type="checkbox" id="bmb-native-list" ${settings.useNativeList?'checked':''} style="cursor:pointer;" />
          Use Medium's native list (better spacing)
        </label>
      </div>

      <!-- Title text -->
      <div style="margin-top:10px;opacity:${settings.showTitle?'1':'0.4'};" id="bmb-title-wrap">
        <input type="text" id="bmb-title-input" value="${escHtml(settings.tocTitle)}" maxlength="60"
          placeholder="Table of Contents"
          style="
            width:100%;background:#f5f5f5;border:1px solid #e0e0e0;border-radius:6px;
            font-size:12px;padding:6px 8px;outline:none;color:#333;box-sizing:border-box;
          "
        />
      </div>
    </div>

    <!-- Preview -->
    <div style="flex:1;overflow-y:auto;padding:14px 16px;">
      <div style="font-size:9px;font-family:monospace;color:#bbb;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">
        Preview · click headings to test links
      </div>
      <div id="bmb-preview" style="font-size:14px;line-height:1.6;"></div>
    </div>

    <!-- Insert button -->
    <div style="padding:12px 16px;border-top:1px solid #f0f0f0;flex-shrink:0;">
      <button id="bmb-insert-btn" style="
        width:100%;background:#1a1a1a;color:#e8ff6b;border:none;border-radius:8px;
        padding:10px;font-size:13px;font-weight:600;cursor:pointer;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        transition:background 0.15s;
      ">
        Copy TOC
      </button>
      <div style="font-size:10px;color:#bbb;text-align:center;margin-top:6px;font-family:monospace;">
        Copies as rich text — paste into your article
      </div>
    </div>
    `;
  }

  function updatePreview() {
    const preview = document.getElementById('bmb-preview');
    if (!preview) return;

    if (!currentHeadings.length) {
      preview.innerHTML = `<div style="color:#bbb;font-size:12px;text-align:center;padding:20px 0;font-family:monospace;">
        No headings found.<br>Add H1/H2 headings to your article.
      </div>`;
      return;
    }

    const lines = buildTOCLines(currentHeadings, settings);
    const minLevel = Math.min(...currentHeadings.map(h => h.level));

    const titleHTML = settings.showTitle && settings.tocTitle
      ? `<div style="font-size:11px;font-weight:700;margin-bottom:6px;">${escHtml(settings.tocTitle)}</div>`
      : '';

    const mainStyle = `${settings.bold ? 'font-weight:700;' : ''}${settings.italic ? 'font-style:italic;' : ''}`;
    const subStyle = `${settings.subBold ? 'font-weight:700;' : ''}${settings.subItalic ? 'font-style:italic;' : ''}`;

    let itemsHTML;

    if (settings.useNativeList) {
      // Preview as <ol> to match what Medium will render
      const groups = [];
      lines.forEach((line, idx) => {
        const h = currentHeadings[idx];
        const rel = h.level - minLevel;
        if (rel === 0) {
          groups.push({ main: { line, heading: h }, subs: [] });
        } else if (groups.length > 0) {
          groups[groups.length - 1].subs.push({ line, heading: h });
        }
      });

      const lisHTML = groups.map(group => {
        let content = `<span style="${mainStyle}">${escHtml(group.main.heading.text)}</span>`;
        group.subs.forEach(sub => {
          const subRel = sub.heading.level - minLevel;
          const indent = '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0'.repeat(subRel);
          const prefix = escHtml(sub.line.text.substring(0, sub.line.text.length - sub.heading.text.length));
          content += `<br><span style="${subStyle}">${indent}${prefix}${escHtml(sub.heading.text)}</span>`;
        });
        return `<li>${content}</li>`;
      }).join('');

      itemsHTML = `<ol style="margin:0;padding-left:1.5em;">${lisHTML}</ol>`;
    } else {
      // Preview as <p> items
      itemsHTML = lines.map((line, idx) => {
        const h = currentHeadings[idx];
        const rel = h.level - minLevel;
        const indent = '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0'.repeat(rel);
        const margin = rel === 0 ? 'margin:0.4em 0' : 'margin:0.15em 0';
        const style = rel === 0 ? mainStyle : subStyle;
        return `<p style="${margin};padding:0;${style}">${indent}${escHtml(line.text)}</p>`;
      }).join('');
    }

    preview.innerHTML = `<div>${titleHTML}<div style="font-size:13px;color:#1a1a1a;">${itemsHTML}</div></div>`;
  }

  function handleCopy() {
    console.log(TAG, 'Copy button clicked');

    if (!currentHeadings.length) {
      console.warn(TAG, 'No headings to copy');
      showToast('No headings found! Add some H1/H2 headings first.');
      return;
    }

    copyTOCToClipboard(settings, currentHeadings);
    showToast(`✓ TOC copied — paste it into your article`);
  }

  function saveSettings() {
    chrome.storage.sync.set(settings);
    console.log(TAG, 'Settings saved:', settings);
  }

  // ── Draggable panel ──────────────────────────────────────────────────────────
  function makeDraggable(panel, handle) {
    let ox = 0, oy = 0, startX = 0, startY = 0;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      e.preventDefault();
      const rect = panel.getBoundingClientRect();
      ox = rect.left;
      oy = rect.top;
      startX = e.clientX;
      startY = e.clientY;

      // Switch from transform-based to absolute positioning
      panel.style.transform = 'none';
      panel.style.top = oy + 'px';
      panel.style.right = 'auto';
      panel.style.left = ox + 'px';

      const onMove = (e2) => {
        panel.style.left = (ox + e2.clientX - startX) + 'px';
        panel.style.top  = (oy + e2.clientY - startY) + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ── Toast ────────────────────────────────────────────────────────────────────
  function showToast(msg) {
    document.getElementById('bmb-toast')?.remove();
    const t = document.createElement('div');
    t.id = 'bmb-toast';
    t.style.cssText = `
      position:fixed;bottom:28px;left:50%;transform:translateX(-50%);
      z-index:9999999;background:#1a1a1a;color:#e8ff6b;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      font-size:12px;font-weight:500;padding:9px 18px;border-radius:100px;
      box-shadow:0 4px 20px rgba(0,0,0,0.25);pointer-events:none;
      opacity:0;transition:opacity 0.2s;white-space:nowrap;
    `;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => {
      t.style.opacity = '1';
      setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3200);
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  console.log(TAG, 'Ready. Click extension icon or press Alt+T on a Medium draft to open TOC panel.');

})();
