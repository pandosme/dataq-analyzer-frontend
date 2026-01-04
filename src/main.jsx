// import { StrictMode } from 'react' // Temporarily disabled - see below
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ServerProvider } from './context/ServerContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { UserPreferencesProvider } from './context/UserPreferencesContext.jsx'
import { WebSocketProvider } from './context/WebSocketContext.jsx'

createRoot(document.getElementById('root')).render(
  // Temporarily disabled StrictMode to prevent WebSocket interruption during development
  // TODO: Re-enable and handle double-mounting properly
  // <StrictMode>
    <ServerProvider>
      <AuthProvider>
        <WebSocketProvider>
          <UserPreferencesProvider>
            <App />
          </UserPreferencesProvider>
        </WebSocketProvider>
      </AuthProvider>
    </ServerProvider>
  // </StrictMode>,
)
