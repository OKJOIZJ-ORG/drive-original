param([Parameter(Mandatory=$true)][string]$LedgerPath,[ValidateSet('moved','trashed','restored','cleaned')][string]$Phase='moved')
$ErrorActionPreference='Stop'
try {
  $raw=Get-Content -LiteralPath $LedgerPath -Raw | ConvertFrom-Json
  $ledger=$raw.ledger
  $roles=@('folder-a','folder-b','test-image-1','test-image-2')
  if($ledger.schema -ne 1 -or $ledger.planned.Count -ne 4 -or $ledger.created.Count -ne 4 -or $ledger.run -notmatch '^[0-9a-f-]{36}$'){throw 'LEDGER_DENIED'}
  foreach($role in $roles){
    $row=@($ledger.created | Where-Object {$_.role -eq $role})
    if($row.Count -ne 1 -or $row[0].id -notmatch '^[A-Za-z0-9_-]{5,200}$' -or $row[0].metadata.name -cne "DriveOriginal-QA-$($ledger.run)-$role"){throw 'LEDGER_DENIED'}
  }
  $driveRoot='G:\'+[string]::Concat([char]0xB0B4,' ',[char]0xB4DC,[char]0xB77C,[char]0xC774,[char]0xBE0C)
  $folderA=$ledger.created | Where-Object {$_.role -eq 'folder-a'}
  $folderB=$ledger.created | Where-Object {$_.role -eq 'folder-b'}
  $observations=@()
  foreach($row in $ledger.created | Where-Object {$_.role -like 'test-image-*'}){
    $pathA=Join-Path (Join-Path $driveRoot $folderA.metadata.name) $row.metadata.name
    $pathB=Join-Path (Join-Path $driveRoot $folderB.metadata.name) $row.metadata.name
    $existsA=Test-Path -LiteralPath $pathA -PathType Leaf
    $existsB=Test-Path -LiteralPath $pathB -PathType Leaf
    $chosen=if($Phase -eq 'restored'){$pathA}else{$pathB}
    $sizeMatches=$null;$checksumMatches=$null;$readCode=$null
    if(Test-Path -LiteralPath $chosen -PathType Leaf){
      try{$sizeMatches=(Get-Item -LiteralPath $chosen).Length -eq 74;$checksumMatches=(Get-FileHash -LiteralPath $chosen -Algorithm MD5).Hash.ToLower() -ceq $row.metadata.md5Checksum}catch{$readCode='LOCAL_READ_UNAVAILABLE'}
    }
    # Known exact ID path is only an observation, not an assumed provider API.
    $idPath=Join-Path (Join-Path 'G:\.shortcut-targets-by-id' $folderB.id) $row.metadata.name
    $observations+=[pscustomobject]@{role=$row.role;presentInA=$existsA;presentInB=$existsB;sizeMatches=$sizeMatches;checksumMatches=$checksumMatches;knownFolderIdPathPresent=(Test-Path -LiteralPath $idPath -PathType Leaf);readCode=$readCode}
  }
  [pscustomobject]@{schema='drive-original.rc31-disposable-g-observation/1';recordedAt=(Get-Date).ToUniversalTime().ToString('o');phase=$Phase;mountPresent=(Test-Path -LiteralPath $driveRoot);folderAPresent=(Test-Path -LiteralPath (Join-Path $driveRoot $folderA.metadata.name));folderBPresent=(Test-Path -LiteralPath (Join-Path $driveRoot $folderB.metadata.name));files=$observations;exactCloudIdProven=$false;onlyTaskCreatedPngRead=$true;readOnly=$true;rawIdentifiersExported=$false}|ConvertTo-Json -Depth 5
} catch {
  [pscustomobject]@{schema='drive-original.rc31-disposable-g-observation/1';phase=$Phase;readOnly=$true;code='LOCAL_OBSERVATION_FAILED';rawIdentifiersExported=$false}|ConvertTo-Json -Compress
  exit 1
}
