export function getWebviewHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Antigravity Multi-AI Hub</title>
</head>
<body>
    <h1>Antigravity Multi-AI Hub</h1>
</body>
</html>`;
}
