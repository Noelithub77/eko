$ErrorActionPreference = "Stop"

function Get-AndroidDevices {
  $lines = @(
    adb devices |
      Select-Object -Skip 1 |
      Where-Object { $_.Trim().Length -gt 0 }
  )

  foreach ($line in $lines) {
    $parts = $line.Trim() -split "\s+"
    if ($parts.Count -ge 2) {
      [PSCustomObject]@{
        Serial = $parts[0]
        State = $parts[1]
      }
    }
  }
}

function Get-ReadyAndroidDevice {
  $devices = @(Get-AndroidDevices)
  $readyDevices = @($devices | Where-Object { $_.State -eq "device" })

  if ($readyDevices.Count -eq 1) {
    return $readyDevices[0].Serial
  }

  if ($readyDevices.Count -gt 1) {
    return Select-AndroidDevice -Devices $readyDevices
  }

  $blockedDevices = @($devices | Where-Object { $_.State -ne "device" })
  foreach ($device in $blockedDevices) {
    Write-Host "Android device $($device.Serial) is $($device.State)."
  }

  return $null
}

function Get-AndroidDeviceLabel {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Serial
  )

  if ($Serial -match "^emulator-") {
    $avdName = adb -s $Serial shell getprop ro.boot.qemu.avd_name 2>$null
    if ($avdName -and $avdName.Trim().Length -gt 0) {
      return "Emulator $($avdName.Trim())"
    }

    return "Emulator"
  }

  $model = adb -s $Serial shell getprop ro.product.model 2>$null
  if ($model -and $model.Trim().Length -gt 0) {
    return "Phone $($model.Trim())"
  }

  return "Phone"
}

function Select-AndroidDevice {
  param(
    [Parameter(Mandatory = $true)]
    [array]$Devices
  )

  Write-Host "Choose Android device:"
  for ($index = 0; $index -lt $Devices.Count; $index++) {
    $number = $index + 1
    $serial = $Devices[$index].Serial
    $label = Get-AndroidDeviceLabel -Serial $serial
    Write-Host "[$number] $label ($serial)"
  }

  while ($true) {
    $choice = Read-Host "Device number"
    $parsedChoice = 0
    if (
      [int]::TryParse($choice, [ref]$parsedChoice) -and
      $parsedChoice -ge 1 -and
      $parsedChoice -le $Devices.Count
    ) {
      return $Devices[$parsedChoice - 1].Serial
    }

    Write-Host "Enter a number from 1 to $($Devices.Count)."
  }
}

function Wait-ForAndroidBoot {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Serial
  )

  for ($attempt = 0; $attempt -lt 90; $attempt++) {
    $bootState = adb -s $Serial shell getprop sys.boot_completed 2>$null
    if ($bootState -match "1") {
      return
    }
    Start-Sleep -Seconds 2
  }

  throw "Android device $Serial connected but did not finish booting in time."
}

function Wait-ForNewAndroidDevice {
  param(
    [AllowEmptyCollection()]
    [string[]]$KnownSerials = @()
  )

  for ($attempt = 0; $attempt -lt 90; $attempt++) {
    $readyDevices = @(Get-AndroidDevices | Where-Object { $_.State -eq "device" })
    $newDevice = $readyDevices | Where-Object { $KnownSerials -notcontains $_.Serial } | Select-Object -First 1
    $selectedDevice = if ($newDevice) { $newDevice } else { $readyDevices | Select-Object -First 1 }

    if ($selectedDevice) {
      Wait-ForAndroidBoot -Serial $selectedDevice.Serial
      return $selectedDevice.Serial
    }

    Start-Sleep -Seconds 2
  }

  throw "Android emulator started but no ready adb device appeared in time."
}

function Start-FirstEmulator {
  $avds = @(
    emulator -list-avds |
      Where-Object { $_.Trim().Length -gt 0 }
  )

  if ($avds.Count -eq 0) {
    throw "No Android device is connected and no emulator AVD exists."
  }

  $knownSerials = @(Get-AndroidDevices | ForEach-Object { $_.Serial })
  $avd = $avds[0]
  Write-Host "No Android device connected. Starting emulator: $avd"
  Start-Process -FilePath "emulator" -ArgumentList @("-avd", $avd)

  return Wait-ForNewAndroidDevice -KnownSerials $knownSerials
}

function Start-AppLaunchWatcher {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Serial
  )

  $packageName = "com.codialo.eko"
  $beforeInstall = adb -s $Serial shell dumpsys package $packageName 2>$null |
    Select-String -Pattern "lastUpdateTime=" |
    Select-Object -First 1
  $beforeInstallText = if ($beforeInstall) { $beforeInstall.ToString().Trim() } else { "" }

  $scriptBlock = {
    param([string]$DeviceSerial, [string]$PreviousUpdateTime)

    $packageName = "com.codialo.eko"
    $activityName = "com.codialo.eko/.MainActivity"

    for ($attempt = 0; $attempt -lt 180; $attempt++) {
      $currentUpdateTime = adb -s $DeviceSerial shell dumpsys package $packageName 2>$null |
        Select-String -Pattern "lastUpdateTime=" |
        Select-Object -First 1
      $currentUpdateText = if ($currentUpdateTime) { $currentUpdateTime.ToString().Trim() } else { "" }

      if ($currentUpdateText -and $currentUpdateText -ne $PreviousUpdateTime) {
        adb -s $DeviceSerial shell am start -n $activityName | Out-Null
        return
      }

      Start-Sleep -Seconds 1
    }
  }

  Start-Job -Name "eko-android-launch" -ScriptBlock $scriptBlock -ArgumentList $Serial, $beforeInstallText | Out-Null
}

function Get-TauriDeviceName {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Serial
  )

  if ($Serial -match "^emulator-") {
    $avdName = adb -s $Serial shell getprop ro.boot.qemu.avd_name 2>$null
    if ($avdName -and $avdName.Trim().Length -gt 0) {
      return $avdName.Trim()
    }
  }

  return $Serial
}

$deviceSerial = Get-ReadyAndroidDevice
if (-not $deviceSerial) {
  $deviceSerial = Start-FirstEmulator
} else {
  Wait-ForAndroidBoot -Serial $deviceSerial
}

$tauriDeviceName = Get-TauriDeviceName -Serial $deviceSerial
Write-Host "Starting Tauri Android dev on device: $tauriDeviceName"
Start-AppLaunchWatcher -Serial $deviceSerial
npm run tauri -- android dev $tauriDeviceName
