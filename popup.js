// TOC For Medium By BMB — popup.js

const TAG = '[BMB-TOC popup]';

function setStatus(ok, text) {
  const box = document.getElementById('status-box');
  const txt = document.getElementById('status-text');
  const btn = document.getElementById('open-btn');
  const hint = document.getElementById('hint-text');

  box.className = `status ${ok ? 'ok' : 'warn'}`;
  txt.textContent = text;
  btn.disabled = !ok;
  hint.textContent = ok
    ? 'Panel opens on the Medium page · drag to reposition'
    : 'Navigate to a Medium draft edit page first';
}

async function checkAndInit() {
  let tabs;
  try {
    tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (e) {
    console.error(TAG, 'tabs.query failed:', e);
    setStatus(false, 'Cannot query active tab');
    return;
  }

  const tab = tabs[0];
  console.log(TAG, 'Active tab:', tab?.url);

  if (!tab) {
    setStatus(false, 'No active tab found');
    return;
  }

  const url = tab.url || '';
  const isMediumEdit = (url.includes('medium.com') || url.includes('.medium.com')) &&
                       url.includes('/edit');

  if (!isMediumEdit) {
    const isMedium = url.includes('medium.com');
    if (isMedium) {
      setStatus(false, 'Open the draft in edit mode (/edit URL)');
    } else {
      setStatus(false, 'Not a Medium page');
    }
    return;
  }

  // If the content script isn't already loaded (e.g. tab was open before the
  // extension was installed/reloaded), inject it on demand.
  async function ensureContentScript() {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'GET_STATUS' });
      return true;
    } catch (e) {
      console.warn(TAG, 'Content script not present, injecting...', e);
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        });
        // Give it a tick to wire up listeners
        await new Promise(r => setTimeout(r, 50));
        return true;
      } catch (err) {
        console.error(TAG, 'Injection failed:', err);
        return false;
      }
    }
  }

  // Page looks right — ping (or inject) the content script
  const ready = await ensureContentScript();
  if (ready) {
    setStatus(true, `Edit mode · ready to generate TOC`);
  } else {
    setStatus(false, 'Could not load page script. Try refreshing the tab.');
  }

  // Bind open button
  document.getElementById('open-btn').addEventListener('click', async () => {
    console.log(TAG, 'Open button clicked');
    const ok = await ensureContentScript();
    if (!ok) {
      setStatus(false, 'Could not reach page script. Try refreshing the Medium tab.');
      return;
    }
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'OPEN_TOC_PANEL' });
      window.close();
    } catch (e) {
      console.error(TAG, 'Failed to send message to content script:', e);
      setStatus(false, 'Could not reach page script. Try refreshing the Medium tab.');
    }
  });
}

document.addEventListener('DOMContentLoaded', checkAndInit);
