# scripts/verify.ps1 - PowerShell verification script
$ErrorActionPreference = "Stop"

Write-Host "=== [1/3] Running Server Tests ===" -ForegroundColor Cyan
Push-Location -Path "$PSScriptRoot/../server"
try {
    npm test
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Server tests failed with code $LASTEXITCODE"
        exit 1
    }
} finally {
    Pop-Location
}

Write-Host "=== [2/3] Running Client Tests ===" -ForegroundColor Cyan
Push-Location -Path "$PSScriptRoot/../client"
try {
    npm test
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Client tests failed with code $LASTEXITCODE"
        exit 1
    }

    Write-Host "=== [3/3] Building Client Bundle ===" -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Client build failed with code $LASTEXITCODE"
        exit 1
    }
} finally {
    Pop-Location
}

Write-Host "=== ALL VERIFICATION CHECKS PASSED ===" -ForegroundColor Green
exit 0
