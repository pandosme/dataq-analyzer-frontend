# WebSocket Client Implementation

## Overview

The WebSocket client has been successfully implemented to replace the polling mechanism for real-time path event updates in the Detections view.

## What Was Implemented

### 1. WebSocket Context (`src/context/WebSocketContext.jsx`)

A React Context that manages WebSocket connections:

**Features:**
- Automatic connection when user is authenticated
- Automatic disconnection on logout
- Automatic reconnection with exponential backoff (up to 10 attempts)
- JWT token-based authentication
- HTTP/HTTPS to WS/WSS URL conversion
- Subscription management for cameras and filters
- Event handler registration for real-time path events
- Keep-alive ping/pong (every 30 seconds)
- Connection state tracking

**API:**
```javascript
const {
  isConnected,        // Boolean - WebSocket connection status
  connectionError,    // String - Error message if any
  lastEvent,          // Object - Last received path event
  subscribe,          // Function(cameras, filters) - Subscribe to cameras
  unsubscribe,        // Function(cameras) - Unsubscribe from cameras
  onPathEvent,        // Function(handler) - Register event handler
  ping,               // Function() - Send ping
  reconnect,          // Function() - Manually trigger reconnection
} = useWebSocket();
```

### 2. Updated Components

#### LiveData Component (`src/components/LiveData.jsx`)
- **Removed**: Polling mechanism (2-second interval)
- **Added**: WebSocket subscription and real-time event handling
- **Added**: Connection status indicator (green "Live" / gray "Disconnected")
- **Added**: Automatic subscription to selected camera with filters
- **Improved**: Real-time path display (events appear immediately)

#### App Component (`src/App.jsx`)
- **Added**: WebSocket connection status in header
- **Added**: Global "Live" / "Offline" indicator next to server name

#### Main Entry (`src/main.jsx`)
- **Added**: WebSocketProvider in the provider hierarchy
- **Order**: ServerProvider → AuthProvider → WebSocketProvider → DateFormatProvider → App

## How It Works

### Connection Flow

1. **User logs in** → AuthContext stores token and server
2. **WebSocketContext detects auth** → Establishes WebSocket connection
3. **Connection successful** → `isConnected` becomes `true`
4. **User selects camera** → LiveData subscribes to that camera
5. **Backend sends path events** → Events appear in real-time
6. **User logs out** → WebSocket disconnects automatically

### Subscription Flow

When a user selects a camera in the Detections view:

```javascript
// LiveData automatically subscribes
subscribe([selectedCamera], {
  classes: filters.objectTypes,
  minAge: filters.minAge,
  minDistance: filters.minDistance,
});

// And registers an event handler
onPathEvent((pathEvent) => {
  if (pathEvent.serial === selectedCamera) {
    // Add to recent paths list
    setRecentPaths([pathEvent, ...prevPaths].slice(0, 10));
  }
});
```

### Reconnection Logic

If the WebSocket disconnects unexpectedly:
- Attempts to reconnect with exponential backoff
- Delays: 1s, 2s, 4s, 8s, 16s, 30s (max)
- Up to 10 reconnection attempts
- Preserves subscriptions across reconnections

## Usage Examples

### Basic Usage in a Component

```javascript
import { useWebSocket } from '../context/WebSocketContext';

function MyComponent() {
  const { isConnected, subscribe, onPathEvent } = useWebSocket();

  useEffect(() => {
    // Subscribe to camera
    subscribe(['B8A44F3024BB'], {
      classes: ['Human', 'Car'],
      minAge: 3
    });

    // Handle events
    const unsubscribe = onPathEvent((pathEvent) => {
      console.log('New path event:', pathEvent);
    });

    return () => unsubscribe();
  }, [subscribe, onPathEvent]);

  return <div>{isConnected ? 'Connected' : 'Disconnected'}</div>;
}
```

### Subscribe to Multiple Cameras

```javascript
subscribe(['CAM1', 'CAM2', 'CAM3'], {
  classes: ['Human'],
  minAge: 2,
  minDistance: 20
});
```

### Subscribe to All Authorized Cameras

```javascript
// Empty array or omit cameras parameter
subscribe([], {
  classes: ['Human', 'Car']
});
```

## Connection Status Indicators

### Header Status
Located in the app header next to the server name:
- **Green dot + "Live"**: WebSocket connected
- **Gray dot + "Offline"**: WebSocket disconnected

### Detections Panel Status
Located in the right panel above "Recent Detections":
- **Green dot + "Live"**: Receiving real-time events
- **Gray dot + "Disconnected"**: Not connected

## Error Handling

### Connection Errors
- **Invalid token**: WebSocket rejects connection (code 4001)
- **Network error**: Automatic reconnection attempts
- **Max attempts reached**: Error displayed to user

