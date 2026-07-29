# Build and packaging

## Frontend and domain build

```bash
npm ci
npm run build
```

This produces:

- `packages/core/dist/`;
- `apps/desktop/dist/`.

These outputs prove that the TypeScript domain and React frontend compile. They
do not produce a standalone desktop application.

## Native development build

After installing all Tauri prerequisites:

```bash
npm run desktop:dev
```

## Native release bundles

Run separately on each target operating system:

```bash
npm run verify
npm run desktop:build
```

Tauri writes native build and bundle artifacts below
`apps/desktop/src-tauri/target/release/`. Record the exact generated artifact
names and test the installed application before publishing them.

## Automated native pipeline

`.github/workflows/native-ci.yml` runs the locked gate on GitHub-hosted
Ubuntu 22.04 and Windows Server 2022. It performs JavaScript verification,
Rust formatting/tests/lints, native packaging and a short process-start smoke
test. Successful runs upload:

- `tpf2-mod-studio-linux-x64`: AppImage, DEB and RPM;
- `tpf2-mod-studio-windows-x64`: MSI and NSIS setup EXE;
- one copy of the generated Cargo lockfile per operating system.

Artifacts are retained for seven days. They are unsigned development artifacts,
not a durable release.

## Public Alpha release pipeline

`.github/workflows/public-alpha-release.yml` is a version-specific publication
workflow. It runs when its release-critical files reach `main` and also supports
a manual dispatch. For Alpha 1 it:

1. refuses to run without the approved GPL-3.0-only license metadata;
2. downloads the Linux and Windows artifacts from final Native CI run
   `30484600653`;
3. verifies their GitHub-recorded SHA-256 archive digests;
4. requires MSI, NSIS EXE, AppImage, DEB and RPM bundles;
5. generates a package-level `SHA256SUMS.txt`;
6. creates `v0.1.0-alpha.1` as a GitHub pre-release.

The source CI run passed the complete JavaScript, Rust, packaging and native
process-start gates on both operating systems. Reusing those immutable
GitHub Actions artifacts avoids an unnecessary second native compilation while
preserving exact provenance. The workflow uses job-scoped `actions: read` and
`contents: write` permissions. Checkout credentials are not persisted. It
refuses non-`main` publication and treats an existing immutable release as a
successful idempotent result.

### Release gate

A Windows or Linux package may be labelled verified only when all of the
following are recorded for that operating system:

1. `npm ci` succeeds from the lockfile;
2. `npm run verify` succeeds without skipped tests;
3. `cargo test` succeeds in `apps/desktop/src-tauri`;
4. `cargo fmt --check` and `cargo clippy -- -D warnings` succeed;
5. the committed `Cargo.lock` is used with `--locked`;
6. `npm run desktop:build` succeeds;
7. create, open, edit, save, validate, install, log-open and explicit launch
   actions are exercised in the native application;
8. overwrite protection and backup behavior are checked in a disposable test
   directory;
9. the package is installed, started and removed on a clean test machine.

The Public Alpha records items 1–6 as automated evidence. Items 7–9 remain
explicit community acceptance work and are therefore listed as limitations in
the release notes.

## Source package

Exclude generated dependencies and build outputs:

```bash
zip -r Tpf2_Mod_Studio_0.1_PARTIAL_Source.zip tpf2-mod-studio \
  -x '*/node_modules/*' '*/dist/*' '*/target/*' '*/bundle/*' '*/.git/*'
```

The `PARTIAL` marker remains intentional until the interactive installer and
full product acceptance criteria pass on both supported operating systems.
