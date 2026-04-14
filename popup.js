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

  // Page looks right — ping content script to confirm it's loaded
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'GET_STATUS' });
    console.log(TAG, 'Content script responded:', response);
    setStatus(true, `Edit mode · ready to generate TOC`);
  } catch (e) {
    console.warn(TAG, 'Content script not responding:', e);
    // Could be that Medium's CSP blocked the script, or page not fully loaded
    setStatus(true, 'Page looks good · click to try');
  }

  // Bind open button
  document.getElementById('open-btn').addEventListener('click', async () => {
    console.log(TAG, 'Open button clicked');
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'OPEN_TOC_PANEL' });
      window.close(); // close popup after sending
    } catch (e) {
      console.error(TAG, 'Failed to send message to content script:', e);
      setStatus(false, 'Could not reach page script. Try refreshing the Medium tab.');
    }
  });
}

document.addEventListener('DOMContentLoaded', checkAndInit);
