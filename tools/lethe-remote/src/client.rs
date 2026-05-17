//! HTTP-over-Tor client. SOCKS5h (`socks5h://`) is mandatory so the
//! `.onion` hostname is resolved through Tor — never via the local
//! resolver, which would leak the destination to the editor's ISP.

use std::time::Duration;

use reqwest::{Client, Proxy};
use thiserror::Error;

use crate::wire::{AckBody, DevicePub, HeartbeatBody, PubkeyBody, Signed, WireError, COMMAND_LEN};

const DEFAULT_SOCKS: &str = "socks5h://127.0.0.1:9050";
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, Error)]
pub enum ClientError {
    #[error("http transport error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("wire error: {0}")]
    Wire(#[from] WireError),
    #[error("server returned HTTP {status}: {body}")]
    Status { status: u16, body: String },
}

pub struct RemoteClient {
    http: Client,
    base: String,
    device_pub: DevicePub,
}

impl RemoteClient {
    pub fn new(
        onion: &str,
        device_pub: DevicePub,
        socks: Option<&str>,
    ) -> Result<Self, ClientError> {
        let proxy_url = socks.unwrap_or(DEFAULT_SOCKS);
        let proxy = Proxy::all(proxy_url)?;
        let http = Client::builder()
            .proxy(proxy)
            .timeout(DEFAULT_TIMEOUT)
            .build()?;
        Ok(Self {
            http,
            base: format!("http://{}", onion),
            device_pub,
        })
    }

    pub async fn pubkey(&self) -> Result<PubkeyBody, ClientError> {
        let url = format!("{}/v1/remote_dms/pubkey", self.base);
        let signed: Signed<PubkeyBody> = self.fetch_signed(&url, None).await?;
        Ok(signed.body)
    }

    pub async fn heartbeat(&self) -> Result<HeartbeatBody, ClientError> {
        let url = format!("{}/v1/remote_dms/heartbeat", self.base);
        let signed: Signed<HeartbeatBody> = self.fetch_signed(&url, None).await?;
        Ok(signed.body)
    }

    pub async fn send_command(
        &self,
        cmd: [u8; COMMAND_LEN],
    ) -> Result<AckBody, ClientError> {
        let url = format!("{}/v1/remote_dms/cmd", self.base);
        let signed: Signed<AckBody> = self.fetch_signed(&url, Some(cmd.to_vec())).await?;
        Ok(signed.body)
    }

    async fn fetch_signed<T>(
        &self,
        url: &str,
        post_body: Option<Vec<u8>>,
    ) -> Result<Signed<T>, ClientError>
    where
        T: serde::Serialize + serde::de::DeserializeOwned,
    {
        let req = match post_body {
            Some(b) => self
                .http
                .post(url)
                .header("content-type", "application/octet-stream")
                .body(b),
            None => self.http.get(url),
        };
        let resp = req.send().await?;
        let status = resp.status();
        let bytes = resp.bytes().await?;
        if !status.is_success() {
            return Err(ClientError::Status {
                status: status.as_u16(),
                body: String::from_utf8_lossy(&bytes).to_string(),
            });
        }
        let signed: Signed<T> = serde_json::from_slice(&bytes).map_err(WireError::Json)?;
        signed.verify(&self.device_pub)?;
        Ok(signed)
    }
}
