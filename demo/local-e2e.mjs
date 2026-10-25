// End-to-end on a local anvil fork-free chain: deploy, open tab, 25 paid calls, one batch settlement.
import { spawn } from 'node:child_process';
import { createPublicClient, createWalletClient, http, defineChain, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { loadArtifact, ERC20_ABI } from '../lib/chains.mjs';
import { startGateway } from '../gateway/server.mjs';
import { TabAgent } from '../agent/client.mjs';

const ANVIL = `${process.env.HOME}/.foundry/bin/anvil`;
const PORT = 18545, rpc = `http://127.0.0.1:${PORT}`;
// anvil dev key #0 (public, well-known) + two throwaway demo keys funded via anvil_setBalance
const K = ['0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', '0x' + '33'.repeat(32), '0x' + '22'.repeat(32)];
const chain = defineChain({ id: 31337, name: 'anvil', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });

const anvil = spawn(ANVIL, ['--port', String(PORT), '--silent'], { stdio: 'ignore' });
const cleanup = () => anvil.kill();
process.on('exit', cleanup);
await new Promise((r) => setTimeout(r, 1200));
try {
  const pub = createPublicClient({ chain, transport: http(rpc), pollingInterval: 100 });
  const [deployer, payer, service] = K.map((k) => createWalletClient({ chain, transport: http(rpc), account: privateKeyToAccount(k) }));
  for (const w of [payer, service]) await pub.request({ method: 'anvil_setBalance', params: [w.account.address, '0x56BC75E2D63100000'] });
  const agentHotKey = privateKeyToAccount('0x' + '11'.repeat(32)); // signs vouchers only; holds no funds
  const deploy = async (name) => { const a = loadArtifact(name); const h = await deployer.deployContract({ abi: a.abi, bytecode: a.bytecode }); return (await pub.waitForTransactionReceipt({ hash: h })).contractAddress; };
  const usd = await deploy('MockUSD'); const tab = await deploy('AgentTab');
  const usdAbi = loadArtifact('MockUSD').abi; const { abi } = loadArtifact('AgentTab');
  await pub.waitForTransactionReceipt({ hash: await deployer.writeContract({ address: usd, abi: usdAbi, functionName: 'mint', args: [payer.account.address, 100_000_000n] }) });
  console.log(`AgentTab ${tab}\nmUSD     ${usd}`);

  const g = await startGateway({ chain, rpcUrl: rpc, contract: tab, token: usd, payeeKey: K[2], price: 10_000n, port: 18402, settleEverySec: 0 });
  const agent = new TabAgent({ publicClient: pub, walletClient: payer, abi, signer: agentHotKey, depositUnits: 1_000_000n, maxSpendPerService: 5_000_000n });

  const r0 = await fetch(`${g.url}/v1/snapshot`); console.log('unpaid call ->', r0.status, (await r0.json()).error);
  let last;
  for (let i = 0; i < 25; i++) { const r = await agent.fetch(`${g.url}/v1/snapshot`); if (r.status !== 200) throw new Error(`call ${i} -> ${r.status} ${await r.text()}`); last = await r.json(); }
  console.log('25 paid calls OK; last response:', JSON.stringify(last));
  const t = [...agent.tabs.values()][0];
  // replay attack: resend an old voucher -> must be rejected
  const { encodeHeader, signVoucher } = await import('../lib/voucher.mjs');
  const old = await signVoucher(agentHotKey, { chainId: 31337, contract: tab, tabId: t.tabId, cumulative: 10_000n });
  const rr = await fetch(`${g.url}/v1/snapshot`, { headers: { 'X-AgentTab': encodeHeader({ tabId: t.tabId, cumulative: 10_000n, sig: old }) } });
  console.log('replayed old voucher ->', rr.status, (await rr.json()).error);
  const before = await pub.readContract({ address: usd, abi: ERC20_ABI, functionName: 'balanceOf', args: [service.account.address] });
  const s = await g.paywall.settle({ force: true });
  const after = await pub.readContract({ address: usd, abi: ERC20_ABI, functionName: 'balanceOf', args: [service.account.address] });
  console.log(`settled ${s.tabs} tab(s) in 1 tx ${s.hash} (${s.status}); service earned ${formatUnits(after - before, 6)} mUSD for 25 calls; on-chain txs by agent: 2 (approve+openTab)`);
  const rem = await pub.readContract({ address: tab, abi, functionName: 'remaining', args: [t.tabId] });
  console.log(`tab #${t.tabId} remaining ${formatUnits(rem, 6)} mUSD`);
  g.close();
} finally { cleanup(); }
process.exit(0);
