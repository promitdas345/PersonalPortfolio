<#
    Compiles the sources, runs the self-test, and packages out/connect4.jar.

      .\build.ps1            compile + self-test + jar
      .\build.ps1 -Run       ...then launch the game
      .\build.ps1 -SkipTests compile + jar only
#>
param(
    [switch]$Run,
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$out = Join-Path $PSScriptRoot 'out'
$jar = Join-Path $out 'connect4.jar'

if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Path $out | Out-Null

$sources = Get-ChildItem -Path 'src' -Filter '*.java' -Recurse | ForEach-Object { $_.FullName }
Write-Host "compiling $($sources.Count) files" -ForegroundColor Cyan
& javac -Xlint:all -Xlint:-serial -d $out $sources
if ($LASTEXITCODE -ne 0) { throw 'compilation failed' }

if (-not $SkipTests) {
    Write-Host 'running self-test' -ForegroundColor Cyan
    & java -cp $out connect4.SelfTest
    if ($LASTEXITCODE -ne 0) { throw 'self-test failed' }
}

Write-Host 'packaging out/connect4.jar' -ForegroundColor Cyan
& jar --create --file $jar --main-class connect4.Main -C $out connect4
if ($LASTEXITCODE -ne 0) { throw 'packaging failed' }

Write-Host "built $jar" -ForegroundColor Green
if ($Run) { & java -jar $jar }
