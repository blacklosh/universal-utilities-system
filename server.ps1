param([switch]$Start)

$ErrorActionPreference = 'Stop'
$launchArguments = '-m uvicorn app:app --host 127.0.0.1 --port 8000 --app-dir "' + $PSScriptRoot + '"'
$pattern = '\s' + [regex]::Escape($launchArguments) + '\s*$'

function Get-ProjectServer {
    Get-CimInstance Win32_Process -Filter "Name = 'python.exe' OR Name = 'pythonw.exe'" |
        Where-Object { $_.CommandLine -match $pattern }
}

$servers = @(Get-ProjectServer)
if ($Start) {
    if ($servers.Count -gt 0) {
        Write-Host 'Universal Utility Tool is already running.'
        exit 0
    }

    if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) {
        Write-Error 'Port 8000 is already in use.'
    }

    $python = Join-Path $PSScriptRoot '.venv\Scripts\pythonw.exe'
    $server = Start-Process -FilePath $python -ArgumentList $launchArguments `
        -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $PSScriptRoot 'server-access.log') `
        -RedirectStandardError (Join-Path $PSScriptRoot 'server.log')

    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    do {
        if ($server.HasExited) { break }
        try {
            $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/' -UseBasicParsing -TimeoutSec 1
            if ($response.StatusCode -eq 200) {
                Write-Host 'Universal Utility Tool is running at http://127.0.0.1:8000/'
                exit 0
            }
        } catch {
            Start-Sleep -Milliseconds 200
        }
    } while ([DateTime]::UtcNow -lt $deadline)

    Write-Error 'Universal Utility Tool did not start. See server.log.'
}

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
