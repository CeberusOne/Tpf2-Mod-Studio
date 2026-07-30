local function brokenModifier(fileName)
  fileName = fileName
end

addModifier("loadVehicles", brokenModifier)

function data()
  return {
    info = {
      name = _("Broken modifier fixture"),
      description = _("modDesc"),
      authors = { { name = "Fixture", role = "CREATOR" } },
      minorVersion = 0,
    },
  }
end
