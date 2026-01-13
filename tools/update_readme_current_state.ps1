param(
  [string]$ReadmePath = "README.md",
  [string]$SourcePath = "docs/current_state.md"
)

$begin = "<!-- AUTO:CURRENT_STATE:BEGIN -->"
$end   = "<!-- AUTO:CURRENT_STATE:END -->"

if (!(Test-Path $ReadmePath)) { throw "README not found: $ReadmePath" }
if (!(Test-Path $SourcePath)) { throw "Source not found: $SourcePath" }

$readme = Get-Content -Raw -Encoding UTF8 $ReadmePath
$src    = Get-Content -Raw -Encoding UTF8 $SourcePath

if ($readme -notmatch [regex]::Escape($begin) -or $readme -notmatch [regex]::Escape($end)) {
  throw "Markers not found in README. Add:`n$begin`n...`n$end"
}

$pattern = [regex]::Escape($begin) + ".*?" + [regex]::Escape($end)
$replacement = $begin + "`r`n" + $src.TrimEnd() + "`r`n" + $end

$updated = [regex]::Replace($readme, $pattern, $replacement, "Singleline")

# Write UTF-8 (no BOM)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Resolve-Path $ReadmePath).Path, $updated, $utf8NoBom)

Write-Host "Updated CURRENT STATE block in $ReadmePath"
