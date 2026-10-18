use std::net::SocketAddr;

use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

const TCP_BUFFER: usize = 16 * 1024;

pub async fn run(mut socket: WebSocket, target: SocketAddr) {
    let tcp = match TcpStream::connect(target).await {
        Ok(stream) => stream,
        Err(err) => {
            eprintln!("bridge: cannot reach {target}: {err}");
            let _ = socket.send(Message::Close(None)).await;
            return;
        }
    };

    let (mut ws_tx, mut ws_rx) = socket.split();
    let (mut tcp_rx, mut tcp_tx) = tcp.into_split();

    let upstream = async move {
        while let Some(Ok(message)) = ws_rx.next().await {
            match message {
                Message::Binary(data) => {
                    if tcp_tx.write_all(&data).await.is_err() {
                        break;
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
        let _ = tcp_tx.shutdown().await;
    };

    let downstream = async move {
        let mut buf = vec![0u8; TCP_BUFFER];
        loop {
            match tcp_rx.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => {
                    if ws_tx
                        .send(Message::Binary(buf[..n].to_vec()))
                        .await
                        .is_err()
                    {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        let _ = ws_tx.close().await;
    };

    tokio::join!(upstream, downstream);
}
