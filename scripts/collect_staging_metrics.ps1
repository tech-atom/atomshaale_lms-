param(
    [string]$ComposeFile = "docker-compose.production.yml",
    [string]$StagingFile = "docker-compose.staging.yml",
    [string]$EnvFile = ".env.staging",
    [string]$Output = ""
)

$ErrorActionPreference = "Stop"
$compose = @("compose", "--env-file", $EnvFile, "-f", $ComposeFile, "-f", $StagingFile)
$timestamp = (Get-Date).ToUniversalTime().ToString("o")

function Invoke-Compose([string[]]$Arguments) {
    & docker @compose @Arguments 2>&1 | Out-String
}

$snapshot = [ordered]@{
    timestamp_utc = $timestamp
    services = Invoke-Compose @("ps")
    container_stats = (& docker stats --no-stream --format '{{json .}}' 2>&1 | Out-String)
    redis_info = Invoke-Compose @("exec", "-T", "redis", "redis-cli", "INFO", "memory", "clients", "stats")
    compiler_queue_depth = Invoke-Compose @("exec", "-T", "redis", "redis-cli", "LLEN", "compiler_queue").Trim()
    celery_compiler_workers = Invoke-Compose @("exec", "-T", "celery-compiler", "celery", "-A", "atomm_lms", "inspect", "active")
    postgres_activity = Invoke-Compose @("exec", "-T", "postgres", "sh", "-c", 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT count(*) AS connections, count(*) FILTER (WHERE state = ''active'') AS active FROM pg_stat_activity;"')
}

$json = $snapshot | ConvertTo-Json -Depth 8
if ($Output) {
    $json | Set-Content -Path $Output -Encoding utf8
}
$json