# Technical evidence baseline

Checked on 2026-07-30.

## Official Transport Fever 2 sources

- Mod components and `mod.lua` structure:
  <https://wiki.transportfever2.com/doku.php?id=modding:modcomponents>
- Mod installation and one-level folder requirement:
  <https://wiki.transportfever2.com/doku.php?id=gamemanual:modinstallation>
- Resource types, UTF-8 and lower-case filename guidance:
  <https://wiki.transportfever2.com/doku.php?id=modding:resourcetypes>
- Game file locations and `stdout.txt` lifecycle:
  <https://wiki.transportfever2.com/doku.php?id=gamemanual:gamefilelocations>
- Scripting basics:
  <https://wiki.transportfever2.com/doku.php?id=modding:scriptingbasics>
- Resource modifiers, file filters and their callback contracts:
  <https://wiki.transportfever2.com/doku.php?id=modding:modifiersfilters>
- Base configuration timing:
  <https://wiki.transportfever2.com/doku.php?id=modding:baseconfig>

## CommonAPI2 source

- CommonAPI2 quickstart, native/script split, activation and build boundary:
  <https://www.transportfever.net/lexicon/entry/361-commonapi2-quickstart-guide/>

## Official framework sources

- Tauri project creation:
  <https://v2.tauri.app/start/create-project/>
- Tauri platform prerequisites:
  <https://v2.tauri.app/start/prerequisites/>
- Tauri GitHub Actions pipeline:
  <https://v2.tauri.app/distribute/pipelines/github/>
- Tauri application icons:
  <https://v2.tauri.app/develop/icons/>
- Tauri architecture:
  <https://v2.tauri.app/concept/architecture/>
- Tauri capabilities:
  <https://v2.tauri.app/security/capabilities/>
- React build-tool setup:
  <https://react.dev/learn/build-a-react-app-from-scratch>

## Evidence status

| Decision or rule | Status |
| --- | --- |
| `mod.lua` at the mod root | Officially documented |
| `res/` mirrors game resource structure | Officially documented |
| lower-case filenames reduce case-sensitive OS issues | Officially documented recommendation |
| Tauri supports Windows and Linux desktop shells | Officially documented |
| Tauri native bundle in this repository | Build, package and process start verified on Ubuntu 22.04 and Windows Server 2022 |
| TypeScript domain behavior | Verified by automated tests in this repository |
| Rust filesystem boundary behavior | Verified by five native tests on both supported CI operating systems |
| 22 vanilla modifier categories and 24 file-filter categories | Officially documented and regression-tested |
| Known `stdout.txt` cause signatures | Deterministic fixture-tested; unknown signatures remain unclassified |
| Full cross-mod order and provenance | Not verified without a real ordered active-mod/base-resource corpus |
