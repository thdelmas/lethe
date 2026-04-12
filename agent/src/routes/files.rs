use axum::{extract::Json, routing::post, Router};
use serde::{Deserialize, Serialize};
use tokio::fs;

const MAX_READ_BYTES: u64 = 256 * 1024;
const MAX_WRITE_BYTES: usize = 100 * 1024 * 1024; // 100 MB

// ── List directory ──

#[derive(Deserialize)]
pub struct ListRequest {
    path: String,
}

#[derive(Serialize)]
pub struct DirEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Serialize)]
pub struct ListResponse {
    pub entries: Vec<DirEntry>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

async fn list_files(Json(req): Json<ListRequest>) -> Json<ListResponse> {
    let mut entries = Vec::new();
    let mut dir = match fs::read_dir(&req.path).await {
        Ok(d) => d,
        Err(e) => {
            return Json(ListResponse {
                entries: vec![],
                error: Some(e.to_string()),
            })
        }
    };
    while let Ok(Some(entry)) = dir.next_entry().await {
        let meta = entry.metadata().await;
        entries.push(DirEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            is_dir: meta.as_ref().map(|m| m.is_dir()).unwrap_or(false),
            size: meta.as_ref().map(|m| m.len()).unwrap_or(0),
        });
    }
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Json(ListResponse {
        entries,
        error: None,
    })
}

// ── Read file ──

#[derive(Deserialize)]
pub struct ReadRequest {
    path: String,
}

#[derive(Serialize)]
pub struct ReadResponse {
    pub content: String,
    pub size: u64,
    pub truncated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

async fn read_file(Json(req): Json<ReadRequest>) -> Json<ReadResponse> {
    let meta = match fs::metadata(&req.path).await {
        Ok(m) => m,
        Err(e) => {
            return Json(ReadResponse {
                content: String::new(),
                size: 0,
                truncated: false,
                error: Some(e.to_string()),
            })
        }
    };

    let size = meta.len();
    let truncated = size > MAX_READ_BYTES;
    let bytes = if truncated {
        use tokio::io::AsyncReadExt;
        let mut f = match fs::File::open(&req.path).await {
            Ok(f) => f,
            Err(e) => {
                return Json(ReadResponse {
                    content: String::new(),
                    size,
                    truncated: false,
                    error: Some(e.to_string()),
                })
            }
        };
        let mut buf = vec![0u8; MAX_READ_BYTES as usize];
        let n = f.read(&mut buf).await.unwrap_or(0);
        buf.truncate(n);
        buf
    } else {
        match fs::read(&req.path).await {
            Ok(b) => b,
            Err(e) => {
                return Json(ReadResponse {
                    content: String::new(),
                    size,
                    truncated: false,
                    error: Some(e.to_string()),
                })
            }
        }
    };

    Json(ReadResponse {
        content: String::from_utf8_lossy(&bytes).into_owned(),
        size,
        truncated,
        error: None,
    })
}

// ── Write file ──

#[derive(Deserialize)]
pub struct WriteRequest {
    path: String,
    content: String,
}

#[derive(Serialize)]
pub struct WriteResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

async fn write_file(Json(req): Json<WriteRequest>) -> Json<WriteResponse> {
    if req.content.len() > MAX_WRITE_BYTES {
        return Json(WriteResponse {
            ok: false,
            error: Some(format!(
                "content too large: {} bytes (max {})",
                req.content.len(),
                MAX_WRITE_BYTES
            )),
        });
    }
    match fs::write(&req.path, &req.content).await {
        Ok(()) => Json(WriteResponse {
            ok: true,
            error: None,
        }),
        Err(e) => Json(WriteResponse {
            ok: false,
            error: Some(e.to_string()),
        }),
    }
}

pub fn router() -> Router {
    Router::new()
        .route("/api/files/list", post(list_files))
        .route("/api/files/read", post(read_file))
        .route("/api/files/write", post(write_file))
}
