use crate::model::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::StreamExt;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::sync::Semaphore;
use tokio_util::sync::CancellationToken;

pub struct EngineState {
    active: Mutex<HashMap<String, CancellationToken>>,
    slots: Semaphore,
}
impl Default for EngineState {
    fn default() -> Self {
        Self {
            active: Mutex::new(HashMap::new()),
            slots: Semaphore::new(8),
        }
    }
}
impl EngineState {
    pub fn cancel(&self, id: &str) {
        if let Ok(active) = self.active.lock() {
            if let Some(token) = active.get(id) {
                token.cancel();
            }
        }
    }
    pub async fn execute(&self, request: RequestSpec) -> Result<ResponseData, String> {
        let token = CancellationToken::new();
        {
            let mut active = self.active.lock().map_err(|_| "Request lock unavailable")?;
            if active.len() >= 32 {
                return Err("Too many queued requests (maximum 32)".into());
            }
            if active.contains_key(&request.id) {
                return Err("Request already running".into());
            }
            active.insert(request.id.clone(), token.clone());
        }
        let result = tokio::select! {
            _ = token.cancelled() => Err("Request cancelled".into()),
            result = async {
                let _permit = self.slots.acquire().await.map_err(|_| "Request engine closed")?;
                send(&request).await
            } => result,
        };
        if let Ok(mut active) = self.active.lock() {
            active.remove(&request.id);
        }
        result
    }
}

pub async fn send(spec: &RequestSpec) -> Result<ResponseData, String> {
    let url = url::Url::parse(&spec.url).map_err(|_| "Enter a valid absolute HTTP or HTTPS URL")?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Only HTTP and HTTPS URLs are allowed".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Put credentials in Authorization, not in the URL".into());
    }
    if spec.body.len() > 16 * 1024 * 1024 {
        return Err("Request body exceeds 16 MiB".into());
    }
    let redirect_count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let count = redirect_count.clone();
    let follow = spec.follow_redirects;
    let policy = reqwest::redirect::Policy::custom(move |attempt| {
        if !follow {
            return attempt.stop();
        }
        if attempt.previous().len() >= 10 {
            return attempt.error("Redirect limit exceeded");
        }
        // Never forward credentials or a request body to another origin or downgrade TLS.
        if let Some(first) = attempt.previous().first() {
            if first.origin() != attempt.url().origin() {
                return attempt.stop();
            }
        }
        count.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        attempt.follow()
    });
    let client = reqwest::Client::builder()
        .redirect(policy)
        .timeout(Duration::from_millis(spec.timeout_ms.clamp(100, 300_000)))
        .connect_timeout(Duration::from_secs(15))
        .user_agent("Relay/0.1.0")
        .build()
        .map_err(|_| "Unable to initialize TLS client")?;
    let method =
        reqwest::Method::from_bytes(spec.method.as_bytes()).map_err(|_| "Invalid HTTP method")?;
    let mut request = client.request(method, url);
    for header in spec
        .headers
        .iter()
        .filter(|h| h.enabled && !h.key.is_empty())
    {
        let key = reqwest::header::HeaderName::from_bytes(header.key.as_bytes())
            .map_err(|_| "Invalid header name")?;
        if ["host", "content-length", "transfer-encoding"].contains(&key.as_str()) {
            return Err(
                "Host, Content-Length and Transfer-Encoding are managed by the HTTP engine".into(),
            );
        }
        let value = reqwest::header::HeaderValue::from_str(&header.value)
            .map_err(|_| "Invalid header value (line breaks are not allowed)")?;
        request = request.header(key, value);
    }
    match spec.body_type.as_str() {
        "form" => {
            let fields: Vec<_> = spec
                .fields
                .iter()
                .filter(|p| p.enabled && !p.key.is_empty())
                .map(|p| (&p.key, &p.value))
                .collect();
            request = request.form(&fields);
        }
        "multipart" => {
            let mut form = reqwest::multipart::Form::new();
            for p in spec
                .fields
                .iter()
                .filter(|p| p.enabled && !p.key.is_empty())
            {
                form = form.text(p.key.clone(), p.value.clone());
            }
            if let Some(data) = &spec.upload {
                let bytes = STANDARD
                    .decode(data)
                    .map_err(|_| "Invalid upload encoding")?;
                if bytes.len() > 16 * 1024 * 1024 {
                    return Err("Upload exceeds 16 MiB".into());
                }
                form = form.part(
                    "file",
                    reqwest::multipart::Part::bytes(bytes).file_name("upload"),
                );
            }
            request = request.multipart(form);
        }
        "binary" => {
            let bytes = STANDARD
                .decode(spec.upload.as_deref().unwrap_or_default())
                .map_err(|_| "Invalid upload encoding")?;
            if bytes.len() > 16 * 1024 * 1024 {
                return Err("Upload exceeds 16 MiB".into());
            }
            request = request.body(bytes);
        }
        _ => {
            if !spec.body.is_empty() {
                request = request.body(spec.body.clone());
            }
        }
    }
    let start = Instant::now();
    let response = request.send().await.map_err(safe_error)?;
    let headers_ms = start.elapsed().as_millis();
    let status = response.status();
    let final_url = response.url().to_string();
    let headers: Vec<Pair> = response
        .headers()
        .iter()
        .map(|(k, v)| Pair {
            key: k.to_string(),
            value: v.to_str().unwrap_or("[non-UTF8]").into(),
            enabled: true,
        })
        .collect();
    let cookies = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok().map(String::from))
        .collect();
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    let limit = spec.max_response_bytes.clamp(1024, 32 * 1024 * 1024);
    if response.content_length().is_some_and(|n| n > limit as u64) {
        return Err(format!(
            "Response exceeds {} MiB limit",
            limit / 1024 / 1024
        ));
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(safe_error)?;
        if bytes.len() + chunk.len() > limit {
            return Err(format!(
                "Response exceeds {} MiB limit",
                limit / 1024 / 1024
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    let binary = std::str::from_utf8(&bytes).is_err()
        || (content_type.starts_with("image/") && !content_type.contains("svg"));
    Ok(ResponseData {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").into(),
        duration_ms: start.elapsed().as_millis(),
        size: bytes.len(),
        headers,
        cookies,
        body: if binary {
            String::new()
        } else {
            String::from_utf8_lossy(&bytes).into_owned()
        },
        base64: STANDARD.encode(&bytes),
        content_type,
        final_url,
        redirects: redirect_count.load(std::sync::atomic::Ordering::Relaxed),
        binary,
        headers_ms,
    })
}
fn safe_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "Request timed out".into()
    } else if error.is_connect() {
        "Connection failed. Check the host, port, proxy and TLS certificate.".into()
    } else if error.is_redirect() {
        "Redirect limit exceeded".into()
    } else {
        "Network request failed. Check the request and server connection.".into()
    }
}
