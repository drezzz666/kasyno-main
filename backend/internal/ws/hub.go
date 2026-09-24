package ws

import (
	"encoding/json"
	"log"
	"sync"
)

var (
	wsTelemetryMu         sync.RWMutex
	wsTelemetryConnect    func()
	wsTelemetryDisconnect func()
	wsTelemetryEvent      func(eventType string)
)

// SetWSTelemetryCallbacks configures telemetry hooks for WebSocket connections and events.
func SetWSTelemetryCallbacks(onConnect, onDisconnect func(), onEvent func(eventType string)) {
	wsTelemetryMu.Lock()
	defer wsTelemetryMu.Unlock()
	wsTelemetryConnect = onConnect
	wsTelemetryDisconnect = onDisconnect
	wsTelemetryEvent = onEvent
}

func recordWSConnect() {
	wsTelemetryMu.RLock()
	fn := wsTelemetryConnect
	wsTelemetryMu.RUnlock()
	if fn != nil {
		fn()
	}
}

func recordWSDisconnect() {
	wsTelemetryMu.RLock()
	fn := wsTelemetryDisconnect
	wsTelemetryMu.RUnlock()
	if fn != nil {
		fn()
	}
}

func recordWSEvent(evType string) {
	wsTelemetryMu.RLock()
	fn := wsTelemetryEvent
	wsTelemetryMu.RUnlock()
	if fn != nil {
		fn(evType)
	}
}

type MessageHandler func(client *Client, msg []byte)
type DisconnectHandler func(userID string)

type Hub struct {
	clients          map[*Client]bool
	userClients      map[string]map[*Client]bool
	broadcast        chan []byte
	register         chan *Client
	unregister       chan *Client
	messageHandler   MessageHandler
	onUserDisconnect DisconnectHandler
	mu               sync.RWMutex
}

func NewHub() *Hub {
	return &Hub{
		clients:     make(map[*Client]bool),
		userClients: make(map[string]map[*Client]bool),
		broadcast:   make(chan []byte, 256),
		register:    make(chan *Client),
		unregister:  make(chan *Client),
	}
}

func (h *Hub) SetMessageHandler(handler MessageHandler) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.messageHandler = handler
}

func (h *Hub) GetMessageHandler() MessageHandler {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.messageHandler
}

func (h *Hub) SetOnUserDisconnect(handler DisconnectHandler) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.onUserDisconnect = handler
}

func (h *Hub) IsUserConnected(userID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.userClients[userID]) > 0
}


func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			if client.UserID != "" {
				if h.userClients[client.UserID] == nil {
					h.userClients[client.UserID] = make(map[*Client]bool)
				}
				h.userClients[client.UserID][client] = true
			}
			h.mu.Unlock()
			recordWSConnect()
			log.Printf("[WS Hub] Client registered: %s (Total: %d)", client.UserID, len(h.clients))

		case client := <-h.unregister:
			h.removeClient(client)

		case message := <-h.broadcast:
			h.mu.Lock()
			var deadClients []*Client
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					deadClients = append(deadClients, client)
				}
			}
			for _, client := range deadClients {
				h.internalRemoveClient(client)
			}
			h.mu.Unlock()
		}
	}
}

func (h *Hub) removeClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.internalRemoveClient(client)
}

func (h *Hub) internalRemoveClient(client *Client) {
	if _, ok := h.clients[client]; ok {
		delete(h.clients, client)
		close(client.send)
		var userDisconnected string
		if client.UserID != "" && h.userClients[client.UserID] != nil {
			delete(h.userClients[client.UserID], client)
			if len(h.userClients[client.UserID]) == 0 {
				delete(h.userClients, client.UserID)
				userDisconnected = client.UserID
			}
		}
		recordWSDisconnect()
		log.Printf("[WS Hub] Client disconnected: %s (Remaining: %d)", client.UserID, len(h.clients))
		if userDisconnected != "" && h.onUserDisconnect != nil {
			fn := h.onUserDisconnect
			go fn(userDisconnected)
		}
	}
}

func (h *Hub) Broadcast(event Event) {
	recordWSEvent(string(event.Type))
	data, err := json.Marshal(event)
	if err != nil {
		return
	}
	select {
	case h.broadcast <- data:
	default:
		// Drop broadcast if channel is congested to prevent blocking caller
	}
}

func (h *Hub) SendToUser(userID string, event Event) {
	recordWSEvent(string(event.Type))
	data, err := json.Marshal(event)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	if clients, ok := h.userClients[userID]; ok {
		for client := range clients {
			select {
			case client.send <- data:
			default:
			}
		}
	}
}

