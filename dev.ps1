param(
    [Parameter(Position=0, Mandatory=$false)]
    [string]$Action = "help",
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$CommandArgs
)

$hasGo = (Get-Command go -ErrorAction SilentlyContinue) -ne $null

function Run-Go {
    param(
        [string[]]$params,
        [hashtable]$env = @{}
    )
    if ($hasGo) {
        $origEnv = @{}
        foreach ($k in $env.Keys) {
            $origEnv[$k] = [Environment]::GetEnvironmentVariable($k)
            [Environment]::SetEnvironmentVariable($k, $env[$k])
        }
        try {
            & go @params
        } finally {
            foreach ($k in $env.Keys) {
                [Environment]::SetEnvironmentVariable($k, $origEnv[$k])
            }
        }
    } else {
        $envArgs = @()
        foreach ($k in $env.Keys) {
            $envArgs += "-e"
            $envArgs += "$k=$($env[$k])"
        }
        docker run --rm -v "${PWD}:/app" -v "go-pkg-cache:/go/pkg/mod" $envArgs -w /app golang:1.22-alpine go @params
    }
}

switch ($Action) {
    "tidy"  { Run-Go @("mod", "tidy") }
    "test"  { Run-Go @("test", "-v", "./...") }
    "vet"   { Run-Go @("vet", "./...") }
    "fmt"   { Run-Go @("fmt", "./...") }
    "build" { Run-Go @("build", "-v", "-o", "bin/brilian-engine.exe", "./cmd/server") -env @{ GOOS = "windows"; GOARCH = "amd64" } }
    "run"   { & ".\bin\brilian-engine.exe" }
    "up"    { docker compose up -d postgres minio minio-init }
    "down"  { docker compose down }
    "ps"    { docker compose ps }
    "e2e"   { node --test tests/e2e/tier1_features/*.test.js }
    default { Write-Host "Usage: .\dev.ps1 [tidy|test|vet|fmt|build|run|up|down|ps|e2e]" }
}
