# Contributing to Tpf2 Mod Studio

Thank you for helping test and improve Tpf2 Mod Studio. The current product is
a partial Public Alpha focused on Transport Fever 2.

## Before contributing

- Search existing issues and pull requests first.
- Use the bug form for reproducible defects and the feature form for proposals.
- Do not disclose suspected security vulnerabilities in a public issue. Follow
  [SECURITY.md](SECURITY.md) instead.
- Keep Transport Fever 1 and Transport Fever 3 proposals aligned with the future
  support plan in the README; neither is implemented in the 0.1 release.

## Development setup

Install Node.js 22.12 or newer, npm, Rust through `rustup`, and the platform
prerequisites for Tauri 2. Then run:

```bash
npm ci
npm run verify
```

For native changes, also run:

```bash
cd apps/desktop/src-tauri
cargo fmt --check
cargo test --locked --all-targets
cargo clippy --locked --all-targets --all-features -- -D warnings
```

Build the native package on the target operating system when your change affects
Tauri, filesystem behavior or packaging:

```bash
npm run desktop:build
```

## Pull requests

Create a focused branch and keep unrelated changes separate. A pull request
should:

- explain the user-visible outcome and motivation;
- link related issues;
- include tests for changed behavior;
- preserve the filesystem and Lua safety boundaries;
- update documentation when behavior or support changes;
- pass Native CI on Windows and Linux.

Screenshots are useful for visible UI changes. Never include private game files,
mods without redistribution permission, credentials or personal paths.

By submitting a contribution, you agree that it may be distributed under the
license present in the repository. Code contributions must not be merged until
that license exists.
