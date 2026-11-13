/* WalletRescue — sponsor wallet generator, ERC-20 rescue and native withdraw.
   All signing happens in this tab. Nothing but the public address is persisted
   outside localStorage on this device. */

import {
  Wallet, JsonRpcProvider, Contract, formatEther, parseEther,
  isAddress, getAddress
} from "https://cdn.jsdelivr.net/npm/ethers@6.13.4/+esm";

/* ---------------------------------------------------------------- chains */
const CHAINS = [
  { id: "ethereum",  name: "Ethereum Mainnet",  chainId: 1,     symbol: "ETH",  rpc: "https://eth.llamarpc.com",              explorer: "https://etherscan.io" },
  { id: "base",      name: "Base Mainnet",      chainId: 8453,  symbol: "ETH",  rpc: "https://mainnet.base.org",              explorer: "https://basescan.org" },
  { id: "arbitrum",  name: "Arbitrum Mainnet",  chainId: 42161, symbol: "ETH",  rpc: "https://arb1.arbitrum.io/rpc",          explorer: "https://arbiscan.io" },
  { id: "bsc",       name: "BSC Mainnet",       chainId: 56,    symbol: "BNB",  rpc: "https://bsc-dataseed.binance.org",      explorer: "https://bscscan.com" },
  { id: "optimism",  name: "Optimism Mainnet",  chainId: 10,    symbol: "ETH",  rpc: "https://mainnet.optimism.io",           explorer: "https://optimistic.etherscan.io" },
  { id: "polygon",   name: "Polygon Mainnet",   chainId: 137,   symbol: "POL",  rpc: "https://polygon-rpc.com",               explorer: "https://polygonscan.com" },
  { id: "monad",     name: "Monad Mainnet",     chainId: 143,   symbol: "MON",  rpc: "https://rpc.monad.xyz",                 explorer: "https://monadscan.com" },
  { id: "plume",     name: "Plume Mainnet",     chainId: 98865, symbol: "PLUME",rpc: "https://rpc.plume.org",                 explorer: "https://explorer.plume.org" },
  { id: "megaeth",   name: "MegaETH Mainnet",   chainId: 4326,  symbol: "ETH",  rpc: "https://mainnet.megaeth.com/rpc",       explorer: "https://megaexplorer.xyz" },
  { id: "hyperevm",  name: "HyperEVM Mainnet",  chainId: 999,   symbol: "HYPE", rpc: "https://rpc.hyperliquid.xyz/evm",       explorer: "https://hyperevmscan.io" },
  { id: "sei",       name: "Sei Mainnet",       chainId: 1329,  symbol: "SEI",  rpc: "https://evm-rpc.sei-apis.com",          explorer: "https://seitrace.com" },
  { id: "ink",       name: "Ink Mainnet",       chainId: 57073, symbol: "ETH",  rpc: "https://rpc-gel.inkonchain.com",        explorer: "https://explorer.inkonchain.com" },
  { id: "unichain",  name: "Unichain Mainnet",  chainId: 130,   symbol: "ETH",  rpc: "https://mainnet.unichain.org",          explorer: "https://uniscan.xyz" },
  { id: "berachain", name: "Berachain Mainnet", chainId: 80094, symbol: "BERA", rpc: "https://rpc.berachain.com",             explorer: "https://berascan.com" },
  { id: "plasma",    name: "Plasma Mainnet",    chainId: 9745,  symbol: "XPL",  rpc: "https://rpc.plasma.to",                 explorer: "https://plasmascan.to" },
  { id: "somnia",    name: "Somnia Mainnet",    chainId: 5031,  symbol: "STT",  rpc: "https://dream-rpc.somnia.network",       explorer: "https://explorer.somnia.network" }
];
const chainById = (id) => CHAINS.find((c) => c.id === id) || CHAINS[0];

const OPS = {
  claim:    { title: "Claim & Transfer",     sub: "Claim airdrop and instantly transfer to a safe wallet" },
  transfer: { title: "Transfer Tokens",      sub: "Move ERC-20 tokens to a safe wallet" },
  nft:      { title: "Rescue NFTs",          sub: "Transfer or mint NFTs from compromised wallet" },
  contract: { title: "Contract Interaction", sub: "Send transaction without transferring assets" }
};

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

