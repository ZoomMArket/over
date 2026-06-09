# Generate a self-signed code signing certificate for Overlord agent builds.
# Run this once, then configure the .pfx path in the server settings.
#
# Usage: .\generate-signing-cert.ps1 [-Name "My Company"] [-OutputDir ".\certs"]
#
# Note: Self-signed certs reduce SmartScreen warnings but don't fully bypass them.
# For full SmartScreen bypass, purchase an EV certificate from Sectigo/DigiCert/GlobalSign.

param(
    [string]$Name = "Overlord Code Signing",
    [string]$OutputDir = ".\certs",
    [string]$Password = "overlord-sign"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

Write-Host "Generating self-signed code signing certificate..." -ForegroundColor Cyan
Write-Host "  Subject: CN=$Name" -ForegroundColor Gray

$cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject "CN=$Name" `
    -KeyExportPolicy Exportable `
    -KeyLength 2048 `
    -KeyAlgorithm RSA `
    -HashAlgorithm SHA256 `
    -NotAfter (Get-Date).AddYears(5) `
    -CertStoreLocation Cert:\CurrentUser\My

$securePassword = ConvertTo-SecureString -String $Password -Force -AsPlainText
$pfxPath = Join-Path $OutputDir "overlord-sign.pfx"

Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $securePassword | Out-Null

$cerPath = Join-Path $OutputDir "overlord-sign.cer"
Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null

Write-Host ""
Write-Host "Certificate generated:" -ForegroundColor Green
Write-Host "  PFX (private key): $pfxPath" -ForegroundColor Yellow
Write-Host "  CER (public key):  $cerPath" -ForegroundColor Yellow
Write-Host "  Password:          $Password" -ForegroundColor Yellow
Write-Host "  Thumbprint:        $($cert.Thumbprint)" -ForegroundColor Yellow
Write-Host ""
Write-Host "To use with Overlord:" -ForegroundColor Cyan
Write-Host "  1. Copy the .pfx file to your server's data/ directory"
Write-Host "  2. Set OVERLORD_SIGN_PFX=data/overlord-sign.pfx in your environment"
Write-Host "  3. Set OVERLORD_SIGN_PASSWORD=$Password in your environment"
Write-Host ""
Write-Host "To trust this cert on the local machine (for testing):" -ForegroundColor Cyan
Write-Host "  Import-Certificate -FilePath '$cerPath' -CertStoreLocation Cert:\LocalMachine\Root"
