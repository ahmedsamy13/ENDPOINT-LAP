use endpoint_core::{db::Database, model::Node};
use serde_json::json;
use std::time::Instant;
fn main() {
    let path = std::env::temp_dir().join(format!("endpoint-bench-{}.db", uuid::Uuid::new_v4()));
    let mut db = Database::open(&path).unwrap();
    let start = Instant::now();
    db.connection.execute_batch("BEGIN").unwrap();
    db.save_node(Node {
        id: "p".into(),
        project_id: "p".into(),
        parent_id: None,
        kind: "project".into(),
        name: "Benchmark".into(),
        method: None,
        favorite: false,
        data: json!({}),
    })
    .unwrap();
    for i in 0..10000 {
        db.save_node(Node {
            id: format!("r{i}"),
            project_id: "p".into(),
            parent_id: Some("p".into()),
            kind: "request".into(),
            name: format!("Request {i:05}"),
            method: Some("GET".into()),
            favorite: false,
            data: json!({"url":"http://localhost:3000","body":"x".repeat(1024)}),
        })
        .unwrap();
    }
    db.connection.execute_batch("COMMIT").unwrap();
    let insert = start.elapsed().as_millis();
    let start = Instant::now();
    let rows = db.list_nodes(Some("p")).unwrap();
    let list = start.elapsed().as_micros();
    assert_eq!(rows.len(), 10001);
    let start = Instant::now();
    for i in 0..100 {
        assert!(db.get_node(&format!("r{}", i * 99)).is_ok());
    }
    let reads = start.elapsed().as_micros();
    println!("{{\"nodes\":10001,\"batchedInsertMs\":{insert},\"metadataQueryUs\":{list},\"hundredPayloadReadsUs\":{reads}}}");
    drop(db);
    let _ = std::fs::remove_file(&path);
    let _ = std::fs::remove_file(path.with_extension("db-wal"));
    let _ = std::fs::remove_file(path.with_extension("db-shm"));
}
