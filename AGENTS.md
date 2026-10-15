# Repository instructions

- Scope work to this public classroom distribution. Never import personal DSH profiles, credentials, OAuth grants, cookies, sessions, chat archives, WeChat bindings, database keys or document contents.
- `classroom.json` is the source for supported Desktop version, plugins, capabilities and platform status. Keep `README.md` current through `npm run refresh`; never hand-edit the generated README.
- For every capability/version change update the manifest, CHANGELOG and relevant install/acceptance docs, then run `npm test`. README freshness, payload hashes and privacy checks must pass before pushing.
- Use `codex/` branches for subsequent work. Do not rewrite public history or commit runtime logs.
- Do not stop, restart, poll or modify another user's running DSH task. Integration tests use a new temporary DSH home; real UI testing requires a separately safe idle window.
- Install using Desktop's generation backend, preserving unrelated data, plugin settings, model defaults and auth. Never patch the App bundle or silently downgrade Desktop.
- User login, OS authorization and concrete document writes remain explicit user actions. An installed credential or plugin is not proof of a successful call or UI acceptance.
- WeChat database reading and system share helper are excluded from the default pack. Do not reintroduce private/native scanners or teacher bindings during an export.
- Preserve upstream license files and attribution, including embedded browser dependencies and pypdf.
