$ErrorActionPreference = "Continue"
$out = ""
try {
    $result = & "npx" "vitest" "run" "tests/racingRoad.test.js" 2>&1
    $out = $result | Out-String
} catch {
    $out = "ERROR: " + $_.Exception.Message
}
[System.IO.File]::WriteAllText("$PSScriptRoot\result.txt", $out, [System.Text.Encoding]::UTF8)
Write-Host "Written to result.txt"
Write-Host $out
