// AgentTab gateway: an example paid agent service on HashKey Chain.
// Env: RPC_URL, CHAIN_ID (133|177), AGENTTAB_ADDRESS, TOKEN (address), PAYEE_PRIVATE_KEY, PRICE_UNITS (6-dec),
//      PORT, SETTLE_EVERY_SEC, DATA_RPC (chain to read for the paid data; default HashKey mainnet)
import http from 'node:http';
import { createPublicClient, createWalletClient, http as httpT, formatGwei } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hashkey, hashkeyTestnet, loadArtifact, TOKENS } from '../lib/chains.mjs';
import { createPaywall } from './paywall.mjs';
import { createTopUpOrder, verifyWebhook } from '../hsp/hsp.mjs';

export async function startGateway({ chain, rpcUrl, contract, token, payeeKey, price = 10_000n, port = 8402, settleEverySec = 60, dataRpc = 'https://mainnet.hsk.xyz' }) {
  const { abi } = loadArtifact('AgentTab');
  const account = privateKeyToAccount(payeeKey);
  const publicClient = createPublicClient({ chain, transport: httpT(rpcUrl), pollingInterval: chain.id === 31337 ? 100 : 2000 });
  const walletClient = createWalletClient({ chain, transport: httpT(rpcUrl), account });
  const dataClient = createPublicClient({ chain: hashkey, transport: httpT(dataRpc, { timeout: 4000 }) });
  const pw = createPaywall({ publicClient, walletClient, contract, abi, token, payee: account.address, price });

  // The paid resource: a live HashKey Chain snapshot (what a trading agent polls before acting)
  const snapshot = pw.protect(async (_req, res) => {
    let data;
    try {
      const [block, gasPrice] = await Promise.all([dataClient.getBlock(), dataClient.getGasPrice()]);
      data = { chainId: 177, block: block.number.toString(), timestamp: Number(block.timestamp), txCount: block.transactions.length, gasPriceGwei: formatGwei(gasPrice), baseFeeGwei: block.baseFeePerGas != null ? formatGwei(block.baseFeePerGas) : null };
    } catch (e) { data = { error: 'data_source_unavailable', detail: String(e.shortMessage || e.message) }; }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(data));
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/v1/snapshot') return snapshot(req, res);
    if (url.pathname === '/v1/pricing') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(pw.requirements())); }
    if (url.pathname === '/v1/stats') {
      const tabs = [...pw.state].map(([id, s]) => ({ tabId: id.toString(), cumulative: s.cumulative.toString(), redeemed: s.redeemed.toString() }));
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ payee: account.address, tabs }));
    }
    if (url.pathname === '/hsp/topup' && req.method === 'POST') { // human funds an agent wallet through HSP checkout
      const amountUsd = url.searchParams.get('usd') || '5.00'; const to = url.searchParams.get('agent');
      const r = await createTopUpOrder({ orderId: `TOPUP-${Date.now()}`, chainId: chain.id, token, payTo: to || account.address, amountUsd, label: `AgentTab top-up for ${to || 'agent'}` });
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(r));
    }
    if (url.pathname === '/hsp/webhook' && req.method === 'POST') {
      let raw = ''; for await (const c of req) raw += c;
      const ok = process.env.HSP_APP_SECRET && verifyWebhook(raw, req.headers['x-signature'], process.env.HSP_APP_SECRET);
      res.writeHead(ok ? 200 : 401); return res.end(ok ? 'ok' : 'bad signature');
    }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(port, r));
  const timer = settleEverySec ? setInterval(() => pw.settle().catch((e) => console.error('settle failed', e.shortMessage || e)), settleEverySec * 1000) : null;
  return { server, paywall: pw, close: () => { if (timer) clearInterval(timer); server.close(); }, url: `http://127.0.0.1:${port}` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const chainId = Number(process.env.CHAIN_ID || 133);
  const chain = chainId === 177 ? hashkey : hashkeyTestnet;
  const g = await startGateway({ chain, rpcUrl: process.env.RPC_URL || chain.rpcUrls.default.http[0], contract: process.env.AGENTTAB_ADDRESS,
    token: process.env.TOKEN || TOKENS[chainId].USDC, payeeKey: process.env.PAYEE_PRIVATE_KEY, price: BigInt(process.env.PRICE_UNITS || 10000),
    port: Number(process.env.PORT || 8402), settleEverySec: Number(process.env.SETTLE_EVERY_SEC || 300) });
  console.log(`AgentTab gateway on ${g.url} (chain ${chainId})`);
}
