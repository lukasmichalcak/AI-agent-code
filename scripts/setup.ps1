param([switch]$PullModel, [switch]$InstallBrowsers, [string]$Model = 'qwen3.5:4b')
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root
if (-not (Get-Command py -ErrorAction SilentlyContinue)) { throw 'Install Python 3.12 first (README.md).' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node 22 LTS or newer first (README.md).' }
$NodeVersion = (node --version).TrimStart('v').Split('.')
$NodeMajor = [int]$NodeVersion[0]
$NodeMinor = [int]$NodeVersion[1]
if ($NodeMajor -lt 22 -or ($NodeMajor -eq 22 -and $NodeMinor -lt 12)) { throw 'Node 22.12+ is required for the supplied frontend.' }
py -3.12 -m venv .venv
if ($LASTEXITCODE -ne 0) { throw 'Could not create the Python environment.' }
$Python = Join-Path $Root '.venv\Scripts\python.exe'
& $Python -m pip install -r backend/requirements-lock.txt
if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed.' }
npm --prefix adapters ci
if ($LASTEXITCODE -ne 0) { throw 'Adapter dependency installation failed.' }
npm --prefix frontend ci
if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
if ($InstallBrowsers) {
  Push-Location frontend
  try { npx playwright install chromium; if ($LASTEXITCODE -ne 0) { throw 'Browser download failed.' } } finally { Pop-Location }
}
if ($PullModel) {
  if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) { throw 'Install and start Ollama first (README.md).' }
  ollama pull $Model
  if ($LASTEXITCODE -ne 0) { throw 'Model download failed; inspect the Ollama error.' }
}
Write-Host 'Setup complete. Run .venv\Scripts\python.exe scripts\run_local.py (or add --fixture).'
