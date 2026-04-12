use axum::extract::Multipart;
use axum::routing::post;
use axum::{Json, Router};
use tokio::process::Command;

const WHISPER_BIN: &str = "/system/extras/lethe/bin/whisper-cpp";
const WHISPER_MODEL: &str = "/data/lethe/models/ggml-tiny.bin";
const SHERPA_BIN: &str = "/system/extras/lethe/bin/sherpa-onnx-offline";
const SHERPA_MODEL_DIR: &str = "/data/lethe/models/sherpa-onnx";
const TMP_AUDIO: &str = "/data/local/tmp/lethe-audio";

/// POST /v1/audio/transcriptions — OpenAI-compatible STT endpoint.
/// Accepts multipart form with audio file. Tries sherpa-onnx first,
/// falls back to whisper.cpp.
async fn transcribe(mut multipart: Multipart) -> Json<serde_json::Value> {
    // Extract audio file from multipart
    let mut audio_data: Option<Vec<u8>> = None;
    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() == Some("file") {
            if let Ok(bytes) = field.bytes().await {
                audio_data = Some(bytes.to_vec());
            }
        }
    }

    let data = match audio_data {
        Some(d) if !d.is_empty() => d,
        _ => {
            return Json(serde_json::json!({
                "error": "No audio file in request"
            }));
        }
    };

    // Write audio to temp file
    let input_path = format!("{TMP_AUDIO}.webm");
    let wav_path = format!("{TMP_AUDIO}.wav");
    if let Err(e) = tokio::fs::write(&input_path, &data).await {
        return Json(serde_json::json!({ "error": format!("write tmp: {e}") }));
    }

    // Convert to WAV (16kHz mono) — required by both engines
    let ffmpeg = Command::new("ffmpeg")
        .args(["-y", "-i", &input_path, "-ar", "16000", "-ac", "1", &wav_path])
        .output()
        .await;

    if ffmpeg.is_err() || !ffmpeg.as_ref().unwrap().status.success() {
        // Try sox as fallback
        let sox = Command::new("sox")
            .args([&input_path, "-r", "16000", "-c", "1", &wav_path])
            .output()
            .await;
        if sox.is_err() || !sox.as_ref().unwrap().status.success() {
            let _ = tokio::fs::remove_file(&input_path).await;
            return Json(serde_json::json!({
                "error": "Cannot convert audio to WAV (need ffmpeg or sox)"
            }));
        }
    }
    let _ = tokio::fs::remove_file(&input_path).await;

    // Try sherpa-onnx first (faster, lower memory)
    let text = try_sherpa(&wav_path)
        .await
        .or_else(|| try_whisper_blocking(&wav_path));

    let _ = tokio::fs::remove_file(&wav_path).await;

    match text {
        Some(t) => Json(serde_json::json!({ "text": t.trim() })),
        None => Json(serde_json::json!({
            "error": "No STT engine available (need sherpa-onnx or whisper.cpp)"
        })),
    }
}

async fn try_sherpa(wav_path: &str) -> Option<String> {
    let output = Command::new(SHERPA_BIN)
        .arg(format!("--tokens={SHERPA_MODEL_DIR}/tokens.txt"))
        .arg(format!("--encoder={SHERPA_MODEL_DIR}/encoder.onnx"))
        .arg(format!("--decoder={SHERPA_MODEL_DIR}/decoder.onnx"))
        .arg(format!("--joiner={SHERPA_MODEL_DIR}/joiner.onnx"))
        .arg(wav_path)
        .output()
        .await
        .ok()?;

    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    // sherpa-onnx outputs transcription after the filename line
    stdout
        .lines()
        .find(|l| !l.starts_with('/') && !l.is_empty())
        .map(|l| l.to_string())
}

fn try_whisper_blocking(wav_path: &str) -> Option<String> {
    let output = std::process::Command::new(WHISPER_BIN)
        .args(["-m", WHISPER_MODEL, "-f", wav_path, "--no-timestamps", "-nt"])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    Some(text.trim().to_string())
}

pub fn router() -> Router {
    Router::new().route("/v1/audio/transcriptions", post(transcribe))
}
