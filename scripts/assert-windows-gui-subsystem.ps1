param(
    [Parameter(Mandatory = $true)]
    [string]$Executable
)

$resolved = Resolve-Path -LiteralPath $Executable
$stream = [System.IO.File]::OpenRead($resolved)
$reader = [System.IO.BinaryReader]::new($stream)

try {
    $stream.Position = 0x3c
    $peOffset = $reader.ReadInt32()
    $stream.Position = $peOffset
    if ($reader.ReadUInt32() -ne 0x00004550) {
        throw "$resolved is not a PE executable."
    }

    # IMAGE_OPTIONAL_HEADER.Subsystem is 68 bytes into both PE32 and PE32+.
    $stream.Position = $peOffset + 24 + 68
    $subsystem = $reader.ReadUInt16()
    if ($subsystem -ne 2) {
        throw "Expected Windows GUI subsystem (2), found $subsystem in $resolved."
    }

    Write-Host "Verified Windows GUI subsystem for $resolved."
}
finally {
    $reader.Dispose()
    $stream.Dispose()
}
