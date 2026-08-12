# Start local stack: Supabase + FastAPI + Vite.
# Usage:  .\scripts\dev.ps1
#    or:  .\dev.cmd

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root

$py = Join-Path $Root '.venv\Scripts\python.exe'
if (-not (Test-Path $py)) {
  throw "Missing .venv. Create it first: python -m venv .venv && .\.venv\Scripts\python.exe -m pip install -r requirements.txt"
}
if (-not (Test-Path (Join-Path $Root 'frontend\node_modules'))) {
  throw "Missing frontend\node_modules. Run: cd frontend; npm install"
}

Write-Host '==> Supabase' -ForegroundColor Cyan
npx --yes supabase start
if ($LASTEXITCODE -ne 0) { throw 'supabase start failed' }

Write-Host '==> Backend  http://localhost:8000' -ForegroundColor Cyan
$backend = Start-Process -PassThru -WorkingDirectory $Root -FilePath 'powershell.exe' -ArgumentList @(
  '-NoProfile', '-NoExit', '-Command',
  "& '$py' -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000"
)

Write-Host '==> Frontend http://localhost:3000' -ForegroundColor Cyan
$frontend = Start-Process -PassThru -WorkingDirectory (Join-Path $Root 'frontend') -FilePath 'powershell.exe' -ArgumentList @(
  '-NoProfile', '-NoExit', '-Command',
  'npm run dev'
)

Write-Host ''
Write-Host 'Studio  http://127.0.0.1:54323'
Write-Host 'Press Ctrl+C or Enter to stop backend + frontend (Supabase stays up).' -ForegroundColor Yellow

function Stop-ChildTree([int]$ProcessId) {
  if ($ProcessId -le 0) { return }
  & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null
}

try {
  [void][Console]::ReadLine()
} finally {
  Write-Host 'Stopping backend + frontend...' -ForegroundColor Cyan
  Stop-ChildTree $backend.Id
  Stop-ChildTree $frontend.Id
}
