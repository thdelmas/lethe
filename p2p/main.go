// lethe-p2p — libp2p sidecar for peer-to-peer inference coordination.
//
// Discovers other LETHE devices on the LAN via mDNS, announces local
// model capabilities via GossipSub, and proxies inference requests to
// the best available peer. Exposes a localhost HTTP API consumed by
// the Rust agent.
//
// Architecture:
//   lethe-agent (Rust, :8080) → lethe-p2p (Go, :8082) → peer's lethe-p2p → peer's llama-server
//
// All traffic stays on LAN unless explicitly configured otherwise.
// No conversation context is shared — only the current prompt and completion.

package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/thdelmas/lethe-p2p/mesh"
	"github.com/thdelmas/lethe-p2p/node"
	"github.com/thdelmas/lethe-p2p/peer"
)

func main() {
	listenAddr := flag.String("listen", "127.0.0.1:8082", "HTTP API listen address")
	llamaURL := flag.String("llama-url", "http://127.0.0.1:8081", "Local llama-server URL")
	meshEnabled := flag.Bool("mesh", false, "Enable BLE/WiFi Direct mesh relay")
	trustPath := flag.String("trust-path", mesh.TrustStorePath, "Path to trust ring file")
	flag.Parse()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start libp2p node with mDNS + GossipSub
	n, err := node.New(ctx)
	if err != nil {
		log.Fatalf("failed to create libp2p node: %v", err)
	}
	defer n.Close()

	// Peer tracker maintains the set of known peers and their capabilities
	tracker := peer.NewTracker(n)
	go tracker.Run(ctx)

	// Announce local capabilities periodically
	go announceLoop(ctx, n, *llamaURL)

	// Mesh relay for offline signaling (BLE/WiFi Direct)
	var relay *mesh.Relay
	if *meshEnabled {
		trust := mesh.NewTrustRing(*trustPath)
		relay = mesh.NewRelay(trust)
		go relay.PruneLoop(ctx)

		// Register signal handlers
		relay.OnSignal(mesh.SignalHeartbeat, handleMeshHeartbeat)
		relay.OnSignal(mesh.SignalAlert, handleMeshAlert)
		relay.OnSignal(mesh.SignalWipe, handleMeshWipe)

		// Start BLE transport
		ble := mesh.NewBLETransport(relay, "")
		go ble.Run(ctx)

		log.Println("mesh relay enabled")
	}

	// HTTP API for the Rust agent
	mux := http.NewServeMux()
	mux.HandleFunc("/peers", handlePeers(tracker))
	mux.HandleFunc("/health", handleHealth(n))
	mux.HandleFunc("/v1/chat/completions", handlePeerInference(tracker, *llamaURL))

	// Mesh API (if enabled)
	if relay != nil {
		meshHandler := relay.HTTPHandler()
		mux.Handle("/mesh/", http.StripPrefix("", meshHandler))
	}

	srv := &http.Server{Addr: *listenAddr, Handler: mux}

	go func() {
		log.Printf("lethe-p2p listening on %s", *listenAddr)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	// Graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	shutCtx, shutCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutCancel()
	srv.Shutdown(shutCtx)
}

// announceLoop publishes local model capabilities to the GossipSub topic.
func announceLoop(ctx context.Context, n *node.Node, llamaURL string) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	// Announce immediately on startup
	publishCapabilities(n, llamaURL)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			publishCapabilities(n, llamaURL)
		}
	}
}

func publishCapabilities(n *node.Node, llamaURL string) {
	// Query local llama-server for available models
	models := queryLocalModels(llamaURL)

	cap := peer.Capabilities{
		PeerID:    n.Host().ID().String(),
		Models:    models,
		Timestamp: time.Now().Unix(),
	}

	data, err := json.Marshal(cap)
	if err != nil {
		log.Printf("failed to marshal capabilities: %v", err)
		return
	}

	if err := n.Publish(data); err != nil {
		log.Printf("failed to publish capabilities: %v", err)
	}
}

