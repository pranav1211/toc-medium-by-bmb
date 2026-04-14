# Medium TOC — by BMB

A Chrome extension that generates a Table of Contents for your Medium articles with working anchor links — giving you full creative control over numbering, bullet styles, and formatting.

Since this extension isn't on the Chrome Web Store, you'll need to load it manually. It takes about 30 seconds and you only have to do it once.

---

## Installation

1. **Download this repo** — click the green **Code** button above, then **Download ZIP**
2. **Extract the ZIP** — unzip it anywhere on your computer
3. Open Chrome Extensions — go to (chrome://extensions)[chrome://extensions] in your browser
4. **Enable Developer Mode** — toggle the switch in the top-right corner
5. **Load the extension** — click **Load unpacked** (top-left), then select the `toc-extension` folder from the extracted files
6. **Done** — the extension icon appears in your toolbar. Do **not** delete the extracted folder — Chrome reads from it directly.

That's it. Once loaded, the extension stays installed across browser restarts. You never need to repeat these steps unless you delete the folder.

---

## How to Use

1. Open a Medium draft in edit mode (URL should contain `/edit`)
2. Click the extension icon in your toolbar, then hit **Open TOC Panel** — or press **Alt+T** on the page
3. Configure your TOC style in the panel
4. Click inside a paragraph in your article where you want the TOC
5. Hit **Copy TOC into article** and the paste it.

---

## Features

**Anchor Links That Work**
- Reads Medium's own heading anchors directly from the page
- Links use `#hash` format — they work on the published article

**Mix-and-Match Numbering**
- Set different styles for main headings vs sub-headings independently
- Main headings numbered (1. 2. 3.) with sub-headings as bullets, or any combination
- 3 list modes: **Numbered**, **Bullet points**, **Plain**
- 8 bullet characters to choose from: `bullet, dash, em-dash, diamond, triangle, angle, circle, star`

**Formatting Options**
- **Bold** and **Italic** toggles
- Optional TOC title (customizable text)
- Sub-headings automatically indented for visual hierarchy

**Clean Output**
- Inserts as native Medium text — no weird formatting or extra spacing
- Shift-enter line spacing between entries, full paragraph break after title
- Looks like you typed it yourself