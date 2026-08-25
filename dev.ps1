# Start local stack: Supabase + FastAPI + Vite
# Usage (from repo root):
#   .\dev.ps1
#   .\dev.cmd

$ErrorActionPreference = 'Stop'

# Resolve repo root even when invoked via -Command / different hosts.
$scriptPath = $MyInvocation.MyCommand.Path
if (-not $scriptPath) { $scriptPath = $PSCommandPath }
if ($scriptPath) {
  $Root = Split-Path -Parent (Resolve-Path -LiteralPath $scriptPath)
} elseif ($PSScriptRoot) {
  $Root = $PSScriptRoot
} else {
  $Root = (Get-Location).Path
}
# Allow calling from scripts\dev.ps1 shim
if ((Split-Path -Leaf $Root) -eq 'scripts') {
  $Root = Split-Path -Parent $Root
}
Set-Location -LiteralPath $Root

$py = Join-Path $Root '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $py)) {
  throw "Missing .venv. Run: python -m venv .venv; .\.venv\Scripts\python.exe -m pip install -r requirements.txt"
}
if (-not (Test-Path -LiteralPath (Join-Path $Root 'frontend\node_modules'))) {
  throw "Missing frontend\node_modules. Run: cd frontend; pnpm install"
}

Write-Host '==> Supabase' -ForegroundColor Cyan
# npx writes warnings to stderr; don't treat that as a terminating error
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
npx --yes supabase start
$supabaseExit = $LASTEXITCODE
$ErrorActionPreference = $prevEap
if ($supabaseExit -ne 0) { throw "supabase start failed (exit $supabaseExit)" }

# Quote-safe paths (repo path may contain spaces, e.g. "AI IA")
$frontendDir = Join-Path $Root 'frontend'

Write-Host '==> Backend  http://localhost:8000' -ForegroundColor Cyan
$backend = Start-Process -PassThru -FilePath 'cmd.exe' -WorkingDirectory $Root -ArgumentList @(
  '/k',
  "title Backend :8000 && `"$py`" -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000"
)

Write-Host '==> Frontend http://localhost:3000' -ForegroundColor Cyan
$frontend = Start-Process -PassThru -FilePath 'cmd.exe' -WorkingDirectory $frontendDir -ArgumentList @(
  '/k',
  'title Frontend :3000 && npm run dev'
)

Write-Host ''
Write-Host 'Studio   http://127.0.0.1:54323'
Write-Host 'Backend  http://localhost:8000/docs'
Write-Host 'Frontend http://localhost:3000'
Write-Host ''
Write-Host 'Press Enter to stop backend + frontend (Supabase stays up).' -ForegroundColor Yellow

function Stop-ChildTree([int]$ProcessId) {
  if ($ProcessId -le 0) { return }
  & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null
}

try {
  # Read-Host works in normal PowerShell consoles; falls back if stdin is closed.
  try {
    [void](Read-Host)
  } catch {
    Wait-Process -Id @($backend.Id, $frontend.Id) -ErrorAction SilentlyContinue
  }
} finally {
  Write-Host 'Stopping backend + frontend...' -ForegroundColor Cyan
  Stop-ChildTree $backend.Id
  Stop-ChildTree $frontend.Id
}
