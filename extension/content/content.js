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
    HIGHLIGHTS_CLEAR_PAGE: "HIGHLIGHTS_CLEAR_PAGE"
  });
  var ContentEventTypes = Object.freeze({
    // Badge events -> content
    BADGE_SET: "BADGE_SET",
    BADGE_ENABLED_SET: "BADGE_ENABLED_SET"
  });

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
  function isBadgeEnabledForThisSite() {
    return enabledForThisSite;
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
    const el = ensureBadge();
    if (!el) return;
    const visible = Boolean(hasNote);
    el.style.display = visible ? "block" : "none";
    el.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  // core/content/init.js
  function sendMessagePromise(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) return resolve(null);
        resolve(response);
      });
    });
  }
  function isBadgeEnabledForOrigin(settings, origin) {
    const badge = settings?.badge;
    const globalEnabled = badge?.globalEnabled !== false;
    const disabled = Array.isArray(badge?.disabledOrigins) ? badge.disabledOrigins : [];
    return globalEnabled && !disabled.includes(origin);
  }
  async function initBadgeFromBackground() {
    const origin = window.location.origin;
    const sRes = await sendMessagePromise({
      type: MessageTypes.SETTINGS_GET,
      payload: {}
    });
    const settings = sRes?.ok ? sRes.settings : null;
    const enabled = isBadgeEnabledForOrigin(settings, origin);
    setBadgeEnabledForThisSite(enabled);
    if (!enabled) return;
    ensureBadge();
    setBadgeVisible(false);
    const bRes = await sendMessagePromise({
      type: MessageTypes.BADGE_STATUS_GET,
      payload: { origin }
    });
    if (bRes?.ok && typeof bRes.hasNote === "boolean") {
      setBadgeVisible(bRes.hasNote);
    }
  }

  // core/content/highlights/anchor.js
  var UI_ATTR = "data-notextension-ui";
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
  function getXPathForElement(el) {
    if (el === document.documentElement) return "/html";
    const segments = [];
    let node = el;
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
  function sendMessagePromise2(message) {
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
    return sendMessagePromise2({
      type: MessageTypes.HIGHLIGHTS_LIST,
      payload: { pageUrl }
    });
  }
  function createHighlight({ pageUrl, color, anchor }) {
    return sendMessagePromise2({
      type: MessageTypes.HIGHLIGHT_CREATE,
      payload: { pageUrl, color, anchor }
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
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    return Boolean(el?.closest?.(`[${UI_ATTR2}]`));
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

  // core/content/highlights/index.js
  var UI_ATTR3 = "data-notextension-ui";
  var TOOLBAR_ID = "notext-hl-toolbar";
  var STYLE_ID = "notext-hl-style";
  var HIGHLIGHT_CLASS = "notext-highlight";
  var Z_INDEX2 = 2147483647;
  var lastRange = null;
  var lastPointer = null;
  function initHighlights() {
    ensureStyle();
    scheduleRestoreWithRetries();
    const toolbar = ensureToolbar(async () => {
      if (!lastRange) return;
      const r = lastRange.cloneRange();
      const anchor = makeAnchor(r);
      const exact = anchor?.quote?.exact || "";
      if (exact.trim().length === 0) return;
      const pageUrl = getPageUrl();
      const created = await createHighlight({
        pageUrl,
        color: "yellow",
        anchor
      });
      if (!created?.ok || !created?.highlight?.id) {
        console.warn("[highlights] create failed:", created?.error);
        return;
      }
      const highlightId = created.highlight.id;
      applyHighlight(r, highlightId);
      hideToolbar();
      const sel = window.getSelection?.();
      sel?.removeAllRanges();
    });
    function hideToolbar() {
      toolbar.style.display = "none";
    }
    let raf = null;
    document.addEventListener(
      "selectionchange",
      () => {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          raf = null;
          const range = getValidSelectionRange();
          if (!range) {
            lastRange = null;
            hideToolbar();
            return;
          }
          lastRange = range.cloneRange();
        });
      },
      true
    );
    document.addEventListener(
      "mouseup",
      (e) => {
        lastPointer = { x: e.clientX, y: e.clientY, ts: Date.now() };
        const range = getValidSelectionRange();
        if (!range) {
          hideToolbar();
          return;
        }
        lastRange = range.cloneRange();
        showToolbarSmart(lastRange, lastPointer);
      },
      true
    );
    document.addEventListener(
      "keyup",
      (e) => {
        if (!["Shift", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
          e.key
        ))
          return;
        const range = getValidSelectionRange();
        if (!range) {
          hideToolbar();
          return;
        }
        lastRange = range.cloneRange();
        showToolbarSmart(lastRange, null);
      },
      true
    );
    document.addEventListener(
      "mousedown",
      (e) => {
        const target = e.target;
        if (isInsideToolbar(target)) return;
        hideToolbar();
      },
      true
    );
    hideToolbar();
  }
  function hasHighlightAlready(id) {
    if (!id) return false;
    return Boolean(document.querySelector(`mark.${HIGHLIGHT_CLASS}[data-hid="${CSS.escape(id)}"]`));
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
  async function restoreAllOnce() {
    const pageUrl = getPageUrl();
    const res = await listHighlights({ pageUrl });
    console.log("[hl] restore pageUrl", pageUrl, res);
    if (!res?.ok) return { total: 0, restored: 0 };
    const list = Array.isArray(res.highlights) ? res.highlights : [];
    if (list.length === 0) return { total: 0, restored: 0 };
    const planned = [];
    for (const h of list) {
      const id = h?.id;
      if (!id || hasHighlightAlready(id)) continue;
      const r = restoreRange(h?.anchor);
      if (r) planned.push({ id, range: r.cloneRange() });
    }
    if (planned.length === 0) return { total: list.length, restored: 0 };
    planned.sort(compareRanges);
    let restored = 0;
    for (let i = planned.length - 1; i >= 0; i--) {
      const item = planned[i];
      if (hasHighlightAlready(item.id)) continue;
      applyHighlight(item.range, item.id);
      restored++;
    }
    return { total: list.length, restored };
  }
  function scheduleRestoreWithRetries() {
    const delays = [0, 250, 1e3, 2500, 5e3];
    delays.forEach((ms) => {
      setTimeout(async () => {
        try {
          const { total, restored } = await restoreAllOnce();
          if (total > 0) {
            console.log(`[hl] restore pass: restored ${restored}/${total}`);
          }
        } catch (e) {
          console.warn("[hl] restore failed:", e);
        }
      }, ms);
    });
    window.addEventListener(
      "load",
      () => {
        setTimeout(() => restoreAllOnce().catch(() => {
        }), 0);
      },
      { once: true }
    );
  }
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
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
    }

    #${TOOLBAR_ID} button {
      all: unset;
      cursor: pointer;
      padding: 6px 10px;
      border-radius: 8px;
      color: white;
      font: 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      background: rgba(255,255,255,0.10);
    }

    #${TOOLBAR_ID} button:hover {
      background: rgba(255,255,255,0.18);
    }

    mark.${HIGHLIGHT_CLASS} {
      background: #fde047;
      color: inherit;
      padding: 0 1px;
      border-radius: 2px;
    }
  `;
    (document.head || document.documentElement).appendChild(style);
  }
  function ensureToolbar(onClick) {
    let el = document.getElementById(TOOLBAR_ID);
    if (el) return el;
    el = document.createElement("div");
    el.id = TOOLBAR_ID;
    el.setAttribute(UI_ATTR3, "1");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Highlight";
    btn.setAttribute(UI_ATTR3, "1");
    btn.addEventListener("click", onClick);
    el.appendChild(btn);
    (document.body || document.documentElement).appendChild(el);
    return el;
  }
  function isInsideToolbar(target) {
    return Boolean(target?.closest?.(`#${TOOLBAR_ID}`));
  }
  function showToolbarSmart(range, pointer) {
    const el = document.getElementById(TOOLBAR_ID);
    if (!el) return;
    el.style.display = "block";
    const pad = 8;
    const w = el.offsetWidth || 80;
    const h = el.offsetHeight || 28;
    if (pointer && Date.now() - pointer.ts < 1500) {
      let left2 = pointer.x + 10;
      let top2 = pointer.y + 12;
      left2 = Math.max(pad, Math.min(left2, window.innerWidth - w - pad));
      top2 = Math.max(pad, Math.min(top2, window.innerHeight - h - pad));
      el.style.left = `${Math.round(left2)}px`;
      el.style.top = `${Math.round(top2)}px`;
      return;
    }
    const rect = getRectForRange(range);
    if (!rect) {
      el.style.display = "none";
      return;
    }
    let left = rect.left + rect.width / 2 - w / 2;
    let top = rect.bottom + pad;
    left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
    top = Math.max(pad, Math.min(top, window.innerHeight - h - pad));
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }
  function getRectForRange(range) {
    const rects = range.getClientRects?.();
    if (rects && rects.length > 0) return rects[0];
    const r = range.getBoundingClientRect?.();
    if (!r || r.width === 0 && r.height === 0) return null;
    return r;
  }
  function getValidSelectionRange() {
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
    if (isInsideNoTextUI(sp) || isInsideNoTextUI(ep)) return null;
    if (isInsideEditable(sp) || isInsideEditable(ep)) return null;
    return range;
  }
  function isInsideNoTextUI(el) {
    return Boolean(el?.closest?.(`[${UI_ATTR3}]`));
  }
  function isInsideEditable(el) {
    if (!el) return false;
    return Boolean(
      el.closest?.(
        "input, textarea, [contenteditable='true'], [contenteditable='']"
      )
    );
  }
  function applyHighlight(range, highlightId) {
    const id = highlightId;
    if (!id) return;
    const nodes = collectTextNodesInRange2(range);
    if (nodes.length === 0) return;
    const startNode = range.startContainer;
    const endNode = range.endContainer;
    for (const node of nodes) {
      const fullLen = node.nodeValue?.length ?? 0;
      if (fullLen === 0) continue;
      const isStart = node === startNode;
      const isEnd = node === endNode;
      const startOffset = isStart ? range.startOffset : 0;
      const endOffset = isEnd ? range.endOffset : fullLen;
      if (endOffset <= startOffset) continue;
      const slice = node.nodeValue.slice(startOffset, endOffset);
      if (slice.trim().length === 0) continue;
      wrapTextSlice(node, startOffset, endOffset, id);
    }
  }
  function collectTextNodesInRange2(range) {
    const ancestor = range.commonAncestorContainer;
    const root = ancestor.nodeType === 1 ? ancestor : ancestor.parentElement || document.body;
    const out = [];
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const value = node.nodeValue;
          if (!value || value.trim().length === 0) {
            return NodeFilter.FILTER_REJECT;
          }
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (parent.closest("script, style, noscript"))
            return NodeFilter.FILTER_REJECT;
          if (parent.closest(`[${UI_ATTR3}]`)) return NodeFilter.FILTER_REJECT;
          if (parent.closest(`mark.${HIGHLIGHT_CLASS}`))
            return NodeFilter.FILTER_REJECT;
          if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
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

  // core/content/index.js
  console.log("Hello from Content Script on:", window.location.href);
  function sendMessagePromise3(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) return resolve(null);
        resolve(response);
      });
    });
  }
  async function refreshHasNote() {
    const origin = window.location.origin;
    const bRes = await sendMessagePromise3({
      type: MessageTypes.BADGE_STATUS_GET,
      payload: { origin }
    });
    if (bRes?.ok && typeof bRes.hasNote === "boolean") {
      setBadgeVisible(bRes.hasNote);
    } else {
      setBadgeVisible(false);
    }
  }
  async function handleMessage(message) {
    if (!message || typeof message !== "object") return;
    const { type, payload } = message;
    switch (type) {
      case ContentEventTypes.BADGE_SET: {
        if (!isBadgeEnabledForThisSite()) return;
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
        await refreshHasNote();
        break;
      }
      default:
        break;
    }
  }
  initBadgeFromBackground();
  initHighlights();
  chrome.runtime.onMessage.addListener((message) => {
    handleMessage(message);
  });
})();
