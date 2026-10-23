# Production veritabanının bu bilgisayara günlük yedeği (Windows Görev Zamanlayıcı ile her gün çalışır).
# Supabase CLI (bağlı proje, Docker'daki pg_dump) ile üç dosya alınır: roller, şema, veri (auth + public + storage kayıtları).
# Yedek tarihli .zip olarak $Hedef klasörüne yazılır; $Gun günden eski yedekler silinir. Dosya depolamasındaki
# fotoğraf / PDF'lerin kendisi bu yedekte yoktur (yalnız kayıtları). Geri yükleme: docs/yedekten-donus.md
param(
  [string]$Hedef = "$env:USERPROFILE\Documents\BulusKure-Yedek",
  [int]$Gun = 30
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force $Hedef | Out-Null
$log = Join-Path $Hedef 'yedek.log'
function Yaz($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m" | Out-File -Append -Encoding utf8 $log }

try {
  # Docker kapalıysa açılır (pg_dump Docker içinde çalışır)
  $ErrorActionPreference = 'Continue'
  docker info *> $null
  $ErrorActionPreference = 'Stop'
  if ($LASTEXITCODE -ne 0) {
    Yaz 'Docker kapalı; açılıyor.'
    Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    $hazir = $false
    for ($i = 0; $i -lt 36; $i++) { Start-Sleep 5; docker info *> $null; if ($LASTEXITCODE -eq 0) { $hazir = $true; break } }
    if (-not $hazir) { throw 'Docker 3 dakikada açılmadı.' }
  }

  $ad = 'yedek-' + (Get-Date -Format 'yyyy-MM-dd_HHmm')
  $gecici = Join-Path $Hedef $ad
  New-Item -ItemType Directory -Force $gecici | Out-Null
  Push-Location $repo
  try {
    foreach ($p in @(
        @{ f = 'roller.sql'; a = @('--role-only') },
        @{ f = 'sema.sql'; a = @() },
        @{ f = 'veri.sql'; a = @('--data-only', '--use-copy') })) {
      $dosya = Join-Path $gecici $p.f
      # CLI bilgi mesajlarını stderr'e yazar; PowerShell 5.1 bunu hata saymasın diye yalnız çıkış koduna bakılır
      $ErrorActionPreference = 'Continue'
      $cikti = & npx.cmd supabase db dump --linked -f $dosya @($p.a) 2>&1 | Out-String
      $ErrorActionPreference = 'Stop'
      if ($LASTEXITCODE -ne 0 -or -not (Test-Path $dosya)) { throw "$($p.f) alınamadı: $($cikti.Trim())" }
    }
  } finally { Pop-Location }

  # Doğrulama: veri dosyası öğrenci ve hesap tablolarını içermeli
  $veri = Join-Path $gecici 'veri.sql'
  foreach ($t in @('COPY "public"."students"', 'COPY "public"."exam_results"', 'COPY "auth"."users"')) {
    if (-not (Select-String -Path $veri -SimpleMatch $t -Quiet)) { throw "Veri dosyasında $t yok." }
  }

  $zip = Join-Path $Hedef "$ad.zip"
  Compress-Archive -Path "$gecici\*" -DestinationPath $zip -Force
  Remove-Item -Recurse -Force $gecici
  $mb = [math]::Round((Get-Item $zip).Length / 1MB, 2)
  Get-ChildItem $Hedef -Filter 'yedek-*.zip' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$Gun) } | Remove-Item -Force
  Yaz "TAMAM  $ad.zip ($mb MB)"
} catch {
  Yaz "HATA  $($_.Exception.Message)"
  if ($gecici -and (Test-Path $gecici)) { Remove-Item -Recurse -Force $gecici }
  exit 1
}
