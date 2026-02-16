(() => {
  // core/shared/protocol.js
  var MessageTypes = Object.freeze({
    // Notes
    NOTE_SET: "NOTE_SET",
    NOTE_GET: "NOTE_GET",
    NOTE_DELETE: "NOTE_DELETE",
    // Badge
    BADGE_STATUS_GET: "BADGE_STATUS_GET",
    // Settings
    SETTINGS_GET: "SETTINGS_GET",
    SETTINGS_PATCH: "SETTINGS_PATCH",
    // Highlights (storage / background)
    HIGHLIGHTS_LIST: "HIGHLIGHTS_LIST",
    HIGHLIGHT_CREATE: "HIGHLIGHT_CREATE",
    HIGHLIGHT_DELETE: "HIGHLIGHT_DELETE",
    HIGHLIGHTS_CLEAR_PAGE: "HIGHLIGHTS_CLEAR_PAGE",
    // Highlights -> new capabilities (pinned highlight / note)
    HIGHLIGHT_PATCH: "HIGHLIGHT_PATCH",
    // Content-only: request current selection anchor (for context menu / other triggers)
    HIGHLIGHT_CAPTURE_SELECTION: "HIGHLIGHT_CAPTURE_SELECTION"
  });
  var ContentEventTypes = Object.freeze({
    // Badge events -> content
    BADGE_SET: "BADGE_SET",
    BADGE_ENABLED_SET: "BADGE_ENABLED_SET",
    // Highlights events -> content (for rerender/restore/panel refresh)
    HIGHLIGHTS_UPDATED: "HIGHLIGHTS_UPDATED"
  });

  // core/shared/settingsSchema.js
  var DEFAULT_SETTINGS = Object.freeze({
    _v: 1,
    autosaveEnabled: true,
    theme: "light",
    // "light" | "dark"
    modules: {
      badge: true,
      highlights: true,
      pins: true
    },
    badge: {
      globalEnabled: true,
      disabledOrigins: []
    }
  });
  function isPlainObject(v) {
    return v && typeof v === "object" && !Array.isArray(v);
  }
  function normalizeTheme(v) {
    return v === "dark" ? "dark" : "light";
  }
  function normalizeBool(v, fallback) {
    return typeof v === "boolean" ? v : fallback;
  }
  function uniqStrings(arr) {
    const raw = Array.isArray(arr) ? arr : [];
    const trimmed = raw.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean);
    return Array.from(new Set(trimmed));
  }
  function normalizeModules(raw) {
    const m = isPlainObject(raw) ? raw : {};
    const d = DEFAULT_SETTINGS.modules;
    const out = {
      badge: normalizeBool(m.badge, d.badge),
      highlights: normalizeBool(m.highlights, d.highlights),
      pins: normalizeBool(m.pins, d.pins)
    };
    if (out.highlights === false) out.pins = false;
    return out;
  }
  function normalizeBadge(raw) {
    const b = isPlainObject(raw) ? raw : {};
    return {
      globalEnabled: normalizeBool(b.globalEnabled, true),
      disabledOrigins: uniqStrings(b.disabledOrigins)
    };
  }
  function normalizeSettings(raw) {
    const s = isPlainObject(raw) ? raw : {};
    return {
      _v: 1,
      autosaveEnabled: normalizeBool(s.autosaveEnabled, true),
      theme: normalizeTheme(s.theme),
      modules: normalizeModules(s.modules),
      badge: normalizeBadge(s.badge)
    };
  }
  function isBadgeEnabledForOrigin(settings, origin) {
    const o = typeof origin === "string" ? origin.trim() : "";
    if (!o) return false;
    const s = settings && typeof settings === "object" ? settings : DEFAULT_SETTINGS;
    if (s.modules?.badge === false) return false;
    const badge = s.badge ?? DEFAULT_SETTINGS.badge;
    if (badge.globalEnabled === false) return false;
    const disabled = Array.isArray(badge.disabledOrigins) ? badge.disabledOrigins : [];
    return !disabled.includes(o);
  }

  // core/content/ui/badge.js
  var BADGE_ID = "notextension-note-badge";
  var Z_INDEX = 2147483647;
  var badgeEl = null;
  var enabledForThisSite = true;
  function setBadgeEnabledForThisSite(enabled) {
    enabledForThisSite = Boolean(enabled);
    if (!enabledForThisSite) {
      destroyBadge();
    }
  }
  function ensureBadge() {
    if (!enabledForThisSite) return null;
    if (badgeEl && document.contains(badgeEl)) return badgeEl;
    badgeEl = document.createElement("div");
    badgeEl.id = BADGE_ID;
    Object.assign(badgeEl.style, {
      position: "fixed",
      top: "12px",
      right: "12px",
      zIndex: String(Z_INDEX),
      display: "none",
      padding: "6px 10px",
      borderRadius: "999px",
      fontSize: "12px",
      lineHeight: "1",
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
      background: "rgba(26, 115, 232, 0.92)",
      color: "#fff",
      boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
      userSelect: "none",
      cursor: "default"
    });
    badgeEl.textContent = "\u{1F4DD} Note";
    const mount = () => {
      const parent = document.body || document.documentElement;
      if (parent && badgeEl && !parent.contains(badgeEl)) parent.appendChild(badgeEl);
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mount, { once: true });
    } else {
      mount();
    }
    return badgeEl;
  }
  function destroyBadge() {
    if (badgeEl && badgeEl.parentNode) {
      badgeEl.parentNode.removeChild(badgeEl);
    }
    badgeEl = null;
  }
  function setBadgeVisible(hasNote) {
    if (!enabledForThisSite) return;
    const el2 = ensureBadge();
    if (!el2) return;
    const visible = Boolean(hasNote);
    el2.style.display = visible ? "block" : "none";
    el2.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  // core/content/highlights/constants.js
  var UI_ATTR = "data-notextension-ui";
  var HIGHLIGHT_CLASS = "notext-highlight";
  var HIGHLIGHT_STYLE_ID = "notext-highlight-style";
  var TOOLBAR_ID = "notext-hl-toolbar";
  var TOOLBAR_STYLE_ID = "notext-hl-style";
  var PIN_CLASS = "notext-pin";
  var PIN_STYLE_ID = "notext-pin-style";
  var PINS_PANEL_ID = "notext-pins-panel";
  var PINS_PANEL_STYLE_ID = "notext-pins-panel-style";
  var HIGHLIGHT_FLASH_CLASS = "notext-hl-flash";
  var Z_INDEX2 = 2147483647;

  // core/content/highlights/anchor.js
  function isText(n) {
    return n && n.nodeType === Node.TEXT_NODE;
  }
  function isIgnorableTextNode(node) {
    const v = node?.nodeValue ?? "";
    return v.trim().length === 0;
  }
  function collectTextNodesInRange(range) {
    const ancestor = range.commonAncestorContainer;
    const root = ancestor.nodeType === 1 ? ancestor : ancestor.parentElement || document.body;
    const out = [];
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue || isIgnorableTextNode(node)) {
            return NodeFilter.FILTER_REJECT;
          }
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (parent.closest("script, style, noscript")) return NodeFilter.FILTER_REJECT;
          if (parent.closest(`[${UI_ATTR}]`)) return NodeFilter.FILTER_REJECT;
          if (parent.closest(`mark.${HIGHLIGHT_CLASS}[data-hid]`)) return NodeFilter.FILTER_REJECT;
          try {
            if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
          } catch {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      },
      false
    );
    let n = walker.nextNode();
    while (n) {
      out.push(n);
      n = walker.nextNode();
    }
    return out;
  }
  function getXPathForTextNode(textNode) {
    const parent = textNode.parentNode;
    if (!parent || parent.nodeType !== 1) return "";
    const parentPath = getXPathForElement(parent);
    let i = 1;
    let sib = textNode.previousSibling;
    while (sib) {
      if (sib.nodeType === Node.TEXT_NODE) i++;
      sib = sib.previousSibling;
    }
    return `${parentPath}/text()[${i}]`;
  }
  function getXPathForElement(el2) {
    if (el2 === document.documentElement) return "/html";
    const segments = [];
    let node = el2;
    while (node && node.nodeType === 1 && node !== document) {
      const tag = node.tagName.toLowerCase();
      let index = 1;
      let sib = node.previousElementSibling;
      while (sib) {
        if (sib.tagName.toLowerCase() === tag) index++;
        sib = sib.previousElementSibling;
      }
      segments.unshift(`${tag}[${index}]`);
      node = node.parentElement;
      if (node === document.documentElement) {
        segments.unshift("html[1]");
        break;
      }
    }
    return "/" + segments.join("/");
  }
  function clampOffset(textNode, offset) {
    const len = textNode?.nodeValue?.length ?? 0;
    const n = typeof offset === "number" ? offset : 0;
    return Math.max(0, Math.min(len, n));
  }
  function takeSuffix(s, n) {
    if (!s) return "";
    return s.length <= n ? s : s.slice(s.length - n);
  }
  function takePrefix(s, n) {
    if (!s) return "";
    return s.length <= n ? s : s.slice(0, n);
  }
  function makeAnchor(range) {
    const exact = range.toString();
    if (!exact || exact.trim().length === 0) return null;
    const nodes = collectTextNodesInRange(range);
    if (nodes.length === 0) return null;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const startOffset = isText(range.startContainer) && range.startContainer === first ? clampOffset(first, range.startOffset) : 0;
    const endOffset = isText(range.endContainer) && range.endContainer === last ? clampOffset(last, range.endOffset) : last.nodeValue?.length ?? 0;
    const dom = {
      start: { xpath: getXPathForTextNode(first), offset: startOffset },
      end: { xpath: getXPathForTextNode(last), offset: endOffset }
    };
    const before = (first.nodeValue || "").slice(0, startOffset);
    const after = (last.nodeValue || "").slice(endOffset);
    const quote = {
      exact,
      prefix: takeSuffix(before, 32),
      suffix: takePrefix(after, 32)
    };
    return { dom, quote };
  }

  // core/content/highlights/api.js
  function sendMessagePromise(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) return resolve(null);
        resolve(response);
      });
    });
  }
  function getPageUrl() {
    try {
      const u = new URL(window.location.href);
      u.hash = "";
      return u.toString();
    } catch {
      return window.location.href.split("#")[0];
    }
  }
  function listHighlights({ pageUrl }) {
    return sendMessagePromise({
      type: MessageTypes.HIGHLIGHTS_LIST,
      payload: { pageUrl }
    });
  }
  function createHighlight({ pageUrl, color, anchor, pinned, noteText }) {
    return sendMessagePromise({
      type: MessageTypes.HIGHLIGHT_CREATE,
      payload: { pageUrl, color, anchor, pinned, noteText }
    });
  }
  function patchHighlight({ pageUrl, id, patch }) {
    return sendMessagePromise({
      type: MessageTypes.HIGHLIGHT_PATCH,
      payload: { pageUrl, id, patch }
    });
  }
  function deleteHighlight({ pageUrl, id }) {
    return sendMessagePromise({
      type: MessageTypes.HIGHLIGHT_DELETE,
      payload: { pageUrl, id }
    });
  }

  // core/content/highlights/restore.js
  var UI_ATTR2 = "data-notextension-ui";
  function isText2(n) {
    return n && n.nodeType === Node.TEXT_NODE;
  }
  function clampOffset2(textNode, offset) {
    const len = textNode?.nodeValue?.length ?? 0;
    const n = typeof offset === "number" ? offset : 0;
    return Math.max(0, Math.min(len, n));
  }
  function evalXPath(xpath) {
    if (!xpath || typeof xpath !== "string") return null;
    try {
      const res = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      return res.singleNodeValue || null;
    } catch {
      return null;
    }
  }
  function isInsideOurUI(node) {
    const el2 = node?.nodeType === 1 ? node : node?.parentElement;
    return Boolean(el2?.closest?.(`[${UI_ATTR2}]`));
  }
  function restoreByDom(dom) {
    const sNode = evalXPath(dom?.start?.xpath);
    const eNode = evalXPath(dom?.end?.xpath);
    if (!isText2(sNode) || !isText2(eNode)) return null;
    if (isInsideOurUI(sNode) || isInsideOurUI(eNode)) return null;
    const sOff = clampOffset2(sNode, dom.start.offset);
    const eOff = clampOffset2(eNode, dom.end.offset);
    const r = document.createRange();
    try {
      r.setStart(sNode, sOff);
      r.setEnd(eNode, eOff);
    } catch {
      return null;
    }
    if (r.collapsed) return null;
    return r;
  }
  function buildTextIndex() {
    const root = document.body || document.documentElement;
    if (!root) return null;
    const nodes = [];
    const starts = [];
    let full = "";
    let pos = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const v = node.nodeValue || "";
        if (v.trim().length === 0) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (p.closest("script, style, noscript")) return NodeFilter.FILTER_REJECT;
        if (p.closest(`[${UI_ATTR2}]`)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n = walker.nextNode();
    while (n) {
      const v = n.nodeValue || "";
      nodes.push(n);
      starts.push(pos);
      full += v;
      pos += v.length;
      n = walker.nextNode();
    }
    return { nodes, starts, full };
  }
  function posToNodeOffset(index, idx) {
    const starts = idx.starts;
    const nodes = idx.nodes;
    let lo = 0;
    let hi = starts.length - 1;
    while (lo <= hi) {
      const mid = lo + hi >> 1;
      const s = starts[mid];
      const nextS = mid + 1 < starts.length ? starts[mid + 1] : Infinity;
      if (index >= s && index < nextS) {
        const node = nodes[mid];
        const off = index - s;
        return { node, offset: clampOffset2(node, off) };
      }
      if (index < s) hi = mid - 1;
      else lo = mid + 1;
    }
    return null;
  }
  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function normalizeWs(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }
  function findBestQuoteMatch(fullText, quote) {
    const exact = quote?.exact;
    if (!exact || typeof exact !== "string" || exact.trim().length === 0) return null;
    const directIdx = fullText.indexOf(exact);
    if (directIdx !== -1) return { index: directIdx, length: exact.length };
    const tokens = exact.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return null;
    const pattern = tokens.map(escapeRegExp).join("[\\s\\u00A0]*");
    const re = new RegExp(pattern, "g");
    const prefix = normalizeWs(quote?.prefix || "");
    const suffix = normalizeWs(quote?.suffix || "");
    let best = null;
    let m;
    while (m = re.exec(fullText)) {
      const idx = m.index;
      const len = m[0].length;
      let score = 0;
      if (prefix) {
        const left = fullText.slice(Math.max(0, idx - 200), idx);
        if (normalizeWs(left).endsWith(prefix)) score += 2;
      }
      if (suffix) {
        const right = fullText.slice(idx + len, idx + len + 200);
        if (normalizeWs(right).startsWith(suffix)) score += 2;
      }
      if (!best || score > best.score) {
        best = { index: idx, length: len, score };
        if (score >= 4) break;
      }
    }
    return best ? { index: best.index, length: best.length } : null;
  }
  function restoreByQuote(quote) {
    const idx = buildTextIndex();
    if (!idx) return null;
    const match = findBestQuoteMatch(idx.full, quote);
    if (!match) return null;
    const startPos = match.index;
    const endPos = match.index + match.length;
    const a = posToNodeOffset(startPos, idx);
    const b = posToNodeOffset(endPos, idx);
    if (!a || !b) return null;
    if (isInsideOurUI(a.node) || isInsideOurUI(b.node)) return null;
    const r = document.createRange();
    try {
      r.setStart(a.node, a.offset);
      r.setEnd(b.node, b.offset);
    } catch {
      return null;
    }
    if (r.collapsed) return null;
    return r;
  }
  function restoreRange(anchor) {
    if (!anchor || typeof anchor !== "object") return null;
    const byDom = restoreByDom(anchor.dom);
    if (byDom) {
      const exact = anchor?.quote?.exact;
      if (typeof exact === "string" && exact.trim().length > 0) {
        const got = byDom.toString();
        if (got.trim().length > 0) {
          if (got.includes(exact) || exact.includes(got)) return byDom;
        }
      } else {
        return byDom;
      }
    }
    return restoreByQuote(anchor.quote);
  }

  // core/content/dom/applyHighlight.js
  function ensureHighlightStyle() {
    if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = HIGHLIGHT_STYLE_ID;
    style.textContent = `
    mark.${HIGHLIGHT_CLASS}{
      background: rgba(253, 224, 71, 0.55);
      box-shadow: inset 0 -1px 0 rgba(234, 179, 8, 0.90);
      border-radius: 3px;
      padding: 0 1px;
      color: inherit;
    }
  `;
    (document.head || document.documentElement).appendChild(style);
  }
  function collectTextNodesInRange2(range) {
    const root = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    if (!root) return [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const value = node.nodeValue || "";
        if (value.trim().length === 0) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest("script, style, noscript")) return NodeFilter.FILTER_REJECT;
        if (parent.closest(`[${UI_ATTR}]`)) return NodeFilter.FILTER_REJECT;
        if (parent.closest(`mark.${HIGHLIGHT_CLASS}`)) return NodeFilter.FILTER_REJECT;
        try {
          if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
        } catch {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let n = walker.nextNode();
    while (n) {
      nodes.push(n);
      n = walker.nextNode();
    }
    return nodes;
  }
  function clampOffset3(textNode, offset) {
    const len = textNode?.nodeValue?.length ?? 0;
    const n = typeof offset === "number" ? offset : 0;
    return Math.max(0, Math.min(len, n));
  }
  function wrapTextSlice(textNode, startOffset, endOffset, highlightId) {
    let node = textNode;
    if (endOffset < node.nodeValue.length) {
      node.splitText(endOffset);
    }
    if (startOffset > 0) {
      node = node.splitText(startOffset);
    }
    const mark = document.createElement("mark");
    mark.className = HIGHLIGHT_CLASS;
    mark.setAttribute("data-hid", highlightId);
    node.parentNode.insertBefore(mark, node);
    mark.appendChild(node);
  }
  function applyHighlight(range, highlightId) {
    ensureHighlightStyle();
    const textNodes = collectTextNodesInRange2(range);
    if (textNodes.length === 0) return { ok: false, error: "No text nodes" };
    const id = highlightId || globalThis.crypto?.randomUUID && crypto.randomUUID() || `h_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    for (const tn of textNodes) {
      const fullLen = tn.nodeValue?.length ?? 0;
      if (fullLen === 0) continue;
      const isStart = tn === range.startContainer;
      const isEnd = tn === range.endContainer;
      const start = clampOffset3(tn, isStart ? range.startOffset : 0);
      const end = clampOffset3(tn, isEnd ? range.endOffset : fullLen);
      if (end <= start) continue;
      const slice = tn.nodeValue.slice(start, end);
      if (slice.trim().length === 0) continue;
      wrapTextSlice(tn, start, end, id);
    }
    return { ok: true, id };
  }

  // core/content/ui/highlightToolbar.js
  function ensureStyle() {
    if (document.getElementById(TOOLBAR_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = TOOLBAR_STYLE_ID;
    style.textContent = `
    #${TOOLBAR_ID} {
      position: fixed;
      z-index: ${Z_INDEX2};
      display: none;
      padding: 6px;
      border-radius: 10px;
      background: rgba(17, 24, 39, 0.96);
      box-shadow: 0 10px 24px rgba(0,0,0,0.22);
      user-select: none;
      gap: 6px;
      align-items: center;
      max-width: min(520px, calc(100vw - 24px));
    }

    #${TOOLBAR_ID} .notext-btn {
      all: unset;
      cursor: pointer;
      padding: 6px 10px;
      border-radius: 8px;
      color: white;
      font: 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      background: rgba(255,255,255,0.10);
      user-select: none;
      border: 1px solid transparent;
    }

    #${TOOLBAR_ID} .notext-btn:hover {
      background: rgba(255,255,255,0.18);
    }

    #${TOOLBAR_ID} .notext-btn.danger {
      background: rgba(239,68,68,0.18);
    }
    #${TOOLBAR_ID} .notext-btn.danger:hover {
      background: rgba(239,68,68,0.28);
    }

    #${TOOLBAR_ID} .notext-status {
      margin-left: 6px;
      font: 11px/1.1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      color: rgba(255,255,255,0.85);
      opacity: 0.95;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: none;
      max-width: 240px;
    }
  `;
    (document.head || document.documentElement).appendChild(style);
  }
  function ensureToolbar({ onHighlight, onPin, onRemove, onClick }) {
    let el2 = document.getElementById(TOOLBAR_ID);
    if (el2) return el2;
    ensureStyle();
    el2 = document.createElement("div");
    el2.id = TOOLBAR_ID;
    el2.setAttribute(UI_ATTR, "1");
    el2.style.display = "none";
    const handleHighlight = typeof onHighlight === "function" ? onHighlight : onClick;
    const btnHl = document.createElement("button");
    btnHl.type = "button";
    btnHl.className = "notext-btn";
    btnHl.textContent = "Highlight";
    btnHl.setAttribute(UI_ATTR, "1");
    btnHl.dataset.role = "highlight";
    if (typeof handleHighlight === "function") {
      btnHl.addEventListener("click", handleHighlight);
    }
    el2.appendChild(btnHl);
    if (typeof onPin === "function") {
      const btnPin = document.createElement("button");
      btnPin.type = "button";
      btnPin.className = "notext-btn";
      btnPin.textContent = "\u{1F4CC} Pin";
      btnPin.setAttribute(UI_ATTR, "1");
      btnPin.dataset.role = "pin";
      btnPin.addEventListener("click", onPin);
      el2.appendChild(btnPin);
    }
    if (typeof onRemove === "function") {
      const btnRm = document.createElement("button");
      btnRm.type = "button";
      btnRm.className = "notext-btn danger";
      btnRm.textContent = "Remove";
      btnRm.setAttribute(UI_ATTR, "1");
      btnRm.dataset.role = "remove";
      btnRm.addEventListener("click", onRemove);
      el2.appendChild(btnRm);
    }
    const status = document.createElement("span");
    status.className = "notext-status";
    status.setAttribute(UI_ATTR, "1");
    status.textContent = "";
    el2.appendChild(status);
    (document.body || document.documentElement).appendChild(el2);
    return el2;
  }
  function getRectForRange(range) {
    const rects = range.getClientRects?.();
    if (rects && rects.length > 0) return rects[0];
    const r = range.getBoundingClientRect?.();
    if (!r || r.width === 0 && r.height === 0) return null;
    return r;
  }
  function createHighlightToolbar({ onHighlight, onPin, onRemove, onClick }) {
    const el2 = ensureToolbar({ onHighlight, onPin, onRemove, onClick });
    const statusEl = el2.querySelector(".notext-status");
    function showNearRange(range, pointer) {
      el2.style.display = "flex";
      const pad = 8;
      const w = el2.offsetWidth || 120;
      const h = el2.offsetHeight || 32;
      if (pointer && Date.now() - pointer.ts < 1500) {
        let left2 = pointer.x + 10;
        let top2 = pointer.y + 12;
        left2 = Math.max(pad, Math.min(left2, window.innerWidth - w - pad));
        top2 = Math.max(pad, Math.min(top2, window.innerHeight - h - pad));
        el2.style.left = `${Math.round(left2)}px`;
        el2.style.top = `${Math.round(top2)}px`;
        return;
      }
      const rect = getRectForRange(range);
      if (!rect) {
        el2.style.display = "none";
        return;
      }
      let left = rect.left + rect.width / 2 - w / 2;
      let top = rect.bottom + pad;
      left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
      top = Math.max(pad, Math.min(top, window.innerHeight - h - pad));
      el2.style.left = `${Math.round(left)}px`;
      el2.style.top = `${Math.round(top)}px`;
    }
    function setStatus(text) {
      if (!statusEl) return;
      const t = String(text || "").trim();
      statusEl.textContent = t;
      statusEl.style.display = t ? "inline-block" : "none";
    }
    function clearStatus() {
      setStatus("");
    }
    return {
      showNearRange,
      hide() {
        el2.style.display = "none";
        clearStatus();
      },
      isVisible() {
        return el2.style.display !== "none";
      },
      isEventInsideUI(target) {
        return Boolean(target?.closest?.(`#${TOOLBAR_ID}`));
      },
      setStatus,
      clearStatus
    };
  }

  // core/content/ui/pinsPanel.js
  var panelEl = null;
  var bodyEl = null;
  var isOpen = false;
  var noteTimers = /* @__PURE__ */ new Map();
  function ensureStyle2() {
    if (document.getElementById(PINS_PANEL_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = PINS_PANEL_STYLE_ID;
    style.textContent = `
    #${PINS_PANEL_ID} {
      --pin-bg: #ffffff;
      --pin-surface: #f6f4ff;
      --pin-surface-strong: #f0edff;
      --pin-border: rgba(53, 52, 52, 0.16);
      --pin-text: #353434;
      --pin-muted: #4c4b4b;
      --pin-accent: #6e5dd0;
      --pin-accent-2: #7766dc;
      --pin-danger: #dc2626;

      position: fixed;
      top: 12px;
      right: 12px;
      width: 360px;
      height: calc(100vh - 24px);
      z-index: ${Z_INDEX2};
      display: none;
      background: linear-gradient(180deg, var(--pin-bg) 0%, var(--pin-surface) 100%);
      color: var(--pin-text);
      border-radius: 14px;
      border: 1px solid var(--pin-border);
      box-shadow: 0 16px 40px rgba(53, 52, 52, 0.18);
      overflow: hidden;
      font: 13px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    }

    #${PINS_PANEL_ID} * { box-sizing: border-box; }

    #${PINS_PANEL_ID} .hdr {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 10px;
      background: var(--pin-surface-strong);
      border-bottom: 1px solid var(--pin-border);
    }

    #${PINS_PANEL_ID} .title {
      font-weight: 650;
      letter-spacing: 0.2px;
      display: flex;
      gap: 8px;
      align-items: center;
      color: var(--pin-text);
    }

    #${PINS_PANEL_ID} .close {
      all: unset;
      cursor: pointer;
      padding: 6px 10px;
      border-radius: 10px;
      color: var(--pin-text);
      border: 1px solid var(--pin-border);
      background: #fff;
      transition: border-color 140ms ease, transform 140ms ease;
    }
    #${PINS_PANEL_ID} .close:hover {
      border-color: rgba(110, 93, 208, 0.55);
      transform: translateY(-1px);
    }

    #${PINS_PANEL_ID} .body {
      padding: 10px;
      height: calc(100% - 48px);
      overflow: auto;
    }

    #${PINS_PANEL_ID} .item {
      padding: 10px;
      border-radius: 12px;
      background: #ffffff;
      border: 1px solid var(--pin-border);
      margin-bottom: 10px;
    }

    #${PINS_PANEL_ID} .quote {
      color: var(--pin-text);
      font-size: 12px;
      margin-bottom: 8px;
      word-break: break-word;
      padding: 6px 8px;
      border-radius: 10px;
      border: 1px solid transparent;
    }
    #${PINS_PANEL_ID} .quote.clickable{
      cursor: pointer;
    }
    #${PINS_PANEL_ID} .quote.clickable:hover{
      border-color: rgba(110, 93, 208, 0.35);
      background: rgba(110, 93, 208, 0.06);
    }

    #${PINS_PANEL_ID} .meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
      color: var(--pin-muted);
      font-size: 11px;
      min-height: 16px;
    }

    #${PINS_PANEL_ID} textarea {
      width: 100%;
      min-height: 78px;
      resize: vertical;
      border-radius: 10px;
      border: 1px solid var(--pin-border);
      background: #ffffff;
      color: var(--pin-text);
      padding: 8px 10px;
      outline: none;
    }
    #${PINS_PANEL_ID} textarea:focus {
      border-color: rgba(110, 93, 208, 0.55);
      box-shadow: 0 0 0 2px rgba(110, 93, 208, 0.12);
    }

    #${PINS_PANEL_ID} .row {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }

    #${PINS_PANEL_ID} .btn {
      all: unset;
      cursor: pointer;
      padding: 7px 10px;
      border-radius: 10px;
      background: var(--pin-accent);
      color: #fff;
      font-size: 12px;
      user-select: none;
      border: 1px solid transparent;
      transition: transform 140ms ease, background 140ms ease, border-color 140ms ease;
      text-align: center;
      flex: 1 1 auto;
    }
    #${PINS_PANEL_ID} .btn:hover {
      background: var(--pin-accent-2);
      transform: translateY(-1px);
    }
    #${PINS_PANEL_ID} .btn.ghost{
      background: #fff;
      color: var(--pin-text);
      border: 1px solid var(--pin-border);
    }
    #${PINS_PANEL_ID} .btn.ghost:hover{
      background: #f9fafb;
      transform: translateY(-1px);
      border-color: rgba(110, 93, 208, 0.35);
    }
    #${PINS_PANEL_ID} .btn.danger {
      background: var(--pin-danger);
    }
    #${PINS_PANEL_ID} .btn.danger:hover {
      background: #b91c1c;
    }

    #${PINS_PANEL_ID} .muted {
      color: var(--pin-muted);
      font-size: 12px;
      padding: 10px;
      border: 1px dashed rgba(110, 93, 208, 0.35);
      border-radius: 12px;
    }

    /* flash on jump */
    mark.${HIGHLIGHT_FLASH_CLASS} {
      outline: 2px solid rgba(59, 130, 246, 0.95);
      outline-offset: 1px;
      animation: notextFlash 900ms ease-out 1;
    }
    @keyframes notextFlash {
      0% { outline-color: rgba(59,130,246,1); }
      100% { outline-color: rgba(59,130,246,0); }
    }
  `;
    (document.head || document.documentElement).appendChild(style);
  }
  function ensurePanel() {
    if (panelEl && document.contains(panelEl)) return panelEl;
    ensureStyle2();
    panelEl = document.createElement("div");
    panelEl.id = PINS_PANEL_ID;
    panelEl.setAttribute(UI_ATTR, "1");
    const hdr = document.createElement("div");
    hdr.className = "hdr";
    hdr.setAttribute(UI_ATTR, "1");
    const title = document.createElement("div");
    title.className = "title";
    title.setAttribute(UI_ATTR, "1");
    title.textContent = "Pins";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "close";
    close.setAttribute(UI_ATTR, "1");
    close.textContent = "Close";
    close.addEventListener("click", () => closePinsPanel());
    hdr.appendChild(title);
    hdr.appendChild(close);
    bodyEl = document.createElement("div");
    bodyEl.className = "body";
    bodyEl.setAttribute(UI_ATTR, "1");
    panelEl.appendChild(hdr);
    panelEl.appendChild(bodyEl);
    (document.body || document.documentElement).appendChild(panelEl);
    window.addEventListener("keydown", (e) => {
      if (!isOpen) return;
      if (e.key === "Escape") closePinsPanel();
    });
    return panelEl;
  }
  function getMarkEls(highlightId) {
    return Array.from(
      document.querySelectorAll(
        `mark.${HIGHLIGHT_CLASS}[data-hid="${CSS.escape(highlightId)}"]`
      )
    );
  }
  function getFirstMarkEl(highlightId) {
    return document.querySelector(
      `mark.${HIGHLIGHT_CLASS}[data-hid="${CSS.escape(highlightId)}"]`
    );
  }
  function getVisualPos(highlightId) {
    const els = getMarkEls(highlightId);
    if (!els || els.length === 0) return null;
    let best = null;
    for (const el2 of els) {
      const r = el2.getBoundingClientRect();
      const p = { top: r.top + window.scrollY, left: r.left + window.scrollX };
      if (!best) {
        best = p;
        continue;
      }
      const lineThreshold = 8;
      if (p.top < best.top - lineThreshold) best = p;
      else if (Math.abs(p.top - best.top) <= lineThreshold && p.left < best.left) best = p;
    }
    return best;
  }
  function compareReadingOrder(a, b) {
    const ap = a._pos;
    const bp = b._pos;
    if (!ap && !bp) return (a.createdAt || 0) - (b.createdAt || 0);
    if (!ap) return 1;
    if (!bp) return -1;
    const lineThreshold = 10;
    if (Math.abs(ap.top - bp.top) > lineThreshold) return ap.top - bp.top;
    return ap.left - bp.left;
  }
  function truncate(s, n = 120) {
    const v = String(s || "").replace(/\s+/g, " ").trim();
    if (v.length <= n) return v;
    return v.slice(0, n - 1) + "\u2026";
  }
  function unwrapHighlightMarks(highlightId) {
    const marks = document.querySelectorAll(
      `mark.${HIGHLIGHT_CLASS}[data-hid="${CSS.escape(highlightId)}"]`
    );
    for (const mark of marks) {
      const parent = mark.parentNode;
      if (!parent) continue;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize?.();
    }
  }
  function flashAndScrollTo(highlightId) {
    const el2 = getFirstMarkEl(highlightId);
    if (!el2) return false;
    el2.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    const marks = document.querySelectorAll(
      `mark.${HIGHLIGHT_CLASS}[data-hid="${CSS.escape(highlightId)}"]`
    );
    marks.forEach((m) => m.classList.add(HIGHLIGHT_FLASH_CLASS));
    setTimeout(() => {
      marks.forEach((m) => m.classList.remove(HIGHLIGHT_FLASH_CLASS));
    }, 950);
    return true;
  }
  async function loadPinnedList() {
    const pageUrl = getPageUrl();
    const res = await listHighlights({ pageUrl });
    if (!res?.ok) return { ok: false, error: res?.error || "list failed", list: [] };
    const all = Array.isArray(res.highlights) ? res.highlights : [];
    const pinned = all.filter((h) => Boolean(h?.pinned));
    for (const h of pinned) {
      h._pos = getVisualPos(h.id);
    }
    pinned.sort(compareReadingOrder);
    return { ok: true, pageUrl, list: pinned };
  }
  function scheduleNotePatch({ pageUrl, id, noteText, onStatus }) {
    if (!pageUrl || !id) return;
    const prev = noteTimers.get(id);
    if (prev) clearTimeout(prev);
    const t = setTimeout(async () => {
      try {
        onStatus?.("Saving\u2026");
        const res = await patchHighlight({
          pageUrl,
          id,
          patch: { noteText }
        });
        if (!res?.ok) onStatus?.("Save failed");
        else onStatus?.("Saved");
        setTimeout(() => onStatus?.(""), 700);
      } catch {
        onStatus?.("Save failed");
      }
    }, 450);
    noteTimers.set(id, t);
  }
  async function unpinHighlight({ pageUrl, id, onStatus }) {
    try {
      onStatus?.("Unpinning\u2026");
      const res = await patchHighlight({ pageUrl, id, patch: { pinned: false } });
      if (!res?.ok) {
        onStatus?.("Unpin failed");
        return false;
      }
      removePinMarker(id);
      onStatus?.("");
      return true;
    } catch {
      onStatus?.("Unpin failed");
      return false;
    }
  }
  function renderList({ pageUrl, list }) {
    if (!bodyEl) return;
    bodyEl.innerHTML = "";
    if (!list || list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.setAttribute(UI_ATTR, "1");
      empty.textContent = "No pinned notes found on this page.";
      bodyEl.appendChild(empty);
      return;
    }
    for (const h of list) {
      const item = document.createElement("div");
      item.className = "item";
      item.setAttribute(UI_ATTR, "1");
      item.setAttribute("data-hid", h.id);
      const quote = document.createElement("div");
      quote.className = `quote ${h._pos ? "clickable" : ""}`;
      quote.setAttribute(UI_ATTR, "1");
      quote.textContent = truncate(h?.anchor?.quote?.exact || "", 160) || "\u2014";
      quote.title = h._pos ? "Click to jump to highlight" : "Unable to find position on page";
      quote.tabIndex = h._pos ? 0 : -1;
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.setAttribute(UI_ATTR, "1");
      const left = document.createElement("span");
      left.setAttribute(UI_ATTR, "1");
      left.textContent = h._pos ? "Position: resolved" : "Position: unresolved";
      const status = document.createElement("span");
      status.setAttribute(UI_ATTR, "1");
      status.textContent = "";
      meta.appendChild(left);
      meta.appendChild(status);
      const ta = document.createElement("textarea");
      ta.setAttribute(UI_ATTR, "1");
      ta.value = typeof h.noteText === "string" ? h.noteText : "";
      ta.placeholder = "Note for this pin\u2026";
      ta.addEventListener("input", () => {
        const txt = ta.value;
        scheduleNotePatch({
          pageUrl,
          id: h.id,
          noteText: txt,
          onStatus: (s) => status.textContent = s
        });
      });
      const go = () => {
        if (!h._pos) {
          status.textContent = "Position unresolved";
          setTimeout(() => status.textContent = "", 900);
          return;
        }
        flashAndScrollTo(h.id);
      };
      if (h._pos) {
        quote.addEventListener("click", go);
        quote.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            go();
          }
        });
      }
      const row = document.createElement("div");
      row.className = "row";
      row.setAttribute(UI_ATTR, "1");
      const btnGo = document.createElement("button");
      btnGo.type = "button";
      btnGo.className = "btn";
      btnGo.setAttribute(UI_ATTR, "1");
      btnGo.textContent = "Go to";
      btnGo.disabled = !h._pos;
      btnGo.title = h._pos ? "Scroll to highlight" : "Unable to find position on page";
      btnGo.addEventListener("click", go);
      const btnUnpin = document.createElement("button");
      btnUnpin.type = "button";
      btnUnpin.className = "btn ghost";
      btnUnpin.setAttribute(UI_ATTR, "1");
      btnUnpin.textContent = "Unpin";
      btnUnpin.addEventListener("click", async () => {
        const ok = await unpinHighlight({
          pageUrl,
          id: h.id,
          onStatus: (s) => status.textContent = s
        });
        if (ok) await refreshPinsPanel();
      });
      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "btn danger";
      btnDel.setAttribute(UI_ATTR, "1");
      btnDel.textContent = "Delete";
      btnDel.addEventListener("click", async () => {
        try {
          status.textContent = "Deleting\u2026";
          const res = await deleteHighlight({ pageUrl, id: h.id });
          if (!res?.ok) {
            status.textContent = "Delete failed";
            return;
          }
          unwrapHighlightMarks(h.id);
          removePinMarker(h.id);
          await refreshPinsPanel();
        } catch {
          status.textContent = "Delete failed";
        }
      });
      row.appendChild(btnGo);
      row.appendChild(btnUnpin);
      row.appendChild(btnDel);
      item.appendChild(quote);
      item.appendChild(meta);
      item.appendChild(ta);
      item.appendChild(row);
      bodyEl.appendChild(item);
    }
  }
  async function refreshPinsPanel() {
    ensurePanel();
    let focusState = null;
    if (isOpen) {
      const active = document.activeElement;
      if (active && active.tagName === "TEXTAREA" && panelEl?.contains(active)) {
        const item = active.closest("[data-hid]");
        const id = item?.getAttribute?.("data-hid") || "";
        if (id) {
          focusState = {
            id,
            start: active.selectionStart,
            end: active.selectionEnd,
            scrollTop: active.scrollTop
          };
        }
      }
    }
    const loaded = await loadPinnedList();
    if (!loaded.ok) {
      bodyEl.innerHTML = "";
      const err = document.createElement("div");
      err.className = "muted";
      err.setAttribute(UI_ATTR, "1");
      err.textContent = "Failed to load pinned notes.";
      bodyEl.appendChild(err);
      return { ok: false };
    }
    renderList({ pageUrl: loaded.pageUrl, list: loaded.list });
    if (focusState) {
      requestAnimationFrame(() => {
        const item = panelEl?.querySelector?.(
          `[data-hid="${CSS.escape(focusState.id)}"]`
        );
        const ta = item?.querySelector?.("textarea");
        if (!ta) return;
        ta.focus();
        if (typeof focusState.start === "number" && typeof focusState.end === "number") {
          ta.setSelectionRange(focusState.start, focusState.end);
        }
        if (typeof focusState.scrollTop === "number") {
          ta.scrollTop = focusState.scrollTop;
        }
      });
    }
    return { ok: true };
  }
  async function openPinsPanel({ focusId } = {}) {
    ensurePanel();
    panelEl.style.display = "block";
    isOpen = true;
    await refreshPinsPanel();
    if (focusId) {
      requestAnimationFrame(() => {
        const item = panelEl.querySelector(
          `[data-hid="${CSS.escape(focusId)}"]`
        );
        const ta = item?.querySelector?.("textarea");
        if (ta) {
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
          item.scrollIntoView({ block: "nearest" });
        }
        setTimeout(() => {
          flashAndScrollTo(focusId);
        }, 80);
      });
    }
  }
  function closePinsPanel() {
    if (!panelEl) return;
    panelEl.style.display = "none";
    isOpen = false;
  }
  function initPinsPanel() {
    ensurePanel();
  }

  // core/content/ui/pinPopover.js
  var POPOVER_ID = "notext-pin-popover";
  var POPOVER_STYLE_ID = "notext-pin-popover-style";
  var el = null;
  var state = {
    open: false,
    highlightId: null,
    anchorEl: null,
    pageUrl: null
  };
  var noteTimers2 = /* @__PURE__ */ new Map();
  function ensureStyle3() {
    if (document.getElementById(POPOVER_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = POPOVER_STYLE_ID;
    style.textContent = `
    #${POPOVER_ID}{
      position: fixed;
      z-index: 2147483647;
      width: 320px;
      max-width: calc(100vw - 16px);
      background: #ffffff;
      border: 1px solid rgba(53, 52, 52, 0.18);
      box-shadow: 0 16px 40px rgba(53, 52, 52, 0.22);
      border-radius: 14px;
      overflow: hidden;
      font: 13px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      color: #111827;
      display: none;
    }
    #${POPOVER_ID} *{ box-sizing: border-box; }
    #${POPOVER_ID} .hdr{
      display:flex;
      align-items:center;
      justify-content:space-between;
      padding: 10px 10px;
      background: #f6f4ff;
      border-bottom: 1px solid rgba(53, 52, 52, 0.14);
    }
    #${POPOVER_ID} .ttl{
      font-weight: 650;
      display:flex;
      align-items:center;
      gap: 8px;
    }
    #${POPOVER_ID} .x{
      all: unset;
      cursor: pointer;
      padding: 6px 10px;
      border-radius: 10px;
      border: 1px solid rgba(53, 52, 52, 0.16);
      background: #fff;
    }
    #${POPOVER_ID} .x:hover{
      border-color: rgba(110, 93, 208, 0.55);
    }
    #${POPOVER_ID} .body{
      padding: 10px;
    }
    #${POPOVER_ID} textarea{
      width: 100%;
      min-height: 86px;
      resize: vertical;
      border-radius: 10px;
      border: 1px solid rgba(53, 52, 52, 0.16);
      background: #ffffff;
      color: #111827;
      padding: 8px 10px;
      outline: none;
    }
    #${POPOVER_ID} textarea:focus{
      border-color: rgba(110, 93, 208, 0.55);
      box-shadow: 0 0 0 2px rgba(110, 93, 208, 0.12);
    }
    #${POPOVER_ID} .meta{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap: 10px;
      margin-top: 8px;
      color: #4b5563;
      font-size: 11px;
      min-height: 16px;
    }
    #${POPOVER_ID} .row{
      display:flex;
      gap: 8px;
      margin-top: 10px;
    }
    #${POPOVER_ID} .btn{
      all: unset;
      cursor: pointer;
      padding: 7px 10px;
      border-radius: 10px;
      background: #6e5dd0;
      color: #fff;
      font-size: 12px;
      user-select: none;
      border: 1px solid transparent;
      transition: transform 140ms ease, background 140ms ease;
    }
    #${POPOVER_ID} .btn:hover{ background:#7766dc; transform: translateY(-1px); }
    #${POPOVER_ID} .btn.ghost{
      background: #fff;
      color:#111827;
      border: 1px solid rgba(53, 52, 52, 0.16);
    }
    #${POPOVER_ID} .btn.ghost:hover{
      background:#f9fafb;
      transform: translateY(-1px);
    }
    #${POPOVER_ID} .btn.danger{
      background:#dc2626;
    }
    #${POPOVER_ID} .btn.danger:hover{
      background:#b91c1c;
    }
  `;
    (document.head || document.documentElement).appendChild(style);
  }
  function ensureEl() {
    if (el && document.contains(el)) return el;
    ensureStyle3();
    el = document.createElement("div");
    el.id = POPOVER_ID;
    el.setAttribute(UI_ATTR, "1");
    el.innerHTML = `
    <div class="hdr" ${UI_ATTR}="1">
      <div class="ttl" ${UI_ATTR}="1">\u{1F4CC} Pin note</div>
      <button class="x" type="button" ${UI_ATTR}="1" aria-label="Close" title="Close">Close</button>
    </div>
    <div class="body" ${UI_ATTR}="1">
      <textarea ${UI_ATTR}="1" placeholder="Write a note\u2026"></textarea>
      <div class="meta" ${UI_ATTR}="1">
        <span class="status" ${UI_ATTR}="1"></span>
        <span class="hint" ${UI_ATTR}="1">Shift+Click pin \u2192 open list</span>
      </div>
      <div class="row" ${UI_ATTR}="1">
        <button class="btn ghost openlist" type="button" ${UI_ATTR}="1">Open list</button>
        <button class="btn ghost unpin" type="button" ${UI_ATTR}="1">Unpin</button>
        <button class="btn danger del" type="button" ${UI_ATTR}="1">Delete</button>
      </div>
    </div>
  `;
    (document.body || document.documentElement).appendChild(el);
    el.querySelector(".x")?.addEventListener("click", () => closePinPopover());
    return el;
  }
  function clamp(v, min, max) {
    return Math.max(min, Math.min(v, max));
  }
  function positionNearAnchor(anchorEl) {
    if (!anchorEl || !el) return;
    const rect = anchorEl.getBoundingClientRect();
    const pad = 8;
    let left = rect.right + 8;
    let top = rect.top;
    el.style.display = "block";
    const w = el.offsetWidth || 320;
    const h = el.offsetHeight || 220;
    if (left + w + pad > window.innerWidth) {
      left = rect.left - w - 8;
    }
    left = clamp(left, pad, window.innerWidth - w - pad);
    top = clamp(top, pad, window.innerHeight - h - pad);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }
  function clearTimer(id) {
    const t = noteTimers2.get(id);
    if (t) clearTimeout(t);
    noteTimers2.delete(id);
  }
  async function fetchHighlight(pageUrl, id) {
    const res = await listHighlights({ pageUrl });
    if (!res?.ok) return null;
    const list = Array.isArray(res.highlights) ? res.highlights : [];
    return list.find((h) => h?.id === id) || null;
  }
  function unwrapHighlightMarks2(id) {
    const marks = document.querySelectorAll(
      `mark.${HIGHLIGHT_CLASS}[data-hid="${CSS.escape(id)}"]`
    );
    for (const mark of marks) {
      const parent = mark.parentNode;
      if (!parent) continue;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize?.();
    }
  }
  function attachGlobalCloseHandlers() {
    const onDown = (e) => {
      if (!state.open) return;
      const t = e.target;
      if (el?.contains(t)) return;
      if (t?.closest?.(`.${PIN_CLASS}`)) return;
      closePinPopover();
    };
    const onKey = (e) => {
      if (!state.open) return;
      if (e.key === "Escape") closePinPopover();
    };
    window.addEventListener("mousedown", onDown, { capture: true });
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      window.removeEventListener("mousedown", onDown, { capture: true });
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  }
  var detachGlobals = null;
  async function openPinPopover({ highlightId, anchorEl }) {
    if (!highlightId || !anchorEl) return;
    ensureEl();
    const pageUrl = getPageUrl();
    state = { open: true, highlightId, anchorEl, pageUrl };
    const h = await fetchHighlight(pageUrl, highlightId);
    const ta = el.querySelector("textarea");
    const statusEl = el.querySelector(".status");
    ta.value = typeof h?.noteText === "string" ? h.noteText : "";
    statusEl.textContent = "";
    const btnOpenList = el.querySelector(".openlist");
    const btnUnpin = el.querySelector(".unpin");
    const btnDel = el.querySelector(".del");
    btnOpenList.onclick = () => {
      openPinsPanel({ focusId: highlightId });
      closePinPopover();
    };
    btnUnpin.onclick = async () => {
      try {
        statusEl.textContent = "Unpinning\u2026";
        clearTimer(highlightId);
        const res = await patchHighlight({
          pageUrl,
          id: highlightId,
          patch: { pinned: false }
        });
        if (!res?.ok) {
          statusEl.textContent = "Unpin failed";
          return;
        }
        removePinMarker(highlightId);
        closePinPopover();
      } catch {
        statusEl.textContent = "Unpin failed";
      }
    };
    btnDel.onclick = async () => {
      try {
        statusEl.textContent = "Deleting\u2026";
        clearTimer(highlightId);
        const res = await deleteHighlight({ pageUrl, id: highlightId });
        if (!res?.ok) {
          statusEl.textContent = "Delete failed";
          return;
        }
        unwrapHighlightMarks2(highlightId);
        removePinMarker(highlightId);
        closePinPopover();
      } catch {
        statusEl.textContent = "Delete failed";
      }
    };
    ta.oninput = () => {
      const txt = ta.value;
      clearTimer(highlightId);
      statusEl.textContent = "Saving\u2026";
      const t = setTimeout(async () => {
        try {
          const res = await patchHighlight({
            pageUrl,
            id: highlightId,
            patch: { noteText: txt }
          });
          if (!res?.ok) {
            statusEl.textContent = "Save failed";
            return;
          }
          statusEl.textContent = "Saved";
          setTimeout(() => {
            if (state.open && state.highlightId === highlightId) statusEl.textContent = "";
          }, 650);
        } catch {
          statusEl.textContent = "Save failed";
        } finally {
          noteTimers2.delete(highlightId);
        }
      }, 450);
      noteTimers2.set(highlightId, t);
    };
    positionNearAnchor(anchorEl);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });
    if (!detachGlobals) detachGlobals = attachGlobalCloseHandlers();
  }
  function closePinPopover() {
    if (!el) return;
    state.open = false;
    state.highlightId = null;
    state.anchorEl = null;
    state.pageUrl = null;
    el.style.display = "none";
    if (detachGlobals) {
      detachGlobals();
      detachGlobals = null;
    }
  }

  // core/content/highlights/pins.js
  function ensurePinStyle() {
    if (document.getElementById(PIN_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = PIN_STYLE_ID;
    style.textContent = `
    .${PIN_CLASS}{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-left: 8px;

      width: 20px;
      height: 20px;
      border-radius: 6px;

      border: 1px solid rgba(0,0,0,0.25);
      background-color: transparent;
      background-repeat: no-repeat;
      background-position: center;
      background-size: 16px 16px;

      cursor: pointer;
      user-select: none;

      vertical-align: middle;
      opacity: 0.92;
      transform: translateY(-1px);

      transition:
        opacity 140ms ease,
        transform 140ms ease,
        border-color 140ms ease;

      padding: 0;
    }

    .${PIN_CLASS}:hover{
      opacity: 1;
      border-color: rgba(0,0,0,0.38);
      transform: translateY(-1px) scale(1.04);
    }

    .${PIN_CLASS}:active{
      transform: translateY(0px) scale(0.98);
    }
  `;
    (document.head || document.documentElement).appendChild(style);
  }
  function pinExists(highlightId) {
    return Boolean(
      document.querySelector(`.${PIN_CLASS}[data-hid="${CSS.escape(highlightId)}"]`)
    );
  }
  function findLastMark(highlightId) {
    const nodes = document.querySelectorAll(
      `mark.${HIGHLIGHT_CLASS}[data-hid="${CSS.escape(highlightId)}"]`
    );
    if (!nodes || nodes.length === 0) return null;
    return nodes[nodes.length - 1];
  }
  function getPinIconUrl() {
    try {
      return chrome.runtime.getURL("icons/icon-32.png");
    } catch {
      return "";
    }
  }
  function renderPinMarker(highlightId) {
    if (!highlightId) return;
    ensurePinStyle();
    if (pinExists(highlightId)) return;
    const lastMark = findLastMark(highlightId);
    if (!lastMark) return;
    const pin = document.createElement("button");
    pin.type = "button";
    pin.className = PIN_CLASS;
    pin.setAttribute("aria-label", "Open pin note");
    pin.setAttribute("title", "Open pin note (Shift+Click = open list)");
    pin.setAttribute("data-hid", highlightId);
    pin.setAttribute(UI_ATTR, "1");
    const url = getPinIconUrl();
    if (url) {
      pin.style.backgroundImage = `url("${url}")`;
    } else {
      pin.textContent = "\u25CF";
      pin.style.fontSize = "14px";
      pin.style.color = "#111827";
    }
    const parent = lastMark.parentNode;
    if (!parent) return;
    parent.insertBefore(pin, lastMark.nextSibling);
    pin.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        openPinsPanel({ focusId: highlightId });
        return;
      }
      await openPinPopover({ highlightId, anchorEl: pin });
    });
  }
  function removePinMarker(highlightId) {
    if (!highlightId) return;
    const pin = document.querySelector(`.${PIN_CLASS}[data-hid="${CSS.escape(highlightId)}"]`);
    pin?.remove?.();
  }

  // core/content/highlights/index.js
  var lastRange = null;
  var lastPointer = null;
  var hlEnabled = false;
  var pinsEnabled = true;
  var initedOnce = false;
  var toolbar = null;
  var aborter = null;
  var raf = null;
  var enableBurstToken = 0;
  function showToolbarStatus(msg, ms = 1300) {
    if (!toolbar) return;
    toolbar.setStatus(msg);
    if (ms > 0) {
      setTimeout(() => {
        if (toolbar?.isVisible?.()) toolbar.clearStatus();
      }, ms);
    }
  }
  function clearSelection() {
    const sel = window.getSelection?.();
    sel?.removeAllRanges?.();
  }
  function setToolbarPinVisible(visible) {
    const btn = document.querySelector(`#${TOOLBAR_ID} [data-role="pin"]`);
    if (!btn) return;
    btn.style.display = visible ? "" : "none";
  }
  function listExistingHighlightIds() {
    const marks = document.querySelectorAll(`mark.${HIGHLIGHT_CLASS}[data-hid]`);
    const out = /* @__PURE__ */ new Set();
    for (const m of marks) {
      const id = m.getAttribute("data-hid");
      if (id) out.add(id);
    }
    return out;
  }
  function unwrapHighlightMarks3(highlightId) {
    const marks = document.querySelectorAll(
      `mark.${HIGHLIGHT_CLASS}[data-hid="${CSS.escape(highlightId)}"]`
    );
    for (const mark of marks) {
      const parent = mark.parentNode;
      if (!parent) continue;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize?.();
    }
  }
  function removeAllHighlightsFromDom() {
    const ids = listExistingHighlightIds();
    for (const id of ids) {
      unwrapHighlightMarks3(id);
      removePinMarker(id);
    }
  }
  function removeAllPinMarkersFromDom() {
    const ids = listExistingHighlightIds();
    for (const id of ids) removePinMarker(id);
  }
  function scheduleEnableSyncBurst() {
    const token = ++enableBurstToken;
    const delays = [0, 250, 1e3];
    for (const ms of delays) {
      setTimeout(() => {
        if (!hlEnabled) return;
        if (token !== enableBurstToken) return;
        void syncHighlightsFromStore().catch(() => {
        });
      }, ms);
    }
  }
  function attachListeners() {
    if (!toolbar) return;
    aborter = new AbortController();
    const signal = aborter.signal;
    document.addEventListener(
      "selectionchange",
      () => {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          raf = null;
          const range = getValidSelectionRange(toolbar);
          if (!range) {
            if (toolbar.isVisible()) return;
            lastRange = null;
            toolbar.hide();
            return;
          }
          lastRange = range.cloneRange();
        });
      },
      { capture: true, signal }
    );
    document.addEventListener(
      "mouseup",
      (e) => {
        lastPointer = { x: e.clientX, y: e.clientY, ts: Date.now() };
        const range = getValidSelectionRange(toolbar);
        if (!range) {
          if (toolbar.isVisible()) return;
          toolbar.hide();
          return;
        }
        lastRange = range.cloneRange();
        toolbar.showNearRange(lastRange, lastPointer);
      },
      { capture: true, signal }
    );
    document.addEventListener(
      "keyup",
      (e) => {
        if (!["Shift", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
          return;
        }
        const range = getValidSelectionRange(toolbar);
        if (!range) {
          if (toolbar.isVisible()) return;
          toolbar.hide();
          return;
        }
        lastRange = range.cloneRange();
        toolbar.showNearRange(lastRange, null);
      },
      { capture: true, signal }
    );
    document.addEventListener(
      "mousedown",
      (e) => {
        if (toolbar.isEventInsideUI(e.target)) return;
        toolbar.hide();
      },
      { capture: true, signal }
    );
  }
  function detachListeners() {
    enableBurstToken++;
    if (raf) {
      cancelAnimationFrame(raf);
      raf = null;
    }
    aborter?.abort?.();
    aborter = null;
  }
  function initHighlightsOnce() {
    if (initedOnce) return;
    initedOnce = true;
    toolbar = createHighlightToolbar({
      onHighlight: async () => {
        const res = await createAndApplyHighlight({ pinned: false });
        if (res?.keepOpen) {
          showToolbarStatus(res.message || "Cannot highlight");
          return;
        }
        toolbar.clearStatus();
        toolbar.hide();
      },
      onPin: async () => {
        const res = await pinSelection();
        if (res?.keepOpen) {
          showToolbarStatus(res.message || "Cannot pin");
          return;
        }
        toolbar.clearStatus();
        toolbar.hide();
      },
      onRemove: async () => {
        const res = await removeSelectionHighlights();
        if (res?.keepOpen) {
          showToolbarStatus(res.message || "Nothing to remove");
          return;
        }
        toolbar.clearStatus();
        toolbar.hide();
      }
    });
    toolbar.hide();
    setToolbarPinVisible(pinsEnabled);
    scheduleRestoreWithRetries();
  }
  async function setPinsEnabled(enabled) {
    pinsEnabled = Boolean(enabled);
    if (pinsEnabled) {
      try {
        initPinsPanel();
      } catch {
      }
    }
    setToolbarPinVisible(pinsEnabled);
    if (!pinsEnabled) {
      removeAllPinMarkersFromDom();
      closePinsPanel();
      return { ok: true, enabled: false };
    }
    if (hlEnabled) {
      await syncHighlightsFromStore().catch(() => {
      });
    }
    return { ok: true, enabled: true };
  }
  async function setHighlightsEnabled(enabled) {
    const next = Boolean(enabled);
    if (hlEnabled === next) return { ok: true, enabled: hlEnabled };
    if (!next) {
      await setPinsEnabled(false).catch(() => {
      });
      hlEnabled = false;
      detachListeners();
      toolbar?.hide?.();
      lastRange = null;
      lastPointer = null;
      clearSelection();
      removeAllHighlightsFromDom();
      closePinsPanel();
      return { ok: true, enabled: false };
    }
    hlEnabled = true;
    initHighlightsOnce();
    setToolbarPinVisible(pinsEnabled);
    attachListeners();
    scheduleEnableSyncBurst();
    return { ok: true, enabled: true };
  }
  async function createAndApplyHighlight({ pinned }) {
    if (!hlEnabled) return { keepOpen: true, message: "Highlights are disabled" };
    if (!lastRange) return { keepOpen: true, message: "No selection" };
    const r = lastRange.cloneRange();
    if (getHighlightIdsInRange(r).length > 0) {
      return {
        keepOpen: true,
        message: "Already highlighted. Use Pin/Remove."
      };
    }
    const anchor = makeAnchor(r);
    const exact = anchor?.quote?.exact || "";
    if (exact.trim().length === 0) {
      return { keepOpen: true, message: "Empty selection" };
    }
    const pageUrl = getPageUrl();
    const created = await createHighlight({
      pageUrl,
      color: "yellow",
      anchor,
      pinned: Boolean(pinned),
      noteText: ""
    });
    if (!created?.ok || !created?.highlight?.id) {
      console.warn("[highlights] create failed:", created?.error);
      return { keepOpen: true, message: "Create failed" };
    }
    const highlightId = created.highlight.id;
    applyHighlight(r, highlightId);
    if (pinned && pinsEnabled) {
      renderPinMarker(highlightId);
      openPinsPanel({ focusId: highlightId });
    }
    lastRange = null;
    clearSelection();
    return { keepOpen: false };
  }
  function getClosestHighlightMark(node) {
    if (!node) return null;
    const el2 = node.nodeType === 1 ? node : node.parentElement;
    if (!el2) return null;
    const sel = `mark.${HIGHLIGHT_CLASS}[data-hid]`;
    if (el2.matches?.(sel)) return el2;
    return el2.closest?.(sel) || null;
  }
  function getMarksInRange(range) {
    if (!range) return [];
    const ancestor = range.commonAncestorContainer?.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer?.parentElement;
    const root = ancestor || document.body;
    const selector = `mark.${HIGHLIGHT_CLASS}[data-hid]`;
    const marks = Array.from(root.querySelectorAll(selector));
    if (root.matches?.(selector)) marks.push(root);
    const m1 = getClosestHighlightMark(range.startContainer);
    const m2 = getClosestHighlightMark(range.endContainer);
    if (m1) marks.push(m1);
    if (m2) marks.push(m2);
    const hit = [];
    const seen = /* @__PURE__ */ new Set();
    for (const m of marks) {
      const id = m?.getAttribute?.("data-hid");
      if (!id || seen.has(id)) continue;
      try {
        if (range.intersectsNode(m)) {
          hit.push(m);
          seen.add(id);
        }
      } catch {
      }
    }
    return hit;
  }
  function getHighlightIdsInRange(range) {
    const marks = getMarksInRange(range);
    const ids = marks.map((m) => m.getAttribute("data-hid")).filter(Boolean);
    return Array.from(new Set(ids));
  }
  async function getStoredHighlightById(pageUrl, id) {
    const res = await listHighlights({ pageUrl });
    if (!res?.ok) return null;
    const list = Array.isArray(res.highlights) ? res.highlights : [];
    return list.find((h) => h?.id === id) || null;
  }
  async function pinSelection() {
    if (!hlEnabled) return { keepOpen: true, message: "Highlights are disabled" };
    if (!pinsEnabled) return { keepOpen: true, message: "Pins are disabled" };
    if (!lastRange) return { keepOpen: true, message: "No selection" };
    const r = lastRange.cloneRange();
    const pageUrl = getPageUrl();
    const ids = getHighlightIdsInRange(r);
    if (ids.length > 1) {
      return { keepOpen: true, message: "Multiple highlights selected" };
    }
    if (ids.length === 1) {
      const id = ids[0];
      const stored = await getStoredHighlightById(pageUrl, id);
      const nextPinned = !Boolean(stored?.pinned);
      const patched = await patchHighlight({
        pageUrl,
        id,
        patch: { pinned: nextPinned }
      });
      if (!patched?.ok) {
        console.warn("[highlights] pin patch failed:", patched?.error);
        return { keepOpen: true, message: "Pin failed" };
      }
      await syncHighlightsFromStore();
      if (nextPinned) openPinsPanel({ focusId: id });
      lastRange = null;
      clearSelection();
      return { keepOpen: false };
    }
    return await createAndApplyHighlight({ pinned: true });
  }
  async function removeSelectionHighlights() {
    if (!hlEnabled) return { keepOpen: true, message: "Highlights are disabled" };
    if (!lastRange) return { keepOpen: true, message: "No selection" };
    const r = lastRange.cloneRange();
    const pageUrl = getPageUrl();
    const ids = getHighlightIdsInRange(r);
    if (ids.length === 0) {
      return { keepOpen: true, message: "No highlight found in selection" };
    }
    for (const id of ids) {
      const res = await deleteHighlight({ pageUrl, id });
      if (!res?.ok) {
        console.warn("[highlights] delete failed:", id, res?.error);
        continue;
      }
      unwrapHighlightMarks3(id);
      removePinMarker(id);
    }
    await syncHighlightsFromStore();
    lastRange = null;
    clearSelection();
    return { keepOpen: false };
  }
  function hasHighlightAlready(id) {
    if (!id) return false;
    return Boolean(
      document.querySelector(`mark.${HIGHLIGHT_CLASS}[data-hid="${CSS.escape(id)}"]`)
    );
  }
  function compareRanges(a, b) {
    const ar = a.range;
    const br = b.range;
    if (ar.startContainer === br.startContainer) {
      return ar.startOffset - br.startOffset;
    }
    const pos = ar.startContainer.compareDocumentPosition(br.startContainer);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  }
  async function syncHighlightsFromStore() {
    if (!hlEnabled) return { ok: true, skipped: true };
    const pageUrl = getPageUrl();
    const res = await listHighlights({ pageUrl });
    if (!res?.ok) return { ok: false, error: res?.error || "list failed" };
    const list = Array.isArray(res.highlights) ? res.highlights : [];
    const byId = /* @__PURE__ */ new Map();
    for (const h of list) {
      if (h?.id) byId.set(h.id, h);
    }
    const existingIds = listExistingHighlightIds();
    for (const id of existingIds) {
      if (!byId.has(id)) {
        unwrapHighlightMarks3(id);
        removePinMarker(id);
      }
    }
    const planned = [];
    for (const h of list) {
      const id = h?.id;
      if (!id || hasHighlightAlready(id)) continue;
      const r = restoreRange(h?.anchor);
      if (r) planned.push({ id, range: r.cloneRange() });
    }
    planned.sort(compareRanges);
    for (let i = planned.length - 1; i >= 0; i--) {
      const item = planned[i];
      if (hasHighlightAlready(item.id)) continue;
      applyHighlight(item.range, item.id);
    }
    for (const h of list) {
      const id = h?.id;
      if (!id) continue;
      if (pinsEnabled && h?.pinned) renderPinMarker(id);
      else removePinMarker(id);
    }
    return { ok: true, total: list.length, applied: planned.length };
  }
  function scheduleRestoreWithRetries() {
    const delays = [0, 250, 1e3, 2500, 5e3];
    delays.forEach((ms) => {
      setTimeout(async () => {
        try {
          await syncHighlightsFromStore();
        } catch (e) {
          console.warn("[hl] restore failed:", e);
        }
      }, ms);
    });
    window.addEventListener(
      "load",
      () => {
        setTimeout(() => syncHighlightsFromStore().catch(() => {
        }), 0);
      },
      { once: true }
    );
  }
  function getValidSelectionRange(toolbarApi) {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return null;
    if (sel.isCollapsed) return null;
    const text = sel.toString();
    if (!text || text.trim().length === 0) return null;
    const range = sel.getRangeAt(0);
    const sc = range.startContainer;
    const ec = range.endContainer;
    const sp = sc?.nodeType === 1 ? sc : sc?.parentElement;
    const ep = ec?.nodeType === 1 ? ec : ec?.parentElement;
    if (toolbarApi.isEventInsideUI(sp) || toolbarApi.isEventInsideUI(ep)) return null;
    if (isInsideNoTextUI(sp) || isInsideNoTextUI(ep)) return null;
    if (isInsideEditable(sp) || isInsideEditable(ep)) return null;
    return range;
  }
  function isInsideNoTextUI(el2) {
    return Boolean(el2?.closest?.(`[${UI_ATTR}]`));
  }
  function isInsideEditable(el2) {
    if (!el2) return false;
    return Boolean(
      el2.closest?.("input, textarea, [contenteditable='true'], [contenteditable='']")
    );
  }

  // core/kernel/contentKernel.js
  var SETTINGS_KEY = "settings";
  function sendMessagePromise2(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) return resolve(null);
        resolve(response);
      });
    });
  }
  async function loadSettingsOnce() {
    const res = await sendMessagePromise2({
      type: MessageTypes.SETTINGS_GET,
      payload: {}
    });
    if (res?.ok && res.settings) return normalizeSettings(res.settings);
    return normalizeSettings(DEFAULT_SETTINGS);
  }
  async function fetchHasNote(origin) {
    const bRes = await sendMessagePromise2({
      type: MessageTypes.BADGE_STATUS_GET,
      payload: { origin }
    });
    if (bRes?.ok && typeof bRes.hasNote === "boolean") return bRes.hasNote;
    return false;
  }
  function computeHasNoteFromStorageValue(v) {
    const text = typeof v === "string" ? v : "";
    return text.trim().length > 0;
  }
  function applyThemeToRoot(theme) {
    const t = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = t;
  }
  async function initContentKernel() {
    console.log("Hello from Content Script on:", window.location.href);
    const origin = window.location.origin;
    let settings = await loadSettingsOnce();
    applyThemeToRoot(settings.theme);
    const badgeEnabled = isBadgeEnabledForOrigin(settings, origin);
    setBadgeEnabledForThisSite(badgeEnabled);
    try {
      await setPinsEnabled(Boolean(settings.modules?.pins));
    } catch (e) {
      console.warn("setPinsEnabled crashed:", e);
    }
    try {
      await setHighlightsEnabled(Boolean(settings.modules?.highlights));
    } catch (e) {
      console.warn("setHighlightsEnabled crashed:", e);
    }
    if (settings.modules?.badge && badgeEnabled) {
      ensureBadge();
      setBadgeVisible(false);
      const hasNote = await fetchHasNote(origin);
      setBadgeVisible(hasNote);
    } else {
      setBadgeVisible(false);
    }
    if (chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") return;
        if (changes[SETTINGS_KEY]) {
          const prevHighlights = Boolean(settings.modules?.highlights);
          const prevPins = Boolean(settings.modules?.pins);
          const nextRaw = changes[SETTINGS_KEY].newValue;
          const next = normalizeSettings(nextRaw || DEFAULT_SETTINGS);
          settings = next;
          applyThemeToRoot(settings.theme);
          const enabledNow = isBadgeEnabledForOrigin(settings, origin);
          setBadgeEnabledForThisSite(enabledNow);
          if (settings.modules?.badge && enabledNow) {
            ensureBadge();
            if (changes[origin]) {
              setBadgeVisible(
                computeHasNoteFromStorageValue(changes[origin].newValue)
              );
            } else {
              void (async () => {
                const hasNote = await fetchHasNote(origin);
                setBadgeVisible(hasNote);
              })();
            }
          } else {
            setBadgeVisible(false);
          }
          const nextHighlights = Boolean(settings.modules?.highlights);
          const nextPins = Boolean(settings.modules?.pins);
          void (async () => {
            try {
              if (prevPins !== nextPins) {
                await setPinsEnabled(nextPins);
              }
              if (prevHighlights !== nextHighlights) {
                await setHighlightsEnabled(nextHighlights);
              }
            } catch (e) {
              console.warn("Live gating failed:", e);
            }
          })();
        }
        if (changes[origin]) {
          const enabledNow = isBadgeEnabledForOrigin(settings, origin);
          if (!settings.modules?.badge || !enabledNow) return;
          ensureBadge();
          setBadgeVisible(computeHasNoteFromStorageValue(changes[origin].newValue));
        }
      });
    }
    async function handleMessage(message) {
      if (!message || typeof message !== "object") return;
      const { type, payload } = message;
      switch (type) {
        case ContentEventTypes.BADGE_SET: {
          if (!settings.modules?.badge) return;
          if (!isBadgeEnabledForOrigin(settings, origin)) return;
          ensureBadge();
          setBadgeVisible(Boolean(payload?.hasNote));
          break;
        }
        case ContentEventTypes.BADGE_ENABLED_SET: {
          const enabled = Boolean(payload?.enabled);
          setBadgeEnabledForThisSite(enabled);
          if (!enabled) {
            setBadgeVisible(false);
            return;
          }
          if (!settings.modules?.badge) return;
          ensureBadge();
          const hasNote = await fetchHasNote(origin);
          setBadgeVisible(hasNote);
          break;
        }
        case ContentEventTypes.HIGHLIGHTS_UPDATED: {
          if (!settings.modules?.highlights) return;
          try {
            await syncHighlightsFromStore();
          } catch (e) {
            console.warn("syncHighlightsFromStore failed:", e);
          }
          if (settings.modules?.pins) {
            try {
              await refreshPinsPanel();
            } catch (e) {
              console.warn("refreshPinsPanel failed:", e);
            }
          }
          break;
        }
      }
    }
    chrome.runtime.onMessage.addListener((message) => {
      void handleMessage(message).catch(
        (e) => console.warn("Content handleMessage failed:", e)
      );
    });
  }

  // core/content/index.js
  void initContentKernel();
})();
