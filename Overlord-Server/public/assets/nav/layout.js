import { NAV_MODE_KEY } from "./template.js";

const LS_KEY = "sb_collapsed";
const NAV_HIDDEN_KEY = "nav_hidden";
const MOBILE_BP = 768;

/* ──────────────────────────────────────────────
   NAV HIDE / REVEAL — shared across both modes
   ────────────────────────────────────────────── */

function createNavHideController() {
  let hidden = localStorage.getItem(NAV_HIDDEN_KEY) === "true";

  // Create reveal button (injected into body)
  const revealBtn = document.createElement("button");
  revealBtn.id = "nav-reveal-btn";
  revealBtn.setAttribute("aria-label", "Show navigation");
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || "");
  revealBtn.dataset.tooltip = `Show nav  ${isMac ? "⌘" : "Ctrl"}+\\`;
  revealBtn.innerHTML = '<i class="fa-solid fa-angles-right" style="font-size:0.65rem"></i>';
  document.body.appendChild(revealBtn);

  function setHidden(val) {
    hidden = val;
    localStorage.setItem(NAV_HIDDEN_KEY, String(val));
    document.body.classList.toggle("nav-hidden", val);
  }

  function toggle() {
    setHidden(!hidden);
  }

  // Apply persisted state
  if (hidden) document.body.classList.add("nav-hidden");

  // Click the reveal button → show nav
  revealBtn.addEventListener("click", () => { if (hidden) setHidden(false); });

  // Keyboard shortcut: Ctrl+\ (or Cmd+\ on Mac)
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "\\") {
      e.preventDefault();
      toggle();
    }
  });

  return { toggle, isHidden: () => hidden, setHidden };
}

/* ──────────────────────────────────────────────
   TOPBAR DROPDOWN LOGIC
   ────────────────────────────────────────────── */

function initDropdowns(navLinks) {
  if (!navLinks) return;

  let activeDropdown = null;

  function closeAll() {
    if (activeDropdown) {
      const btn = activeDropdown._activeBtn || activeDropdown.querySelector(".nav-dd-group-btn, .user-actions-trigger");
      const menu = activeDropdown.querySelector(".nav-dd-menu");
      if (btn) btn.setAttribute("aria-expanded", "false");
      if (menu) menu.classList.remove("nav-dd-open");
      activeDropdown._activeBtn = null;
      activeDropdown = null;
    }
  }

  navLinks.addEventListener("click", (e) => {
    // If clicking a dropdown menu item (actual link), let it navigate normally
    const item = e.target.closest(".nav-dd-item");
    if (item) {
      closeAll();
      return; // Don't prevent default — let the link navigate
    }

    const wrapper = e.target.closest(".nav-dd-wrapper");
    if (!wrapper) {
      closeAll();
      return;
    }
    const menu = wrapper.querySelector(".nav-dd-menu");
    const btn = wrapper.querySelector(".nav-dd-group-btn, .user-actions-trigger");
    if (!menu || !btn) return;

    e.preventDefault();
    e.stopPropagation();

    if (activeDropdown === wrapper) {
      closeAll();
    } else {
      closeAll();
      btn.setAttribute("aria-expanded", "true");
      menu.classList.add("nav-dd-open");
      activeDropdown = wrapper;
      activeDropdown._activeBtn = btn;
    }
  });

  // Close on outside click
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".nav-dd-wrapper")) {
      closeAll();
    }
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAll();
  });
}

/* ──────────────────────────────────────────────
   NOTIFY BADGE MIRROR (utility dropdown)
   ────────────────────────────────────────────── */

function initNotifyBadgeMirror(scope) {
  if (!scope) return;
  const badge = scope.querySelector("#notify-badge");
  const dot = scope.querySelector("#user-actions-dot");
  if (!badge || !dot) return;

  const sync = () => {
    const visible = !badge.classList.contains("hidden");
    dot.classList.toggle("hidden", !visible);
  };

  sync();
  new MutationObserver(sync).observe(badge, {
    attributes: true,
    attributeFilter: ["class"],
  });
}

/* ──────────────────────────────────────────────
   SIDEBAR TREE EXPAND / COLLAPSE
   ────────────────────────────────────────────── */

function initSidebarTree(navLinks) {
  if (!navLinks) return;

  navLinks.addEventListener("click", (e) => {
    const groupBtn = e.target.closest(".sb-group-btn");
    if (!groupBtn) return;

    const group = groupBtn.closest(".sb-group");
    if (!group) return;

    const children = group.querySelector(".sb-group-children");
    const chevron = groupBtn.querySelector(".sb-chevron");
    if (!children) return;

    const expanded = groupBtn.getAttribute("aria-expanded") === "true";
    groupBtn.setAttribute("aria-expanded", String(!expanded));
    children.classList.toggle("sb-group-open", !expanded);
    if (chevron) {
      chevron.classList.toggle("sb-chevron-open", !expanded);
    }
  });
}

/* ──────────────────────────────────────────────
   TOPBAR CONTROLLER (adaptive layout)
   ────────────────────────────────────────────── */

function createTopbarController(host, refs) {
  const { panel, navLinks, navUtility } = refs;
  if (!panel || !navLinks || !navUtility) {
    return { applyAdaptiveNavLayout: () => {} };
  }

  // Dropdowns + notify-badge mirror; layout itself is pure CSS now.
  initDropdowns(navLinks);
  initDropdowns(navUtility);
  initNotifyBadgeMirror(navUtility);

  host.dataset.navMode = "desktop";
  return { applyAdaptiveNavLayout: () => {} };
}

/* ──────────────────────────────────────────────
   SIDEBAR CONTROLLER
   ────────────────────────────────────────────── */

function createSidebarController(host, refs) {
  const { collapseBtn, toggle, panel } = refs;
  const backdrop = document.getElementById("sb-backdrop");
  const navLinks = document.getElementById("nav-links");

  document.body.classList.add("sb-ready");

  // Init sidebar tree
  if (navLinks) initSidebarTree(navLinks);

  let collapsed = localStorage.getItem(LS_KEY) === "true";
  if (collapsed) document.body.classList.add("sb-collapsed");

  function setCollapsed(val) {
    collapsed = val;
    localStorage.setItem(LS_KEY, String(val));
    document.body.classList.toggle("sb-collapsed", val);
  }

  function isMobile() { return window.innerWidth < MOBILE_BP; }
  function openMobile() { document.body.classList.add("sb-open"); }
  function closeMobile() { document.body.classList.remove("sb-open"); }

  if (collapseBtn) {
    collapseBtn.addEventListener("click", () => {
      if (!isMobile()) setCollapsed(!collapsed);
    });
  }
  if (toggle) toggle.addEventListener("click", openMobile);
  if (backdrop) backdrop.addEventListener("click", closeMobile);
  window.addEventListener("resize", () => { if (!isMobile()) closeMobile(); });

  return { applyAdaptiveNavLayout: () => {} };
}

export function createAdaptiveNavController(host, refs) {
  const mode = localStorage.getItem(NAV_MODE_KEY);
  const navCtrl = mode === "sidebar"
    ? createSidebarController(host, refs)
    : createTopbarController(host, refs);

  const hideCtrl = createNavHideController();

  return {
    applyAdaptiveNavLayout: navCtrl.applyAdaptiveNavLayout,
    navHide: hideCtrl,
  };
}

