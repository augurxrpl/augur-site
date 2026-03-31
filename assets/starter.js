(() => {
  const API_BASE = "https://api.augurxrpl.com";
  const EXAMPLE = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";
  const q = new URLSearchParams(location.search);
  const wallet = document.getElementById("starterWallet");
  const run = document.getElementById("starterRunBtn");
  const ex = document.getElementById("starterExampleBtn");
  const status = document.getElementById("starterStatus");
  const out = document.getElementById("starterOutput");
  if (!wallet || !run || !ex || !status || !out) return;
  const setStatus = (t) => status.textContent = t;
  const setOut = (v) => out.textContent = typeof v === "string" ? v : JSON.stringify(v, null, 2);
  const renderReport = (data) => {
    const r = data?.report || data || {};
    const lines = [
      `Classification: ${r.classification || "Unknown"}`,
      `Confidence: ${r.confidence ?? "Unknown"}`,
      `Activity: ${r.activityLevel || r.activity?.trend || r.activity?.level || "Unknown"}`,
      `Risk: ${r.risk?.level || "Unknown"}`,
      "",
      `Statement: ${Array.isArray(r.statement) ? r.statement.join(" ") : (r.statement || "No statement available.")}`,
      "",
      `XRP Balance: ${r.summary?.balanceXRP ?? r.balanceXRP ?? "Unknown"}`,
      `Trustlines: ${r.summary?.trustlineCount ?? r.trustlines ?? "Unknown"}`,
      `Owner Count: ${r.summary?.ownerCount ?? r.ownerCount ?? "Unknown"}`,
      `NFT Count: ${r.summary?.nftCount ?? r.nftCount ?? "Unknown"}`,
      "",
      `Token Holdings: ${Array.isArray(r.tokenHoldings) ? r.tokenHoldings.length : 0}`,
      `Transactions: ${Array.isArray(r.transactionBreakdown) ? r.transactionBreakdown.length : 0}`
    ];
    out.textContent = lines.join("\n");
  };
  async function go(v) {
    v = String(v || "").trim();
    if (!v) { setStatus("Enter an XRPL wallet address."); return; }
    run.disabled = true; ex.disabled = true; setStatus(`Running Starter utility for ${v} ...`);
    try {
      const res = await fetch(`${API_BASE}/api/starter/report?wallet=${encodeURIComponent(v)}&address=${encodeURIComponent(v)}`, { headers: { accept: "application/json" } });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.error || `Request failed with status ${res.status}`);
      renderReport(data); setStatus("Starter utility loaded.");
    } catch (err) {
      setOut("Starter utility request failed.");
      setStatus(err instanceof Error ? err.message : "Starter utility request failed.");
    } finally {
      run.disabled = false; ex.disabled = false;
    }
  }
  run.addEventListener("click", () => go(wallet.value));
  ex.addEventListener("click", () => { wallet.value = EXAMPLE; go(EXAMPLE); });
  wallet.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go(wallet.value); } });
  const incoming = (q.get("wallet") || "").trim();
  if (incoming) { wallet.value = incoming; go(incoming); }
})();
