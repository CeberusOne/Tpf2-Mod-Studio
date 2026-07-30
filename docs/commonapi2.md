# CommonAPI2 integration boundary

## Current status

The project model can retain `commonapi2` as a mode distinct from `vanilla`.
The log analyzer recognizes supported CommonAPI2 build and native-load failure
signatures. No CommonAPI2-specific completion, full API validator or compatible
installation detector is enabled.

The verified quickstart establishes that CommonAPI2 combines a normal script
mod with a build-specific native component, supports Windows/Linux, requires
the exact `eis_os_commonapi2_1` folder, and must be active in the savegame mod
list for full additional API functionality. It does not provide a complete
versioned machine-readable API corpus.

## Isolation rules

- Vanilla validation never depends on CommonAPI2.
- CommonAPI2 symbols must live in a separately versioned data source.
- A symbol from that source must be labelled CommonAPI2, never native TF2.
- Activation requires a detected, inspectable installation and a supported
  version.
- An absent or incompatible installation leaves vanilla projects fully usable.
- Compatibility conclusions require evidence; a folder name alone is
  insufficient.
- Vanilla `addModifier` categories and callback contracts remain vanilla TF2
  knowledge; CommonAPI2 APIs must not be inferred from them.

## Planned evidence-driven integration

1. Obtain a complete, permitted and versioned CommonAPI2 API source.
2. Inspect real supported installation layouts, native binaries and version
   metadata.
3. Define a versioned provider interface separate from vanilla TF2 knowledge.
4. Add fixtures derived from permitted documentation and synthetic edge cases.
5. Test missing, compatible and incompatible installations.
6. Enable mode-specific completions and diagnostics only after those tests pass.

Until then the UI must describe CommonAPI2 intelligence as unavailable, not
simulate it.

Verified guide:
<https://www.transportfever.net/lexicon/entry/361-commonapi2-quickstart-guide/>
