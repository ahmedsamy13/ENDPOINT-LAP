use endpoint_core::{
    db::Database,
    engine::{send, EngineState},
    model::*,
};
use serde_json::json;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};
fn node(id: &str, parent: Option<&str>, kind: &str) -> Node {
    Node {
        id: id.into(),
        project_id: "p".into(),
        parent_id: parent.map(String::from),
        kind: kind.into(),
        name: id.into(),
        method: None,
        favorite: false,
        data: json!({"body":"hello"}),
    }
}
fn spec(url: String) -> RequestSpec {
    RequestSpec {
        id: "r".into(),
        method: "GET".into(),
        url,
        headers: vec![],
        body: String::new(),
        body_type: "none".into(),
        fields: vec![],
        timeout_ms: 1000,
        follow_redirects: true,
        max_response_bytes: 1024,
        upload: None,
    }
}
#[test]
fn database_roundtrip_integrity_and_cascade() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("test.db");
    {
        let mut db = Database::open(&path).unwrap();
        db.save_node(node("p", None, "project")).unwrap();
        db.save_node(node("f", Some("p"), "folder")).unwrap();
        db.save_node(node("r", Some("f"), "request")).unwrap();
        assert_eq!(db.list_nodes(Some("p")).unwrap().len(), 3);
        assert_eq!(db.get_node("r").unwrap().data["body"], "hello");
        let mut circular = node("f", Some("r"), "folder");
        assert!(db.save_node(circular.clone()).is_err());
        circular.parent_id = Some("f".into());
        assert!(db.save_node(circular).is_err());
    }
    let mut db = Database::open(&path).unwrap();
    assert_eq!(db.get_node("r").unwrap().name, "r");
    db.delete_node("f").unwrap();
    assert!(db.get_node("r").is_err());
    assert!(db.get_node("p").is_ok());
}
#[test]
fn environment_settings_and_history_retention() {
    let db = Database::open(std::path::Path::new(":memory:")).unwrap();
    db.save_environment(Environment {
        id: "e".into(),
        project_id: None,
        name: "Local".into(),
        variables: json!([{ "key":"baseUrl","value":"http://localhost"}]),
    })
    .unwrap();
    assert_eq!(db.environments().unwrap().len(), 1);
    db.save_setting("historyLimit", json!(2)).unwrap();
    for _ in 0..5 {
        db.record_history(json!({"requestId":"r","status":200}))
            .unwrap();
    }
    assert_eq!(db.history().unwrap().len(), 2);
    db.clear_history().unwrap();
    assert!(db.history().unwrap().is_empty());
}
async fn server(response: &'static str) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let mut buf = [0; 4096];
        let _ = stream.read(&mut buf).await;
        stream.write_all(response.as_bytes()).await.unwrap();
    });
    format!("http://{addr}")
}
#[tokio::test]
async fn real_network_response() {
    let url=server("HTTP/1.1 201 Created\r\nContent-Type: application/json\r\nContent-Length: 11\r\nSet-Cookie: test=yes; HttpOnly\r\nConnection: close\r\n\r\n{\"ok\":true}").await;
    let r = send(&spec(url)).await.unwrap();
    assert_eq!(r.status, 201);
    assert_eq!(r.body, "{\"ok\":true}");
    assert_eq!(r.size, 11);
    assert_eq!(r.cookies.len(), 1);
}
#[tokio::test]
async fn rejects_unsafe_urls_and_headers() {
    for url in [
        "file:///etc/passwd",
        "ftp://localhost",
        "http://user:password@localhost",
    ] {
        assert!(send(&spec(url.into())).await.is_err());
    }
    let mut r = spec("http://localhost".into());
    r.headers.push(Pair {
        key: "X-Test".into(),
        value: "foo\r\nInjected: true".into(),
        enabled: true,
    });
    assert!(send(&r).await.is_err());
}
#[tokio::test]
async fn bounded_response() {
    let url =
        server("HTTP/1.1 200 OK\r\nContent-Length: 2000000\r\nConnection: close\r\n\r\n").await;
    assert!(send(&spec(url)).await.unwrap_err().contains("limit"));
}
#[tokio::test]
async fn stops_cross_origin_redirects() {
    let url=server("HTTP/1.1 302 Found\r\nLocation: http://localhost:1/private\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;
    assert_eq!(send(&spec(url)).await.unwrap().status, 302);
}
#[tokio::test]
async fn cancellation_interrupts_io() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let engine = std::sync::Arc::new(EngineState::default());
    let other = engine.clone();
    let task = tokio::spawn(async move { other.execute(spec(format!("http://{addr}"))).await });
    let (_stream, _) = listener.accept().await.unwrap();
    engine.cancel("r");
    assert!(task.await.unwrap().unwrap_err().contains("cancelled"));
}
