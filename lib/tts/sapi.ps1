# Speaks one file of text into one WAV using the voices already installed in
# Windows. Called by lib/tts/sapi.js; not meant to be run by hand.
param(
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Voice = '',
  [int]$Rate = 0
)

$ErrorActionPreference = 'Stop'

# .NET resolves relative paths against its own current directory, which is not
# always PowerShell's. Make both absolute before anything touches them.
$inPath = (Resolve-Path -LiteralPath $In).Path
$outPath = [System.IO.Path]::Combine((Get-Location).ProviderPath, $Out)

Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer

if ($Voice) {
  $installed = $synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }
  # Exact name first, then anything containing what was asked for, so "Zira"
  # finds "Microsoft Zira Desktop".
  $match = $installed | Where-Object { $_ -eq $Voice } | Select-Object -First 1
  if (-not $match) { $match = $installed | Where-Object { $_ -like "*$Voice*" } | Select-Object -First 1 }
  if ($match) { $synth.SelectVoice($match) }
  else { Write-Warning "voice '$Voice' not found, using the default. Installed: $($installed -join ', ')" }
}

$synth.Rate = $Rate
$text = Get-Content -LiteralPath $inPath -Raw -Encoding UTF8

$synth.SetOutputToWaveFile($outPath)
$synth.Speak($text)
$synth.SetOutputToNull()
$synth.Dispose()
