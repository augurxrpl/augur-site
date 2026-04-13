(function () {
  "use strict";

  const qs = (sel) => document.querySelector(sel);
  const API_BASE = (
    window.location.hostname === "augurxrpl.com" ||
    window.location.hostname === "www.augurxrpl.com"
  )
    ? "https://api.augurxrpl.com"
    : "";


  const state = {
    wallet: "",
    tier: "unknown",
    active: false,
    expiry: "",
    rawStatus: null,
  };

  const ITEMS_PER_PAGE = 10;
  let tokenHoldingsData = [];
  let transactionBreakdownData = [];
  let tokenHoldingsPage = 1;
  let transactionBreakdownPage = 1;

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
    starterStatus: qs("#starterStatus"),

    walletClassPill: qs("#walletClassPill"),
    walletAddress: qs("#walletAddress"),
    walletIdentity: qs("#walletIdentity"),
    walletBalance: qs("#walletBalance"),
    walletTx: qs("#walletTx"),
    walletRisk: qs("#walletRisk"),
    walletTrustlines: qs("#walletTrustlines"),
    walletOwnerCount: qs("#walletOwnerCount"),

    blackholeTierPill: qs("#blackholeTierPill"),
    blackholeSummaryNote: qs("#blackholeSummaryNote"),
    blackholeTierValue: qs("#blackholeTierValue"),
    blackholeStatusLabel: qs("#blackholeStatusLabel"),
    blackholeConfirmedValue: qs("#blackholeConfirmedValue"),
    blackholeMasterKeyValue: qs("#blackholeMasterKeyValue"),
    blackholeRegularKeyValue: qs("#blackholeRegularKeyValue"),
    blackholeRegularKeyLooksValue: qs("#blackholeRegularKeyLooksValue"),

    tokenHoldingsList: qs("#tokenHoldingsList"),
    transactionBreakdownList: qs("#transactionBreakdownList"),
    tokenPrevBtn: qs("#tokenPrevBtn"),
    tokenNextBtn: qs("#tokenNextBtn"),
    tokenPageInfo: qs("#tokenPageInfo"),
    txPrevBtn: qs("#txPrevBtn"),
    txNextBtn: qs("#txNextBtn"),
    txPageInfo: qs("#txPageInfo"),

    recentActivityList: qs("#recentActivityList"),
    confidencePill: qs("#confidencePill"),
    donutEl: qs(".donut"),
    legendBalance: qs("#legendBalance"),
    legendTokens: qs("#legendTokens"),
    behaviorList: qs("#behaviorList"),
    legendBalance: qs("#legendBalance"),
    legendTokens: qs("#legendTokens"),
    topHoldingsChart: qs("#topHoldingsChart"),
    txMixChart: qs("#txMixChart"),
    counterpartyChart: qs("#counterpartyChart"),
    xrpFlowChart: qs("#xrpFlowChart"),
    signalList: qs("#signalList"),
    statementText: qs("#statementText"),
    classificationValue: qs("#classificationValue"),
    confidenceValue: qs("#confidenceValue"),
    riskLevelValue: qs("#riskLevelValue"),
    riskScoreValue: qs("#riskScoreValue"),
    riskFlagsRow: qs("#riskFlagsRow"),
    riskNotesList: qs("#riskNotesList"),

    metricActivity: qs("#metricActivity"),
    metricStatementShort: qs("#metricStatementShort"),
    nftCount: qs("#nftCount"),
    blackholeTier: qs("#blackholeTier"),

    starterErrorBox: qs("#starterErrorBox"),
    proWorkspace: qs("#proWorkspace"),
    developerWorkspace: qs("#developerWorkspace"),
    proBadge: qs("#proBadge"),
    developerBadge: qs("#developerBadge"),

    proLockNote: qs("#proLockNote"),
    proCompareWalletA: qs("#proCompareWalletA"),
    proCompareWalletB: qs("#proCompareWalletB"),
    runWalletCompareBtn: qs("#runWalletCompareBtn"),
    proCompareOutput: qs("#proCompareOutput"),
    proSavedWalletLabelInput: qs("#proSavedWalletLabelInput"),
    proSavedWalletInput: qs("#proSavedWalletInput"),
    addSavedWalletBtn: qs("#addSavedWalletBtn"),
    proSavedWalletsList: qs("#proSavedWalletsList"),
    proWatchlistLabelInput: qs("#proWatchlistLabelInput"),
    proWatchlistInput: qs("#proWatchlistInput"),
    addWatchlistBtn: qs("#addWatchlistBtn"),
    proWatchlist: qs("#proWatchlist"),
    proSavedWalletCount: qs("#proSavedWalletCount"),
    proWatchlistCount: qs("#proWatchlistCount"),
    proWorkspaceTierLabel: qs("#proWorkspaceTierLabel"),
  };

  function getQueryWallet() {
    const params = new URLSearchParams(window.location.search);
    return (params.get("wallet") || params.get("address") || "").trim();
  }

  function safeText(value, fallback = "-") {
    if (value === undefined || value === null || value === "") return fallback;
    return String(value);
  }

  function decodeCurrencyCode(value) {
    const raw = String(value || "").trim();
    if (!raw) return "-";
    if (/^[A-Z0-9]{3}$/.test(raw)) return raw;
    if (!/^[A-Fa-f0-9]{40}$/.test(raw)) return raw;
    try {
      const bytes = raw.match(/.{1,2}/g) || [];
      return bytes
        .map((b) => String.fromCharCode(parseInt(b, 16)))
        .join("")
        .replace(/\0+$/g, "")
        .trim() || raw;
    } catch {
      return raw;
    }
  }

  function normalizeAmount(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "0";
    const num = Number(raw);
    if (!Number.isFinite(num)) return raw;
    return Math.abs(num).toLocaleString(undefined, { maximumFractionDigits: 6 });
  }

  function formatDateTime(value) {
    if (!value) return "";
    try {
      return new Date(value).toLocaleString();
    } catch {
      return String(value);
    }
  }

  function formatTxTime(value) {
    if (value === undefined || value === null || value === "") return "";
    const num = Number(value);
    if (!Number.isFinite(num)) return "";
    const ms = num > 1000000000000 ? num : (946684800 + num) * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return safeText(value, "—");
    return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }

  function capitalize(str) {
    const value = String(str || "");
    if (!value) return "Unknown";
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function shortWallet(wallet) {
    if (!wallet) return "Waiting";
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

  function setPill(elm, text, tone) {
    if (!elm) return;
    elm.className = tone ? `badge ${tone}` : "badge";
    elm.textContent = text;
  }

  function renderBadgeRow(target, items, emptyText, tone = "") {
    if (!target) return;
    if (!Array.isArray(items) || !items.length) {
      target.innerHTML = `<span class="badge">${escapeHtml(emptyText)}</span>`;
      return;
    }
    const cls = tone ? `badge ${tone}` : "badge";
    target.innerHTML = items.map((item) => `<span class="${cls}">${escapeHtml(String(item))}</span>`).join("");
  }

  function renderList(target, items, emptyText) {
    if (!target) return;
    if (!Array.isArray(items) || !items.length) {
      target.innerHTML = `<li class="empty">${escapeHtml(emptyText)}</li>`;
      return;
    }
    target.innerHTML = items.map((item) => `<li>${escapeHtml(String(item))}</li>`).join("");
  }

  function extractActivities(data) {
    const items =
      Array.isArray(data?.activity?.highlights) ? data.activity.highlights :
      Array.isArray(data?.activity?.items) ? data.activity.items :
      Array.isArray(data?.activity?.summary) ? data.activity.summary :
      Array.isArray(data?.activity) ? data.activity :
      [];
    return items.map((v) => {
      if (typeof v === "string") return v;
      if (!v || typeof v !== "object") return safeText(v);
      const parts = [
        v.line,
        v.label,
        v.name,
        v.title,
        v.type,
        v.category,
        v.value !== undefined && v.value !== null && v.value !== "" ? String(v.value) : "",
        v.interpretation,
        v.detail,
        v.reason
      ].filter(Boolean);
      return parts.join(" • ");
    }).filter(Boolean);
  }

  function extractSignals(data) {
    if (!Array.isArray(data?.signals)) return [];
    return data.signals.map((v) => {
      if (typeof v === "string") return v;
      if (!v || typeof v !== "object") return safeText(v);
      const parts = [
        v.line,
        v.label,
        v.name,
        v.signal,
        v.type,
        v.category,
        v.value !== undefined && v.value !== null && v.value !== "" ? String(v.value) : "",
        v.interpretation,
        v.detail,
        v.reason
      ].filter(Boolean);
      return parts.join(" • ");
    }).filter(Boolean);
  }

  function buildIdentityBadges(data) {
    const items = [];
    if (data?.classification) items.push(data.classification);
    if (data?.blackholeTier && String(data.blackholeTier).toLowerCase() !== "none") {
      items.push(`Blackhole: ${String(data.blackholeTier).toUpperCase()}`);
    }
    if (data?.risk?.level) items.push(`Risk: ${data.risk.level}`);
    if (!items.length) items.push("Awaiting analysis");
    return items;
  }

  function getBlackholePresentation(data) {
    const flags = data?.accountFlags || {};
    const tier = String(data?.blackholeTier || "none").toLowerCase();
    const confirmed = !!data?.blackholeStatus;
    const masterKeyDisabled = "masterKeyDisabled" in flags ? (flags.masterKeyDisabled ? "True" : "False") : "-";
    const regularKey = "regularKey" in flags ? (flags.regularKey || "None") : "-";
    const regularKeyLooks = "regularKeyLooksBlackholed" in flags ? (flags.regularKeyLooksBlackholed ? "True" : "False") : "-";

    let pill = "green";
    let label = "No blackhole pattern detected";
    let note = "No blackhole pattern detected from current wallet flags and key state.";

    if (tier === "confirmed") {
      pill = "red";
      label = "Confirmed blackhole state detected";
      note = "Confirmed blackhole state detected from current wallet flags and key state.";
    } else if (tier === "likely") {
      pill = "amber";
      label = "Likely blackhole pattern detected";
      note = "Likely blackhole pattern detected. Current state suggests blackhole behavior without confirmed final certainty.";
    } else if (tier === "partial") {
      pill = "blue";
      label = "Partial blackhole pattern detected";
      note = "Partial blackhole pattern detected. Some blackhole signals are present, but the state is not confirmed.";
    }

    return {
      tier: tier.toUpperCase(),
      pill,
      label,
      note,
      confirmed: confirmed ? "True" : "False",
      masterKeyDisabled,
      regularKey,
      regularKeyLooks
    };
  }

  function riskTone(level) {
    const value = String(level || "").toLowerCase();
    if (value.includes("high")) return "red";
    if (value.includes("medium") || value.includes("moderate")) return "amber";
    if (value.includes("low")) return "green";
    return "blue";
  }

  const KNOWN_WALLET_LABELS = {
    "rUpsEEPvfRAZC5woNHZv95R4BBJeM1Tdj1": "AUGUR Subscription Wallet"
  };

  function humanWalletLabel(address) {
    const value = String(address || "").trim();
    if (!value) return "Unknown wallet";
    return KNOWN_WALLET_LABELS[value] || `${value.slice(0,6)}...${value.slice(-6)}`;
  }

  function setHero() {
    if (el.heroWallet) el.heroWallet.textContent = shortWallet(state.wallet);
    if (el.heroTier) el.heroTier.textContent = capitalize(state.tier);
    if (el.heroStatus) el.heroStatus.textContent = state.active ? "Active" : "Inactive";
    if (el.heroExpiry) el.heroExpiry.textContent = state.expiry || "—";

    if (state.active) {
      setPill(el.heroPill, `${capitalize(state.tier)} active`, "green");
    } else if (state.wallet) {
      setPill(el.heroPill, "Inactive wallet", "red");
    } else {
      setPill(el.heroPill, "Wallet required", "amber");
    }

    if (el.hubAccessStatus) {
      el.hubAccessStatus.textContent = state.wallet
        ? `${shortWallet(state.wallet)} resolved. ${state.active ? "Paid access confirmed." : "No active paid access on this wallet."}`
        : "No wallet loaded.";
    }

    if (el.hubTierAccess) {
      if (!state.active) {
        el.hubTierAccess.textContent = "Starter, Pro, and Developer stay locked until a paid wallet is loaded.";
      } else if (state.tier === "developer") {
        el.hubTierAccess.textContent = "Developer wallet resolved. Starter, Pro, and Developer are all unlocked.";
      } else if (state.tier === "pro") {
        el.hubTierAccess.textContent = "Pro wallet resolved. Starter and Pro are unlocked. Developer is visible but locked.";
      } else if (state.tier === "starter") {
        el.hubTierAccess.textContent = "Starter wallet resolved. Starter is unlocked. Pro and Developer are visible but locked.";
      } else {
        el.hubTierAccess.textContent = "Tier could not be resolved.";
      }
    }
  }

  function setModuleVisibility() {
    const rank = state.active ? tierRank(state.tier) : 0;
    if (el.proBadge) setPill(el.proBadge, rank >= 2 ? "Unlocked" : "Locked", rank >= 2 ? "green" : "amber");
    if (el.developerBadge) setPill(el.developerBadge, rank >= 3 ? "Unlocked" : "Locked", rank >= 3 ? "green" : "amber");
  }

  function setLoadingState(isLoading) {
    if (!el.runStarterBtn) return;
    el.runStarterBtn.disabled = isLoading;
    el.runStarterBtn.textContent = isLoading ? "Running..." : "Run Report";
    if (el.starterStatus && isLoading) {
      el.starterStatus.textContent = `Running premium report for ${state.wallet || "wallet"}...`;
    }
  }

  function setStarterError(message) {
    if (el.starterErrorBox) {
      el.starterErrorBox.textContent = message || "Unable to load premium wallet report.";
    }
    if (el.starterStatus) {
      el.starterStatus.textContent = message || "Unable to load premium wallet report.";
    }
  }

  function clearStarterError() {
    if (el.starterErrorBox) {
      el.starterErrorBox.textContent = "No current utility errors.";
    }
  }

  function renderTopHoldingsChart(valuations) {
    if (!el.topHoldingsChart) return;
    const rows = Array.isArray(valuations?.holdings) ? valuations.holdings : [];
    if (!rows.length) {
      el.topHoldingsChart.innerHTML = `<div class="empty">No holdings valuation data available.</div>`;
      return;
    }
    const top = rows
      .sort((a, b) => {
        const ap = Number(a?.valueUsd || 0) > 0 ? 1 : 0;
        const bp = Number(b?.valueUsd || 0) > 0 ? 1 : 0;
        if (bp !== ap) return bp - ap;
        return (Number(b?.valueUsd || 0) || 0) - (Number(a?.valueUsd || 0) || 0);
      })
      .slice(0, 8)
      .map((item) => ({
        label: item?.symbol === "XRP" ? "XRP" : decodeCurrencyCode(item?.symbol || item?.currency || ""),
        valueUsd: Number(item?.valueUsd || 0) || 0,
        portfolioPct: Number(item?.portfolioPct || 0) || 0,
        priced: Boolean(item?.priced)
      }));
    if (!top.length) {
      el.topHoldingsChart.innerHTML = `<div class="empty">No holdings available yet.</div>`;
      return;
    }
    el.topHoldingsChart.innerHTML = top.map((item) => `
      <div class="tracker-item">
        <div class="tracker-left">
          <strong>${escapeHtml(item.label)}</strong>
          <span>${item.priced ? `$${item.valueUsd.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} • ${item.portfolioPct.toFixed(1)}%` : "Live quote unavailable"}</span>
        </div>
        <div class="tracker-right" style="min-width:140px;width:140px;">
          <div style="width:100%;height:10px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;">
            <div style="height:100%;width:${Math.max(8, item.priced ? item.portfolioPct : 8)}%;background:linear-gradient(180deg,#2891ff,#1876d8);border-radius:999px;"></div>
          </div>
        </div>
      </div>
    `).join("");
  }

  function renderTxMixChart(items) {
    if (!el.txMixChart) return;
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) {
      el.txMixChart.innerHTML = `<div class="empty">No recent transaction breakdown available.</div>`;
      return;
    }
    const counts = {};
    rows.forEach((item) => {
      const key = safeText(item?.type, "Unknown");
      counts[key] = (counts[key] || 0) + 1;
    });
    const mix = Object.entries(counts)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
    const max = Math.max(...mix.map(x => x.value), 1);
    const total = mix.reduce((sum, item) => sum + item.value, 0) || 1;
    el.txMixChart.innerHTML = mix.map((item) => `
      <div class="tracker-item">
        <div class="tracker-left">
          <strong>${escapeHtml(item.label)}</strong>
          <span>${item.value} tx • ${((item.value / total) * 100).toFixed(1)}%</span>
        </div>
        <div class="tracker-right" style="min-width:140px;width:140px;">
          <div style="width:100%;height:10px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;">
            <div style="height:100%;width:${Math.max(8, (item.value / max) * 100)}%;background:linear-gradient(180deg,#4ecdc4,#2aa99d);border-radius:999px;"></div>
          </div>
        </div>
      </div>
    `).join("");
  }

  function renderCounterpartyChart(items) {
    if (!el.counterpartyChart) return;
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) {
      el.counterpartyChart.innerHTML = `<div class="empty">No counterparties detected.</div>`;
      return;
    }
    const counts = {};
    rows.forEach((item) => {
      const key = safeText(item?.counterparty, "Unknown");
      counts[key] = (counts[key] || 0) + 1;
    });
    const top = Object.entries(counts)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    const max = Math.max(...top.map(x => x.value), 1);
    const total = top.reduce((sum, item) => sum + item.value, 0) || 1;
    el.counterpartyChart.innerHTML = top.map((item) => `
      <div class="tracker-item">
        <div class="tracker-left">
          <strong>${escapeHtml(item.label)}</strong>
          <span>${item.value} tx • ${((item.value / total) * 100).toFixed(1)}%</span>
        </div>
        <div class="tracker-right" style="min-width:140px;width:140px;">
          <div style="width:100%;height:10px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;">
            <div style="height:100%;width:${Math.max(8, (item.value / max) * 100)}%;background:linear-gradient(180deg,#ffcc66,#c7961f);border-radius:999px;"></div>
          </div>
        </div>
      </div>
    `).join("");
  }

  function renderXrpFlowChart(items) {
    if (!el.xrpFlowChart) return;
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) {
      el.xrpFlowChart.innerHTML = `<div class="empty">No XRP flow data available.</div>`;
      return;
    }
    const sums = {};
    rows.forEach((item) => {
      const currency = String(item?.currency || "").toUpperCase();
      const amount = Number(item?.amount || 0) || 0;
      const counterparty = safeText(item?.counterparty, "Unknown");
      if (currency !== "XRP" || amount <= 0) return;
      sums[counterparty] = (sums[counterparty] || 0) + amount;
    });
    const top = Object.entries(sums)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    if (!top.length) {
      el.xrpFlowChart.innerHTML = `<div class="empty">No XRP flow data available.</div>`;
      return;
    }
    const max = Math.max(...top.map(x => x.value), 1);
    const total = top.reduce((sum, item) => sum + item.value, 0) || 1;
    el.xrpFlowChart.innerHTML = top.map((item) => `
      <div class="tracker-item">
        <div class="tracker-left">
          <strong>${escapeHtml(item.label)}</strong>
          <span>${item.value.toFixed(6)} XRP • ${((item.value / total) * 100).toFixed(1)}%</span>
        </div>
        <div class="tracker-right" style="min-width:140px;width:140px;">
          <div style="width:100%;height:10px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;">
            <div style="height:100%;width:${Math.max(8, (item.value / max) * 100)}%;background:linear-gradient(180deg,#ffcc66,#c7961f);border-radius:999px;"></div>
          </div>
        </div>
      </div>
    `).join("");
  }

  function renderTokenHoldings(items, valuations) {
    const tokenRows = Array.isArray(items) ? [...items] : [];
    const valuationRows = Array.isArray(valuations?.holdings) ? valuations.holdings : [];
    const xrpHolding = valuationRows.find((item) => item?.symbol === "XRP");
    const merged = [];

    if (xrpHolding) {
      merged.push({
        currency: "XRP",
        issuer: "",
        balance: String(xrpHolding.balance ?? 0),
        valueUsd: xrpHolding.valueUsd,
        priced: Boolean(xrpHolding.priced),
        portfolioPct: xrpHolding.portfolioPct
      });
    }

    tokenRows.forEach((item) => {
      const symbol = String(item?.currency || "");
      const issuer = String(item?.issuer || "");
      const match = valuationRows.find((v) => String(v?.symbol || "") === symbol && String(v?.issuer || "") === issuer);
      merged.push({
        currency: symbol,
        issuer,
        balance: String(item?.balance || "0"),
        valueUsd: match?.valueUsd ?? null,
        priced: Boolean(match?.priced),
        portfolioPct: match?.portfolioPct ?? null
      });
    });

    tokenHoldingsData = merged;
    const totalPages = Math.max(1, Math.ceil(tokenHoldingsData.length / ITEMS_PER_PAGE));
    if (tokenHoldingsPage > totalPages) tokenHoldingsPage = totalPages;
    if (tokenHoldingsPage < 1) tokenHoldingsPage = 1;

    if (!el.tokenHoldingsList) return;
    if (!tokenHoldingsData.length) {
      el.tokenHoldingsList.innerHTML = `<div class="empty">No XRPL token holdings detected.</div>`;
      if (el.tokenPageInfo) el.tokenPageInfo.textContent = `Page 1 of 1`;
      if (el.tokenPrevBtn) el.tokenPrevBtn.disabled = true;
      if (el.tokenNextBtn) el.tokenNextBtn.disabled = true;
      return;
    }

    const startIndex = (tokenHoldingsPage - 1) * ITEMS_PER_PAGE;
    const pageItems = tokenHoldingsData.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    el.tokenHoldingsList.innerHTML = pageItems.map((item) => {
      const currency = escapeHtml(decodeCurrencyCode(item?.currency || "-"));
      const issuer = currency === "XRP" ? "Native XRPL asset" : escapeHtml(String(item?.issuer || "-"));
      const balance = escapeHtml(normalizeAmount(item?.balance || "0"));
      const valueUsd = item?.valueUsd != null ? `$${Number(item.valueUsd).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}` : "Live quote unavailable";
      const pct = item?.portfolioPct != null ? ` • ${Number(item.portfolioPct).toFixed(1)}%` : "";
      const tone = item?.valueUsd != null ? "pos" : "warn";
      return `<div class="tracker-item">
        <div>
          <strong>${currency}</strong>
          <span>${issuer}</span>
        </div>
        <div class="flow ${tone}">${balance} • ${valueUsd}${pct}</div>
      </div>`;
    }).join("");

    if (el.tokenPageInfo) el.tokenPageInfo.textContent = `Page ${tokenHoldingsPage} of ${totalPages}`;
    if (el.tokenPrevBtn) el.tokenPrevBtn.disabled = tokenHoldingsPage <= 1;
    if (el.tokenNextBtn) el.tokenNextBtn.disabled = tokenHoldingsPage >= totalPages;
  }

  function renderTransactionBreakdown(items) {
    transactionBreakdownData = Array.isArray(items) ? items : [];
    const totalPages = Math.max(1, Math.ceil(transactionBreakdownData.length / ITEMS_PER_PAGE));
    if (transactionBreakdownPage > totalPages) transactionBreakdownPage = totalPages;
    if (transactionBreakdownPage < 1) transactionBreakdownPage = 1;

    if (!el.transactionBreakdownList) return;
    if (!transactionBreakdownData.length) {
      el.transactionBreakdownList.innerHTML = `<div class="empty">No recent transaction breakdown available.</div>`;
      if (el.txPageInfo) el.txPageInfo.textContent = `Page 1 of 1`;
      if (el.txPrevBtn) el.txPrevBtn.disabled = true;
      if (el.txNextBtn) el.txNextBtn.disabled = true;
      return;
    }

    const startIndex = (transactionBreakdownPage - 1) * ITEMS_PER_PAGE;
    const pageItems = transactionBreakdownData.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    el.transactionBreakdownList.innerHTML = pageItems.map((item) => {
      const hash = escapeHtml(String(item?.hash || "-"));
      const rawType = String(item?.type || "Unknown");
      const humanTypeMap = {
        Payment: "Payment",
        TrustSet: "Trustline update",
        OfferCreate: "DEX order placed",
        OfferCancel: "DEX order canceled",
        AMMDeposit: "Liquidity added",
        AMMWithdraw: "Liquidity removed",
        AMMVote: "AMM vote"
      };
      const type = escapeHtml(humanTypeMap[rawType] || rawType);
      const rawResult = String(item?.result || "-");
      const result = escapeHtml(rawResult === "tesSUCCESS" ? "Success" : rawResult);
      const summary = escapeHtml(String(item?.summary || "Transaction detected."));
      const when = escapeHtml(formatTxTime(item?.timestamp));
      return `<div class="tracker-item">
        <div class="tracker-left">
          <strong>${type}</strong>
          <span>${summary}</span>
          <div class="meta">
            <small>${when}</small>
            <small>Hash: ${hash === "-" ? "-" : `${hash.slice(0, 6)}...${hash.slice(-6)}`}</small>
          </div>
        </div>
        <div class="tracker-right">
          <div class="flow ${rawResult === "tesSUCCESS" ? "pos" : "warn"}">${result}</div>
        </div>
      </div>`;
    }).join("");

    if (el.txPageInfo) el.txPageInfo.textContent = `Page ${transactionBreakdownPage} of ${totalPages}`;
    if (el.txPrevBtn) el.txPrevBtn.disabled = transactionBreakdownPage <= 1;
    if (el.txNextBtn) el.txNextBtn.disabled = transactionBreakdownPage >= totalPages;
  }

  function resetReportUI() {
    if (el.walletClassPill) setPill(el.walletClassPill, "No Report", "blue");
    if (el.walletAddress) el.walletAddress.textContent = "No wallet loaded";
    renderBadgeRow(el.walletIdentity, [], "Awaiting analysis");
    if (el.walletBalance) el.walletBalance.textContent = "-";
    if (el.walletTx) el.walletTx.textContent = "-";
    if (el.walletRisk) el.walletRisk.textContent = "-";
    if (el.walletTrustlines) el.walletTrustlines.textContent = "-";
    if (el.walletOwnerCount) el.walletOwnerCount.textContent = "-";

    if (el.blackholeTierPill) setPill(el.blackholeTierPill, "NONE", "green");
    if (el.blackholeSummaryNote) el.blackholeSummaryNote.textContent = "Run a wallet analysis to evaluate blackhole state.";
    if (el.blackholeTierValue) el.blackholeTierValue.textContent = "-";
    if (el.blackholeStatusLabel) el.blackholeStatusLabel.textContent = "-";
    if (el.blackholeConfirmedValue) el.blackholeConfirmedValue.textContent = "-";
    if (el.blackholeMasterKeyValue) el.blackholeMasterKeyValue.textContent = "-";
    if (el.blackholeRegularKeyValue) el.blackholeRegularKeyValue.textContent = "-";
    if (el.blackholeRegularKeyLooksValue) el.blackholeRegularKeyLooksValue.textContent = "-";

    renderTokenHoldings([]);
    renderTransactionBreakdown([]);
    renderList(el.recentActivityList, [], "Run a wallet analysis to populate activity insights.");
    if (el.confidencePill) setPill(el.confidencePill, "Confidence -", "");
    renderList(el.signalList, [], "No signals yet.");
    if (el.statementText) el.statementText.textContent = "Run a wallet analysis to generate a statement.";
    if (el.classificationValue) el.classificationValue.textContent = "-";
    if (el.confidenceValue) el.confidenceValue.textContent = "-";
    if (el.riskLevelValue) el.riskLevelValue.textContent = "-";
    if (el.riskScoreValue) el.riskScoreValue.textContent = "-";
    renderBadgeRow(el.riskFlagsRow, [], "No risk flags yet");
    renderList(el.riskNotesList, [], "No risk notes yet.");

    if (el.metricActivity) el.metricActivity.textContent = "-";
    if (el.metricStatementShort) el.metricStatementShort.textContent = "-";
    if (el.nftCount) el.nftCount.textContent = "-";
    if (el.blackholeTier) el.blackholeTier.textContent = "-";
  }

  function renderReport(data) {
    tokenHoldingsPage = 1;
    transactionBreakdownPage = 1;

    const classification = safeText(data?.classification, "Unknown");
    const confidence = safeText(data?.confidence, "-");
    const riskLevel = safeText(data?.risk?.level, "-");
    const riskScore = safeText(data?.risk?.score ?? data?.risk?.level, "-");
    const blackholeFlag = !!data?.blackholeStatus;
    const blackholeTierRaw = String(data?.blackholeTier || "").toLowerCase();
    const blackholeClass = String(classification || "").toLowerCase().includes("blackhole");
    const blackholeDetected = blackholeFlag || ["confirmed","likely","partial"].includes(blackholeTierRaw) || blackholeClass;

    function humanRiskScore(value){
      const raw = String(value ?? "").trim();
      if (!raw) return "-";
      const num = Number(raw);
      if (Number.isFinite(num)) return String(num);
      const v = raw.toLowerCase();
      if (v.includes("low")) return "25";
      if (v.includes("medium") || v.includes("moderate")) return "60";
      if (v.includes("high")) return "90";
      return raw;
    }

    const confidenceDisplay = blackholeDetected ? "5" : confidence;
    const riskLevelDisplay = blackholeDetected ? "High" : riskLevel;
    const riskScoreDisplay = blackholeDetected ? "95" : humanRiskScore(riskScore);
    const statement = Array.isArray(data?.statement) ? data.statement.join(" ") : safeText(data?.statement, "No statement returned.");
    const activityItems = extractActivities(data);
    const activitySummary = Array.isArray(data?.activity?.summary) ? data.activity.summary : [];
    const riskFlags = Array.isArray(data?.risk?.flags) ? data.risk.flags : [];
    const riskNotes = Array.isArray(data?.risk?.notes) ? data.risk.notes : [];
    const tokenHoldings = Array.isArray(data?.tokenHoldings) ? data.tokenHoldings : [];
    const txs = Array.isArray(data?.transactionBreakdown) ? data.transactionBreakdown : [];
    const behaviorItems = [
      `Classification: ${classification}`,
      `Confidence: ${confidenceDisplay}`,
      `Risk Level: ${riskLevelDisplay}`,
      `Risk Score: ${riskScoreDisplay}`
    ];
    activitySummary.forEach(item => behaviorItems.push(safeText(item)));
    const xrpBalanceRaw = Number(data?.balanceXRP ?? data?.balance ?? data?.summary?.balanceXRP ?? 0) || 0;
    const tokenCount = tokenHoldings.length;
    const tokenSlice = tokenCount > 0 ? tokenCount : 0;
    const totalSlice = xrpBalanceRaw + tokenSlice;
    const xrpPct = totalSlice > 0 ? ((xrpBalanceRaw / totalSlice) * 100) : 100;
    const blackholeView = getBlackholePresentation(data);
    const badgeTone = riskTone(riskLevelDisplay);
    const identityBadges = buildIdentityBadges(data);
    const signals = extractSignals(data);
    const recentTx = safeText(
      data?.activity?.sampledRecentTransactions ??
      data?.activity?.recentTransactions ??
      data?.activity?.recentTransactionCount,
      "-"
    );

    if (el.walletClassPill) setPill(el.walletClassPill, classification, badgeTone);
    if (el.walletAddress) el.walletAddress.textContent = state.wallet || "No wallet loaded";
    renderBadgeRow(el.walletIdentity, identityBadges, "Awaiting analysis");
    if (el.walletBalance) el.walletBalance.textContent = safeText(data?.balanceXRP ?? data?.summary?.balanceXRP, "-");
    if (el.walletTx) el.walletTx.textContent = recentTx;
    if (el.walletRisk) el.walletRisk.textContent = safeText(riskScore);
    if (el.walletTrustlines) el.walletTrustlines.textContent = safeText(data?.trustlines ?? data?.summary?.trustlineCount ?? data?.activity?.trustlines, "-");
    if (el.walletOwnerCount) el.walletOwnerCount.textContent = safeText(data?.ownerCount ?? data?.summary?.ownerCount, "-");

    if (el.blackholeTierPill) setPill(el.blackholeTierPill, blackholeView.tier, blackholeView.pill);
    if (el.blackholeSummaryNote) el.blackholeSummaryNote.textContent = blackholeView.note;
    if (el.blackholeTierValue) el.blackholeTierValue.textContent = blackholeView.tier;
    if (el.blackholeStatusLabel) el.blackholeStatusLabel.textContent = blackholeView.label;
    if (el.blackholeConfirmedValue) el.blackholeConfirmedValue.textContent = blackholeView.confirmed;
    if (el.blackholeMasterKeyValue) el.blackholeMasterKeyValue.textContent = blackholeView.masterKeyDisabled;
    if (el.blackholeRegularKeyValue) el.blackholeRegularKeyValue.textContent = blackholeView.regularKey;
    if (el.blackholeRegularKeyLooksValue) el.blackholeRegularKeyLooksValue.textContent = blackholeView.regularKeyLooks;

    const valuations = data?.valuations || null;
    renderTokenHoldings(tokenHoldings, valuations);
    renderTopHoldingsChart(valuations);
    renderTransactionBreakdown(txs);
    renderTxMixChart(txs);
    renderCounterpartyChart(txs);
    renderXrpFlowChart(txs);
    renderList(el.recentActivityList, activityItems, "No recent activity insights returned.");
    if (el.confidencePill) setPill(el.confidencePill, `Confidence ${confidenceDisplay}`, "");
    if (el.legendBalance) el.legendBalance.textContent = valuations?.holdings?.find((h) => h.symbol === "XRP")?.valueUsd != null
      ? `$${Number(valuations.holdings.find((h) => h.symbol === "XRP").valueUsd).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`
      : safeText(data?.balanceXRP ?? data?.balance ?? data?.summary?.balanceXRP, "-");
    if (el.legendTokens) el.legendTokens.textContent = valuations ? `${valuations.unpricedCount || 0} unpriced assets` : `${tokenCount} holdings`;
    if (el.donutEl) {
      const xrpHolding = valuations?.holdings?.find((h) => h.symbol === "XRP");
      const xrpPctValue = Number(xrpHolding?.portfolioPct || 0) || 0;
      el.donutEl.style.setProperty("--xrp-pct", `${Math.max(0, Math.min(100, xrpPctValue || xrpPct))}%`);
    }
    if (el.behaviorList) renderList(el.behaviorList, behaviorItems, "No behavior data available.");
    renderList(el.signalList, signals, "No signals yet.");
    if (el.statementText) el.statementText.textContent = statement;
    if (el.classificationValue) el.classificationValue.textContent = classification;
    if (el.confidenceValue) el.confidenceValue.textContent = confidenceDisplay;
    if (el.riskLevelValue) el.riskLevelValue.textContent = riskLevelDisplay;
    if (el.riskScoreValue) el.riskScoreValue.textContent = riskScoreDisplay;
    renderBadgeRow(el.riskFlagsRow, riskFlags, "No explicit risk flags returned for this wallet.", badgeTone);
    renderList(el.riskNotesList, riskNotes, "No additional risk notes.");

    if (el.metricActivity) {
      el.metricActivity.textContent = activitySummary.length
        ? safeText(activitySummary[0])
        : safeText(data?.activity?.level ?? data?.activity, "-");
    }
    if (el.metricStatementShort) el.metricStatementShort.textContent = statement.slice(0, 42) || "-";
    if (el.nftCount) el.nftCount.textContent = safeText(data?.nftCount ?? data?.summary?.nftCount, "-");
    if (el.blackholeTier) el.blackholeTier.textContent = blackholeView.tier;

    if (el.starterStatus) {
      el.starterStatus.textContent = `Premium report loaded for ${state.wallet}.`;
    }
  }

  async function loadAccess() {
    setHero();
    setModuleVisibility();

    if (!state.wallet) return;

    try {
      const statusWallet = state.subscriberWallet || state.wallet;
      state.subscriberWallet = statusWallet;
      localStorage.setItem(AUGUR_SUBSCRIBER_WALLET_KEY, statusWallet);
      sessionStorage.setItem(AUGUR_SUBSCRIBER_WALLET_KEY, statusWallet);
      const res = await fetch(`${API_BASE}/api/subscription/status?wallet=${encodeURIComponent(statusWallet)}`, {
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
      state.expiry = formatDateTime(expiry);

      setHero();
      setModuleVisibility();
      await loadProWorkspace();
    } catch (err) {
      alert("LOADACCESS CATCH: " + (err && err.message ? err.message : err));
      state.tier = "unknown";
      state.active = false;
      state.expiry = "";
      setHero();
      setModuleVisibility();
      await loadProWorkspace();
    }
  }

  async function runStarter() {
    clearStarterError();

    const wallet = (el.walletInput?.value || state.reportWallet || state.wallet || "").trim();
    if (!wallet) {
      setStarterError("Enter a wallet first.");
      return;
    }

    state.reportWallet = wallet;
    localStorage.setItem(AUGUR_LAST_REPORT_WALLET_KEY, wallet);
    sessionStorage.setItem(AUGUR_LAST_REPORT_WALLET_KEY, wallet);
    if (!state.subscriberWallet) state.wallet = wallet;
    setHero();
    setLoadingState(true);

    try {
      const subscriberWallet = state.subscriberWallet || state.wallet || wallet;
      const reportWallet = state.reportWallet || wallet;
      const url = `${API_BASE}/api/starter/report?wallet=${encodeURIComponent(subscriberWallet)}&address=${encodeURIComponent(reportWallet)}`;
      const res = await fetch(url, {
        headers: { "Accept": "application/json" },
        credentials: "same-origin"
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message = data.error || data.message || `Starter route failed with ${res.status}`;
        throw new Error(message);
      }

      renderReport(data?.report || data);
      clearStarterError();
    } catch (err) {
      resetReportUI();
      setStarterError(err.message || "Unable to load premium wallet report.");
    } finally {
      setLoadingState(false);
    }
  }


  let proSavedWallets = [];
  let proWatchlistWallets = [];
  function hasProAccess() {
    return tierRank(state.tier) >= 2 && state.active;
  }

  async function saveProWorkspace() {
    if (!hasProAccess() || !state.wallet) return;

    await fetch(`${API_BASE}/api/subscription/pro-workspace`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      credentials: "same-origin",
      body: JSON.stringify({
        walletAddress: state.subscriberWallet || state.wallet,
        savedWallets: proSavedWallets,
        watchlist: proWatchlistWallets
      })
    });
  }


  async function loadProWorkspace() {
    if (!hasProAccess() || !state.wallet) {
      proSavedWallets = [];
      proWatchlistWallets = [];
      updateProPanels();
      return;
    }

    const workspaceWallet = state.subscriberWallet || state.wallet;
    const res = await fetch(`${API_BASE}/api/subscription/pro-workspace?wallet=${encodeURIComponent(workspaceWallet)}`, {
      headers: { "Accept": "application/json" },
      credentials: "same-origin"
    });

    const data = await res.json().catch(() => ({}));

    proSavedWallets = Array.isArray(data?.workspace?.savedWallets) ? data.workspace.savedWallets : [];
    proWatchlistWallets = Array.isArray(data?.workspace?.watchlist) ? data.workspace.watchlist : [];

    if (el.proSavedWalletLabelInput) el.proSavedWalletLabelInput.value = "";
    if (el.proSavedWalletInput) el.proSavedWalletInput.value = "";
    if (el.proWatchlistLabelInput) el.proWatchlistLabelInput.value = "";
    if (el.proWatchlistInput) el.proWatchlistInput.value = "";
    updateProPanels();
  }

  function bind() {
    el.loadWalletBtn?.addEventListener("click", async () => {
      const wallet = (el.walletInput?.value || "").trim();
      if (!wallet) {
        setStarterError("Enter a wallet first.");
        return;
      }
      state.reportWallet = wallet;
      localStorage.setItem(AUGUR_LAST_REPORT_WALLET_KEY, wallet);
      sessionStorage.setItem(AUGUR_LAST_REPORT_WALLET_KEY, wallet);
      if (!state.subscriberWallet) state.wallet = wallet;
      clearStarterError();
      const url = new URL(window.location.href);
      url.searchParams.set("wallet", wallet);
      window.history.replaceState({}, "", url);
      if (state.subscriberWallet ? state.active : wallet && state.active) {
        await runStarter();
      }
    });

    el.runStarterBtn?.addEventListener("click", runStarter);

    el.walletInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        runStarter();
      }
    });

    el.tokenPrevBtn?.addEventListener("click", () => {
      tokenHoldingsPage -= 1;
      renderTokenHoldings(tokenHoldingsData);
    });

    el.tokenNextBtn?.addEventListener("click", () => {
      tokenHoldingsPage += 1;
      renderTokenHoldings(tokenHoldingsData);
    });

    el.txPrevBtn?.addEventListener("click", () => {
      transactionBreakdownPage -= 1;
      renderTransactionBreakdown(transactionBreakdownData);
    });

    el.txNextBtn?.addEventListener("click", () => {
      transactionBreakdownPage += 1;
      renderTransactionBreakdown(transactionBreakdownData);
    });

    el.runWalletCompareBtn?.addEventListener("click", runProCompare);
    el.addSavedWalletBtn?.addEventListener("click", addProSavedWallet);
    el.addWatchlistBtn?.addEventListener("click", addProWatchlistWallet);

    document.addEventListener("click", async (e) => {
      const copyBtn = e.target.closest("[data-copy-wallet]");
      if (copyBtn) {
        const wallet = copyBtn.getAttribute("data-copy-wallet") || "";
        try {
          await navigator.clipboard.writeText(wallet);
          copyBtn.textContent = "Copied";
          setTimeout(() => { copyBtn.textContent = "Copy"; }, 900);
        } catch (_) {}
        return;
      }

      const btn = e.target.closest("[data-remove-kind][data-remove-index]");
      if (!btn) return;
      removeProItem(btn.getAttribute("data-remove-kind"), btn.getAttribute("data-remove-index"));
    });
  }

  async function init() {
    alert("INIT START");
    alert("BEFORE resetReportUI");
    resetReportUI();
    alert("AFTER resetReportUI");
    alert("BEFORE updateProPanels");
    updateProPanels();
    alert("AFTER updateProPanels");

    const qWallet = getQueryWallet();
    const storedSubscriberWallet =
      sessionStorage.getItem(AUGUR_SUBSCRIBER_WALLET_KEY) ||
      localStorage.getItem(AUGUR_SUBSCRIBER_WALLET_KEY) ||
      "";
    const storedReportWallet =
      sessionStorage.getItem(AUGUR_LAST_REPORT_WALLET_KEY) ||
      localStorage.getItem(AUGUR_LAST_REPORT_WALLET_KEY) ||
      "";

    state.subscriberWallet = storedSubscriberWallet || "";
    state.reportWallet = qWallet || storedReportWallet || state.subscriberWallet || "";
    state.wallet = state.subscriberWallet || state.reportWallet || "";

    alert("INIT VALUES | subscriber=" + state.subscriberWallet + " | report=" + state.reportWallet + " | wallet=" + state.wallet);

    if (el.walletInput) el.walletInput.value = state.reportWallet || "";

    bind();
    alert("BEFORE LOADACCESS");
    await loadAccess();
    alert("AFTER LOADACCESS | tier=" + state.tier + " | active=" + state.active + " | expiry=" + state.expiry);

    if (state.reportWallet && state.active) {
      await runStarter();
    }
  }

  init();
})();
