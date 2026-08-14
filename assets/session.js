(() => {
  const API_BASE = "https://api.augurxrpl.com";
  const WALLET_KEY = "augurSubscriberWallet";
  const PLAN_KEY = "augurAccessPlan";
  const STATUS_KEY = "augurAccessStatus";
  const LAST_REPORT_KEY = "augurLastReportWallet";

  function getWallet() {
    return (
      localStorage.getItem(WALLET_KEY) ||
      sessionStorage.getItem(WALLET_KEY) ||
      ""
    ).trim();
  }

  function getPlan() {
    return (
      localStorage.getItem(PLAN_KEY) ||
      sessionStorage.getItem(PLAN_KEY) ||
      "free"
    ).toLowerCase();
  }

  function getStatus() {
    return (
      localStorage.getItem(STATUS_KEY) ||
      sessionStorage.getItem(STATUS_KEY) ||
      "disconnected"
    ).toLowerCase();
  }

  function saveSession(wallet, plan, status) {
    const values = {
      [WALLET_KEY]: wallet,
      [PLAN_KEY]: plan,
      [STATUS_KEY]: status
    };

    for (const [key, value] of Object.entries(values)) {
      localStorage.setItem(key, value);
      sessionStorage.setItem(key, value);
    }
  }

  function clearSession() {
    [
      WALLET_KEY,
      PLAN_KEY,
      STATUS_KEY,
      LAST_REPORT_KEY
    ].forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
  }

  function shortWallet(wallet) {
    if (!wallet || wallet.length < 14) return wallet || "";
    return `${wallet.slice(0, 6)}…${wallet.slice(-5)}`;
  }

  function titlePlan(plan) {
    const value = String(plan || "free").toLowerCase();
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  async function resolveAccess(wallet) {
    const res = await fetch(
      `${API_BASE}/api/subscription/status?wallet=${encodeURIComponent(wallet)}`,
      { headers: { Accept: "application/json" } }
    );

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.ok) {
      const plan = String(data.planCode || "free").toLowerCase();
      const active = data.active === true;
      return {
        wallet,
        plan: active ? plan : "free",
        status: active ? "active" : "inactive",
        active,
        data
      };
    }

    if (res.status === 404 || res.status === 403) {
      return {
        wallet,
        plan: "free",
        status: "free",
        active: false,
        data: null
      };
    }

    throw new Error(data.error || data.message || "Unable to verify AUGUR access.");
  }

  async function connectWallet(wallet) {
    const clean = String(wallet || "").trim();

    if (!clean) {
      throw new Error("Enter an XRPL wallet address.");
    }

    if (!clean.startsWith("r") || clean.length < 25) {
      throw new Error("Enter a valid XRPL wallet address.");
    }

    const access = await resolveAccess(clean);

    saveSession(clean, access.plan, access.status);

    window.dispatchEvent(
      new CustomEvent("augur-session-changed", { detail: access })
    );

    return access;
  }

  function disconnectWallet() {
    clearSession();

    window.dispatchEvent(
      new CustomEvent("augur-session-changed", {
        detail: {
          wallet: "",
          plan: "free",
          status: "disconnected",
          active: false
        }
      })
    );

    renderGlobalSession();
  }

  function makeButton(text, onClick, primary = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.style.border = primary
      ? "1px solid rgba(87,166,255,.48)"
      : "1px solid rgba(118,156,228,.18)";
    button.style.background = primary
      ? "linear-gradient(180deg,rgba(40,111,221,.92),rgba(24,73,157,.92))"
      : "rgba(255,255,255,.04)";
    button.style.color = "#eef4ff";
    button.style.minHeight = "36px";
    button.style.padding = "0 12px";
    button.style.borderRadius = "10px";
    button.style.fontSize = "11px";
    button.style.fontWeight = "900";
    button.style.letterSpacing = ".06em";
    button.style.cursor = "pointer";
    button.addEventListener("click", onClick);
    return button;
  }

  function createSessionControl(mobile = false) {
    const wrap = document.createElement("div");
    wrap.className = "augur-global-session";
    wrap.style.display = "flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "8px";
    wrap.style.flexWrap = "wrap";

    if (mobile) {
      wrap.style.width = "100%";
      wrap.style.marginTop = "8px";
    } else {
      wrap.style.marginLeft = "8px";
    }

    return wrap;
  }

  async function promptConnect() {
    const existing = getWallet();
    const wallet = window.prompt(
      "Enter the XRPL wallet you use as your AUGUR access wallet:",
      existing
    );

    if (wallet === null) return;

    try {
      const access = await connectWallet(wallet);
      renderGlobalSession();

      if (location.pathname.startsWith("/account")) {
        const input = document.getElementById("walletInput");
        if (input) input.value = access.wallet;
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Unable to connect wallet.");
    }
  }

  function renderGlobalSession() {
    document.querySelectorAll(".augur-global-session").forEach((node) => node.remove());

    const wallet = getWallet();
    const plan = getPlan();

    function populateControl(control) {
      if (!wallet) {
        control.appendChild(
          makeButton("CONNECT WALLET", promptConnect, true)
        );
        return;
      }

      const identity = document.createElement("a");
      identity.href = "/account/";
      identity.textContent = `${titlePlan(plan)} · ${shortWallet(wallet)}`;
      identity.style.color = "#9fc9ff";
      identity.style.textDecoration = "none";
      identity.style.fontSize = "11px";
      identity.style.fontWeight = "900";
      identity.style.letterSpacing = ".05em";
      identity.style.whiteSpace = "nowrap";
      control.appendChild(identity);

      control.appendChild(
        makeButton("DISCONNECT", () => {
          disconnectWallet();
          if (location.pathname.startsWith("/hub")) {
            location.href = "/account/";
          } else {
            location.reload();
          }
        })
      );
    }

    document.querySelectorAll(".nav-links").forEach((nav) => {
      const control = createSessionControl(false);
      populateControl(control);
      nav.appendChild(control);
    });

    document.querySelectorAll(".mobile-nav").forEach((nav) => {
      const control = createSessionControl(true);
      populateControl(control);
      nav.appendChild(control);
    });

    document.documentElement.dataset.augurWallet = wallet;
    document.documentElement.dataset.augurPlan = plan;

    const accountInput = document.getElementById("walletInput");
    if (
      wallet &&
      accountInput &&
      location.pathname.startsWith("/account") &&
      !accountInput.value
    ) {
      accountInput.value = wallet;
    }
  }

  async function refreshExistingSession() {
    const wallet = getWallet();
    if (!wallet) {
      renderGlobalSession();
      return;
    }

    try {
      const access = await resolveAccess(wallet);
      saveSession(wallet, access.plan, access.status);
    } catch (err) {
      console.warn("AUGUR session refresh failed:", err);
    }

    renderGlobalSession();
  }

  window.AUGUR_SESSION = {
    getWallet,
    getPlan,
    getStatus,
    connectWallet,
    disconnectWallet,
    resolveAccess,
    refresh: refreshExistingSession
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refreshExistingSession);
  } else {
    refreshExistingSession();
  }
})();
