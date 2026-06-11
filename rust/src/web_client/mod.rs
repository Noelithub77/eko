use std::path::{Component, Path, PathBuf};

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

const MAX_REQUEST_BYTES: usize = 4096;

pub async fn serve(mut stream: TcpStream) {
    if let Err(error) = serve_inner(&mut stream).await {
        log::warn!("Web client response failed: {error}");
    }
}

async fn serve_inner(stream: &mut TcpStream) -> Result<(), String> {
    let mut request = vec![0_u8; MAX_REQUEST_BYTES];
    let read = stream
        .read(&mut request)
        .await
        .map_err(|error| error.to_string())?;
    let request = String::from_utf8_lossy(&request[..read]);

    if let Some(dev_url) = std::env::var("EKO_WEB_CLIENT_DEV_URL")
        .ok()
        .filter(|u| !u.is_empty())
    {
        return serve_proxy(stream, &request, &dev_url).await;
    }

    let path = request_path(&request).unwrap_or("/client");
    let Some(file_path) = web_file_path(path)? else {
        write_response(stream, "404 Not Found", "text/plain; charset=utf-8", b"Not found").await?;
        return Ok(());
    };

    let bytes = tokio::fs::read(&file_path)
        .await
        .map_err(|error| error.to_string())?;
    let content_type = content_type(&file_path);
    write_response(stream, "200 OK", content_type, &bytes).await
}

async fn serve_proxy(
    stream: &mut TcpStream,
    request: &str,
    dev_url: &str,
) -> Result<(), String> {
    let path = request_path(request).unwrap_or("/");
    let proxied_path = proxy_target_path(path);
    let target = format!("{}{}", dev_url.trim_end_matches('/'), proxied_path);

    let target = target
        .strip_prefix("http://")
        .or_else(|| target.strip_prefix("https://"))
        .unwrap_or(&target);
    let (host, path_part) = target.split_once('/').unwrap_or((target, ""));
    let request_line = if path_part.is_empty() {
        "GET / HTTP/1.1".to_string()
    } else {
        format!("GET /{} HTTP/1.1", path_part)
    };

    let mut proxy = TcpStream::connect(host)
        .await
        .map_err(|error| format!("Web client dev server at {host} unreachable: {error}"))?;

    let proxy_request = format!(
        "{}\r\nHost: {}\r\nAccept: */*\r\nConnection: close\r\n\r\n",
        request_line, host
    );

    proxy
        .write_all(proxy_request.as_bytes())
        .await
        .map_err(|error| error.to_string())?;

    let mut response = Vec::new();
    proxy
        .read_to_end(&mut response)
        .await
        .map_err(|error| error.to_string())?;

    stream
        .write_all(&response)
        .await
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn proxy_target_path(path: &str) -> &str {
    if path == "/client" || path == "/client/" {
        "/"
    } else if let Some(stripped) = path.strip_prefix("/client") {
        stripped
    } else {
        path
    }
}

pub fn looks_like_http_client(bytes: &[u8]) -> bool {
    let text = String::from_utf8_lossy(bytes);
    if !text.starts_with("GET ") {
        return false;
    }
    !text.to_ascii_lowercase().contains("upgrade: websocket")
}

fn request_path(request: &str) -> Option<&str> {
    let first_line = request.lines().next()?;
    let mut parts = first_line.split_whitespace();
    let method = parts.next()?;
    if method != "GET" {
        return None;
    }
    parts.next()
}

fn web_file_path(path: &str) -> Result<Option<PathBuf>, String> {
    let root = web_root()?;
    let relative = if path == "/" || path == "/client" || path == "/client/" {
        PathBuf::from("index.html")
    } else if let Some(asset_path) = path.strip_prefix("/assets/") {
        safe_relative_path(Path::new("assets").join(asset_path))?
    } else if let Some(client_asset_path) = path.strip_prefix("/client/assets/") {
        safe_relative_path(Path::new("assets").join(client_asset_path))?
    } else {
        return Ok(None);
    };

    let file_path = root.join(relative);
    Ok(file_path.exists().then_some(file_path))
}

fn web_root() -> Result<PathBuf, String> {
    let current_dir = std::env::current_dir().map_err(|error| error.to_string())?;
    let candidates = [
        current_dir.join("dist/web/client"),
        current_dir.join("../dist/web/client"),
        current_dir.join("../../dist/web/client"),
    ];

    candidates
        .into_iter()
        .find(|path| path.join("index.html").exists())
        .ok_or_else(|| "Web client build not found. Run npm run build:web:client.".to_string())
}

fn safe_relative_path(path: impl AsRef<Path>) -> Result<PathBuf, String> {
    let mut clean = PathBuf::new();
    for component in path.as_ref().components() {
        match component {
            Component::Normal(part) => clean.push(part),
            _ => return Err("Invalid web client path.".to_string()),
        }
    }
    Ok(clean)
}

fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|extension| extension.to_str()) {
        Some("css") => "text/css; charset=utf-8",
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("json") => "application/json; charset=utf-8",
        Some("svg") => "image/svg+xml",
        Some("woff2") => "font/woff2",
        _ => "application/octet-stream",
    }
}

async fn write_response(
    stream: &mut TcpStream,
    status: &str,
    content_type: &str,
    body: &[u8],
) -> Result<(), String> {
    let headers = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream
        .write_all(headers.as_bytes())
        .await
        .map_err(|error| error.to_string())?;
    stream
        .write_all(body)
        .await
        .map_err(|error| error.to_string())
}
