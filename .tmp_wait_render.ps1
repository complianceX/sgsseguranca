$target = 'b473dbe2430d13af4842f324e1b34e7124c78696'
$services = @(
  @{ Name = 'web'; Id = 'srv-d75c5eea2pns73dv84rg' },
  @{ Name = 'worker'; Id = 'srv-d75c5eea2pns73dv84sg' }
)
for ($i = 0; $i -lt 30; $i++) {
  $allLive = $true
  foreach ($service in $services) {
    $json = render deploys list $service.Id -o json | ConvertFrom-Json
    $latest = $json[0].deploy
    $isLive = $latest.status -eq 'live' -and $latest.commit.id -eq $target
    Write-Host ("{0}: status={1} commit={2} createdAt={3}" -f $service.Name, $latest.status, $latest.commit.id.Substring(0,7), $latest.createdAt)
    if (-not $isLive) { $allLive = $false }
  }
  if ($allLive) { exit 0 }
  Start-Sleep -Seconds 20
}
exit 1
