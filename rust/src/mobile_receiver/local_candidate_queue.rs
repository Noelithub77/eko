use tokio::sync::{mpsc, Mutex};

use crate::domain::{IceCandidateMessage, SignalClientMessage};

#[derive(Default)]
pub(super) struct LocalCandidateQueue {
    state: Mutex<LocalCandidateState>,
}

#[derive(Default)]
struct LocalCandidateState {
    answer_sent: bool,
    pending: Vec<IceCandidateMessage>,
}

impl LocalCandidateQueue {
    pub(super) async fn send_or_queue(
        &self,
        sender: &mpsc::UnboundedSender<SignalClientMessage>,
        candidate: IceCandidateMessage,
    ) {
        let mut state = self.state.lock().await;
        if !state.answer_sent {
            state.pending.push(candidate);
            return;
        }
        let _ = sender.send(SignalClientMessage::IceCandidate { candidate });
    }

    pub(super) async fn flush_after_answer(
        &self,
        sender: &mpsc::UnboundedSender<SignalClientMessage>,
    ) {
        let pending = {
            let mut state = self.state.lock().await;
            state.answer_sent = true;
            std::mem::take(&mut state.pending)
        };
        for candidate in pending {
            let _ = sender.send(SignalClientMessage::IceCandidate { candidate });
        }
    }
}

#[cfg(test)]
mod tests {
    use tokio::sync::mpsc;

    use super::LocalCandidateQueue;
    use crate::domain::{IceCandidateMessage, SessionDescriptionMessage, SignalClientMessage};

    #[tokio::test]
    async fn sends_answer_before_queued_candidates() {
        let queue = LocalCandidateQueue::default();
        let (sender, mut receiver) = mpsc::unbounded_channel();
        queue
            .send_or_queue(
                &sender,
                IceCandidateMessage {
                    device_id: "phone-1".to_string(),
                    candidate: "candidate-1".to_string(),
                },
            )
            .await;

        sender
            .send(SignalClientMessage::Answer {
                description: SessionDescriptionMessage {
                    device_id: "phone-1".to_string(),
                    sdp: "answer".to_string(),
                },
            })
            .expect("Test channel should stay open");
        queue.flush_after_answer(&sender).await;

        assert!(matches!(
            receiver.recv().await,
            Some(SignalClientMessage::Answer { .. })
        ));
        assert!(matches!(
            receiver.recv().await,
            Some(SignalClientMessage::IceCandidate { .. })
        ));
    }
}
