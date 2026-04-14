// Package mesh defines the signal protocol for offline BLE/WiFi Direct mesh.
//
// Only structured signals cross the mesh — never conversation content.
// Signals are signed with the device's Ed25519 key and encrypted to
// the recipient's public key. Unknown signals are silently dropped.
package mesh

import (
	"crypto/ed25519"
	"encoding/json"
	"fmt"
	"time"
)

// SignalType identifies the kind of mesh signal.
type SignalType string

const (
	// SignalHeartbeat — dead man's switch check-in via mesh relay.
	// Sent periodically to confirm the device owner is alive.
	// Carries no payload beyond the timestamp and sender ID.
	SignalHeartbeat SignalType = "heartbeat"

	// SignalAlert — emergency broadcast to trusted peers.
	// Sent when the user triggers a panic action. Peers can
	// relay this to internet-connected devices for notification.
	SignalAlert SignalType = "alert"

	// SignalWipe — remote wipe command from a trusted peer.
	// Only accepted from peers in the device's trust ring.
	// Triggers Stage 2 (wipe) of the dead man's switch.
	SignalWipe SignalType = "wipe"

	// SignalAck — acknowledgment of a received signal.
	SignalAck SignalType = "ack"

	// SignalPing — mesh connectivity test.
	SignalPing SignalType = "ping"
)

// Signal is the envelope for all mesh messages.
type Signal struct {
	Type      SignalType `json:"type"`
	SenderID  string     `json:"sender_id"`
	Timestamp int64      `json:"timestamp"`
	Nonce     uint64     `json:"nonce"`
	Payload   []byte     `json:"payload,omitempty"`
	Signature []byte     `json:"signature"`
}

// HeartbeatPayload carries dead man's switch check-in data.
type HeartbeatPayload struct {
	// Interval is the sender's configured check-in interval in seconds.
	Interval int64 `json:"interval"`
	// NextDue is the Unix timestamp when the next check-in is expected.
	NextDue int64 `json:"next_due"`
}

// AlertPayload carries emergency alert data.
type AlertPayload struct {
	// Level indicates urgency: "low", "medium", "high", "critical"
	Level string `json:"level"`
	// Code is a predefined alert code (no free text to prevent data leaks)
	Code string `json:"code"`
}

// Valid alert codes — no free-form text allowed.
var ValidAlertCodes = map[string]string{
	"duress":     "Device holder under duress",
	"seized":     "Device seized",
	"lost":       "Device lost or stolen",
	"sos":        "Emergency — need help",
	"checkin_ok": "Check-in received, all clear",
}

// NewSignal creates a new signal with timestamp and nonce.
func NewSignal(sigType SignalType, senderID string) *Signal {
	return &Signal{
		Type:      sigType,
		SenderID:  senderID,
		Timestamp: time.Now().Unix(),
		Nonce:     uint64(time.Now().UnixNano()),
	}
}

// SetPayload marshals and sets the payload.
func (s *Signal) SetPayload(v interface{}) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	s.Payload = data
	return nil
}

// Sign signs the signal with the sender's Ed25519 private key.
func (s *Signal) Sign(key ed25519.PrivateKey) {
	msg := s.signingMessage()
	s.Signature = ed25519.Sign(key, msg)
}

// Verify checks the signal's signature against the sender's public key.
func (s *Signal) Verify(pubKey ed25519.PublicKey) bool {
	if len(s.Signature) == 0 {
		return false
	}
	return ed25519.Verify(pubKey, s.signingMessage(), s.Signature)
}

// signingMessage returns the canonical bytes to sign/verify.
func (s *Signal) signingMessage() []byte {
	msg := fmt.Sprintf("%s|%s|%d|%d|%x",
		s.Type, s.SenderID, s.Timestamp, s.Nonce, s.Payload)
	return []byte(msg)
}

// IsExpired returns true if the signal is older than maxAge.
func (s *Signal) IsExpired(maxAge time.Duration) bool {
	age := time.Since(time.Unix(s.Timestamp, 0))
	return age > maxAge
}

// Marshal serializes the signal for transmission.
func (s *Signal) Marshal() ([]byte, error) {
	return json.Marshal(s)
}

// UnmarshalSignal deserializes a signal from bytes.
func UnmarshalSignal(data []byte) (*Signal, error) {
	var s Signal
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, err
	}
	return &s, nil
}
