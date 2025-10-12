import { useWebSocketContext } from '../contexts/WebSocketContext';
import { Badge } from './ui/badge';

/**
 * Connection Status Indicator
 *
 * Displays real-time WebSocket connection status with visual feedback
 */
export function ConnectionStatusIndicator() {
    const { connected, error, reconnectAttempt } = useWebSocketContext();

    // Don't show anything if connected and no errors
    if (connected && !error) {
        return (
            <Badge
                variant="profit"
                className="text-xs animate-pulse-glow flex items-center gap-1.5"
                aria-label="Real-time connection active"
            >
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" aria-hidden="true" />
                <span>Live</span>
            </Badge>
        );
    }

    // Reconnecting state
    if (reconnectAttempt > 0 && !connected) {
        return (
            <Badge
                variant="outline"
                className="text-xs flex items-center gap-1.5 animate-pulse"
                aria-label={`Reconnecting, attempt ${reconnectAttempt}`}
            >
                <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" aria-hidden="true" />
                <span>Reconnecting... ({reconnectAttempt})</span>
            </Badge>
        );
    }

    // Disconnected with error
    if (error) {
        return (
            <Badge
                variant="outline"
                className="text-xs flex items-center gap-1.5 text-red-500 border-red-500"
                aria-label={`Connection error: ${error}`}
                title={error}
            >
                <span className="w-2 h-2 rounded-full bg-red-500" aria-hidden="true" />
                <span>Offline</span>
            </Badge>
        );
    }

    // Disconnected state
    return (
        <Badge
            variant="outline"
            className="text-xs flex items-center gap-1.5"
            aria-label="Real-time connection inactive"
        >
            <span className="w-2 h-2 rounded-full bg-gray-500" aria-hidden="true" />
            <span>Disconnected</span>
        </Badge>
    );
}

export default ConnectionStatusIndicator;
