# CommonAPI2 integration boundary

## Current status

The project model can retain `commonapi2` as a mode distinct from `vanilla`.
No CommonAPI2-specific completion, validator, installation detector or runtime
claim is enabled in 0.1.

This is deliberate. The application has not yet verified a real CommonAPI2
installation, its compatibility metadata or a versioned documentation source.
Invented APIs would be less useful than an explicit unavailable state.

## Isolation rules

- Vanilla validation never depends on CommonAPI2.
- CommonAPI2 symbols must live in a separately versioned data source.
- A symbol from that source must be labelled CommonAPI2, never native TF2.
- Activation requires a detected, inspectable installation and a supported
  version.
- An absent or incompatible installation leaves vanilla projects fully usable.
- Compatibility conclusions require evidence; a folder name alone is
  insufficient.

## Planned evidence-driven integration

1. Obtain and record the authoritative CommonAPI2 documentation source and
   license.
2. Inspect real supported installation layouts and version metadata.
3. Define a versioned provider interface separate from vanilla TF2 knowledge.
4. Add fixtures derived from permitted documentation and synthetic edge cases.
5. Test missing, compatible and incompatible installations.
6. Enable mode-specific completions and diagnostics only after those tests pass.

Until then the UI must describe CommonAPI2 intelligence as unavailable, not
simulate it.
