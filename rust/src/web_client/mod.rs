use std::path::{Component, Path, PathBuf};

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

const MAX_REQUEST_BYTES: usize = 64 * 1024;
const PROFILER_PATH: &str = "/__eko_profiler";

pub async fn serve(mut stream: TcpStream) {
    if let Err(error) = serve_inner(&mut stream).await {
        log::warn!("Web client response failed: {error}");
    }
}

async fn serve_inner(stream: &mut TcpStream) -> Result<(), String> {
    let request = read_http_request(stream).await?;
    if is_profiler_post(&request) {
        let body = request_body(&request);
        crate::profiler::append_sample(body.as_bytes())?;
        write_response(stream, "204 No Content", "text/plain; charset=utf-8", b"").await?;
        return Ok(());
    }

    if is_profiler_get(&request) {
        let body = crate::profiler::snapshot_json()?;
        write_response(
            stream,
            "200 OK",
            "application/json; charset=utf-8",
            body.as_bytes(),
        )
        .await?;
        return Ok(());
    }

    if let Some(dev_url) = std::env::var("EKO_WEB_CLIENT_DEV_URL")
        .ok()
        .filter(|u| !u.is_empty())
    {
        return serve_proxy(stream, &request, &dev_url).await;
    }

    let path = request_path(&request).unwrap_or("/client");
    let Some(file_path) = web_file_path(path)? else {
        log::info!("Web client 404 for path: {path}");
        write_response(
            stream,
            "404 Not Found",
            "text/plain; charset=utf-8",
            b"Not found",
        )
        .await?;
        return Ok(());
    };

    let bytes = tokio::fs::read(&file_path)
        .await
        .map_err(|error| error.to_string())?;
    let content_type = content_type(&file_path);
    write_response(stream, "200 OK", content_type, &bytes).await
}

async fn serve_proxy(stream: &mut TcpStream, request: &str, dev_url: &str) -> Result<(), String> {
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
    if !text.starts_with("GET ") && !text.starts_with("POST ") {
        return false;
    }
    let Some(path) = text.split_whitespace().nth(1) else {
        return true;
    };
    // Known web client paths are definitely HTTP.
    if path == "/"
        || path == "/client"
        || path.starts_with("/client/")
        || path.starts_with("/assets/")
    {
        return true;
    }
    // Known WebSocket path — definitely not HTTP.
    if path == "/eko" {
        return false;
    }
    // Unknown path: fall back to checking for the upgrade header.
    // This handles browser auto-requests like /favicon.ico.
    !text.to_ascii_lowercase().contains("upgrade: websocket")
}

async fn read_http_request(stream: &mut TcpStream) -> Result<String, String> {
    let mut request = Vec::with_capacity(4096);
    let mut buffer = [0_u8; 4096];

    loop {
        let read = stream
            .read(&mut buffer)
            .await
            .map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }

        request.extend_from_slice(&buffer[..read]);
        if request.len() > MAX_REQUEST_BYTES {
            return Err("HTTP request is too large.".to_string());
        }

        if has_full_request(&request) {
            break;
        }
    }

    String::from_utf8(request).map_err(|error| error.to_string())
}

fn has_full_request(request: &[u8]) -> bool {
    let Some(header_end) = header_end(request) else {
        return false;
    };
    let headers = String::from_utf8_lossy(&request[..header_end]);
    let content_length = content_length(&headers).unwrap_or(0);
    request.len() >= header_end + 4 + content_length
}

fn header_end(request: &[u8]) -> Option<usize> {
    request.windows(4).position(|window| window == b"\r\n\r\n")
}

fn content_length(headers: &str) -> Option<usize> {
    headers.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        if name.eq_ignore_ascii_case("content-length") {
            value.trim().parse::<usize>().ok()
        } else {
            None
        }
    })
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

fn is_profiler_post(request: &str) -> bool {
    request
        .lines()
        .next()
        .map(|line| line.starts_with("POST ") && line.contains(PROFILER_PATH))
        .unwrap_or(false)
}

fn is_profiler_get(request: &str) -> bool {
    request
        .lines()
        .next()
        .map(|line| line.starts_with("GET ") && line.contains(PROFILER_PATH))
        .unwrap_or(false)
}

fn request_body(request: &str) -> &str {
    request.split("\r\n\r\n").nth(1).unwrap_or("")
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
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
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
