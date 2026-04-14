// BLE transport for mesh signaling.
//
// Uses Android BLE APIs via a JNI bridge (lethe-ble-bridge) to
// advertise and scan for nearby LETHE devices. Signals are exchanged
// over GATT characteristics.
//
// This file defines the transport interface. The actual BLE I/O is
// handled by a native Android service that communicates with the Go
// sidecar via a Unix domain socket.
//
// BLE constraints:
//   - BLE 4.0 (ARMv7 Galaxy Note II): ~10m range, 20 byte MTU
//   - BLE 5.0 (modern devices): ~40m range, 251 byte MTU
//   - Signals are small (<512 bytes) so they fit in a few BLE packets
//   - Advertising interval tuned by battery level
package mesh

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"sync"
	"time"
)

const (
	// BLESocketPath is the Unix socket for the Android BLE bridge.
	BLESocketPath = "/data/lethe/mesh/ble.sock"

	// BLEServiceUUID identifies LETHE mesh on BLE.
	// Generated deterministically from "lethe-mesh-v1".
	BLEServiceUUID = "4c455448-452d-4d45-5348-563100000001"

	// BLESignalCharUUID is the GATT characteristic for signals.
	BLESignalCharUUID = "4c455448-452d-4d45-5348-563100000002"
)

// BLETransport sends and receives mesh signals over Bluetooth Low Energy.
type BLETransport struct {
	relay      *Relay
	socketPath string
	conn       net.Conn
	mu         sync.Mutex
	connected  bool
}

// NewBLETransport creates a BLE transport connected to the Android bridge.
func NewBLETransport(relay *Relay, socketPath string) *BLETransport {
	if socketPath == "" {
		socketPath = BLESocketPath
	}
	return &BLETransport{
		relay:      relay,
		socketPath: socketPath,
	}
}

// Run connects to the BLE bridge and relays signals.
func (bt *BLETransport) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		if err := bt.connect(); err != nil {
			log.Printf("ble: bridge not available: %v (retrying in 30s)", err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(30 * time.Second):
				continue
			}
		}

		bt.readLoop(ctx)
	}
}

// Send transmits a signal over BLE.
func (bt *BLETransport) Send(sig *Signal) error {
	bt.mu.Lock()
	defer bt.mu.Unlock()

	if !bt.connected || bt.conn == nil {
		return fmt.Errorf("ble: not connected to bridge")
	}

	data, err := json.Marshal(sig)
	if err != nil {
		return err
	}

	// Frame: 4-byte length prefix + payload
	frame := make([]byte, 4+len(data))
	frame[0] = byte(len(data) >> 24)
	frame[1] = byte(len(data) >> 16)
	frame[2] = byte(len(data) >> 8)
	frame[3] = byte(len(data))
	copy(frame[4:], data)

	_, err = bt.conn.Write(frame)
	return err
}

func (bt *BLETransport) connect() error {
	bt.mu.Lock()
	defer bt.mu.Unlock()

	conn, err := net.Dial("unix", bt.socketPath)
	if err != nil {
		return err
	}
	bt.conn = conn
	bt.connected = true
	log.Printf("ble: connected to bridge at %s", bt.socketPath)
	return nil
}

func (bt *BLETransport) readLoop(ctx context.Context) {
	buf := make([]byte, 4096)
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		n, err := bt.conn.Read(buf)
		if err != nil {
			log.Printf("ble: bridge read error: %v", err)
			bt.mu.Lock()
			bt.connected = false
			bt.conn.Close()
			bt.mu.Unlock()
			return
		}

		if n > 0 {
			bt.relay.Receive(buf[:n])
		}
	}
}

// IsConnected returns whether the BLE bridge is connected.
func (bt *BLETransport) IsConnected() bool {
	bt.mu.Lock()
	defer bt.mu.Unlock()
	return bt.connected
}
