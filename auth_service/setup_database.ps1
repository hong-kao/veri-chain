# PostgreSQL setup script for VeriChain Auth Service
$psqlPath = "C:\Program Files\PostgreSQL\17\bin\psql.exe"

Write-Host "Creating verichain_auth database..." -ForegroundColor Green

# Create database
& $psqlPath -U postgres -c "CREATE DATABASE verichain_auth;"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Database 'verichain_auth' created successfully!" -ForegroundColor Green
} else {
    Write-Host "Note: Database might already exist or there was an error." -ForegroundColor Yellow
}

# Test connection
Write-Host "`nTesting connection to database..." -ForegroundColor Green
& $psqlPath -U postgres -d verichain_auth -c "SELECT version();"

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✓ PostgreSQL is ready for VeriChain!" -ForegroundColor Green
} else {
    Write-Host "`n✗ Connection test failed" -ForegroundColor Red
}
