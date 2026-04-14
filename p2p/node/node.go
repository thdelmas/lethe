// Package node manages the libp2p host with mDNS discovery and GossipSub.
package node

import (
	"context"
	"log"
	"sync"

	"github.com/libp2p/go-libp2p"
	pubsub "github.com/libp2p/go-libp2p-pubsub"
	"github.com/libp2p/go-libp2p/core/host"
	"github.com/libp2p/go-libp2p/core/network"
	"github.com/libp2p/go-libp2p/core/peer"
	"github.com/libp2p/go-libp2p/p2p/discovery/mdns"
)

const (
	// TopicName is the GossipSub topic for capability announcements.
	TopicName = "lethe/capabilities"

	// InferenceProtocol is the libp2p protocol ID for inference requests.
	InferenceProtocol = "/lethe/inference/1.0.0"

	// MDNSServiceTag identifies LETHE peers on the local network.
	MDNSServiceTag = "lethe-p2p.local"
)

// Node wraps a libp2p host with GossipSub and mDNS.
type Node struct {
	host  host.Host
	ps    *pubsub.PubSub
	topic *pubsub.Topic
	sub   *pubsub.Subscription

	// Callback for incoming inference requests (set by peer tracker)
	InferenceHandler func(network.Stream)

	mu          sync.RWMutex
	msgHandlers []func([]byte)
}

// New creates a libp2p node with mDNS discovery and GossipSub.
func New(ctx context.Context) (*Node, error) {
	// Create host — listen on random port, LAN only
	h, err := libp2p.New(
		libp2p.ListenAddrStrings(
			"/ip4/0.0.0.0/tcp/0",
		),
		libp2p.EnableRelay(),
	)
	if err != nil {
		return nil, err
	}

	log.Printf("libp2p peer ID: %s", h.ID())
	for _, addr := range h.Addrs() {
		log.Printf("  listening on %s/p2p/%s", addr, h.ID())
	}

	// Create GossipSub
	ps, err := pubsub.NewGossipSub(ctx, h)
	if err != nil {
		h.Close()
		return nil, err
	}

	// Join the capabilities topic
	topic, err := ps.Join(TopicName)
	if err != nil {
		h.Close()
		return nil, err
	}

	sub, err := topic.Subscribe()
	if err != nil {
		h.Close()
		return nil, err
	}

	n := &Node{
		host:  h,
		ps:    ps,
		topic: topic,
		sub:   sub,
	}

	// Set up inference protocol handler
	h.SetStreamHandler(InferenceProtocol, func(s network.Stream) {
		if n.InferenceHandler != nil {
			n.InferenceHandler(s)
		} else {
			s.Reset()
		}
	})

	// Start mDNS discovery
	disc := mdns.NewMdnsService(h, MDNSServiceTag, &discoveryNotifee{})
	if err := disc.Start(); err != nil {
		log.Printf("mDNS start failed (non-fatal): %v", err)
	}

	// Read messages from subscription
	go n.readLoop(ctx)

	return n, nil
}

// Host returns the underlying libp2p host.
func (n *Node) Host() host.Host { return n.host }

// Publish sends data to the GossipSub topic.
func (n *Node) Publish(data []byte) error {
	return n.topic.Publish(context.Background(), data)
}

// OnMessage registers a handler for incoming GossipSub messages.
func (n *Node) OnMessage(handler func([]byte)) {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.msgHandlers = append(n.msgHandlers, handler)
}

// Close shuts down the node.
func (n *Node) Close() error {
	n.sub.Cancel()
	n.topic.Close()
	return n.host.Close()
}

func (n *Node) readLoop(ctx context.Context) {
	for {
		msg, err := n.sub.Next(ctx)
		if err != nil {
			return
		}
		// Skip messages from self
		if msg.ReceivedFrom == n.host.ID() {
			continue
		}

		n.mu.RLock()
		handlers := n.msgHandlers
		n.mu.RUnlock()

		for _, h := range handlers {
			h(msg.Data)
		}
	}
}

// discoveryNotifee handles mDNS peer discoveries.
type discoveryNotifee struct{}

func (d *discoveryNotifee) HandlePeerFound(pi peer.AddrInfo) {
	log.Printf("mDNS: discovered peer %s", pi.ID.ShortString())
}
