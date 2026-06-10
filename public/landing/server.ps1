$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://localhost:3001/')
$listener.Start()
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$mime = @{'.html'='text/html;charset=utf-8';'.svg'='image/svg+xml';'.css'='text/css';'.js'='application/javascript';'.png'='image/png';'.jpg'='image/jpeg'}
while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $url = $ctx.Request.Url.LocalPath
    if ($url -eq '/') { $url = '/index.html' }
    $file = Join-Path $base $url.TrimStart('/')
    try {
        if (Test-Path $file -PathType Leaf) {
            $ext = [IO.Path]::GetExtension($file)
            $ct = if ($mime[$ext]) { $mime[$ext] } else { 'text/plain' }
            $data = [IO.File]::ReadAllBytes($file)
            $ctx.Response.ContentType = $ct
            $ctx.Response.ContentLength64 = $data.Length
            $ctx.Response.OutputStream.Write($data, 0, $data.Length)
        } else {
            $ctx.Response.StatusCode = 404
        }
    } catch {}
    try { $ctx.Response.OutputStream.Close() } catch {}
}
