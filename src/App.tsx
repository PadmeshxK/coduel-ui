import { Routes, Route } from 'react-router-dom'
import { Lobby } from './pages/Lobby'
import { Practice } from './pages/Practice'
import { Leaderboard } from './pages/Leaderboard'
import { Solve } from './pages/Solve'
import { MatchPage } from './pages/MatchPage'
import { RoomPage } from './pages/RoomPage'
import { Login } from './pages/Login'
import { NameSetup } from './pages/NameSetup'
import { Profile } from './pages/Profile'
import { Friends } from './pages/Friends'
import { Styleguide } from './pages/Styleguide'
import { ErrorPage } from './pages/ErrorPage'
import { RequireAuth } from './components/RequireAuth'
import { ScrollToTop } from './components/ScrollToTop'
import { DefaultLayout, FillLayout } from './components/layout/Layout'
import { useReflectiveGlow } from './hooks/useReflectiveGlow'
import { useSmoothScroll } from './hooks/useSmoothScroll'

function App() {
  useReflectiveGlow()
  useSmoothScroll()

  return (
    <>
      <ScrollToTop />
      <Routes>
        {/* standard layout — navbar rendered once, pages render into the Outlet */}
        <Route element={<DefaultLayout />}>
          <Route
            path="/"
            element={
              <RequireAuth>
                <Lobby />
              </RequireAuth>
            }
          />
          <Route
            path="/practice"
            element={
              <RequireAuth>
                <Practice />
              </RequireAuth>
            }
          />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <Profile />
              </RequireAuth>
            }
          />
          <Route
            path="/friend"
            element={
              <RequireAuth>
                <Friends />
              </RequireAuth>
            }
          />
          <Route
            path="/room/:roomId"
            element={
              <RequireAuth>
                <RoomPage />
              </RequireAuth>
            }
          />
          <Route path="/styleguide" element={<Styleguide />} />
        </Route>

        {/* full-height layout for the code editor + 1v1 duel */}
        <Route element={<FillLayout />}>
          <Route
            path="/practice/:slug"
            element={
              <RequireAuth>
                <Solve />
              </RequireAuth>
            }
          />
          {/* Shared match arena — matchmaking duels and private-room games both land here. */}
          <Route
            path="/match/:matchId"
            element={
              <RequireAuth>
                <MatchPage />
              </RequireAuth>
            }
          />
        </Route>

        {/* standalone — their own minimal header */}
        <Route path="/login" element={<Login />} />
        {/* new-account name setup — auth required, but exempt from the setup gate itself */}
        <Route
          path="/setup"
          element={
            <RequireAuth allowUnnamed>
              <NameSetup />
            </RequireAuth>
          }
        />

        {/* catch-all 404 */}
        <Route path="*" element={<ErrorPage />} />
      </Routes>
    </>
  )
}

export default App
