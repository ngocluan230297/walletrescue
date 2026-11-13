# WalletRescue — Rescue Dashboard

A three step dashboard for recovering assets from a compromised EVM wallet.

1. **Generate** — creates a sponsor wallet in the browser (address, private key, seed phrase).
   The sponsor pays gas for the rescue because any gas sent to the compromised wallet is swept.
2. **Rescue** — pick an operation (Claim & Transfer, Transfer Tokens, Rescue NFTs, Contract
   Interaction), choose a network, then enter the compromised private key, a safe recipient and
   the token contracts.
3. **Withdraw** — sweep the remaining native balance out of the sponsor wallet to a recipient.

## Run it

It is a static site. Any static host works:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

Or open `index.html` directly. An internet connection is needed on first load for the ethers.js
module and the font.

## What actually executes

| Step | Live on chain |
| --- | --- |
| Generate | Yes — a real secp256k1 keypair and BIP-39 phrase, created locally |
| Withdraw | Yes — signs and broadcasts a native transfer from the sponsor wallet |
| Rescue | Validates each wallet and reads real balances over RPC; signing is the remaining step |

The original dashboard routes rescue transactions through its own rescue contract with an
EIP-7702 delegation, so the sponsor pays the gas and a 20% protocol fee applies. This build ships
no contract address, so it checks the wallet, the token contracts and the gas balance instead of
inventing a contract to call. Point `runRescue()` in `app.js` at your own contract to complete it.

Default RPC endpoints are public and rate limited. Paste your own in the Custom RPC field when a
network is slow.

## Files

- `index.html` — markup and all three panels
- `styles.css` — the lavender and mono theme
- `app.js` — wallet generation, RPC reads, rescue review, withdraw

## Deploy to GitHub Pages

1. Push this folder to a repository.
2. Settings → Pages → Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. The site appears at `https://<user>.github.io/<repo>/`.

## Security

Keys never leave the tab: the sponsor wallet lives in `localStorage` on this device and nothing is
sent to a server. Never paste a key you also use for long-term storage, and treat the sponsor
wallet as disposable once the rescue is done.
