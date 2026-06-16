import { Routes, Route } from 'react-router-dom'
import { Lobby } from './pages/Lobby'
import { Practice } from './pages/Practice'
import { Leaderboard } from './pages/Leaderboard'
import { Solve } from './pages/Solve'
import { DuelPage } from './pages/DuelPage'
import { Login } from './pages/Login'
import { Profile } from './pages/Profile'
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
        <Route path="/practice" element={<Practice />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <Profile />
            </RequireAuth>
          }
        />
        <Route path="/styleguide" element={<Styleguide />} />
      </Route>

      {/* full-height layout for the code editor + duel */}
      <Route element={<FillLayout />}>
        <Route path="/practice/:slug" element={<Solve />} />
        <Route
          path="/duel/:matchId"
          element={
            <RequireAuth>
              <DuelPage />
            </RequireAuth>
          }
        />
      </Route>

      {/* standalone — its own minimal header */}
      <Route path="/login" element={<Login />} />

      {/* common error page — catch-all 404 */}
      <Route path="*" element={<ErrorPage />} />
      </Routes>
    </>
  )
}

export default App
