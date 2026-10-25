# AgentTab — demo video (≤3 min)

Format: motion-graphics explainer + real terminal screen recording as proof. Target length ~2:40.
Deliverables in this folder: `agenttab_demo.mp4` (produced), plus this storyboard/narration to re-record with your own voice if you want.

| # | Time | Visual | Narration |
|---|------|--------|-----------|
| 1 | 0:00–0:16 | Title card: "AgentTab — pay-per-request A2A settlement on HashKey Chain". Subtitle: HashKey Chain Horizon · Agent Payments & A2A Settlement. | "This is AgentTab: pay-per-request settlement between AI agents, on HashKey Chain. Built for the Agent Payments and A2A Settlement track." |
| 2 | 0:16–0:40 | Problem animation: a payer agent firing many tiny calls at a service agent; each call spawns an on-chain tx with a gas coin bigger than the payment; a red "too slow / too expensive" stamp. | "Agents pay each other for every API call — fractions of a cent, thousands of times. One on-chain transfer per call is too slow, and the gas dwarfs the payment. A checkout per call is worse." |
| 3 | 0:40–1:05 | Solution animation: "openTab" locks a deposit in the AgentTab contract; then each call is an off-chain signed voucher with a rising cumulative number; a counter shows "on-chain tx: 2" staying flat while "paid calls" climbs. | "AgentTab opens one tab — an escrow in USDC on HashKey Chain. After that, every call is paid with an off-chain EIP-712 voucher carrying the cumulative amount owed. Signing is free and instant." |
| 4 | 1:05–1:25 | Batch settle animation: many vouchers collapse into one "redeemBatch" arrow hitting the chain; USDC flows to the service wallet. | "Whenever it likes, the service redeems the latest voucher — settling any number of calls, from any number of clients, in a single transaction." |
| 5 | 1:25–2:20 | REAL terminal recording of `node demo/local-e2e.mjs`: deploy, 402 on the unpaid call, 25 paid calls, replayed-voucher rejected, one-tx settlement, remaining balance. | "Here's the real thing. We deploy the contract, start the paid service — which serves live HashKey mainnet data. An unpaid call gets a 402. Then 25 paid calls go through. A replayed old voucher is rejected. And all 25 settle in one transaction: two on-chain transactions for the agent, one for the service." |
| 6 | 2:20–2:40 | Safety + HSP card: bullet list (voucher ≤ deposit, bound to chain/contract/tab, hot key holds no funds, HSP top-ups). Repo URL + contract address. | "Vouchers can never exceed the deposit, can't be replayed, and the signing key holds no funds. Humans top agents up through HSP. Code and the deployed contract are linked below. Thanks for watching." |

## Record-it-yourself (optional, for your own voice)
1. `node demo/local-e2e.mjs` in a clean terminal (scenes 5).
2. Screen-record scenes 1–4 from `assets/logo.svg` + the README mermaid diagrams, or just reuse `agenttab_demo.mp4`.
3. Keep under 3:00; upload to YouTube/Loom; paste the link into the DoraHacks form.
