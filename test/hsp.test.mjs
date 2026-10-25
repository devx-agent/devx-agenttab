import test from 'node:test';
import assert from 'node:assert/strict';
import { secp256k1 } from '@noble/curves/secp256k1';
import { canonicalJSON, signRequest, merchantJWT, verifyJWT, buildTopUpCart, createTopUpOrder, verifyWebhook } from '../hsp/hsp.mjs';
import { createHmac } from 'node:crypto';

test('canonical JSON sorts keys recursively', () => {
  assert.equal(canonicalJSON({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: 'x' } }), '{"a":{"c":"x","d":[2,{"y":2,"z":1}]},"b":1}');
});
test('HMAC request signature is deterministic and covers body', () => {
  const base = { appKey: 'k', appSecret: 's', method: 'post', path: '/api/v1/merchant/orders', timestamp: '1700000000', nonce: 'n1' };
  const a = signRequest({ ...base, body: { x: 1 } }), b = signRequest({ ...base, body: { x: 1 } }), c = signRequest({ ...base, body: { x: 2 } });
  assert.equal(a['X-Signature'], b['X-Signature']); assert.notEqual(a['X-Signature'], c['X-Signature']);
});
test('ES256K merchant JWT verifies and binds cart_hash', () => {
  const priv = secp256k1.utils.randomPrivateKey(); const pub = Buffer.from(secp256k1.getPublicKey(priv, true)).toString('hex');
  const contents = buildTopUpCart({ orderId: 'T1', chainId: 133, token: '0x79AEc4EeA31D50792F61D1Ca0733C18c89524C9e', payTo: '0x000000000000000000000000000000000000dEaD', amountUsd: '5.00', label: 'Top up' });
  const jwt = merchantJWT({ merchantPrivKeyHex: Buffer.from(priv).toString('hex'), contents, iss: 'm1' });
  assert.ok(verifyJWT(jwt, pub));
  const claims = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url'));
  assert.equal(claims.aud, 'HashkeyMerchant'); assert.equal(claims.cart_hash.length, 64);
});
test('createTopUpOrder dry-runs without keys', async () => {
  const r = await createTopUpOrder({ env: {}, orderId: 'T2', chainId: 177, token: '0x054ed45810DbBAb8B27668922D110669c9D88D0a', payTo: '0x000000000000000000000000000000000000dEaD', amountUsd: '1.00', label: 'x' });
  assert.equal(r.dryRun, true); assert.equal(r.body.cart_mandate.contents.payment_request.method_data[0].data.chain_id, 177);
});
test('webhook verification', () => {
  const raw = '{"status":"payment-successful"}'; const sig = createHmac('sha256', 'sec').update(raw).digest('hex');
  assert.ok(verifyWebhook(raw, sig, 'sec')); assert.ok(!verifyWebhook(raw, sig, 'other')); assert.ok(!verifyWebhook(raw, 'zz', 'sec'));
});
