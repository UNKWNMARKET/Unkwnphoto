// Exercises the real auth module. Node 22 strips the TS types for us.
process.env.ADMIN_PASSWORD = 'correct horse battery staple';
delete process.env.SESSION_SECRET;

const auth = await import('../api/_lib/auth.ts');

let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); };

// --- password checking -----------------------------------------------------
ok('correct password accepted', auth.passwordMatches('correct horse battery staple'));
ok('wrong password rejected', !auth.passwordMatches('wrong'));
ok('empty password rejected', !auth.passwordMatches(''));
ok('non-string rejected', !auth.passwordMatches({ toString: () => 'correct horse battery staple' }));
ok('near-miss rejected', !auth.passwordMatches('correct horse battery stapl'));
ok('over-long password rejected without hashing', !auth.passwordMatches('x'.repeat(5000)));

// --- session issue + verify ------------------------------------------------
let setCookie = null;
const res = { setHeader: (k, v) => { if (k === 'Set-Cookie') setCookie = v; }, status() { return this; }, json() { return this; } };
auth.issueSession(res);
ok('cookie was set', typeof setCookie === 'string' && setCookie.includes('unkwn_session='));
ok('cookie is HttpOnly', setCookie.includes('HttpOnly'));
ok('cookie is SameSite=Strict', setCookie.includes('SameSite=Strict'));

const token = setCookie.split(';')[0].split('=').slice(1).join('=');
const req = (cookie, extra = {}) => ({ headers: { cookie, host: 'unkwnphoto.com', ...extra }, cookies: undefined });

ok('valid cookie authenticates', auth.isAuthenticated(req(`unkwn_session=${token}`)));
ok('no cookie is unauthenticated', !auth.isAuthenticated(req(undefined)));
ok('garbage cookie rejected', !auth.isAuthenticated(req('unkwn_session=garbage')));

// tamper with the signature
const [payload, sig] = [token.slice(0, token.lastIndexOf('.')), token.slice(token.lastIndexOf('.') + 1)];
ok('flipped signature rejected', !auth.isAuthenticated(req(`unkwn_session=${payload}.${sig.slice(0, -1)}A`)));
ok('signature stripped rejected', !auth.isAuthenticated(req(`unkwn_session=${payload}.`)));
ok('extra dot injection rejected', !auth.isAuthenticated(req(`unkwn_session=${payload}.x.${sig}`)));

// forge a payload claiming a far-future expiry, keeping the old signature
const forged = Buffer.from(JSON.stringify({ exp: Date.now() + 9e12 })).toString('base64url');
ok('forged payload rejected', !auth.isAuthenticated(req(`unkwn_session=${forged}.${sig}`)));

// an expired but correctly signed cookie
const expiredPayload = Buffer.from(JSON.stringify({ exp: Date.now() - 1000 })).toString('base64url');
const crypto = await import('node:crypto');
const key = crypto.pbkdf2Sync(process.env.ADMIN_PASSWORD, 'unkwnphoto/session-key/v1', 120000, 32, 'sha256');
const expiredSig = crypto.createHmac('sha256', key).update(expiredPayload).digest('base64url');
ok('correctly signed but EXPIRED cookie rejected', !auth.isAuthenticated(req(`unkwn_session=${expiredPayload}.${expiredSig}`)));
ok('signing key is the stretched one (not raw password)', auth.isAuthenticated(req(`unkwn_session=${expiredPayload.replace(/./, expiredPayload[0])}.${expiredSig}`)) === false);

// prove the key really is stretched: the naive derivation must NOT verify
const naiveKey = `unkwnphoto/derived/${process.env.ADMIN_PASSWORD}`;
const naiveSig = crypto.createHmac('sha256', naiveKey).update(payload).digest('base64url');
ok('OLD fast key derivation no longer validates (oracle closed)', !auth.isAuthenticated(req(`unkwn_session=${payload}.${naiveSig}`)));

// --- origin check ----------------------------------------------------------
ok('missing Origin allowed', auth.sameOrigin(req(undefined)));
ok('same Origin allowed', auth.sameOrigin(req(undefined, { origin: 'https://unkwnphoto.com' })));
ok('cross Origin refused', !auth.sameOrigin(req(undefined, { origin: 'https://evil.example' })));
ok('malformed Origin refused', !auth.sameOrigin(req(undefined, { origin: 'not a url' })));

// --- fail closed when unconfigured ----------------------------------------
delete process.env.ADMIN_PASSWORD;
ok('unconfigured: authConfigured false', !auth.authConfigured());
ok('unconfigured: password never matches', !auth.passwordMatches('anything'));
ok('unconfigured: previously valid cookie no longer authenticates',
   !auth.isAuthenticated(req(`unkwn_session=${token}`)));

let status = 0;
const gate = { setHeader() {}, status(s) { status = s; return this; }, json() { return this; } };
ok('unconfigured: requireAuth denies (fails CLOSED)',
   auth.requireAuth(req(`unkwn_session=${token}`), gate) === false && status === 503);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
