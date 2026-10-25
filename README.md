# AgentTab: pay-per-request agent-to-agent settlement on HashKey Chain

**Track:** Agent Payments & A2A Settlement (HashKey Chain Horizon Hackathon, Mumbai Edition)

AI agents need to pay other agents for every API call, which can mean thousands of calls at $0.001–$0.05 each. One on-chain transfer per call costs too much in gas and is too slow. A card or merchant checkout per call is worse.

AgentTab opens one **tab**, an on-chain escrow in USDC/USDT on HashKey Chain, between a paying agent and a service agent. After that, **every call is paid with an off-chain EIP-712 voucher** carrying the *cumulative* amount owed. The service checks the voucher in microseconds, with no gas. Later it settles any number of calls from any number of clients in **one `redeemBatch` transaction**. Humans fund agents through **HSP checkout**, the HashKey Settlement Platform.

```
 human ──HSP checkout (USDC)──► agent wallet ──openTab(deposit)──► AgentTab.sol (HashKey Chain)
                                     │                                   ▲
                                     │ HTTP GET /v1/snapshot             │ redeemBatch(ids, cumulatives, sigs)
                                     ▼                                   │  (1 tx settles N tabs × M calls)
                              service agent  ◄── X-AgentTab: voucher ────┘
                              (HTTP 402 paywall: verify sig + monotonic cumulative, serve)
```

## Why this design

- **Gas.** The agent sends 2 transactions (approve + openTab). Each paid call after that costs 0 transactions. The service settles in 1 transaction whenever it wants.
- **Safety.**
  - A voucher can never pay more than the deposit.
  - Vouchers are bound to `chainId`, the contract and the `tabId` through the EIP-712 domain, so they can't be replayed across tabs or chains.
  - Stale vouchers are a no-op.
  - Only low-s signatures are accepted (no malleability).
  - Calls are reentrancy-guarded.
  - After `expiry`, the payer reclaims whatever the service did not redeem.
- **Key separation.** Vouchers are signed by an **agent hot key** that holds no funds. The deposit comes from a separate payer wallet, which can be a human or treasury wallet topped up via HSP. A compromised agent can lose at most the open tab balance. Each tab is capped, and the agent client also enforces a per-service spend policy (`maxSpendPerService`).
- **HTTP-native.** Unpaid requests get `402 Payment Required` with an x402-style `accepts` descriptor (`scheme: agenttab-voucher`, `network: eip155:177`). Any agent can discover the price and pay automatically.
- **HSP.** `hsp/hsp.mjs` builds HSP Cart Mandates. It handles HMAC-SHA256 request signing, an ES256K `merchant_authorization` JWT with `cart_hash` over canonical JSON, and webhook verification. Humans use it to top up agent wallets in USDC on HashKey Chain via HSP checkout, so HSP is the fiat/human → agent on-ramp and AgentTab is the agent ↔ agent rail.

## What's in the repo

| Path | What |
|---|---|
| `contracts/src/AgentTab.sol` | Escrow + EIP-712 voucher redemption, batch settlement, top-up and expiry reclaim |
| `contracts/test/AgentTab.t.sol` | 10 Foundry tests, including a fuzz test proving the payee never gets more than the deposit |
| `gateway/paywall.mjs` | HTTP 402 middleware: verifies vouchers off-chain, rejects replay and concurrent double-spend, batch-settles |
| `gateway/server.mjs` | Example paid service: live HashKey Chain snapshot (block, gas, base fee) for trading agents, plus `/hsp/topup` and `/hsp/webhook` |
| `agent/client.mjs` | `TabAgent.fetch()`: drop-in fetch that pays 402s (opens a tab once, then signs vouchers) |
| `hsp/hsp.mjs` | HSP merchant adapter (Cart Mandate, HMAC, ES256K JWT, webhook) |
| `demo/local-e2e.mjs` | Full end-to-end on local anvil, serving real HashKey mainnet data |

## Run it

```bash
npm install
(cd contracts && forge test)          # 10 passing
node --test test/                     # 5 passing (HSP adapter)
node demo/local-e2e.mjs               # deploy → 402 → 25 paid calls → replay rejected → 1-tx settlement
```

Demo output (`demo/DEMO_OUTPUT.txt`):
```
unpaid call -> 402 payment_required
25 paid calls OK; last response: {"chainId":177,"block":"29308795",...,"gasPriceGwei":"500.001"}
replayed old voucher -> 402 voucher_increment_below_price
settled 1 tab(s) in 1 tx ... (success); service earned 0.25 mUSD for 25 calls; on-chain txs by agent: 2 (approve+openTab)
```

## Deploy to HashKey Chain

```bash
cd contracts
forge script script/Deploy.s.sol --rpc-url hashkey --broadcast --private-key $DEPLOYER_PK          # mainnet 177
# testnet: --rpc-url hashkey_testnet
cp ../.env.example ../.env   # fill AGENTTAB_ADDRESS, PAYEE_PRIVATE_KEY, HSP_* keys
node ../gateway/server.mjs
```

## Status / honest limits

- The HSP adapter follows the publicly summarised merchant docs. It runs in **dry-run** mode until HSP app keys are issued, and the endpoint and header names must be checked against the official HashKey merchant PDF on hashfans.io.
- Gateway state is in memory. Production would persist the latest voucher per tab, and must settle before `expiry` (the server's safety window is 120 s).
- The contract has not been audited.

License: MIT
