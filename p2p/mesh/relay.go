// Mesh relay — receives, validates, and dispatches signals.
//
// The relay sits between transports (BLE, WiFi Direct, libp2p) and
// the local system. It validates signatures, enforces trust, and
// dispatches signals to the appropriate handler (dead man's switch,
// alert system, etc.).
package mesh

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"
)

// Handler processes a validated signal.
type Handler func(sig *Signal, peer *TrustedPeer)

// Relay receives signals from transports and dispatches them.
type Relay struct {
	trust    *TrustRing
	handlers map[SignalType]Handler
	mu       sync.RWMutex

	// Nonce dedup — prevents replay attacks
	seenNonces map[uint64]int64
}

// NewRelay creates a signal relay with the given trust ring.
func NewRelay(trust *TrustRing) *Relay {
	return &Relay{
		trust:      trust,
		handlers:   make(map[SignalType]Handler),
		seenNonces: make(map[uint64]int64),
	}
}

// OnSignal registers a handler for a signal type.
func (r *Relay) OnSignal(sigType SignalType, h Handler) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.handlers[sigType] = h
}

// Receive processes an incoming signal from any transport.
func (r *Relay) Receive(data []byte) {
	sig, err := UnmarshalSignal(data)
	if err != nil {
		log.Printf("mesh: invalid signal: %v", err)
		return
	}

	// Replay protection
	if r.isDuplicate(sig.Nonce) {
		return
	}

	// Verify trust + signature
	valid, peer := r.trust.VerifySignal(sig)
	if !valid {
		log.Printf("mesh: rejected signal from %s (untrusted or bad sig)", sig.SenderID[:12])
		return
	}

	// Special check for wipe signals
	if sig.Type == SignalWipe && !r.trust.CanPeerWipe(sig.SenderID) {
		log.Printf("mesh: rejected wipe from %s (not authorized)", sig.SenderID[:12])
		return
	}

	log.Printf("mesh: accepted %s from %s", sig.Type, sig.SenderID[:12])

	// Dispatch to handler
	r.mu.RLock()
	handler := r.handlers[sig.Type]
	r.mu.RUnlock()

	if handler != nil {
		handler(sig, peer)
	}
}

// isDuplicate checks and records nonce for replay protection.
func (r *Relay) isDuplicate(nonce uint64) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, seen := r.seenNonces[nonce]; seen {
		return true
	}
	r.seenNonces[nonce] = time.Now().Unix()

	// Prune old nonces (keep last 10 minutes)
	cutoff := time.Now().Add(-10 * time.Minute).Unix()
	for n, ts := range r.seenNonces {
		if ts < cutoff {
			delete(r.seenNonces, n)
		}
	}
	return false
}

// PruneLoop periodically cleans stale nonces.
func (r *Relay) PruneLoop(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			r.isDuplicate(0) // triggers prune
		}
	}
}

// HTTPHandler exposes mesh relay as HTTP endpoints for the Rust agent.
func (r *Relay) HTTPHandler() http.Handler {
	mux := http.NewServeMux()

	// POST /mesh/signal — inject a signal (from local dead man's switch)
	mux.HandleFunc("/mesh/signal", func(w http.ResponseWriter, req *http.Request) {
		if req.Method != http.MethodPost {
			http.Error(w, "POST only", http.StatusMethodNotAllowed)
			return
		}
		var sig Signal
		if err := json.NewDecoder(req.Body).Decode(&sig); err != nil {
			http.Error(w, "invalid signal", http.StatusBadRequest)
			return
		}
		r.Receive(mustMarshal(&sig))
		w.WriteHeader(http.StatusAccepted)
	})

	// GET /mesh/trust — list trusted peers
	mux.HandleFunc("/mesh/trust", func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(r.trust.AllPeers())
	})

	// POST /mesh/trust — add a trusted peer
	mux.HandleFunc("/mesh/trust/add", func(w http.ResponseWriter, req *http.Request) {
		if req.Method != http.MethodPost {
			http.Error(w, "POST only", http.StatusMethodNotAllowed)
			return
		}
		var peer TrustedPeer
		if err := json.NewDecoder(req.Body).Decode(&peer); err != nil {
			http.Error(w, "invalid peer", http.StatusBadRequest)
			return
		}
		if err := r.trust.AddPeer(peer); err != nil {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		w.WriteHeader(http.StatusCreated)
	})

	// DELETE /mesh/trust?id=<peer_id> — remove a trusted peer
	mux.HandleFunc("/mesh/trust/remove", func(w http.ResponseWriter, req *http.Request) {
		if req.Method != http.MethodDelete {
			http.Error(w, "DELETE only", http.StatusMethodNotAllowed)
			return
		}
		id := req.URL.Query().Get("id")
		if id == "" {
			http.Error(w, "missing id param", http.StatusBadRequest)
			return
		}
		r.trust.RemovePeer(id)
		w.WriteHeader(http.StatusOK)
	})

	return mux
}

func mustMarshal(v interface{}) []byte {
	data, _ := json.Marshal(v)
	return data
}
