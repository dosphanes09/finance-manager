$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$openScript = Join-Path $scriptDir "open-app.cmd"
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "FinanceAnalyzerPro.lnk"

if (-not (Test-Path $openScript)) {
  throw "Open script was not found at $openScript"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $openScript
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = "Open FinanceAnalyzerPro local app"
$shortcut.WindowStyle = 7
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,13"
$shortcut.Save()

Write-Host "Desktop shortcut created: $shortcutPath"
