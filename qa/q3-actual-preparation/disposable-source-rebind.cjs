'use strict';
// Pure reserved-QA ledger adaptation. No provider, storage, or credential access.
function prepareSourceRebind({ledger, pointer, oldBinding, binding, account, expectedLedger, expectedPointer}) {
  const canonical = value => JSON.stringify((function sort(v) {
    return Array.isArray(v) ? v.map(sort) : v && typeof v === 'object'
      ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])])) : v;
  })(value));
  const fail = () => { throw Error('Q3_RECOVERY_REBIND_REJECTED'); };
  const same = (a, b) => canonical(a) === canonical(b);
  const keys = ['app.js', 'sw.js', 'version.json'];
  if (oldBinding.version !== '1.22.0-rc.33' || oldBinding.source !== '5174485b3c17d047259701bbdd889f9b0740f555'
      || binding.version !== '1.22.0-rc.34' || binding.source !== '09c61bdc1438df24e4213e348caea745823b5ee1'
      || keys.some(k => !/^[a-f0-9]{64}$/.test(binding.sourceSHA256?.[k] || ''))
      || !same(ledger, expectedLedger) || !same(pointer, expectedPointer)
      || !same(ledger?.binding, oldBinding) || pointer?.source !== oldBinding.source
      || ledger?.schema !== 1 || ledger.purpose !== 'q3-exact-fixture'
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(ledger.run || '')
      || pointer.run !== ledger.run || !account.accountId || !account.accountKey
      || ledger.accountId !== account.accountId || pointer.accountId !== account.accountId
      || ledger.accountKey !== account.accountKey || pointer.accountKey !== account.accountKey
      || !same(ledger.fixture, {bytes:18075476,sha256:'cda53855c53bf1d608491eb96aa3abb0ff774cca2aa24cfe01447e295c07ed7a',md5:'6df04298bf9b43cd60e3af70cd1e309f'})
      || ledger.planned?.length !== 2 || ledger.created?.length !== 2 || !Array.isArray(ledger.events)
      || !['complete', 'recovery-verified'].includes(ledger.status)) fail();
  const roles = ['folder-a', 'test-video-1'];
  if (new Set(ledger.planned.map(p => p.id)).size !== 2
      || ledger.planned.some((p, i) => p.role !== roles[i] || p.sent !== true
        || !/^[A-Za-z0-9_-]{5,200}$/.test(p.id || '') || p.id === 'appDataFolder'
        || ledger.created.filter(c => c.id === p.id && c.role === p.role).length !== 1)) fail();
  const nextLedger = JSON.parse(JSON.stringify(ledger));
  nextLedger.binding = JSON.parse(JSON.stringify(binding));
  nextLedger.events.push({method:'SOURCE_REBIND',from:oldBinding.source,to:binding.source,
    scope:'same-exact-fixture-cleanup',providerWrite:false});
  const nextPointer = {...pointer, source:binding.source};
  return {ledger:nextLedger,pointer:nextPointer,
    ledgerKey:'drive-original.qa.disposable.'+ledger.run+'.recovery',
    pointerKey:'drive-original.qa.disposable.q3-180s.'+ledger.fixture.sha256+'.run'};
}
module.exports = {prepareSourceRebind};
