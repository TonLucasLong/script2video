# Speaks one file of text into one WAV using the voices already installed in
# Windows. Called by lib/tts/sapi.js; not meant to be run by hand.
param(
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Voice = '',
  [int]$Rate = 0
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer

if ($Voice) {
  try { $synth.SelectVoice($Voice) }
  catch { Write-Warning "voice '$Voice' not found, using the default" }
}
$synth.Rate = $Rate

$text = Get-Content -Path $In -Raw -Encoding UTF8
$synth.SetOutputToWaveFile($Out)
$synth.Speak($text)
$synth.SetOutputToNull()
$synth.Dispose()
