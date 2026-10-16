#requires -Version 7.0
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$destination = Join-Path $repoRoot 'artifacts/local-ai-models/licenses'
$zoo = 'https://raw.githubusercontent.com/opencv/opencv_zoo/47534e27c9851bb1128ccc0102f1145e27f23f98'
$opencv = 'https://raw.githubusercontent.com/opencv/opencv/fe38fc608f6acb8b68953438a62305d8318f4fcd'
$assets = @(
    @{ name='yunet-LICENSE.txt'; url="$zoo/models/face_detection_yunet/LICENSE"; size=1085; sha='c83b8120c50ccbd4c4f96edf53141bdd566ebb8f8e9227e415326aa1b1aba958' },
    @{ name='sface-LICENSE.txt'; url="$zoo/models/face_recognition_sface/LICENSE"; size=11358; sha='cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30' },
    @{ name='opencv-4.13.0-LICENSE.txt'; url="$opencv/LICENSE"; size=11358; sha='cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30' },
    @{ name='opencv-zoo-LICENSE.txt'; url="$zoo/LICENSE"; size=11357; sha='c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4' },
    @{ name='opencv-4.13.0-LICENSE_CHANGE_NOTICE.txt'; url="$opencv/doc/LICENSE_CHANGE_NOTICE.txt"; size=2768; sha='b2255f81ae7162e36550daefe432c72a8506cfc1b954897dbc553ed5160ad4b8' }
)
function Assert-NoReparse([string]$path) {
    $cursor = [IO.Path]::GetFullPath($path)
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Refusing redirected path: $cursor"
            }
        }
        $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
}
function Assert-Bytes([string]$path, $asset) {
    Assert-NoReparse $path
    $item = Get-Item -LiteralPath $path -Force
    if ($item.PSIsContainer -or $item.Length -ne $asset.size -or
        (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $asset.sha) {
        throw "License bytes differ; existing file will not be overwritten: $path"
    }
}
Assert-NoReparse $destination
[IO.Directory]::CreateDirectory($destination) | Out-Null
$client = [Net.Http.HttpClient]::new()
$client.Timeout = [TimeSpan]::FromSeconds(60)
try {
    foreach ($asset in $assets) {
        $target = Join-Path $destination $asset.name
        Assert-NoReparse $target
        if (Test-Path -LiteralPath $target) {
            Assert-Bytes $target $asset
            Write-Output "Already verified: $($asset.name)"
            continue
        }
        $temporary = Join-Path $destination ('.fetch-' + [Guid]::NewGuid().ToString('N'))
        $response = $null; $source = $null; $file = $null
        try {
            $response = $client.GetAsync($asset.url, [Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
            $response.EnsureSuccessStatusCode() | Out-Null
            $source = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
            $file = [IO.File]::Open($temporary, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
            $buffer = [byte[]]::new(4096); $count = 0
            while (($read = $source.Read($buffer, 0, $buffer.Length)) -gt 0) {
                $count += $read
                if ($count -gt $asset.size) { throw 'Response exceeds pinned byte count' }
                $file.Write($buffer, 0, $read)
            }
            $file.Flush($true); $file.Dispose(); $file = $null
            Assert-Bytes $temporary $asset
            Assert-NoReparse $destination
            [IO.File]::Move($temporary, $target) # Fails if another file appeared; no overwrite.
            Write-Output "Installed verified license: $($asset.name) $($asset.sha)"
        } finally {
            if ($file) { $file.Dispose() }; if ($source) { $source.Dispose() }; if ($response) { $response.Dispose() }
            # Only this invocation's unique temporary file; never license/model files.
            if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
        }
    }
} finally { $client.Dispose() }
