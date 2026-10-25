// Agent-side: fetch() that transparently pays HTTP 402 AgentTab services.
// Opens one tab per service (one on-chain tx), then each call is just an off-chain signature.
import { decodeEventLog } from 'viem';
import { signVoucher, encodeHeader } from '../lib/voucher.mjs';
import { ERC20_ABI } from '../lib/chains.mjs';

export class TabAgent {
  /** @param signer optional separate hot key for vouchers (payer wallet can be a human/HSP-funded wallet) */
  constructor({ publicClient, walletClient, abi, signer = walletClient.account, depositUnits, ttlSec = 86_400n, maxSpendPerService }) {
    Object.assign(this, { publicClient, walletClient, abi, signer, depositUnits, ttlSec, maxSpendPerService });
    this.tabs = new Map(); // `${contract}:${payee}:${asset}` -> { tabId, cumulative, deposit }
  }

  async ensureTab(req) {
    const key = `${req.contract}:${req.payee}:${req.asset}`.toLowerCase();
    if (this.tabs.has(key)) return this.tabs.get(key);
    const deposit = this.depositUnits ?? BigInt(req.minDeposit);
    if (this.maxSpendPerService && deposit > this.maxSpendPerService) throw new Error('deposit exceeds agent spend policy');
    const { walletClient: w, publicClient: p } = this;
    const allowance = await p.readContract({ address: req.asset, abi: ERC20_ABI, functionName: 'allowance', args: [w.account.address, req.contract] });
    if (allowance < deposit) await p.waitForTransactionReceipt({ hash: await w.writeContract({ address: req.asset, abi: ERC20_ABI, functionName: 'approve', args: [req.contract, deposit], account: w.account, chain: w.chain }) });
    const expiry = BigInt(Math.floor(Date.now() / 1000)) + this.ttlSec;
    const hash = await w.writeContract({ address: req.contract, abi: this.abi, functionName: 'openTab', args: [req.payee, req.asset, this.signer.address, deposit, expiry], account: w.account, chain: w.chain });
    const rc = await p.waitForTransactionReceipt({ hash });
    let tabId;
    for (const log of rc.logs) { try { const ev = decodeEventLog({ abi: this.abi, ...log }); if (ev.eventName === 'TabOpened') tabId = ev.args.tabId; } catch {} }
    const t = { tabId, cumulative: 0n, deposit, openTx: hash };
    this.tabs.set(key, t);
    return t;
  }

  async fetch(url, init = {}) {
    let res = await fetch(url, init);
    if (res.status !== 402) return res;
    const body = await res.json();
    const req = body.accepts?.find((a) => a.scheme === 'agenttab-voucher');
    if (!req) throw new Error('no supported payment scheme');
    const chainId = Number(req.network.split(':')[1]);
    if (chainId !== this.publicClient.chain.id) throw new Error(`service wants chain ${chainId}`);
    const tab = await this.ensureTab(req);
    const next = tab.cumulative + BigInt(req.maxAmountRequired);
    if (next > tab.deposit) throw new Error('tab exhausted: top up (e.g. via HSP checkout) or open a new one');
    const sig = await signVoucher(this.signer, { chainId, contract: req.contract, tabId: tab.tabId, cumulative: next });
    res = await fetch(url, { ...init, headers: { ...(init.headers || {}), 'X-AgentTab': encodeHeader({ tabId: tab.tabId, cumulative: next, sig }) } });
    if (res.ok) tab.cumulative = next;
    return res;
  }
}
