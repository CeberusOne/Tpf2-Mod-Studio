# Supported file formats

## Parsed or inspected in 0.1

| Format/path | Current behavior | Limit |
| --- | --- | --- |
| root `mod.lua` | UTF-8 text scan, static Lua syntax parse, `data()` and metadata checks | Lua is never executed; semantic coverage is partial |
| `strings.lua` and other `.lua` | UTF-8 text editing and static syntax parse | No full TF2 runtime type system |
| `.mdl` | Text editing, resource indexing and quoted reference extraction | No rendered model preview |
| `.mtl` | Text editing, resource indexing and quoted reference extraction | No material preview |
| `.msh` / `.msh.blob` | Indexed; text mesh references inspected when readable | No binary mesh decoding or preview |
| `.con` | Text editing, indexing and quoted reference extraction | No construction preview |
| `.tga`, `.dds`, `.png` | Indexed as textures | No image preview in 0.1 |
| `.wav`, `.ogg` | Indexed as sound | No audio preview |
| `stdout.txt` | Bounded UTF-8 read, severity/source extraction and repetition grouping | 32 MiB native IPC cap; no streaming yet |
| other UTF-8-sized text files | Listed and editable when the scanner classifies them as text | No format-specific validation |
| other binary files | Listed and counted | Not opened in the text editor |

TF2 resource paths are normalized with `/` for analysis. The validator warns
about upper-case names because Transport Fever 2 documentation recommends
lower-case filenames for portability across case-sensitive systems.

An unresolved quoted resource reference is a warning with **heuristic**
certainty. The reference may belong to the base game or another dependency,
which 0.1 does not fully index.
