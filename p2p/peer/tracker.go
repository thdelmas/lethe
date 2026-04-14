// Package peer tracks discovered peers and their model capabilities.
package peer

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/libp2p/go-libp2p/core/network"
	lpeer "github.com/libp2p/go-libp2p/core/peer"

	"github.com/thdelmas/lethe-p2p/node"
)

// Capabilities describes what a peer can do.
type Capabilities struct {
	PeerID    string      `json:"peer_id"`
	Models    []ModelInfo `json:"models"`
	Timestamp int64       `json:"timestamp"`
}

// ModelInfo describes a single model available on a peer.
type ModelInfo struct {
	ID        string `json:"id"`
	SizeBytes int64  `json:"size_bytes"`
}

// PeerInfo combines peer identity with capabilities.
type PeerInfo struct {
	ID           string      `json:"id"`
	Models       []ModelInfo `json:"models"`
	LastSeen     int64       `json:"last_seen"`
	Latency      string      `json:"latency,omitempty"`
	peerID       lpeer.ID
}

// InferenceResponse wraps the response from a peer inference call.
type InferenceResponse struct {
	StatusCode  int
	ContentType string
	Body        []byte
}

// Tracker maintains a set of known peers and their capabilities.
type Tracker struct {
	node  *node.Node
	mu    sync.RWMutex
	peers map[string]*PeerInfo

	// llamaURL for handling incoming inference requests
	llamaURL string
}

// NewTracker creates a peer tracker attached to the given node.
func NewTracker(n *node.Node) *Tracker {
	t := &Tracker{
		node:     n,
		peers:    make(map[string]*PeerInfo),
		llamaURL: "http://127.0.0.1:8081",
	}

	// Handle incoming inference requests from other peers
	n.InferenceHandler = t.handleIncomingInference

	return t
}

// Run starts the tracker: listens for capability messages,
// prunes stale peers.
func (t *Tracker) Run(ctx context.Context) {
	// Register GossipSub message handler
	t.node.OnMessage(func(data []byte) {
		var cap Capabilities
		if err := json.Unmarshal(data, &cap); err != nil {
			return
		}
		t.updatePeer(cap)
	})

	// Prune stale peers every 60s
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			t.pruneStale()
		}
	}
}

// Peers returns a snapshot of all known peers.
func (t *Tracker) Peers() []PeerInfo {
	t.mu.RLock()
	defer t.mu.RUnlock()

	result := make([]PeerInfo, 0, len(t.peers))
	for _, p := range t.peers {
		result = append(result, *p)
	}
	return result
}

// FindPeerWithModel returns the best peer that has the given model.
// Returns nil if no peer has it.
func (t *Tracker) FindPeerWithModel(modelID string) *PeerInfo {
	t.mu.RLock()
	defer t.mu.RUnlock()

	for _, p := range t.peers {
		for _, m := range p.Models {
			if m.ID == modelID {
				return p
			}
		}
	}
	return nil
}

// ForwardInference sends an inference request to a peer via libp2p stream.
func (t *Tracker) ForwardInference(ctx context.Context, p *PeerInfo, body []byte) (*InferenceResponse, error) {
	s, err := t.node.Host().NewStream(ctx, p.peerID, node.InferenceProtocol)
	if err != nil {
		return nil, fmt.Errorf("open stream to %s: %w", p.ID, err)
	}
	defer s.Close()

	// Write the request body
	if _, err := s.Write(body); err != nil {
		return nil, fmt.Errorf("write to peer: %w", err)
	}
	s.CloseWrite()

	// Read the response
	respData, err := io.ReadAll(s)
	if err != nil {
		return nil, fmt.Errorf("read from peer: %w", err)
	}

	return &InferenceResponse{
		StatusCode:  http.StatusOK,
		ContentType: "application/json",
		Body:        respData,
	}, nil
}

// handleIncomingInference processes an inference request from a remote peer.
// Proxies to the local llama-server.
func (t *Tracker) handleIncomingInference(s network.Stream) {
	defer s.Close()

	// Read the request body from the stream
	body, err := io.ReadAll(s)
	if err != nil {
		log.Printf("peer inference: read error: %v", err)
		return
	}

	// Forward to local llama-server
	resp, err := http.Post(
		t.llamaURL+"/v1/chat/completions",
		"application/json",
		nopReadCloser(body),
	)
	if err != nil {
		log.Printf("peer inference: llama-server error: %v", err)
		errResp, _ := json.Marshal(map[string]string{
			"error": fmt.Sprintf("llama-server error: %v", err),
		})
		s.Write(errResp)
		return
	}
	defer resp.Body.Close()

	// Stream the response back
	respBody, _ := io.ReadAll(resp.Body)
	s.Write(respBody)
}

func (t *Tracker) updatePeer(cap Capabilities) {
	t.mu.Lock()
	defer t.mu.Unlock()

	pid, err := lpeer.Decode(cap.PeerID)
	if err != nil {
		return
	}

	t.peers[cap.PeerID] = &PeerInfo{
		ID:       cap.PeerID,
		Models:   cap.Models,
		LastSeen: time.Now().Unix(),
		peerID:   pid,
	}

	log.Printf("peer %s: %d models available", cap.PeerID[:12], len(cap.Models))
}

func (t *Tracker) pruneStale() {
	t.mu.Lock()
	defer t.mu.Unlock()

	cutoff := time.Now().Add(-2 * time.Minute).Unix()
	for id, p := range t.peers {
		if p.LastSeen < cutoff {
			log.Printf("pruned stale peer %s", id[:12])
			delete(t.peers, id)
		}
	}
}

type nopRC struct{ data []byte; off int }
func (r *nopRC) Read(p []byte) (int, error) {
	if r.off >= len(r.data) { return 0, io.EOF }
	n := copy(p, r.data[r.off:])
	r.off += n
	return n, nil
}
func (r *nopRC) Close() error { return nil }

func nopReadCloser(data []byte) io.ReadCloser {
	return &nopRC{data: data}
}
