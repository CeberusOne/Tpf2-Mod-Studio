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

### Release gate

A Windows or Linux package may be labelled verified only when all of the
following are recorded for that operating system:

1. `npm ci` succeeds from the lockfile;
2. `npm run verify` succeeds without skipped tests;
3. `cargo test` succeeds in `apps/desktop/src-tauri`;
4. `cargo fmt --check` and `cargo clippy -- -D warnings` succeed;
5. the generated `Cargo.lock` is reviewed and committed;
6. `npm run desktop:build` succeeds;
7. create, open, edit, save, validate, install, log-open and explicit launch
   actions are exercised in the native application;
8. overwrite protection and backup behavior are checked in a disposable test
   directory;
9. the package is installed, started and removed on a clean test machine.

## Source package

Exclude generated dependencies and build outputs:

```bash
zip -r Tpf2_Mod_Studio_0.1_PARTIAL_Source.zip tpf2-mod-studio \
  -x '*/node_modules/*' '*/dist/*' '*/target/*' '*/bundle/*' '*/.git/*'
```

The `PARTIAL` marker is intentional until the native release gate passes on
both supported operating systems.
