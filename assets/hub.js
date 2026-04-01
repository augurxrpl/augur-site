(function () {
  "use strict";

  const qs = (sel) => document.querySelector(sel);

  const state = {
    wallet: "",
    tier: "unknown",
    active: false,
    expiry: "",
    rawStatus: null,
  };

  const el = {
    heroWallet: qs("#heroWallet"),
    heroTier: qs("#heroTier"),
    heroStatus: qs("#heroStatus"),
    heroExpiry: qs("#heroExpiry"),
    heroPill: qs("#heroPill"),
    hubAccessStatus: qs("#hubAccessStatus"),
    hubTierAccess: qs("#hubTierAccess"),
    walletInput: qs("#walletInput"),
    loadWalletBtn: qs("#loadWalletBtn"),
    runStarterBtn: qs("#runStarterBtn"),
    useWorkspaceWalletBtn: qs("#useWorkspaceWalletBtn"),

    metricClassification: qs("#metricClassification"),
    metricConfidence: qs("#metricConfidence"),
    metricActivity: qs("#metricActivity"),
    metricRisk: qs("#metricRisk"),
    metricStatementShort: qs("#metricStatementShort"),

    statementCard: qs("#statementCard"),
    balanceXrp: qs("#balanceXrp"),
    trustlineCount: qs("#trustlineCount"),
    ownerCount: qs("#ownerCount"),
    nftCount: qs("#nftCount"),
    blackholeTier: qs("#blackholeTier"),
    blackholeDetail: qs("#blackholeDetail"),
    signalsCard: qs("#signalsCard"),
    notesCard: qs("#notesCard"),
    holdingsBody: qs("#holdingsBody"),
    txBody: qs("#txBody"),
    starterErrorBox: qs("#starterErrorBox"),
    starterErrorText: qs("#starterErrorText"),

    proWorkspace: qs("#proWorkspace"),
    developerWorkspace: qs("#developerWorkspace"),
    proBadge: qs("#proBadge"),
    developerBadge: qs("#developerBadge"),
  };

  function getQueryWallet() {
    const params = new URLSearchParams(window.location.search);
    return (params.get("wallet") || params.get("address") || "").trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function shortWallet(wallet) {
    if (!wallet) return "Waiting for wallet";
    if (wallet.length < 12) return wallet;
    return `${wallet.slice(0, 8)}...${wallet.slice(-8)}`;
  }

  function tierRank(tier) {
    const t = String(tier || "").toLowerCase();
    if (t === "developer") return 3;
    if (t === "pro") return 2;
    if (t === "starter") return 1;
    return 0;
  }

  function setHero() {
    el.heroWallet.textContent = state.wallet || "Waiting for wallet";
    el.heroTier.textContent = state.tier ? capitalize(state.tier) : "Unknown";
    el.heroStatus.textContent = state.active ? "Active" : "Inactive";
    el.heroExpiry.textContent = state.expiry || "—";

    el.heroPill.className = "status-pill";
    if (state.active) {
      el.heroPill.classList.add("active");
      el.heroPill.textContent = `${capitalize(state.tier)} active`;
    } else if (state.wallet) {
      el.heroPill.classList.add("inactive");
      el.heroPill.textContent = "Inactive wallet";
    } else {
      el.heroPill.classList.add("warn");
      el.heroPill.textContent = "Wallet required";
    }

    el.hubAccessStatus.textContent = state.wallet
      ? `${shortWallet(state.wallet)} resolved. ${state.active ? "Paid access is active." : "No active paid access found."}`
      : "No wallet loaded yet.";

    el.hubTierAccess.textContent = state.active
      ? buildTierAccessText(state.tier)
      : "Starter, Pro, and Developer remain locked until a paid wallet is resolved.";
  }

  function buildTierAccessText(tier) {
    const t = String(tier || "").toLowerCase();
    if (t === "developer") {
      return "Developer wallet resolved. Starter, Pro, and Developer are all unlocked.";
    }
    if (t === "pro") {
      return "Pro wallet resolved. Starter and Pro are unlocked. Developer remains visible and locked.";
    }
    if (t === "starter") {
      return "Starter wallet resolved. Starter is unlocked. Pro and Developer remain visible and locked.";
    }
    return "Tier could not be resolved cleanly.";
  }

  function capitalize(str) {
    const value = String(str || "");
    if (!value) return "Unknown";
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function setModuleVisibility() {
    const rank = state.active ? tierRank(state.tier) : 0;

    el.proWorkspace.classList.remove("hidden");
    el.developerWorkspace.classList.remove("hidden");

    if (rank >= 2) {
      el.proBadge.textContent = "Unlocked";
      el.proBadge.className = "status-pill active";
    } else {
      el.proBadge.textContent = "Locked";
      el.proBadge.className = "status-pill warn";
    }

    if (rank >= 3) {
      el.developerBadge.textContent = "Unlocked";
      el.developerBadge.className = "status-pill active";
    } else {
      el.developerBadge.textContent = "Locked";
      el.developerBadge.className = "status-pill warn";
    }
  }

  function setLoadingState(isLoading) {
    el.runStarterBtn.disabled = isLoading;
    el.runStarterBtn.textContent = isLoading ? "Running..." : "Run Utility";
  }

  function setStarterError(message) {
    el.starterErrorText.textContent = message || "Unable to load paid wallet intelligence.";
    el.starterErrorBox.classList.remove("hidden");
  }

  function clearStarterError() {
    el.starterErrorBox.classList.add("hidden");
    el.starterErrorText.textContent = "";
  }

  function resetReportUI() {
    el.metricClassification.textContent = "—";
    el.metricConfidence.textContent = "Confidence —";
    el.metricActivity.textContent = "—";
    el.metricRisk.textContent = "—";
    el.metricStatementShort.textContent = "—";
    el.statementCard.textContent = "Run the utility to generate a wallet statement.";
    el.balanceXrp.textContent = "—";
    el.trustlineCount.textContent = "—";
    el.ownerCount.textContent = "—";
    el.nftCount.textContent = "—";
    el.blackholeTier.textContent = "—";
    el.blackholeDetail.textContent = "No result loaded yet.";
    el.signalsCard.textContent = "No signals loaded yet.";
    el.notesCard.textContent = "No additional notes loaded yet.";
    el.holdingsBody.innerHTML = `<tr><td colspan="4" class="muted">Run the utility to load token holdings.</td></tr>`;
    el.txBody.innerHTML = `<tr><td colspan="6" class="muted">Run the utility to load transaction breakdown.</td></tr>`;
  }

  function pick(obj, paths, fallback = "—") {
    for (const path of paths) {
      const parts = path.split(".");
      let cur = obj;
      let ok = true;
      for (const part of parts) {
        if (cur && Object.prototype.hasOwnProperty.call(cur, part)) {
          cur = cur[part];
        } else {
          ok = false;
          break;
        }
      }
      if (ok && cur !== undefined && cur !== null && cur !== "") return cur;
    }
    return fallback;
  }

  function formatNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value ?? "—");
    return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }

  function renderHoldings(items) {
    if (!Array.isArray(items) || !items.length) {
      el.holdingsBody.innerHTML = `<tr><td colspan="4" class="muted">No token holdings returned.</td></tr>`;
      return;
    }

    el.holdingsBody.innerHTML = items.map((item) => `
      <tr>
        <td>${escapeHtml(item.currency || "—")}</td>
        <td class="mono">${escapeHtml(item.issuer || "—")}</td>
        <td>${escapeHtml(formatNumber(item.balance))}</td>
        <td>${escapeHtml(formatNumber(item.limit ?? "—"))}</td>
      </tr>
    `).join("");
  }

  function renderTransactions(items) {
    if (!Array.isArray(items) || !items.length) {
      el.txBody.innerHTML = `<tr><td colspan="6" class="muted">No transaction breakdown returned.</td></tr>`;
      return;
    }

    el.txBody.innerHTML = items.slice(0, 50).map((item) => {
      const amount = item.amount !== undefined && item.amount !== null
        ? `${formatNumber(item.amount)} ${item.currency || ""}`.trim()
        : "—";

      return `
        <tr>
          <td>${escapeHtml(item.timestamp || "—")}</td>
          <td>${escapeHtml(item.type || "—")}</td>
          <td>${escapeHtml(item.result || "—")}</td>
          <td>${escapeHtml(amount)}</td>
          <td class="mono">${escapeHtml(item.counterparty || "—")}</td>
          <td>${escapeHtml(item.summary || "—")}</td>
        </tr>
      `;
    }).join("");
  }

  function renderReport(data) {
    const report = data && typeof data === "object" ? data : {};

    const classification = pick(report, [
      "classification",
      "classification.label",
      "report.classification",
      "report.classification.label"
    ]);

    const confidence = pick(report, [
      "confidence",
      "classification.confidence",
      "report.confidence",
      "report.classification.confidence"
    ]);

    const activity = pick(report, [
      "activity",
      "activity.label",
      "report.activity",
      "report.activity.label"
    ]);

    const risk = pick(report, [
      "risk",
      "risk.label",
      "risk.score",
      "report.risk",
      "report.risk.label",
      "report.risk.score"
    ]);

    const statement = pick(report, [
      "statement",
      "statement.text",
      "report.statement",
      "report.statement.text"
    ], "No statement returned.");

    const balanceXRP = pick(report, [
      "balanceXRP",
      "balanceXrp",
      "wallet.balanceXRP",
      "report.balanceXRP",
      "report.wallet.balanceXRP"
    ]);

    const trustlines = pick(report, [
      "trustlines",
      "trustlineCount",
      "wallet.trustlines",
      "report.trustlineCount",
      "report.wallet.trustlines"
    ]);

    const ownerCount = pick(report, [
      "ownerCount",
      "wallet.ownerCount",
      "report.ownerCount",
      "report.wallet.ownerCount"
    ]);

    const nftCount = pick(report, [
      "nftCount",
      "wallet.nftCount",
      "report.nftCount",
      "report.wallet.nftCount"
    ]);

    const blackholeTier = pick(report, [
      "blackholeTier",
      "blackhole.tier",
      "report.blackholeTier",
      "report.blackhole.tier"
    ]);

    const blackholeDetail = pick(report, [
      "blackholeStatus",
      "blackhole.detail",
      "blackhole.status",
      "report.blackholeStatus",
      "report.blackhole.detail",
      "report.blackhole.status"
    ], "No blackhole detail returned.");

    const signals = pick(report, [
      "signalsSummary",
      "signals",
      "report.signalsSummary",
      "report.signals"
    ], "No signals returned.");

    const notes = pick(report, [
      "notes",
      "summary",
      "report.notes",
      "report.summary"
    ], "No additional notes returned.");

    const holdings = pick(report, [
      "tokenHoldings",
      "wallet.tokenHoldings",
      "report.tokenHoldings",
      "report.wallet.tokenHoldings"
    ], []);

    const txs = pick(report, [
      "transactionBreakdown",
      "wallet.transactionBreakdown",
      "report.transactionBreakdown",
      "report.wallet.transactionBreakdown"
    ], []);

    el.metricClassification.textContent = String(classification);
    el.metricConfidence.textContent = `Confidence ${String(confidence)}`;
    el.metricActivity.textContent = String(activity);
    el.metricRisk.textContent = String(risk);
    el.metricStatementShort.textContent = String(statement).slice(0, 42) || "—";

    el.statementCard.textContent = String(statement);
    el.balanceXrp.textContent = formatNumber(balanceXRP);
    el.trustlineCount.textContent = formatNumber(trustlines);
    el.ownerCount.textContent = formatNumber(ownerCount);
    el.nftCount.textContent = formatNumber(nftCount);
    el.blackholeTier.textContent = String(blackholeTier);
    el.blackholeDetail.textContent = String(blackholeDetail);
    el.signalsCard.textContent = Array.isArray(signals) ? signals.join(", ") : String(signals);
    el.notesCard.textContent = String(notes);

    renderHoldings(Array.isArray(holdings) ? holdings : []);
    renderTransactions(Array.isArray(txs) ? txs : []);
  }

  async function loadAccess() {
    setHero();
    setModuleVisibility();

    if (!state.wallet) return;

    try {
      const res = await fetch(`/api/subscription/status?wallet=${encodeURIComponent(state.wallet)}`, {
        headers: { "Accept": "application/json" },
        credentials: "same-origin"
      });

      const data = await res.json().catch(() => ({}));

      const planCode = String(
        data.planCode ||
        data.plan ||
        data.tier ||
        data.subscription?.planCode ||
        data.subscription?.plan ||
        ""
      ).toLowerCase();

      const active = Boolean(
        data.active ||
        data.isActive ||
        data.subscription?.active ||
        data.subscription?.isActive ||
        data.status === "active"
      );

      const expiry = String(
        data.expiresAt ||
        data.expiry ||
        data.subscription?.expiresAt ||
        data.subscription?.expiry ||
        ""
      );

      state.rawStatus = data;
      state.tier = planCode || "unknown";
      state.active = active;
      state.expiry = expiry;

      setHero();
      setModuleVisibility();
    } catch (err) {
      state.tier = "unknown";
      state.active = false;
      state.expiry = "";
      setHero();
      setModuleVisibility();
    }
  }

  async function runStarter() {
    clearStarterError();

    const wallet = (el.walletInput.value || state.wallet || "").trim();
    if (!wallet) {
      setStarterError("Enter a wallet first.");
      return;
    }

    state.wallet = wallet;
    setHero();
    setLoadingState(true);

    try {
      const url = `/api/starter/report?wallet=${encodeURIComponent(wallet)}&address=${encodeURIComponent(wallet)}`;
      const res = await fetch(url, {
        headers: { "Accept": "application/json" },
        credentials: "same-origin"
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message = data.error || data.message || `Starter route failed with ${res.status}`;
        throw new Error(message);
      }

      renderReport(data);
      clearStarterError();
    } catch (err) {
      resetReportUI();
      setStarterError(err.message || "Unable to load paid wallet intelligence.");
    } finally {
      setLoadingState(false);
    }
  }

  function bind() {
    el.loadWalletBtn?.addEventListener("click", async () => {
      state.wallet = (el.walletInput.value || "").trim();
      if (!state.wallet) {
        setStarterError("Enter a wallet first.");
        return;
      }
      clearStarterError();
      const url = new URL(window.location.href);
      url.searchParams.set("wallet", state.wallet);
      window.history.replaceState({}, "", url);
      await loadAccess();
    });

    el.runStarterBtn?.addEventListener("click", runStarter);

    el.useWorkspaceWalletBtn?.addEventListener("click", () => {
      if (!state.wallet) return;
      el.walletInput.value = state.wallet;
    });

    el.walletInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        runStarter();
      }
    });
  }

  async function init() {
    resetReportUI();

    const qWallet = getQueryWallet();
    if (qWallet) {
      state.wallet = qWallet;
      el.walletInput.value = qWallet;
    }

    bind();
    await loadAccess();

    if (state.wallet && state.active) {
      await runStarter();
    }
  }

  init();
})();
