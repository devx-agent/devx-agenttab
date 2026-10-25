// HSP (HashKey Settlement Platform) merchant adapter — used so a HUMAN can top up an agent's wallet/tab
// through HSP checkout (USDC/USDT on HashKey Chain), while agents settle with each other via AgentTab.
// Auth scheme per HashKey merchant docs as publicly summarised (HMAC-SHA256 request signing +
// ES256K merchant_authorization JWT with cart_hash). Confirm against the official PDF on hashfans.io
// once HSP_APP_KEY/SECRET are issued. Without keys every call runs in dry-run mode.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1';

export const HSP_BASE = { qa: 'https://merchant-qa.hashkeymerchant.com', production: 'https://merchant.hashkey.com' };

/** RFC 8785-style canonical JSON (sorted keys, no whitespace). Amounts are strings in HSP payloads. */
export function canonicalJSON(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJSON).join(',')}]`;
  return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJSON(v[k])}`).join(',')}}`;
}
const sha256hex = (s) => createHash('sha256').update(s).digest('hex');
const b64url = (b) => Buffer.from(b).toString('base64url');

export function signRequest({ appKey, appSecret, method, path, query = '', body, timestamp = Math.floor(Date.now() / 1000).toString(), nonce = randomBytes(16).toString('hex') }) {
  const bodyHash = body === undefined ? '' : sha256hex(canonicalJSON(body));
  const message = `${method.toUpperCase()}\n${path}\n${query}\n${bodyHash}\n${timestamp}\n${nonce}`;
  const signature = createHmac('sha256', appSecret).update(message).digest('hex');
  return { 'X-App-Key': appKey, 'X-Timestamp': timestamp, 'X-Nonce': nonce, 'X-Signature': signature };
}

export function merchantJWT({ merchantPrivKeyHex, contents, iss, sub = iss, ttlSec = 3600, now = Math.floor(Date.now() / 1000) }) {
  const header = { alg: 'ES256K', typ: 'JWT' };
  const claims = { iss, sub, aud: 'HashkeyMerchant', iat: now, exp: now + ttlSec, jti: randomBytes(12).toString('hex'), cart_hash: sha256hex(canonicalJSON(contents)) };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const digest = createHash('sha256').update(input).digest();
  const sig = secp256k1.sign(digest, merchantPrivKeyHex.replace(/^0x/, ''), { lowS: true });
  return `${input}.${b64url(sig.toCompactRawBytes())}`;
}

export function verifyJWT(jwt, publicKeyHex) {
  const [h, c, s] = jwt.split('.');
  const digest = createHash('sha256').update(`${h}.${c}`).digest();
  return secp256k1.verify(Buffer.from(s, 'base64url'), digest, publicKeyHex.replace(/^0x/, ''));
}

/** Build the Cart Mandate for "top up agent tab #id with N USDC" */
export function buildTopUpCart({ orderId, chainId, token, coin = 'USDC', payTo, amountUsd, label, merchantName = 'AgentTab', ttlSec = 1800 }) {
  return {
    id: orderId,
    user_cart_confirmation_required: true,
    payment_request: {
      method_data: [{ supported_methods: 'https://www.x402.org/', data: { x402Version: 2, network: chainId === 177 ? 'hashkey' : 'hashkey-testnet', chain_id: chainId, contract_address: token, pay_to: payTo, coin } }],
      details: { id: `PR-${orderId}`, display_items: [{ label, amount: { currency: 'USD', value: amountUsd } }], total: { label: 'Total', amount: { currency: 'USD', value: amountUsd } } },
    },
    cart_expiry: new Date(Date.now() + ttlSec * 1000).toISOString(),
    merchant_name: merchantName,
  };
}

export async function createTopUpOrder({ env = process.env, ...cartArgs }) {
  const contents = buildTopUpCart(cartArgs);
  const keys = env.HSP_APP_KEY && env.HSP_APP_SECRET && env.HSP_MERCHANT_PRIVATE_KEY;
  const merchant_authorization = keys ? merchantJWT({ merchantPrivKeyHex: env.HSP_MERCHANT_PRIVATE_KEY, contents, iss: env.HSP_MERCHANT_ID || env.HSP_APP_KEY }) : '<dry-run: no HSP_MERCHANT_PRIVATE_KEY>';
  const body = { cart_mandate: { contents, merchant_authorization }, redirect_url: env.HSP_REDIRECT_URL || 'http://localhost:8402/hsp/done' };
  if (!keys) return { dryRun: true, body };
  const base = HSP_BASE[env.HSP_ENV || 'qa'];
  const path = '/api/v1/merchant/orders';
  const headers = { 'content-type': 'application/json', ...signRequest({ appKey: env.HSP_APP_KEY, appSecret: env.HSP_APP_SECRET, method: 'POST', path, body }) };
  const res = await fetch(base + path, { method: 'POST', headers, body: canonicalJSON(body) });
  return { dryRun: false, status: res.status, response: await res.json().catch(() => null) };
}

/** Webhook: HMAC-SHA256(app_secret, raw body) hex in X-Signature (verify header name against docs) */
export function verifyWebhook(rawBody, signatureHex, appSecret) {
  const want = createHmac('sha256', appSecret).update(rawBody).digest();
  const got = Buffer.from(String(signatureHex || ''), 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}
