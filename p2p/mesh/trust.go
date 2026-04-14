// Trust ring management for the mesh network.
//
// A trust ring is a set of devices that can exchange signals.
// Peers are added by scanning a QR code or entering a shared secret.
// The trust store is persisted to /persist/lethe/mesh/trust.json.
package mesh

import (
	"crypto/ed25519"
	"encoding/hex"
	"encoding/json"
	"os"
	"sync"
	"time"
)

const (
	// TrustStorePath on Android — survives burner wipes.
	TrustStorePath = "/persist/lethe/mesh/trust.json"
	// MaxTrustedPeers limits the trust ring size.
	MaxTrustedPeers = 16
	// SignalMaxAge rejects signals older than this.
	SignalMaxAge = 10 * time.Minute
)

// TrustedPeer represents a device in the trust ring.
type TrustedPeer struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	PublicKey string `json:"public_key"` // hex-encoded Ed25519
	AddedAt   int64  `json:"added_at"`
	LastSeen  int64  `json:"last_seen"`
	// CanWipe controls whether this peer can send wipe commands.
	CanWipe bool `json:"can_wipe"`
}

// TrustRing manages the set of trusted peers.
type TrustRing struct {
	mu    sync.RWMutex
	peers map[string]*TrustedPeer
	path  string
}

// NewTrustRing loads or creates a trust ring.
func NewTrustRing(path string) *TrustRing {
	if path == "" {
		path = TrustStorePath
	}
	tr := &TrustRing{
		peers: make(map[string]*TrustedPeer),
		path:  path,
	}
	tr.load()
	return tr
}

// AddPeer adds a device to the trust ring.
func (tr *TrustRing) AddPeer(p TrustedPeer) error {
	tr.mu.Lock()
	defer tr.mu.Unlock()

	if len(tr.peers) >= MaxTrustedPeers {
		return ErrTrustRingFull
	}
	p.AddedAt = time.Now().Unix()
	tr.peers[p.ID] = &p
	return tr.save()
}

// RemovePeer removes a device from the trust ring.
func (tr *TrustRing) RemovePeer(id string) error {
	tr.mu.Lock()
	defer tr.mu.Unlock()

	delete(tr.peers, id)
	return tr.save()
}

// GetPeer returns a trusted peer by ID, or nil.
func (tr *TrustRing) GetPeer(id string) *TrustedPeer {
	tr.mu.RLock()
	defer tr.mu.RUnlock()
	return tr.peers[id]
}

// AllPeers returns a snapshot of all trusted peers.
func (tr *TrustRing) AllPeers() []TrustedPeer {
	tr.mu.RLock()
	defer tr.mu.RUnlock()

	result := make([]TrustedPeer, 0, len(tr.peers))
	for _, p := range tr.peers {
		result = append(result, *p)
	}
	return result
}

// VerifySignal checks if a signal is from a trusted peer and is valid.
func (tr *TrustRing) VerifySignal(sig *Signal) (bool, *TrustedPeer) {
	tr.mu.RLock()
	p := tr.peers[sig.SenderID]
	tr.mu.RUnlock()

	if p == nil {
		return false, nil
	}

	// Reject expired signals
	if sig.IsExpired(SignalMaxAge) {
		return false, p
	}

	// Verify Ed25519 signature
	pubKeyBytes, err := hex.DecodeString(p.PublicKey)
	if err != nil || len(pubKeyBytes) != ed25519.PublicKeySize {
		return false, p
	}

	if !sig.Verify(ed25519.PublicKey(pubKeyBytes)) {
		return false, p
	}

	// Update last seen
	tr.mu.Lock()
	p.LastSeen = time.Now().Unix()
	tr.mu.Unlock()

	return true, p
}

// CanPeerWipe checks if a specific peer has wipe authorization.
func (tr *TrustRing) CanPeerWipe(peerID string) bool {
	tr.mu.RLock()
	defer tr.mu.RUnlock()

	p := tr.peers[peerID]
	return p != nil && p.CanWipe
}

func (tr *TrustRing) load() {
	data, err := os.ReadFile(tr.path)
	if err != nil {
		return
	}
	var peers []TrustedPeer
	if err := json.Unmarshal(data, &peers); err != nil {
		return
	}
	for i := range peers {
		tr.peers[peers[i].ID] = &peers[i]
	}
}

func (tr *TrustRing) save() error {
	peers := tr.AllPeers()
	data, err := json.MarshalIndent(peers, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(tr.path, data, 0600)
}

// ErrTrustRingFull is returned when the trust ring is at capacity.
var ErrTrustRingFull = &trustError{"trust ring full (max 16 peers)"}

type trustError struct{ msg string }

func (e *trustError) Error() string { return e.msg }