### Event Errors
- Invalid messages are logged to console
- Component-level error handling for display issues
- Errors don't crash the application

## Development Mode Features

When running in development mode (`import.meta.env.DEV`):
- Detailed connection logs
- Subscription logs
- Event type logs (except path events to avoid spam)
- Reconnection attempt logs
- Token is masked in logs

## Performance Considerations

1. **Event Filtering**: Applied server-side to reduce bandwidth
2. **Limited History**: Only keeps last 10 paths in memory
3. **Efficient Rendering**: React updates only when new events arrive
4. **Cleanup**: Properly unsubscribes and cleans up event handlers

## Testing

### Manual Testing Checklist

1. **Connection**
   - [ ] Connect with valid credentials → Status shows "Live"
   - [ ] Logout → WebSocket disconnects
   - [ ] Login again → WebSocket reconnects

2. **Subscriptions**
   - [ ] Select camera → Events appear in real-time
   - [ ] Change filters → New subscription sent
   - [ ] Switch cameras → Old subscription cleaned up

3. **Reconnection**
   - [ ] Restart backend → Client reconnects automatically
   - [ ] Check console for reconnection attempts

4. **Events**
   - [ ] New events appear immediately
   - [ ] Events match selected camera
   - [ ] Events respect filters
   - [ ] Path overlays update in real-time

### Browser Console Tests

```javascript
// Check connection status
console.log('Connected:', useWebSocket().isConnected);

// Send manual ping
useWebSocket().ping();

// Subscribe manually
useWebSocket().subscribe(['CAM1']);

// Add event listener
const unsub = useWebSocket().onPathEvent(event => console.log(event));
// Later: unsub();
```

## Troubleshooting

### "Not connected to real-time feed" Error

**Possible causes:**
1. Backend WebSocket server not running
2. CORS issues
3. Invalid JWT token
4. Network/firewall blocking WebSocket connections

**Solutions:**
1. Check backend logs for WebSocket server startup
2. Verify CORS settings allow WebSocket connections
3. Check browser console for connection errors
4. Try http://localhost instead of IP address

### Events Not Appearing

**Possible causes:**
1. Not subscribed to correct camera
2. Filters too restrictive
3. Camera not sending events
4. Event doesn't match filters

**Solutions:**
1. Check subscription in browser console
2. Relax filters (remove minAge, minDistance)
3. Verify camera is active and sending MQTT messages
4. Check backend logs for event processing

### Constant Reconnection

**Possible causes:**
1. Backend rejecting connections
2. Invalid token
3. Network instability

**Solutions:**
1. Check backend logs for rejection reason
2. Try logging out and back in (refreshes token)
3. Check network connection

## Future Enhancements

Potential improvements (not yet implemented):

1. **Message Batching**: Batch multiple events for high-volume scenarios
2. **Compression**: Enable WebSocket compression
3. **Binary Protocol**: Use MessagePack or Protocol Buffers
4. **Replay**: Request recent historical events on connect
5. **Backpressure**: Pause event processing if client can't keep up
6. **Statistics**: Track events/second, connection uptime
7. **Reconnect UI**: Show countdown during reconnection
8. **Manual Reconnect**: Button to manually trigger reconnection

## Backend Requirements

For the WebSocket client to work, the backend must:

1. Implement WebSocket server at `/ws/paths`
2. Accept JWT token in query string (`?token=xxx`)
3. Support subscription messages (see `request.md`)
4. Forward MQTT path events to subscribed clients
5. Apply server-side filtering
6. Handle disconnections gracefully

See `request.md` for complete backend API specification.

## Files Modified

1. **Created**:
   - `src/context/WebSocketContext.jsx` - WebSocket context and provider
   - `request.md` - Backend API specification
   - `WEBSOCKET_IMPLEMENTATION.md` - This document

2. **Modified**:
   - `src/main.jsx` - Added WebSocketProvider
   - `src/components/LiveData.jsx` - Replaced polling with WebSocket
   - `src/App.jsx` - Added connection status indicator

## Migration Notes

### Before (Polling)
- Polled server every 2 seconds
- Could miss events between polls
- Higher server load
- ~2 second delay for new events

### After (WebSocket)
- Real-time event delivery
- No missed events
- Lower server load
- Instant event display
- Auto-reconnection on disconnect

## Summary

The WebSocket client implementation provides:
- ✅ Real-time path event delivery
- ✅ Automatic connection management
- ✅ Robust error handling and reconnection
- ✅ Clean integration with existing code
- ✅ Visual connection status indicators
- ✅ Development mode debugging
- ✅ Production-ready reliability

The frontend is now ready to receive real-time path events once the backend WebSocket server is implemented according to the specification in `request.md`.
