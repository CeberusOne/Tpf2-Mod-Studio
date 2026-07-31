local function doubleBridgeSpeed(fileName, data)
  if data.speedLimit then
    data.speedLimit = data.speedLimit * 2
  end
  return data
end

local function keepVehicles(fileName, data)
  return data.metadata.transportVehicle ~= nil
end

function data()
  return {
    info = {
      name = _("Valid modifier fixture"),
      description = _("modDesc"),
      authors = { { name = "Fixture", role = "CREATOR" } },
      minorVersion = 0,
    },
    runFn = function(settings, modParams)
      addModifier("loadBridge", doubleBridgeSpeed)
      addFileFilter("model/vehicle", keepVehicles)
    end,
  }
end
