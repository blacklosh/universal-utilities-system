$ErrorActionPreference = 'Stop'
$launchArguments = '-m uvicorn app:app --host 127.0.0.1 --port 8000 --app-dir "' + $PSScriptRoot + '"'
$pattern = '\s' + [regex]::Escape($launchArguments) + '\s*$'

function Get-ProjectServer {
    Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
        Where-Object { $_.CommandLine -match $pattern }
}

$servers = @(Get-ProjectServer)
if ($servers.Count -eq 0) {
    Write-Host 'Universal Utility Tool is not running.'
    exit 0
}

# The Windows virtual environment can use a launcher and a child interpreter.
# Stop both so a restart can safely bind the port again.
foreach ($server in $servers) {
    Stop-Process -Id $server.ProcessId -ErrorAction SilentlyContinue
}

$deadline = [DateTime]::UtcNow.AddSeconds(5)
while (@(Get-ProjectServer).Count -gt 0) {
    if ([DateTime]::UtcNow -ge $deadline) {
        Write-Error 'Universal Utility Tool could not be stopped.'
    }
    Start-Sleep -Milliseconds 100
}

Write-Host 'Universal Utility Tool stopped.'