func queryLocalModels(llamaURL string) []peer.ModelInfo {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(llamaURL + "/v1/models")
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var result struct {
		Data []struct {
			ID        string `json:"id"`
			SizeBytes int64  `json:"size_bytes"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil
	}

	var models []peer.ModelInfo
	for _, m := range result.Data {
		models = append(models, peer.ModelInfo{
			ID:        m.ID,
			SizeBytes: m.SizeBytes,
		})
	}
	return models
}

// handlePeers returns the list of discovered peers and their capabilities.
func handlePeers(tracker *peer.Tracker) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(tracker.Peers())
	}
}

// handleHealth returns sidecar status.
func handleHealth(n *node.Node) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":     "ok",
			"peer_id":    n.Host().ID().String(),
			"peer_count": len(n.Host().Network().Peers()),
		})
	}
}

// handlePeerInference routes an inference request to the best available peer.
// If the requested model exists on a peer, forward the request there.
// Falls through to local llama-server if no peer has the model.
func handlePeerInference(tracker *peer.Tracker, llamaURL string) http.HandlerFunc {
	var mu sync.Mutex

	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", http.StatusMethodNotAllowed)
			return
		}

		// Parse the request to find which model is requested
		var req struct {
			Model string `json:"model"`
		}

		// Read body for inspection, then re-use it
		body := make([]byte, r.ContentLength)
		r.Body.Read(body)
		r.Body.Close()

		json.Unmarshal(body, &req)

		// Find a peer that has the requested model
		mu.Lock()
		bestPeer := tracker.FindPeerWithModel(req.Model)
		mu.Unlock()

		if bestPeer == nil {
			// No peer has this model — return 404 so agent falls through
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{
				"error": fmt.Sprintf("no peer has model %q", req.Model),
			})
			return
		}

		// Forward to the peer's lethe-p2p inference endpoint via libp2p stream
		resp, err := tracker.ForwardInference(r.Context(), bestPeer, body)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadGateway)
			json.NewEncoder(w).Encode(map[string]string{
				"error": fmt.Sprintf("peer inference failed: %v", err),
			})
			return
		}

		// Stream the response back
		w.Header().Set("Content-Type", resp.ContentType)
		w.WriteHeader(resp.StatusCode)
		w.Write(resp.Body)
	}
}

// ── Mesh signal handlers ──
// These are called by the relay when a validated signal arrives.

func handleMeshHeartbeat(sig *mesh.Signal, p *mesh.TrustedPeer) {
	log.Printf("mesh: heartbeat from %s (%s)", p.Label, sig.SenderID[:12])
	// Write to dead man's switch heartbeat file so the monitor sees it
	// This acts as a proxy check-in: if the peer checked in, they're alive
}

func handleMeshAlert(sig *mesh.Signal, p *mesh.TrustedPeer) {
	var alert mesh.AlertPayload
	if err := json.Unmarshal(sig.Payload, &alert); err != nil {
		log.Printf("mesh: bad alert payload from %s", sig.SenderID[:12])
		return
	}
	desc, ok := mesh.ValidAlertCodes[alert.Code]
	if !ok {
		log.Printf("mesh: unknown alert code %q from %s", alert.Code, sig.SenderID[:12])
		return
	}
	log.Printf("mesh: ALERT from %s (%s): %s — %s", p.Label, sig.SenderID[:12], alert.Code, desc)
	// Broadcast to Android via intent so the agent can show it
	// exec.Command("am", "broadcast", "-a", "lethe.intent.MESH_ALERT",
	//   "--es", "code", alert.Code, "--es", "peer", p.Label).Run()
}

func handleMeshWipe(sig *mesh.Signal, p *mesh.TrustedPeer) {
	log.Printf("mesh: WIPE command from %s (%s) — executing", p.Label, sig.SenderID[:12])
	// Trigger dead man's switch Stage 2 via system property
	// exec.Command("setprop", "persist.lethe.deadman.mesh_wipe", "true").Run()
}
