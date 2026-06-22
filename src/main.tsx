import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './hooks/useAuth'
import { StompProvider } from './hooks/useStomp'
import { PresenceProvider } from './hooks/usePresence'
import { NotificationsProvider } from './hooks/useNotifications'
import { InvitePopupLayer } from './components/ui/InvitePopup'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        {/* One shared WebSocket for the whole session; every live feature subscribes on it. */}
        <StompProvider>
          <PresenceProvider>
            <NotificationsProvider>
              <App />
              {/* Rendered outside the router Outlet so it's always visible regardless of the current page. */}
              <InvitePopupLayer />
            </NotificationsProvider>
          </PresenceProvider>
        </StompProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
