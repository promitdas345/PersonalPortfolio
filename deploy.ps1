# Static site deploy script for garfield.cs.mun.ca
# Usage: .\deploy.ps1 YOUR_USERNAME

param(
    [Parameter(Mandatory=$true)]
    [string]$Username
)

$RemoteHost = "garfield.cs.mun.ca"
$LocalPath = $PSScriptRoot

Write-Host "Building static site..." -ForegroundColor Cyan
node build.js

if (-not (Test-Path "dist")) {
    Write-Host "Build failed - dist/ directory not found" -ForegroundColor Red
    exit 1
}

Write-Host "Fixing paths for static hosting..." -ForegroundColor Cyan
node fix-paths.js

Write-Host "`nDeploying to $Username@$RemoteHost..." -ForegroundColor Cyan

# Create remote directory if it doesn't exist
Write-Host "`nSetting up remote directory..." -ForegroundColor Yellow
ssh "$Username@$RemoteHost" "mkdir -p ~/.www; chmod 755 ~/.www; chmod 711 ~"

# Upload static files from dist/
Write-Host "`nUploading files..." -ForegroundColor Yellow
scp -r dist/* "$Username@${RemoteHost}:~/.www/"

# Fix permissions on remote
Write-Host "`nSetting permissions..." -ForegroundColor Yellow
ssh "$Username@$RemoteHost" "find ~/.www -type d -exec chmod 755 {} \; && find ~/.www -type f -exec chmod 644 {} \;"

Write-Host "`nDeployment complete!" -ForegroundColor Green
Write-Host "Your site is now live at: https://www.cs.mun.ca/~$Username/" -ForegroundColor Green
Write-Host "`nNote: It may take a few minutes for changes to appear." -ForegroundColor Yellow
