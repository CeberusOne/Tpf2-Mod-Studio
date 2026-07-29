# Module overview

| Module | Responsibility | Verification status |
| --- | --- | --- |
| `packages/core/types.ts` | Shared command, project, diagnostic, index and log contracts | Typechecked |
| `packages/core/path-utils.ts` | Portable relative-path normalization and traversal rejection | Unit tested through filesystem workflow |
| `packages/core/validator.ts` | Static Lua, mod metadata, filename and resource-reference validation | Unit tested |
| `packages/core/resource-index.ts` | Resource classification, counts and snapshot diff | Unit tested, including 810 entries |
| `packages/core/log-parser.ts` | Severity extraction, repetition grouping and source hints | Unit tested |
| `packages/core/node-service.ts` | Real-filesystem reference adapter for project creation, scan, save and safe installation | Integration tested in temporary directories |
| `apps/desktop/src/bridge.ts` | Typed React-to-Tauri IPC adapter and preview-mode safety gate | Typechecked; exercised through UI tests with an injected bridge |
| `apps/desktop/src/App.tsx` | Connected workbench workflow and honest empty/error/success states | Component tested |
| `apps/desktop/src/MonacoEditor.tsx` | Lazy-loaded text editor | Production build verified; native visual inspection pending |
| `apps/desktop/src/lua-language.ts` | Lua syntax configuration and evidence-backed TF2 completions | Typechecked |
| `apps/desktop/src-tauri/src/lib.rs` | Native filesystem, installation, path detection, log read and game launch commands | Source present; native compile and tests blocked in this environment |

The Node service is not shipped as a second production backend. It is a
testable reference for the same filesystem semantics while the production
desktop application uses the Rust command boundary.
