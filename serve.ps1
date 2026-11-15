# serve.ps1 - tiny local web server for TerraTrace (no Python needed).
# Used automatically by start.bat when Python isn't installed.
param([int]$Port = 8000)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path $PSScriptRoot).Path
$mime = @{
  '.html'='text/html; charset=utf-8'; '.htm'='text/html; charset=utf-8'
  '.js'='application/javascript; charset=utf-8'; '.mjs'='application/javascript; charset=utf-8'
  '.css'='text/css; charset=utf-8'; '.json'='application/json; charset=utf-8'
  '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.svg'='image/svg+xml'
  '.ico'='image/x-icon'; '.md'='text/plain; charset=utf-8'; '.txt'='text/plain; charset=utf-8'; '.csv'='text/csv'
}
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch {
  Write-Host "Could not start on port $Port. Is TerraTrace already running in another window?" -ForegroundColor Red
  Read-Host "Press Enter to close"; exit 1
}
Write-Host ""
Write-Host "  TerraTrace is running at  http://localhost:$Port" -ForegroundColor Green
Write-Host "  Keep this window open. Close it to stop the server." 
Write-Host ""
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $res = $ctx.Response
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '') { $rel = 'index.html' }
    $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if (-not $path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $path -PathType Leaf)) {
      $res.StatusCode = 404
      $bytes = [Text.Encoding]::UTF8.GetBytes('404 Not Found')
    } else {
      $ext = [IO.Path]::GetExtension($path).ToLower()
      $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $res.Headers.Add('Cache-Control', 'no-store')
      $bytes = [IO.File]::ReadAllBytes($path)
    }
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    Write-Host ("{0} {1}" -f $res.StatusCode, $rel)
  } catch {
    Write-Host "Error: $_" -ForegroundColor Yellow
  } finally {
    $res.OutputStream.Close()
  }
}
