param([string]$Destination = (Join-Path $PSScriptRoot '../artifacts/local-ai-models'))
$ErrorActionPreference = 'Stop'
$revision = '47534e27c9851bb1128ccc0102f1145e27f23f98'
$assets = @(
    @{ Folder='face_detection_yunet'; Name='face_detection_yunet_2023mar.onnx'; Bytes=232589; SHA='8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4' },
    @{ Folder='face_recognition_sface'; Name='face_recognition_sface_2021dec.onnx'; Bytes=38696353; SHA='0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79' }
)
$targetDirectory = [IO.Path]::GetFullPath($Destination)
[IO.Directory]::CreateDirectory($targetDirectory) | Out-Null
foreach ($asset in $assets) {
    $target = Join-Path $targetDirectory $asset.Name
    if (Test-Path -LiteralPath $target) {
        if ((Get-Item -LiteralPath $target).Length -ne $asset.Bytes -or
            (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $asset.SHA) {
            throw "Existing asset differs; preserved without overwrite: $target"
        }
        Write-Output "Verified existing: $($asset.Name)"
        continue
    }
    $temporary = Join-Path $targetDirectory ('.download-' + [Guid]::NewGuid().ToString('N'))
    try {
        $uri = "https://media.githubusercontent.com/media/opencv/opencv_zoo/$revision/models/$($asset.Folder)/$($asset.Name)"
        Invoke-WebRequest -Uri $uri -OutFile $temporary
        if ((Get-Item -LiteralPath $temporary).Length -ne $asset.Bytes) { throw "Size mismatch: $($asset.Name)" }
        $actualHash = (Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualHash -ne $asset.SHA) { throw "SHA-256 mismatch: $($asset.Name)" }
        [IO.File]::Move($temporary, $target)
        Write-Output "Verified download: $($asset.Name) bytes=$($asset.Bytes) SHA256=$actualHash"
    } finally {
        # Only this invocation's unique temporary file, never the asset or directory.
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
    }
}
