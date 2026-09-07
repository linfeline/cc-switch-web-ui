#!/usr/bin/env node
/**
 * Read-only compatibility check against the real ~/.cc-switch DB.
 * Performs no mutations.
 */
import os from 'os';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

delete process.env.CC_SWITCH_CONFIG_DIR;
process.env.CC_SWITCH_PATH =
  process.env.CC_SWITCH_PATH || path.join(os.homedir(), '.local', 'bin', 'cc-switch');

const realDb = path.join(os.homedir(), '.cc-switch', 'cc-switch.db');
const mtimeBefore = fs.existsSync(realDb) ? fs.statSync(realDb).mtimeMs : null;
const sizeBefore = fs.existsSync(realDb) ? fs.statSync(realDb).size : null;

const { ccSwitchAdapter } = await import(
  path.join(root, 'src/server/services/ccswitch-adapter.ts')
);
const { sqliteReader } = await import(
  path.join(root, 'src/server/services/sqlite-reader.ts')
);

const schema = await sqliteReader.inspectSchema(true);
console.log('Schema:', {
  userVersion: schema.userVersion,
  dbPath: schema.dbPath,
  mcpEnabledColumns: schema.mcpEnabledColumns,
  warnings: schema.warnings,
});

const providers = await ccSwitchAdapter.listProviders('claude');
const mcp = await ccSwitchAdapter.listMcpServers('claude');
const prompts = await ccSwitchAdapter.listPrompts('claude');
const skills = await ccSwitchAdapter.listSkills('claude');
const health = await ccSwitchAdapter.getBackendHealth();

console.log('Counts:', {
  providers: providers.providers.length,
  current: providers.currentProviderId,
  mcp: mcp.length,
  prompts: prompts.length,
  skills: skills.length,
});
console.log('Health version/path:', health.ccSwitchVersion, health.ccSwitchPath);

const mtimeAfter = fs.existsSync(realDb) ? fs.statSync(realDb).mtimeMs : null;
const sizeAfter = fs.existsSync(realDb) ? fs.statSync(realDb).size : null;

if (mtimeBefore !== mtimeAfter || sizeBefore !== sizeAfter) {
  console.error('FAIL: Real DB mtime/size changed during read-only check');
  console.error({ mtimeBefore, mtimeAfter, sizeBefore, sizeAfter });
  process.exit(1);
}

console.log('Real DB mtime/size unchanged.');
console.log('OK — read-only real DB check complete');