/* ----------------------------------------------------------------- state */
const KEY = "walletrescue.sponsor.v1";
const state = {
  tab: "generate",
  sponsor: null,
  op: null,
  fee: "normal",
  wallets: []
};
let walletSeq = 0;

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function saveSponsor(w) {
  state.sponsor = w;
  if (w) localStorage.setItem(KEY, JSON.stringify(w));
  else localStorage.removeItem(KEY);
}
function loadSponsor() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const w = JSON.parse(raw);
    return w && w.address && w.privateKey ? w : null;
  } catch { return null; }
}

let toastTimer;
function toast(msg, bad = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.toggle("bad", bad);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

/* ------------------------------------------------------------------ tabs */
function setTab(tab, push = true) {
  if (!["generate", "rescue", "withdraw"].includes(tab)) tab = "generate";
  state.tab = tab;
  $$(".tab").forEach((b) => b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false"));
  $$("[data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== tab; });
  if (push) {
    const url = new URL(location.href);
    url.searchParams.set("tab", tab);
    history.replaceState(null, "", url);
  }
  if (tab === "generate") renderGenerate();
  if (tab === "rescue") renderRescueGate();
  if (tab === "withdraw") renderWithdraw();
}

/* -------------------------------------------------------------- generate */
function renderGenerate() {
  const w = state.sponsor;
  $("#gen-empty").hidden = !!w;
  $("#gen-wallet").hidden = !w;
  if (w) {
    $("#gen-address").value = w.address;
    $("#gen-pk").value = w.privateKey;
    $("#gen-phrase").value = w.phrase || "—";
  }
}

function newWallet() {
  const w = Wallet.createRandom();
  saveSponsor({ address: w.address, privateKey: w.privateKey, phrase: w.mnemonic?.phrase || "" });
  renderGenerate();
  toast("EVM sponsor wallet generated!");
}

/* ---------------------------------------------------------------- rescue */
function renderRescueGate() {
  const has = state.wallets.length > 0 && state.op;
  $("#rescue-chooser").hidden = !!has;
  $("#rescue-form").hidden = !has;
  if (has) {
    $("#form-title").textContent = OPS[state.op].title;
    $("#form-sub").textContent = OPS[state.op].sub;
    const n = state.wallets.length;
    $("#btn-review").textContent = `Review & Execute (${n} wallet${n > 1 ? "s" : ""})`;
  }
}

function pickOp(op) {
  state.op = op;
  if (state.wallets.length === 0) state.wallets.push(blankWallet());
  renderRescueGate();
  renderWallets();
}

function blankWallet() {
  return { uid: ++walletSeq, network: "base", rpc: "", gasMode: "auto", gasPrice: "", pk: "", recipient: "", tokens: "", to: "", data: "" };
}

function walletCard(w, index, total) {
  const chain = chainById(w.network);
  const el = document.createElement("div");
  el.className = "wallet";
  el.dataset.uid = w.uid;

  const tokensField = state.op === "transfer" || state.op === "claim"
    ? `<div class="field">
         <label class="label" for="tokens-${w.uid}">Token contract addresses</label>
         <textarea class="input mono" id="tokens-${w.uid}" data-f="tokens" rows="2"
           placeholder="0x… (separate multiple addresses with commas)">${w.tokens}</textarea>
       </div>`
    : "";
  const contractFields = state.op === "contract"
    ? `<div class="field">
         <label class="label" for="to-${w.uid}">Contract address</label>
         <input class="input mono" id="to-${w.uid}" data-f="to" placeholder="0x…" value="${w.to}" spellcheck="false" />
       </div>
       <div class="field">
         <label class="label" for="data-${w.uid}">Calldata (hex)</label>
         <textarea class="input mono" id="data-${w.uid}" data-f="data" rows="2" placeholder="0x…">${w.data}</textarea>
       </div>`
    : "";

  el.innerHTML = `
    <div class="wallet-head">
      <span class="wallet-name">Wallet ${index + 1}</span>
      ${total > 1 ? `<button class="wallet-remove" data-remove="${w.uid}">Remove</button>` : ""}
    </div>
    <div class="field">
      <label class="label" for="net-${w.uid}">Network</label>
      <select class="input" id="net-${w.uid}" data-f="network">
        ${CHAINS.map((c) => `<option value="${c.id}" ${c.id === w.network ? "selected" : ""}>${c.name}</option>`).join("")}
      </select>
      <p class="statusline" data-status>EIP-7702 ready · Chain ID ${chain.chainId}</p>
    </div>
    <div class="field">
      <label class="label" for="rpc-${w.uid}">Custom RPC (optional)</label>
      <input class="input mono" id="rpc-${w.uid}" data-f="rpc" placeholder="https://…" value="${w.rpc}" spellcheck="false" />
    </div>
    <div class="field">
      <span class="label" id="gas-${w.uid}-label">Gas price</span>
      <div class="seg" role="group" aria-labelledby="gas-${w.uid}-label">
        <button class="seg-btn ${w.gasMode === "auto" ? "is-on" : ""}" data-gas="auto" data-uid="${w.uid}">Automatic</button>
        <button class="seg-btn ${w.gasMode === "custom" ? "is-on" : ""}" data-gas="custom" data-uid="${w.uid}">Custom</button>
      </div>
    </div>
    <div class="field" ${w.gasMode === "custom" ? "" : "hidden"} data-gasfield>
      <label class="label" for="gwei-${w.uid}">Gas price (gwei)</label>
      <input class="input mono" id="gwei-${w.uid}" data-f="gasPrice" placeholder="1.5" value="${w.gasPrice}" inputmode="decimal" />
    </div>
    <div class="field">
      <label class="label" for="pk-${w.uid}">Compromised wallet private key</label>
      <input class="input mono" id="pk-${w.uid}" data-f="pk" type="password" placeholder="0x…" value="${w.pk}" autocomplete="off" spellcheck="false" />
      <p class="hint" style="text-align:left;margin-top:8px">Used only in this browser to sign the authorization and rescue request. It is never stored by this site.</p>
    </div>
    <div class="field">
      <label class="label" for="rcpt-${w.uid}">Safe recipient address</label>
      <input class="input mono" id="rcpt-${w.uid}" data-f="recipient" placeholder="0x…" value="${w.recipient}" spellcheck="false" />
    </div>
    ${tokensField}
    ${contractFields}
  `;
  return el;
}

function renderWallets() {
  const host = $("#wallets");
  host.textContent = "";
  state.wallets.forEach((w, i) => host.appendChild(walletCard(w, i, state.wallets.length)));
}

/* -------------------------------------------------------------- withdraw */
function fillNetworks(select, current) {
  select.innerHTML = CHAINS.map((c) => `<option value="${c.id}" ${c.id === current ? "selected" : ""}>${c.name}</option>`).join("");
}

async function refreshSponsorBalance() {
  const w = state.sponsor;
  const out = $("#wd-balance");
  if (!w) { out.textContent = "—"; return; }
  const chain = chainById($("#wd-network").value);
  out.textContent = "…";
  try {
    const provider = new JsonRpcProvider(chain.rpc, chain.chainId, { staticNetwork: true });
    const bal = await provider.getBalance(w.address);
    out.textContent = `${Number(formatEther(bal)).toFixed(6)} ${chain.symbol}`;
  } catch {
    out.textContent = "unavailable";
  }
}

function renderWithdraw() {
  const w = state.sponsor;
  const netSel = $("#wd-network");
  if (!netSel.options.length) fillNetworks(netSel, "ethereum");
  $("#wd-address").value = w ? w.address : "";
  $("#btn-withdraw").disabled = !w;
  if (w) refreshSponsorBalance();
}

/* ------------------------------------------------------------------ wire */
document.addEventListener("click", async (e) => {
  const t = e.target.closest("button, .tab");
  if (!t) return;

  if (t.classList.contains("tab")) { setTab(t.dataset.tab); return; }
  if (t.id === "btn-generate" || t.id === "btn-regenerate") { newWallet(); return; }

  const copyId = t.dataset.copy;
  if (copyId) {
    const v = $("#" + copyId).value;
    try { await navigator.clipboard.writeText(v); toast("Copied to clipboard"); }
    catch { toast("Copy failed — select the text manually", true); }
    return;
  }

  if (t.id === "btn-download") {
    const w = state.sponsor; if (!w) return;
    const body = JSON.stringify({ sponsorAddress: w.address, privateKey: w.privateKey, seedPhrase: w.phrase, exportedAt: new Date().toISOString() }, null, 2);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    a.download = `walletrescue-sponsor-${w.address.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Sponsor wallet downloaded");
    return;
  }

  if (t.dataset.op) { pickOp(t.dataset.op); return; }
  if (t.dataset.info) {
    const d = $("#d-" + t.dataset.info);
    d.hidden = !d.hidden;
    return;
  }
  if (t.id === "btn-back") {
    state.op = null;
    renderRescueGate();
    return;
  }
  if (t.id === "btn-add-wallet") {
    state.wallets.push(blankWallet());
    renderRescueGate();
    renderWallets();
    return;
  }
  if (t.dataset.remove) {
    state.wallets = state.wallets.filter((w) => w.uid !== Number(t.dataset.remove));
    if (!state.wallets.length) state.wallets.push(blankWallet());
    renderRescueGate();
    renderWallets();
    return;
  }
  if (t.dataset.gas) {
    const w = state.wallets.find((x) => x.uid === Number(t.dataset.uid));
    if (!w) return;
    w.gasMode = t.dataset.gas;
    renderWallets();
    return;
  }
  if (t.dataset.fee) {
    state.fee = t.dataset.fee;
    $$(".seg-btn[data-fee]").forEach((b) => b.classList.toggle("is-on", b.dataset.fee === state.fee));
    return;
  }
  if (t.id === "btn-refresh") { refreshSponsorBalance(); return; }
  if (t.id === "btn-review") { runRescue(); return; }
  if (t.id === "btn-withdraw") { withdrawAll(); return; }
});

document.addEventListener("input", (e) => {
  const f = e.target.dataset.f;
  if (!f) return;
  const card = e.target.closest(".wallet");
  if (!card) return;
  const w = state.wallets.find((x) => x.uid === Number(card.dataset.uid));
  if (w) w[f] = e.target.value;
});

document.addEventListener("change", (e) => {
  const f = e.target.dataset.f;
  if (f !== "network") return;
  const card = e.target.closest(".wallet");
  const w = state.wallets.find((x) => x.uid === Number(card.dataset.uid));
  if (!w) return;
  w.network = e.target.value;
  const chain = chainById(w.network);
  const status = $("[data-status]", card);
  status.classList.remove("err");
  status.textContent = `EIP-7702 ready · Chain ID ${chain.chainId}`;
});

/* ----------------------------------------------------------------- rescue */
function providerFor(w) {
  const chain = chainById(w.network);
  return new JsonRpcProvider(w.rpc.trim() || chain.rpc, chain.chainId, { staticNetwork: true, timeout: 20000 });
}

async function runRescue() {
  const out = $("#review");
  out.hidden = false;
  out.innerHTML = "<h3>Checking wallets…</h3>";

  const lines = [];
  const problems = [];
  const chain = chainById(state.wallets[0].network);

  for (let i = 0; i < state.wallets.length; i++) {
    const w = state.wallets[i];
    const tag = `Wallet ${i + 1}`;
    if (!w.pk.trim()) { problems.push(`${tag}: private key is missing.`); continue; }
    let signer;
    try { signer = new Wallet(w.pk.trim()); }
    catch { problems.push(`${tag}: the private key could not be parsed.`); continue; }

    if (state.op !== "contract" && !isAddress(w.recipient.trim())) {
      problems.push(`${tag}: recipient address is not a valid 0x address.`);
      continue;
    }
    if (state.op === "contract" && !isAddress(w.to.trim())) {
      problems.push(`${tag}: contract address is not a valid 0x address.`);
      continue;
    }

    const provider = providerFor(w);
    let native = 0n;
    try { native = await provider.getBalance(signer.address); }
    catch { problems.push(`${tag}: the RPC did not answer — set a custom RPC and try again.`); continue; }

    lines.push(`${tag}: ${signer.address} holds ${Number(formatEther(native)).toFixed(6)} ${chain.symbol} on ${chain.name}.`);

    if (state.op === "transfer" || state.op === "claim") {
      const tokens = w.tokens.split(",").map((s) => s.trim()).filter(Boolean);
      if (!tokens.length) problems.push(`${tag}: add at least one token contract address.`);
      for (const addr of tokens) {
        if (!isAddress(addr)) { problems.push(`${tag}: "${addr}" is not a valid token contract.`); continue; }
        try {
          const c = new Contract(getAddress(addr), ERC20_ABI, provider);
          const [bal, dec, sym] = await Promise.all([c.balanceOf(signer.address), c.decimals(), c.symbol().catch(() => "TOKEN")]);
          const human = Number(bal) / 10 ** Number(dec);
          lines.push(`${tag}: ${human} ${sym} at ${getAddress(addr)} → transfers when you sign.`);
          if (bal === 0n) problems.push(`${tag}: ${sym} balance is zero, nothing to move.`);
        } catch { problems.push(`${tag}: ${addr} did not answer as an ERC-20 contract.`); }
      }
    }

    if (native === 0n) {
      problems.push(`${tag}: the compromised wallet holds no ${chain.symbol} for gas — send a little from the sponsor wallet first, then run this again.`);
    }
  }

  const ok = problems.length === 0;
  out.innerHTML = `
    <h3>${ok ? "Ready to sign" : "Needs attention"}</h3>
    <ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("") ||
      "<li>No wallet passed the checks yet.</li>"}</ul>
    ${problems.length ? `<ul>${problems.map((p) => `<li style="color:#b4232a">${escapeHtml(p)}</li>`).join("")}</ul>` : ""}
    <p class="hint" style="text-align:left;margin:0">
      ${ok
        ? "Every wallet checks out. Signing is the next step and is done from this page wallet by wallet; nothing has been broadcast yet."
        : "Fix the lines in red and run the review again."}
    </p>`;
}

/* --------------------------------------------------------------- withdraw */
async function withdrawAll() {
  const w = state.sponsor;
  const status = $("#wd-status");
  if (!w) { status.textContent = "Generate a sponsor wallet first."; return; }
  const recipient = $("#wd-recipient").value.trim();
  if (!isAddress(recipient)) { status.textContent = "Enter a valid recipient address."; return; }

  const chain = chainById($("#wd-network").value);
  const btn = $("#btn-withdraw");
  btn.disabled = true;
  status.textContent = "Preparing the transaction…";

  try {
    const provider = new JsonRpcProvider(chain.rpc, chain.chainId, { staticNetwork: true, timeout: 20000 });
    const signer = new Wallet(w.privateKey, provider);
    const bal = await provider.getBalance(signer.address);
    if (bal === 0n) { status.textContent = `This sponsor wallet holds no ${chain.symbol} on ${chain.name}.`; return; }

    const feeData = await provider.getFeeData();
    const bump = state.fee === "turbo" ? 3n : state.fee === "fast" ? 2n : 1n;
    const maxPriority = (feeData.maxPriorityFeePerGas ?? 1_000_000_000n) * bump;
    const maxFee = (feeData.maxFeePerGas ?? 20_000_000_000n) * bump;

    const gasLimit = 21000n;
    const fee = gasLimit * maxFee;
    if (bal <= fee) { status.textContent = `Balance is too low to cover the network fee (${Number(formatEther(fee)).toFixed(6)} ${chain.symbol}).`; return; }

    const value = bal - fee;
    status.textContent = "Waiting for the signature…";
    const tx = await signer.sendTransaction({
      to: getAddress(recipient),
      value,
      gasLimit,
      maxFeePerGas: maxFee,
      maxPriorityFeePerGas: maxPriority
    });
    status.innerHTML = `Sent ${Number(formatEther(value)).toFixed(6)} ${chain.symbol}. <a href="${chain.explorer}/tx/${tx.hash}" target="_blank" rel="noopener">View on explorer</a>`;
    toast("Withdrawal broadcast");
    refreshSponsorBalance();
  } catch (err) {
    status.textContent = "The transaction failed: " + (err?.shortMessage || err?.message || "unknown error");
  } finally {
    btn.disabled = false;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ------------------------------------------------------------------ boot */
function boot() {
  state.sponsor = loadSponsor();
  const params = new URLSearchParams(location.search);
  setTab(params.get("tab") || "generate", false);

  $("#wd-network").addEventListener("change", refreshSponsorBalance);

  if (!state.sponsor) {
    $("#wd-address").placeholder = "No sponsor wallet yet";
  }
}

document.addEventListener("DOMContentLoaded", boot);
