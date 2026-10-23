use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pair {
    pub key: String,
    pub value: String,
    #[serde(default = "yes")]
    pub enabled: bool,
}
fn yes() -> bool {
    true
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestSpec {
    pub id: String,
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: Vec<Pair>,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub body_type: String,
    #[serde(default)]
    pub fields: Vec<Pair>,
    #[serde(default = "timeout")]
    pub timeout_ms: u64,
    #[serde(default = "yes")]
    pub follow_redirects: bool,
    #[serde(default = "max_response")]
    pub max_response_bytes: usize,
    #[serde(default)]
    pub upload: Option<String>,
}
fn timeout() -> u64 {
    30_000
}
fn max_response() -> usize {
    16 * 1024 * 1024
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseData {
    pub status: u16,
    pub status_text: String,
    pub duration_ms: u128,
    pub size: usize,
    pub headers: Vec<Pair>,
    pub cookies: Vec<String>,
    pub body: String,
    pub base64: String,
    pub content_type: String,
    pub final_url: String,
    pub redirects: usize,
    pub binary: bool,
    pub headers_ms: u128,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub id: String,
    pub project_id: String,
    pub parent_id: Option<String>,
    pub kind: String,
    pub name: String,
    pub method: Option<String>,
    pub favorite: bool,
    #[serde(default)]
    pub data: serde_json::Value,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    pub id: String,
    pub project_id: Option<String>,
    pub name: String,
    pub variables: serde_json::Value,
}
