// EIP-712 voucher shared by agent (signer) and gateway (verifier). Must match AgentTab.sol.
import { recoverTypedDataAddress } from 'viem';

export const voucherTypes = { Voucher: [{ name: 'tabId', type: 'uint256' }, { name: 'cumulative', type: 'uint256' }] };
export const domainFor = (chainId, contract) => ({ name: 'AgentTab', version: '1', chainId, verifyingContract: contract });

export async function signVoucher(account, { chainId, contract, tabId, cumulative }) {
  return account.signTypedData({ domain: domainFor(chainId, contract), types: voucherTypes, primaryType: 'Voucher',
    message: { tabId: BigInt(tabId), cumulative: BigInt(cumulative) } });
}
export async function recoverVoucher({ chainId, contract, tabId, cumulative, sig }) {
  return recoverTypedDataAddress({ domain: domainFor(chainId, contract), types: voucherTypes, primaryType: 'Voucher',
    message: { tabId: BigInt(tabId), cumulative: BigInt(cumulative) }, signature: sig });
}
// Header codec: X-AgentTab: base64url(JSON)
export const encodeHeader = (v) => Buffer.from(JSON.stringify({ ...v, tabId: String(v.tabId), cumulative: String(v.cumulative) })).toString('base64url');
export const decodeHeader = (h) => { const o = JSON.parse(Buffer.from(h, 'base64url').toString('utf8')); return { tabId: BigInt(o.tabId), cumulative: BigInt(o.cumulative), sig: o.sig }; };
