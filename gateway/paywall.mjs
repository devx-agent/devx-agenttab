// HTTP 402 paywall: verifies AgentTab vouchers off-chain (zero gas per request), settles in batches on-chain.
import { getAddress } from 'viem';
import { recoverVoucher, decodeHeader } from '../lib/voucher.mjs';

export function createPaywall({ publicClient, walletClient, contract, abi, token, payee, price, minDeposit = price * 100n, expirySafetySec = 120n, settleThreshold = price * 50n }) {
  const latest = new Map(); // tabId -> { cumulative, sig, redeemed }
  const tabCache = new Map(); // tabId -> { tab, at }
  const chainId = publicClient.chain.id;

  const requirements = () => ({
    x402Version: 2, // descriptor shape borrowed from x402; scheme is AgentTab vouchers
    accepts: [{ scheme: 'agenttab-voucher', network: `eip155:${chainId}`, contract, payee, asset: token,
      maxAmountRequired: price.toString(), minDeposit: minDeposit.toString(), header: 'X-AgentTab',
      voucher: { primaryType: 'Voucher', domain: { name: 'AgentTab', version: '1', chainId, verifyingContract: contract } } }],
  });

  async function readTab(tabId, fresh = false) {
    const c = tabCache.get(tabId);
    if (!fresh && c && Date.now() - c.at < 10_000) return c.tab;
    const [payer, signer, tPayee, tToken, deposit, redeemed, expiry, closed] = await publicClient.readContract({ address: contract, abi, functionName: 'tabs', args: [tabId] });
    const tab = { payer, signer, payee: tPayee, token: tToken, deposit, redeemed, expiry, closed };
    tabCache.set(tabId, { tab, at: Date.now() });
    return tab;
  }

  /** returns { ok, status, body, receipt } */
  async function check(headerValue) {
    if (!headerValue) return { ok: false, status: 402, body: { error: 'payment_required', ...requirements() } };
    let v; try { v = decodeHeader(headerValue); } catch { return { ok: false, status: 400, body: { error: 'bad_voucher_header' } }; }
    const prev = latest.get(v.tabId)?.cumulative;
    let tab = await readTab(v.tabId, prev === undefined);
    if (v.cumulative > tab.deposit) tab = await readTab(v.tabId, true); // maybe topped up since cache
    const now = BigInt(Math.floor(Date.now() / 1000));
    const already = prev ?? tab.redeemed;
    const fail = (error) => ({ ok: false, status: 402, body: { error, ...requirements() } });
    if (tab.payee === '0x0000000000000000000000000000000000000000') return fail('unknown_tab');
    if (getAddress(tab.payee) !== getAddress(payee) || getAddress(tab.token) !== getAddress(token)) return fail('tab_not_for_this_service');
    if (tab.closed || tab.expiry <= now + expirySafetySec) return fail('tab_closed_or_expiring');
    if (v.cumulative > tab.deposit) return fail('tab_exhausted_top_up');
    if (v.cumulative - already < price) return fail('voucher_increment_below_price');
    let who; try { who = await recoverVoucher({ chainId, contract, tabId: v.tabId, cumulative: v.cumulative, sig: v.sig }); } catch { return fail('bad_signature'); }
    if (getAddress(who) !== getAddress(tab.signer)) return fail('bad_signature');
    // re-check after awaits: two concurrent requests must not spend the same increment
    const cur = latest.get(v.tabId)?.cumulative ?? tab.redeemed;
    if (v.cumulative - cur < price) return fail('voucher_replayed');
    latest.set(v.tabId, { cumulative: v.cumulative, sig: v.sig, redeemed: latest.get(v.tabId)?.redeemed ?? tab.redeemed });
    return { ok: true, receipt: { tabId: v.tabId.toString(), cumulative: v.cumulative.toString(), remaining: (tab.deposit - v.cumulative).toString() } };
  }

  /** Node http middleware-style wrapper */
  const protect = (handler) => async (req, res) => {
    try {
      const r = await check(req.headers['x-agenttab']);
      if (!r.ok) { res.writeHead(r.status, { 'content-type': 'application/json' }); return res.end(JSON.stringify(r.body)); }
      res.setHeader('X-AgentTab-Receipt', Buffer.from(JSON.stringify(r.receipt)).toString('base64url'));
      return handler(req, res);
    } catch (e) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'paywall_error', detail: String(e.message || e) })); }
  };

  /** Redeem all tabs with >= threshold unsettled (or all if force). One tx for N tabs. */
  async function settle({ force = false } = {}) {
    const ids = [], cums = [], sigs = [];
    for (const [id, s] of latest) if (s.cumulative > s.redeemed && (force || s.cumulative - s.redeemed >= settleThreshold)) { ids.push(id); cums.push(s.cumulative); sigs.push(s.sig); }
    if (!ids.length) return null;
    const hash = await walletClient.writeContract({ address: contract, abi, functionName: 'redeemBatch', args: [ids, cums, sigs], account: walletClient.account, chain: walletClient.chain });
    const rc = await publicClient.waitForTransactionReceipt({ hash });
    ids.forEach((id, i) => { latest.get(id).redeemed = cums[i]; tabCache.delete(id); });
    return { hash, tabs: ids.length, status: rc.status };
  }

  return { protect, check, settle, requirements, state: latest };
}
