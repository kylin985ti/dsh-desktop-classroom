import assert from 'node:assert/strict'
import { pickWorkspaceDirectory } from '../src/native-directory.js'

let passed = 0
const test = async (name, run) => { await run(); console.log(`ok ${++passed} - ${name}`) }
await test('Desktop uses its public Electron chooser, without invoking the host RPC fallback', async () => {
  let native = 0, fallback = 0
  const workspace = { pickDirectory() { fallback++; return '/must-not-be-used' } }
  const desktop = { marker: true, async pick() { assert.equal(this.marker, true); native++; return '/owned/工作 域' } }
  assert.equal(await pickWorkspaceDirectory({ ctx: { uiWorkspace: workspace } }, desktop), '/owned/工作 域')
  assert.equal(native, 1); assert.equal(fallback, 0)
})
await test('Native cancellation never falls through to a second chooser', async () => {
  let fallback = 0
  const service = { ctx: { uiWorkspace: { pickDirectory() { fallback++; return '/wrong' } } } }
  assert.equal(await pickWorkspaceDirectory(service, { pick: async () => null }), null)
  assert.equal(fallback, 0)
})
await test('Native failure remains actionable without silently changing chooser or binding', async () => {
  let fallback = 0
  await assert.rejects(pickWorkspaceDirectory({ ctx: { uiWorkspace: { pickDirectory() { fallback++ } } } }, { pick: async () => { throw new Error('native refusal') } }), /native refusal/)
  assert.equal(fallback, 0)
})
await test('Browser hosts retain the existing workspace picker and its method binding', async () => {
  const workspace = { marker: true, async pickDirectory() { assert.equal(this.marker, true); return '/owned/browser' } }
  assert.equal(await pickWorkspaceDirectory({ ctx: { uiWorkspace: workspace } }, undefined), '/owned/browser')
  assert.equal(await pickWorkspaceDirectory({ ctx: { uiWorkspace: { pickDirectory: async () => null } } }, null), null)
})
await test('Malformed or unavailable capabilities fail without accepting a bogus path', async () => {
  await assert.rejects(pickWorkspaceDirectory({}, null), /未提供目录选择器/)
  for (const value of [{ path: '/fake' }, 1, true, '/owned\0hidden']) await assert.rejects(pickWorkspaceDirectory({}, { pick: async () => value }), /无效路径/)
})
console.log(`${passed} native directory chooser contract tests passed; no native UI, subprocess, or real file access.`)
