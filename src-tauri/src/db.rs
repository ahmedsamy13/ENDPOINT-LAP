use crate::model::{Environment, Node};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::path::Path;

pub struct Database {
    pub connection: Connection,
}
type Result<T> = std::result::Result<T, String>;
impl Database {
    pub fn open(path: &Path) -> Result<Self> {
        let c = Connection::open(path).map_err(err)?;
        let version: u32 = c
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(err)?;
        if version > 1 {
            return Err("This workspace was created by a newer Endpoint version. Upgrade the app before opening it.".into());
        }
        c.busy_timeout(std::time::Duration::from_secs(5))
            .map_err(err)?;
        c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
            CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY);
            CREATE TABLE IF NOT EXISTS nodes(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, parent_id TEXT REFERENCES nodes(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK(kind IN ('project','collection','folder','request')), name TEXT NOT NULL, method TEXT, favorite INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL DEFAULT(unixepoch()));
            CREATE INDEX IF NOT EXISTS nodes_project ON nodes(project_id,parent_id,name);
            CREATE INDEX IF NOT EXISTS nodes_favorite ON nodes(project_id,favorite);
            CREATE TABLE IF NOT EXISTS environments(id TEXT PRIMARY KEY,project_id TEXT,name TEXT NOT NULL,variables TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS env_project ON environments(project_id);
            CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT,name TEXT,method TEXT,url TEXT,status INTEGER,duration INTEGER,size INTEGER,created_at INTEGER DEFAULT(unixepoch()));
            CREATE INDEX IF NOT EXISTS history_time ON history(created_at DESC);
            CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
            INSERT OR IGNORE INTO migrations VALUES(1); PRAGMA user_version=1;").map_err(err)?;
        Ok(Self { connection: c })
    }
    pub fn list_nodes(&self, project: Option<&str>) -> Result<Vec<Node>> {
        let mut stmt = self.connection.prepare("SELECT id,project_id,parent_id,kind,name,method,favorite FROM nodes WHERE (?1 IS NULL AND kind='project') OR project_id=?1 ORDER BY kind,name COLLATE NOCASE LIMIT 20000").map_err(err)?;
        let rows = stmt
            .query_map([project], |r| {
                Ok(Node {
                    id: r.get(0)?,
                    project_id: r.get(1)?,
                    parent_id: r.get(2)?,
                    kind: r.get(3)?,
                    name: r.get(4)?,
                    method: r.get(5)?,
                    favorite: r.get(6)?,
                    data: Value::Null,
                })
            })
            .map_err(err)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)
    }
    pub fn get_node(&self, id: &str) -> Result<Node> {
        self.connection.query_row("SELECT id,project_id,parent_id,kind,name,method,favorite,data FROM nodes WHERE id=?1",[id],|r| {
            let raw:String=r.get(7)?;
            Ok(Node {id:r.get(0)?,project_id:r.get(1)?,parent_id:r.get(2)?,kind:r.get(3)?,name:r.get(4)?,method:r.get(5)?,favorite:r.get(6)?,data:serde_json::from_str(&raw).unwrap_or(Value::Null)})
        }).map_err(err)
    }
    pub fn save_node(&mut self, node: Node) -> Result<()> {
        if node.name.trim().is_empty() || node.name.len() > 300 {
            return Err("Name must contain 1–300 characters".into());
        }
        if node.data.to_string().len() > 32 * 1024 * 1024 {
            return Err("Request is too large to save".into());
        }
        if node.kind == "project" {
            if node.id != node.project_id || node.parent_id.is_some() {
                return Err("Invalid project root".into());
            }
        } else {
            let parent = self.get_node(node.parent_id.as_deref().ok_or("A parent is required")?)?;
            if parent.project_id != node.project_id || parent.kind == "request" {
                return Err("Invalid parent".into());
            }
            let mut cursor = Some(parent.id);
            let mut depth = 0;
            while let Some(id) = cursor {
                if id == node.id {
                    return Err("Cannot move a folder inside itself".into());
                }
                depth += 1;
                if depth > 64 {
                    return Err("Maximum folder depth is 64".into());
                }
                cursor = self.get_node(&id)?.parent_id;
            }
        }
        if self.get_node(&node.id).is_err() {
            let count: u64 = self
                .connection
                .query_row(
                    "SELECT count(*) FROM nodes WHERE project_id=?1",
                    [&node.project_id],
                    |r| r.get(0),
                )
                .map_err(err)?;
            if count >= 20000 {
                return Err("Project limit is 20,000 items. Create another project.".into());
            }
        }
        if let Ok(existing) = self.get_node(&node.id) {
            if existing.project_id != node.project_id || existing.kind != node.kind {
                return Err("Node type and project cannot be changed".into());
            }
        }
        self.connection.execute("INSERT INTO nodes(id,project_id,parent_id,kind,name,method,favorite,data) VALUES(?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT(id) DO UPDATE SET parent_id=excluded.parent_id,name=excluded.name,method=excluded.method,favorite=excluded.favorite,data=excluded.data,updated_at=unixepoch()",params![node.id,node.project_id,node.parent_id,node.kind,node.name,node.method,node.favorite,node.data.to_string()]).map_err(err)?;
        Ok(())
    }
    pub fn delete_node(&mut self, id: &str) -> Result<()> {
        let transaction = self.connection.transaction().map_err(err)?;
        transaction
            .execute("DELETE FROM environments WHERE project_id=?1", [id])
            .map_err(err)?;
        transaction
            .execute("DELETE FROM nodes WHERE id=?1", [id])
            .map_err(err)?;
        transaction.commit().map_err(err)
    }
    pub fn environments(&self) -> Result<Vec<Environment>> {
        let mut s = self
            .connection
            .prepare("SELECT id,project_id,name,variables FROM environments ORDER BY name")
            .map_err(err)?;
        let rows = s
            .query_map([], |r| {
                let raw: String = r.get(3)?;
                Ok(Environment {
                    id: r.get(0)?,
                    project_id: r.get(1)?,
                    name: r.get(2)?,
                    variables: serde_json::from_str(&raw).unwrap_or(json!([])),
                })
            })
            .map_err(err)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)
    }
    pub fn save_environment(&self, env: Environment) -> Result<()> {
        self.connection.execute("INSERT INTO environments VALUES(?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,name=excluded.name,variables=excluded.variables",params![env.id,env.project_id,env.name,env.variables.to_string()]).map_err(err)?;
        Ok(())
    }
    pub fn history(&self) -> Result<Vec<Value>> {
        let mut s=self.connection.prepare("SELECT id,request_id,name,method,url,status,duration,size,created_at FROM history ORDER BY id DESC LIMIT 200").map_err(err)?;
        let rows=s.query_map([],|r| Ok(json!({"id":r.get::<_,i64>(0)?,"requestId":r.get::<_,String>(1)?,"name":r.get::<_,String>(2)?,"method":r.get::<_,String>(3)?,"url":r.get::<_,String>(4)?,"status":r.get::<_,i64>(5)?,"duration":r.get::<_,i64>(6)?,"size":r.get::<_,i64>(7)?,"createdAt":r.get::<_,i64>(8)?}))).map_err(err)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)
    }
    pub fn record_history(&self, value: Value) -> Result<()> {
        let limit = self
            .setting("historyLimit")?
            .and_then(|v| v.as_u64())
            .unwrap_or(500)
            .min(10000);
        self.connection.execute("INSERT INTO history(request_id,name,method,url,status,duration,size) VALUES(?1,?2,?3,?4,?5,?6,?7)",params![value["requestId"].as_str().unwrap_or(""),value["name"].as_str().unwrap_or(""),value["method"].as_str().unwrap_or(""),value["url"].as_str().unwrap_or(""),value["status"].as_i64().unwrap_or(0),value["duration"].as_i64().unwrap_or(0),value["size"].as_i64().unwrap_or(0)]).map_err(err)?;
        self.connection.execute("DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT ?1)",[limit]).map_err(err)?;
        Ok(())
    }
    pub fn setting(&self, key: &str) -> Result<Option<Value>> {
        let raw: Option<String> = self
            .connection
            .query_row("SELECT value FROM settings WHERE key=?1", [key], |r| {
                r.get(0)
            })
            .optional()
            .map_err(err)?;
        raw.map(|r| serde_json::from_str(&r).map_err(err))
            .transpose()
    }
    pub fn save_setting(&self, key: &str, value: Value) -> Result<()> {
        self.connection.execute("INSERT INTO settings VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![key,value.to_string()]).map_err(err)?;
        Ok(())
    }
    pub fn clear_history(&self) -> Result<()> {
        self.connection
            .execute("DELETE FROM history", [])
            .map_err(err)?;
        Ok(())
    }
}
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
