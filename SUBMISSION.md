# DoraHacks BUIDL submission — AgentTab

**Hackathon:** HashKey Chain Horizon Hackathon (Mumbai Edition) · https://dorahacks.io/hackathon/hskchainindia
**Submission deadline:** Nov 1, 2026, 21:30 IST = **17:00 Budapest (CET)**. Register and submit before this; late entries are not accepted.
**Track:** Agent Payments & A2A Settlement

Fill the DoraHacks "Create new BUIDL" form with the values below (copy/paste). Required text fields are marked *.

---

## Project information (BUIDL form)

- **Project Name\*:** AgentTab
- **Logo:** `assets/logo.svg` in the repo (optional; upload if prompted)
- **Tagline\*:** Pay-per-request agent-to-agent settlement on HashKey Chain — one tab, thousands of calls, one settlement transaction.
- **Project Source\*:** Hackathon
- **Tech Tree\*:** Crypto / Web3 → (category) Payments / Infrastructure
- **Infrastructure where currently deployed\*:** HashKey Chain (chain ID 177)  ← select HashKey; paste the deployed contract address (from DEPLOY.md) in the description
- **Demo video URL\*:** `<YouTube/Loom link, ≤3 min>`  (see video/STORYBOARD.md)
- **Demo link / Website:** `<optional — the GitHub repo or a short Loom>`
- **GitHub Repository URL\*:** https://github.com/devx-agent/devx-agenttab
- **Telegram username\*:** `<your Telegram>`  (DoraHacks requires this)

## Project Description\* (paste)

AgentTab is pay-per-request agent-to-agent (A2A) settlement for AI agents on HashKey Chain.

AI agents increasingly pay other agents for every API call — tiny amounts ($0.001–$0.05), constantly. One on-chain transfer per call is too slow and the gas dwarfs the payment; a card or merchant checkout per call is worse. AgentTab fixes this: a paying agent opens one on-chain tab (an escrow in USDC/USDT on HashKey Chain) for a service agent, then pays each call with an off-chain EIP-712 voucher carrying the cumulative amount owed. The service verifies the voucher in microseconds with zero gas, serves the request, and later settles any number of calls from any number of clients in a single redeemBatch transaction. In the demo, 25 paid calls cost the paying agent only 2 on-chain transactions (approve + openTab), and the service settles all of them in 1 transaction.

It is HTTP-native: unpaid requests return 402 Payment Required with an x402-style descriptor (scheme agenttab-voucher, network eip155:177), so any agent discovers the price and pays automatically. TabAgent.fetch() is a drop-in fetch that handles this.

Safe by construction: a voucher can never exceed the deposit (proven by a fuzz test); vouchers are bound to the chain, contract and tab via the EIP-712 domain so they can't be replayed; stale vouchers are a no-op; only low-s signatures are accepted; calls are reentrancy-guarded; and after expiry the payer reclaims the remainder. Vouchers are signed by an agent hot key that holds no funds, while the deposit sits in a separate payer wallet funded by a human through HSP — so a compromised agent can lose at most its open tab.

HSP integration (Agent Payments track requirement): the HSP adapter builds HashKey Settlement Platform Cart Mandates for human → agent top-ups, implementing the documented auth scheme — HMAC-SHA256 request signing, an ES256K merchant_authorization JWT with a cart_hash over RFC-8785 canonical JSON, and HMAC webhook verification. HSP is the human/fiat on-ramp; AgentTab is the agent ↔ agent rail.

Tested: 10 Foundry tests (incl. a fuzz invariant that the payee never receives more than the deposit) and 5 HSP-adapter tests, all passing, plus an end-to-end demo that shows the 402 → pay → replay-rejected → one-transaction settlement flow against live HashKey mainnet data.

Deployed contract (HashKey Chain, id 177): `<fill AgentTab address after deploy>`
Explorer: https://hashkey.blockscout.com/address/`<address>`

## Team information

- **Name:** Muhammad Usman
- **Role:** Solo — full-stack & AI engineer
- **Short bio:** Top Rated full-stack and AI developer; builds agent infrastructure, smart contracts and web apps.
- **Country of residence:** Hungary
- **Email / Telegram / X / LinkedIn:** `<fill your own>`
- **In-person Mumbai demo:** Not available; online demo. (In-person teams get demo-slot priority, but online demos are allowed.)

## Terms
- Original work built during the hackathon. ✔ (agree to the user agreement / I have the right to all code submitted)

---

## Pre-submit checklist
- [ ] Repo pushed & public: https://github.com/devx-agent/devx-agenttab
- [ ] Contract deployed to HashKey mainnet (177) — address pasted above & in README/DEPLOY.md  ← **required for demo eligibility**
- [ ] Demo video (≤3 min) uploaded, link pasted
- [ ] (Optional, scored) HSP app keys obtained; `/hsp/topup` live instead of dry-run
- [ ] DoraHacks account created; Telegram username ready
- [ ] BUIDL submitted & track = Agent Payments & A2A Settlement, before Nov 1 17:00 Budapest
