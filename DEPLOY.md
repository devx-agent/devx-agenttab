# Deploy AgentTab to HashKey Chain

## Network facts (from docs.hskchain.net / docs.hashkeychain.net)

| | Mainnet | Testnet |
|---|---|---|
| Network name | HSKChain | HSKChain Testnet |
| RPC | `https://mainnet.hsk.xyz` | `https://testnet.hsk.xyz` |
| Chain ID | **177** | 133 |
| Native token | HSK | HSK |
| Explorer | https://hashkey.blockscout.com | https://testnet-explorer.hsk.xyz |

## Which network for the hackathon?

**Mainnet (177) is required.** The hackathon rules state: *"Make sure you deploy your smart contract on HashKey Chain mainnet; projects that have not completed deployment will be automatically deemed to have forfeited their eligibility for demo selection."* A testnet-only deploy does **not** qualify for a demo slot.

> We could not self-deploy to testnet for you as a dry-run: the official faucet (`faucet.hsk.xyz`) is gated behind Google reCAPTCHA v2, which needs a human, and the alternative route needs Sepolia ETH bridged in. Since mainnet is required anyway, just deploy to mainnet — it costs about **$0.06** (see below).

## Cost estimate

- Deployment gas (measured locally): **1,263,542 gas**.
- Live HashKey mainnet gas price (fetched): ~**500 gwei**.
- Deploy cost ≈ 1,263,542 × 500e-9 = **~0.632 HSK ≈ $0.06** (HSK ≈ $0.088).
- **Hold ~2–3 HSK** in the deployer wallet to be safe. Get HSK on an exchange that lists it, or bridge in. (We spent nothing; this is your wallet.)

## Deploy — one command

Prereqs: [Foundry](https://getfoundry.sh) installed (`forge --version`), a funded deployer wallet private key.

```bash
cd contracts
forge create src/AgentTab.sol:AgentTab \
  --rpc-url https://mainnet.hsk.xyz \
  --chain-id 177 \
  --private-key $DEPLOYER_PK \
  --broadcast
```

Or with the included script (same result, prints the address + chain id):

```bash
cd contracts
DEPLOYER_PK=0xYOUR_KEY forge script script/Deploy.s.sol \
  --rpc-url https://mainnet.hsk.xyz --broadcast --private-key $DEPLOYER_PK
```

`forge create` prints `Deployed to: 0x…`. That is the **AgentTab address**.

### After deploy
1. Paste the address into `SUBMISSION.md`, `README.md`, and the DoraHacks form.
2. (Optional) verify on Blockscout:
   ```bash
   forge verify-contract <ADDRESS> src/AgentTab.sol:AgentTab \
     --verifier blockscout --verifier-url https://hashkey.blockscout.com/api \
     --chain-id 177
   ```
3. (Optional) run the service against mainnet:
   ```bash
   cp .env.example .env   # fill AGENTTAB_ADDRESS, PAYEE_PRIVATE_KEY, (optional) HSP_* keys
   node gateway/server.mjs
   ```

## Security note
Never paste a private key with real funds into a shared shell or commit it. Use a **fresh deployer wallet** holding only a few HSK. `.env` and keys are git-ignored.
