use crate::{db::Database, engine::EngineState, model::*};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::Value;
use std::{io::Read, sync::Mutex};
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;

struct Store(Mutex<Database>);
macro_rules! db {
    ($s:expr) => {
        $s.0.lock()
            .map_err(|_| "Database lock unavailable".to_string())?
    };
}
#[tauri::command]
fn list_nodes(store: State<Store>, project: Option<String>) -> Result<Vec<Node>, String> {
    db!(store).list_nodes(project.as_deref())
}
#[tauri::command]
fn get_node(store: State<Store>, id: String) -> Result<Node, String> {
    db!(store).get_node(&id)
}
#[tauri::command]
fn save_node(store: State<Store>, node: Node) -> Result<(), String> {
    db!(store).save_node(node)
}
#[tauri::command]
fn delete_node(store: State<Store>, id: String) -> Result<(), String> {
    db!(store).delete_node(&id)
}
#[tauri::command]
fn import_workspace(
    store: State<Store>,
    nodes: Vec<Node>,
    environments: Vec<Environment>,
) -> Result<(), String> {
    if nodes.len() > 10000 || environments.len() > 1000 {
        return Err("Import exceeds resource limits".into());
    }
    let mut db = db!(store);
    db.connection
        .execute_batch("SAVEPOINT workspace_import")
        .map_err(|e| e.to_string())?;
    let result = (|| {
        for node in nodes {
            db.save_node(node)?;
        }
        for env in environments {
            db.save_environment(env)?;
        }
        Ok(())
    })();
    if result.is_ok() {
        db.connection
            .execute_batch("RELEASE workspace_import")
            .map_err(|e| e.to_string())?;
    } else {
        let _ = db
            .connection
            .execute_batch("ROLLBACK TO workspace_import; RELEASE workspace_import");
    }
    result
}
#[tauri::command]
fn search_nodes(store: State<Store>, query: String) -> Result<Vec<Node>, String> {
    let db = db!(store);
    let mut stmt=db.connection.prepare("SELECT id FROM nodes WHERE kind='request' AND instr(lower(name),lower(?1))>0 ORDER BY name LIMIT 100").map_err(|e|e.to_string())?;
    let ids = stmt
        .query_map([query], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    ids.iter()
        .map(|id| {
            db.get_node(id).map(|mut n| {
                n.data = serde_json::Value::Null;
                n
            })
        })
        .collect()
}
#[tauri::command]
fn list_environments(store: State<Store>) -> Result<Vec<Environment>, String> {
    db!(store).environments()
}
#[tauri::command]
fn save_environment(store: State<Store>, environment: Environment) -> Result<(), String> {
    db!(store).save_environment(environment)
}
#[tauri::command]
fn delete_environment(store: State<Store>, id: String) -> Result<(), String> {
    db!(store)
        .connection
        .execute("DELETE FROM environments WHERE id=?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
fn list_history(store: State<Store>) -> Result<Vec<Value>, String> {
    db!(store).history()
}
#[tauri::command]
fn record_history(store: State<Store>, value: Value) -> Result<(), String> {
    db!(store).record_history(value)
}
#[tauri::command]
fn clear_history(store: State<Store>) -> Result<(), String> {
    db!(store).clear_history()
}
#[tauri::command]
fn get_setting(store: State<Store>, key: String) -> Result<Option<Value>, String> {
    db!(store).setting(&key)
}
#[tauri::command]
fn save_setting(store: State<Store>, key: String, value: Value) -> Result<(), String> {
    db!(store).save_setting(&key, value)
}

fn entry(name: &str) -> Result<keyring::Entry, String> {
    if name.is_empty()
        || name.len() > 200
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_:".contains(c))
    {
        return Err("Invalid credential name".into());
    }
    keyring::Entry::new("dev.endpoint.lap", name).map_err(|_| "OS keychain unavailable".into())
}
#[tauri::command]
fn store_secret(name: String, value: String) -> Result<String, String> {
    entry(&name)?.set_password(&value).map_err(|_|"Unable to save credential. Unlock the OS keychain or configure a Secret Service provider on Linux.".to_string())?;
    Ok(format!("{{{{secret:{name}}}}}"))
}
#[tauri::command]
fn delete_secret(name: String) -> Result<(), String> {
    entry(&name)?
        .delete_credential()
        .map_err(|_| "Unable to delete credential".into())
}
fn resolve_secrets(text: &str) -> Result<String, String> {
    let mut output = String::new();
    let mut remaining = text;
    while let Some(start) = remaining.find("{{secret:") {
        output.push_str(&remaining[..start]);
        let suffix = &remaining[start + 9..];
        let end = suffix
            .find("}}")
            .ok_or("Unterminated credential reference")?;
        let value = entry(&suffix[..end])?.get_password().map_err(|_| {
            "Credential unavailable. Unlock your OS keychain and re-enter the secret.".to_string()
        })?;
        output.push_str(&value);
        remaining = &suffix[end + 2..];
    }
    output.push_str(remaining);
    Ok(output)
}
#[tauri::command]
async fn execute_request(
    engine: State<'_, EngineState>,
    mut request: RequestSpec,
) -> Result<ResponseData, String> {
    // Secrets remain inside the native process until transmitted to the user-selected API.
    let mut url = url::Url::parse(&request.url).map_err(|_| "Invalid URL")?;
    if url.path().contains("{{secret:") || url.path().contains("%7B%7Bsecret") {
        return Err(
            "Use secrets in headers, query parameters or the body, not in URL paths".into(),
        );
    }
    let pairs = url
        .query_pairs()
        .map(|(k, v)| Ok((resolve_secrets(&k)?, resolve_secrets(&v)?)))
        .collect::<Result<Vec<_>, String>>()?;
    if !pairs.is_empty() {
        url.query_pairs_mut().clear().extend_pairs(pairs);
    }
    request.url = url.to_string();
    request.body = resolve_secrets(&request.body)?;
    for h in request.headers.iter_mut().chain(request.fields.iter_mut()) {
        h.value = resolve_secrets(&h.value)?;
    }
    // Native Basic auth needs base64 AFTER resolving credentials.
    for h in &mut request.headers {
        if h.key.eq_ignore_ascii_case("authorization") && h.value.starts_with("Basic-Endpoint ") {
            h.value = format!("Basic {}", STANDARD.encode(&h.value[15..]));
        }
    }
    engine.execute(request).await
}
#[tauri::command]
fn cancel_request(engine: State<EngineState>, id: String) {
    engine.cancel(&id)
}

#[tauri::command]
async fn import_file(app: tauri::AppHandle, binary: bool) -> Result<Option<Value>, String> {
    tauri::async_runtime::spawn_blocking(move||{
        let Some(file)=app.dialog().file().blocking_pick_file() else{return Ok(None)};
        let path=file.into_path().map_err(|_|"Only local files are supported")?;
        let file=std::fs::File::open(&path).map_err(|_|"Cannot open file")?;
        if file.metadata().map_err(|_|"Cannot inspect file")?.len()>16*1024*1024{return Err("File exceeds 16 MiB".into());}
        let mut bytes=Vec::new();file.take(16*1024*1024+1).read_to_end(&mut bytes).map_err(|_|"Cannot read file")?;
        if bytes.len()>16*1024*1024{return Err("File exceeds 16 MiB".into());}
        let content=if binary{STANDARD.encode(bytes)}else{String::from_utf8(bytes).map_err(|_|"Import must be UTF-8 text")?};
        Ok(Some(serde_json::json!({"name":path.file_name().unwrap_or_default().to_string_lossy(),"content":content})))
    }).await.map_err(|_|"File dialog failed".to_string())?
}
#[tauri::command]
async fn export_file(
    app: tauri::AppHandle,
    name: String,
    content: String,
    binary: bool,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let filename = std::path::Path::new(&name)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let Some(file) = app
            .dialog()
            .file()
            .set_file_name(filename)
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let path = file
            .into_path()
            .map_err(|_| "Only local files are supported")?;
        let bytes = if binary {
            STANDARD
                .decode(content)
                .map_err(|_| "Invalid binary encoding")?
        } else {
            content.into_bytes()
        };
        // Write atomically in the destination directory; preserve existing data if writing fails.
        let temporary = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
        let result = (|| {
            use std::io::Write;
            let mut options = std::fs::OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let mut f = options
                .open(&temporary)
                .map_err(|_| "Cannot create export file")?;
            f.write_all(&bytes)
                .and_then(|_| f.sync_all())
                .map_err(|_| "Cannot write export file")?;
            std::fs::rename(&temporary, &path).map_err(|_| "Cannot replace destination file")?;
            Ok(true)
        })();
        if result.is_err() {
            let _ = std::fs::remove_file(&temporary);
        }
        result
    })
    .await
    .map_err(|_| "File dialog failed".to_string())?
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700))?;
            }
            let database =
                Database::open(&dir.join("endpoint.db")).map_err(std::io::Error::other)?;
            app.manage(Store(Mutex::new(database)));
            app.manage(EngineState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_nodes,
            get_node,
            save_node,
            delete_node,
            import_workspace,
            search_nodes,
            list_environments,
            save_environment,
            delete_environment,
            list_history,
            record_history,
            clear_history,
            get_setting,
            save_setting,
            store_secret,
            delete_secret,
            execute_request,
            cancel_request,
            import_file,
            export_file
        ])
        .run(tauri::generate_context!())
        .expect("Unable to launch Endpoint desktop runtime");
}
