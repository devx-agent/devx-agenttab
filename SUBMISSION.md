# DoraHacks BUIDL submission: HashKey Chain Horizon Hackathon (Mumbai Edition)
Hackathon page: https://dorahacks.io/hackathon/hskchainindia
Deadline: Nov 1, 2026, 21:30 IST (= 17:00 Budapest, CET)

**BUIDL name:** AgentTab
**Track:** Agent Payments & A2A Settlement
**Tagline:** Pay-per-request agent-to-agent settlement on HashKey Chain: one tab, thousands of calls, one settlement transaction.

**Description (paste):**
AI agents increasingly pay other agents per API call, and an on-chain transfer per call is too slow and too expensive. AgentTab lets a paying agent lock USDC/USDT on HashKey Chain in a "tab" for a service agent. Each HTTP request is then paid with an off-chain EIP-712 voucher carrying the cumulative amount owed. The service verifies it instantly with no gas and settles any number of calls from any number of clients in a single redeemBatch transaction.

- HTTP-native: unpaid requests get 402 Payment Required with an x402-style descriptor (scheme agenttab-voucher, eip155:177), so agents discover the price and pay automatically. `TabAgent.fetch()` is a drop-in fetch.
- Safe by construction:
  - A voucher can never exceed the deposit.
  - Vouchers are bound to chain, contract and tab through the EIP-712 domain.
  - Stale vouchers are a no-op.
  - Only low-s signatures are accepted, and calls are reentrancy-guarded.
  - The payer reclaims the remainder after expiry.
- Key separation: vouchers are signed by an agent hot key that holds no funds. Deposits come from a payer wallet funded by a human through HSP checkout. A compromised agent can lose at most its open tab.
- HSP integration: the HSP adapter creates Cart Mandates for human → agent top-ups (HMAC-SHA256 request signing, ES256K merchant_authorization JWT with cart_hash, webhook verification). HSP is the human on-ramp and AgentTab is the agent ↔ agent rail.
- Demo service: a paid live HashKey Chain snapshot feed for trading agents (block, gas, base fee), priced at 0.01 USDC per call.

Tested: 10 Foundry tests, including a fuzz invariant that the payee never receives more than the deposit, plus 5 HSP adapter tests. An end-to-end demo shows 25 paid calls, a replayed voucher being rejected, and settlement in 1 transaction.

**Mainnet contract:** <AgentTab address on HashKey Chain 177, filled in after deploy>
**Explorer:** https://hashkey.blockscout.com/address/<address>
**GitHub:** <repo URL>
**Demo video (≤3 min):** <link> (record `node demo/local-e2e.mjs` plus the 402 → pay → settle flow)
**Team:** Muhammad Usman (solo), full-stack & AI engineer, Budapest. In-person demo in Mumbai: not available; online demo.
