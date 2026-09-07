#!/usr/bin/env node
/**
 * Sandbox mutation smoke test — NEVER uses ~/.cc-switch.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-switch-web-sandbox-'));
process.env.CC_SWITCH_CONFIG_DIR = sandbox;
process.env.CC_SWITCH_PATH =
  process.env.CC_SWITCH_PATH || path.join(os.homedir(), '.local', 'bin', 'cc-switch');

console.log('Sandbox:', sandbox);
console.log('Binary:', process.env.CC_SWITCH_PATH);

// Ensure real home DB is not the target
const realDb = path.join(os.homedir(), '.cc-switch', 'cc-switch.db');
const realMtimeBefore = fs.existsSync(realDb) ? fs.statSync(realDb).mtimeMs : null;
const realSizeBefore = fs.existsSync(realDb) ? fs.statSync(realDb).size : null;

const { ccSwitchAdapter } = await import(
  path.join(root, 'src/server/services/ccswitch-adapter.ts')
);
const { toCliApp } = await import(path.join(root, 'src/server/services/cli-runner.ts'));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Non-mutating: web UI app ids → CLI --app names
assert(toCliApp('opencode') === 'open-code', 'opencode → open-code');
assert(toCliApp('openclaw') === 'open-claw', 'openclaw → open-claw');
assert(toCliApp('hermes') === 'hermes', 'hermes → hermes');
assert(toCliApp('pi') === 'pi', 'pi → pi');
assert(toCliApp('kilocode-cli') === undefined, 'kilocode-cli stays non-CLI');
assert(toCliApp('amp') === undefined, 'amp stays non-CLI');
console.log('toCliApp mapping OK');

// Hermes/OpenClaw/OpenCode without raw config must be rejected (no guessed conversion)
const hermesBlocked = await ccSwitchAdapter.addProvider({
  id: 'hermes-blocked',
  name: 'Hermes Blocked',
  apiUrl: 'https://example.test',
  apiKey: 'sk-x',
  app: 'hermes',
});
assert(!hermesBlocked.success, 'hermes field-mode add must fail');
assert(/Unsupported|settingsConfig|raw/i.test(hermesBlocked.message), hermesBlocked.message);

const openclawBlocked = await ccSwitchAdapter.addProvider({
  id: 'openclaw-blocked',
  name: 'OpenClaw Blocked',
  apiUrl: 'https://example.test',
  apiKey: 'sk-x',
  app: 'openclaw',
});
assert(!openclawBlocked.success, 'openclaw field-mode add must fail');
assert(/Unsupported|settingsConfig|raw/i.test(openclawBlocked.message), openclawBlocked.message);

const opencodeBlocked = await ccSwitchAdapter.addProvider({
  id: 'opencode-blocked',
  name: 'OpenCode Blocked',
  apiUrl: 'https://example.test',
  apiKey: 'sk-x',
  app: 'opencode',
});
assert(!opencodeBlocked.success, 'opencode field-mode add must fail');
assert(/Unsupported|settingsConfig|raw/i.test(opencodeBlocked.message), opencodeBlocked.message);
console.log('hermes/openclaw/opencode add without settingsConfig rejected OK');

const health = await ccSwitchAdapter.getBackendHealth();
console.log('Health:', {
  version: health.ccSwitchVersion,
  schema: health.schemaVersion,
  dbPath: health.dbPath,
  mode: health.backendMode,
});
assert(health.dbPath.startsWith(sandbox), 'DB path must be inside sandbox');
assert(health.ccSwitchAvailable, 'cc-switch must be available');

const add = await ccSwitchAdapter.addProvider({
  id: 'webui-sandbox-prov',
  name: 'WebUI Sandbox',
  apiUrl: 'https://example.test/v1',
  apiKey: 'sk-sandbox',
  app: 'claude',
  model: 'test-model',
});
console.log('add:', add);
assert(add.success, `add failed: ${add.message}`);

const list1 = await ccSwitchAdapter.listProviders('claude');
assert(
  list1.providers.some((p) => p.id === 'webui-sandbox-prov'),
  'provider missing after add'
);

// Provider edit must be unsupported (no delete+recreate)
const editProv = await ccSwitchAdapter.editProvider({
  id: 'webui-sandbox-prov',
  name: 'Should Not Apply',
  apiUrl: 'https://evil.test',
  apiKey: 'sk-evil',
  app: 'claude',
});
console.log('edit provider:', editProv);
assert(!editProv.success, 'provider edit must fail as unsupported');
assert(/Unsupported/i.test(editProv.message), 'provider edit message must say Unsupported');
const afterEdit = await ccSwitchAdapter.getProviderById('webui-sandbox-prov', 'claude');
assert(afterEdit && afterEdit.name === 'WebUI Sandbox', 'provider must be unchanged after rejected edit');

const mcp = await ccSwitchAdapter.addMcpServer({
  name: 'sandbox-mcp',
  command: 'echo',
  args: ['hi'],
  app: 'claude',
});
console.log('mcp add:', mcp);
assert(mcp.success, `mcp add failed: ${mcp.message}`);

const editMcp = await ccSwitchAdapter.editMcpServer({
  id: 'sandbox-mcp',
  command: 'node',
  args: ['gone.js'],
});
console.log('edit mcp:', editMcp);
assert(!editMcp.success, 'mcp edit must fail as unsupported');
assert(/Unsupported/i.test(editMcp.message), 'mcp edit message must say Unsupported');
const mcpList = await ccSwitchAdapter.listMcpServers('claude');
const mcpRow = mcpList.find((s) => s.id === 'sandbox-mcp');
assert(mcpRow && mcpRow.command === 'echo', 'MCP must be unchanged after rejected edit');

const prompt = await ccSwitchAdapter.createPrompt({
  id: 'sandbox-prompt',
  name: 'Sandbox Prompt',
  content: 'hello from sandbox',
  description: 'test',
  app: 'claude',
});
console.log('prompt create:', prompt);
assert(prompt.success, `prompt create failed: ${prompt.message}`);

const prompts = await ccSwitchAdapter.listPrompts('claude');
const created = prompts.find((p) => p.name === 'Sandbox Prompt' || p.id === 'sandbox-prompt' || p.id.startsWith('sandbox'));
assert(created, 'prompt missing after create');
const promptId = created.id;

const editContent = await ccSwitchAdapter.editPrompt(promptId, {
  content: 'CHANGED CONTENT — must be rejected',
  app: 'claude',
});
console.log('edit prompt content:', editContent);
assert(!editContent.success, 'prompt content edit must be unsupported');
assert(/Unsupported/i.test(editContent.message), 'prompt content edit must say Unsupported');

const editMeta = await ccSwitchAdapter.editPrompt(promptId, {
  name: 'Sandbox Prompt Renamed',
  description: 'renamed in sandbox',
  content: created.content, // same content → metadata-only path
  app: 'claude',
});
console.log('edit prompt metadata:', editMeta);
assert(editMeta.success, `prompt metadata rename failed: ${editMeta.message}`);

// WebDAV: set + show + check/upload/download error handling (no real credentials)
const FAKE_WEBDAV_PASSWORD = 'sandbox-fake-pass-NEVER-LEAK-9f3a';
const webdavSet = await ccSwitchAdapter.setWebDav({
  baseUrl: 'https://example.test/dav',
  remoteRoot: '/cc-switch-sandbox',
  username: 'sandbox-user',
  password: FAKE_WEBDAV_PASSWORD,
  enable: true,
  autoSync: false,
});
console.log('webdav set:', webdavSet);
assert(webdavSet.success, `webdav set failed: ${webdavSet.message}`);

const webdavShow = await ccSwitchAdapter.getWebDavStatus();
console.log('webdav show:', webdavShow.message, (webdavShow.output || '').slice(0, 120));
assert(webdavShow.success, `webdav show failed: ${webdavShow.message}`);
assert(
  /example\.test|sandbox-user|WebDAV/i.test(webdavShow.output || ''),
  'webdav show should include configured settings'
);
assert(
  !(webdavShow.output || '').includes(FAKE_WEBDAV_PASSWORD),
  'getWebDavStatus must not return plaintext WebDAV password'
);
assert(
  /Password:\s*\[REDACTED\]/i.test(webdavShow.output || ''),
  'getWebDavStatus must redact Password line with [REDACTED]'
);

const webdavCheck = await ccSwitchAdapter.checkWebDavConnection();
console.log('webdav check:', webdavCheck);
assert(!webdavCheck.success, 'check-connection against example.test should fail without real server');

const webdavUpload = await ccSwitchAdapter.uploadWebDav();
console.log('webdav upload:', webdavUpload);
assert(!webdavUpload.success, 'upload without real WebDAV should fail cleanly');

const webdavDownload = await ccSwitchAdapter.downloadWebDav();
console.log('webdav download:', webdavDownload);
assert(!webdavDownload.success, 'download without real WebDAV should fail cleanly');

const emptySet = await ccSwitchAdapter.setWebDav({});
assert(!emptySet.success, 'setWebDav with no flags must error');

const del = await ccSwitchAdapter.deleteProvider('webui-sandbox-prov', 'claude');
console.log('delete:', del);
assert(del.success, `delete failed: ${del.message}`);

const realMtimeAfter = fs.existsSync(realDb) ? fs.statSync(realDb).mtimeMs : null;
const realSizeAfter = fs.existsSync(realDb) ? fs.statSync(realDb).size : null;
assert(
  realMtimeBefore === realMtimeAfter && realSizeBefore === realSizeAfter,
  `Real ~/.cc-switch/cc-switch.db changed! mtime ${realMtimeBefore}->${realMtimeAfter} size ${realSizeBefore}->${realSizeAfter}`
);

console.log('OK — sandbox mutations + unsupported edits + WebDAV handling passed; real DB untouched');
fs.rmSync(sandbox, { recursive: true, force: true });
