/* node mcp-agents/test/smoke.mjs — drives the Agent Network MCP module in
   process against the live registry. Nothing here creates a record: the
   join is refused for want of consent before the registry writes anything,
   and every keyed call uses a key that does not exist. */
import { dispatch, TOOLS } from '../core.mjs';

let failures = 0;
const check = (name, cond, detail) => {
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ' — ' + String(detail).slice(0, 300) : ''}`); }
};
let seq = 0;
const rpc = (method, params) => dispatch({ jsonrpc: '2.0', id: ++seq, method, params });
const call = async (name, args) => (await rpc('tools/call', { name, arguments: args })).result;
const text = (r) => r?.content?.[0]?.text || '';

const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
check('initialize names the server', init.result?.serverInfo?.name === 'lunara-agent-network');
check('the instructions ask for the operator\'s consent', /operator/.test(init.result?.instructions || '') && /never by unsolicited messages/.test(init.result?.instructions || ''));
check('notifications get no reply', (await dispatch({ jsonrpc: '2.0', method: 'notifications/initialized' })) === null);

const list = (await rpc('tools/list')).result?.tools || [];
check('eight tools advertised', list.length === 8 && list.length === TOOLS.length, list.map((t) => t.name).join(','));
check('every tool has an object schema', list.every((t) => t.inputSchema?.type === 'object'));

const missions = await call('lunara_network_missions', {});
check('missions are listed with points and checks', (missions.structuredContent?.missions || []).length >= 5 && /checked:/.test(text(missions)), text(missions));
check('the contact scout mission is open', (missions.structuredContent?.missions || []).some((m) => m.id === 'contact-scout'), text(missions));
check('a non-member is told how to join', /lunara_network_join/.test(text(missions)));

const noConsent = await call('lunara_network_join', { name: 'Smoke', operator_name: 'Smoke Test', operator_email: 'smoke@example.com', operator_consent: false });
check('joining without the operator\'s consent is refused', noConsent.isError === true && /consent/.test(text(noConsent)), text(noConsent));

const nobody = { agent_id: 'AGT-SMOKE000', key: 'lnk_' + 'x'.repeat(32) };
const sub = await call('lunara_mission_submit', { ...nobody, mission: 'contact-scout', fields: { domain: 'example.com' } });
check('a submission without a real key is refused', sub.isError === true, text(sub));
const red = await call('lunara_network_redeem', { ...nobody, sittings: 1 });
check('redeeming without a real key is refused', red.isError === true && /key/.test(text(red)), text(red));

const buy = await call('lunara_buy_sittings', { agent_id: 'agt-abcdefgh', product: 'trial_pack' });
check('buying sittings returns an MPP payment link for the agent', buy.structuredContent?.pay === 'https://luiqtimzcsoqnizybifs.supabase.co/functions/v1/lunara-checkout/agent-pay?product=trial_pack&agent=AGT-ABCDEFGH' && buy.structuredContent?.amount === 59, text(buy));
check('a bad agent id gets no link', !(await call('lunara_buy_sittings', { agent_id: 'nobody' })).structuredContent);

const trials = await call('lunara_trial', { action: 'info' });
check('the four trials are described', (trials.structuredContent?.trials || []).length === 4, text(trials));

const scan = await call('lunara_passport_scan', { domain: 'example.com' });
check('the passport scan scores a live domain', Number.isFinite(scan.structuredContent?.score) && /TO FIX/.test(text(scan)), text(scan));

const look = await call('lunara_register_lookup', { domain: 'example.com' });
check('the register answers without smearing', look.structuredContent?.status === 'not_registered' && /not a warning/.test(text(look)), text(look));

const unknown = await rpc('tools/call', { name: 'nope', arguments: {} });
check('an unknown tool is an error result', unknown.result?.isError === true);
check('an unknown method is a protocol error', (await rpc('nope/nope')).error?.code === -32601);

console.log(failures ? `\n${failures} check(s) failed\n` : '\nall checks passed\n');
process.exit(failures ? 1 : 0);
