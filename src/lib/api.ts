import { http } from './http'
import type {
  ExecutionData,
  ExecutionForm,
  LeaderboardData,
  MatchData,
  MatchmakingData,
  PageData,
  ProblemData,
  SubmissionData,
  SubmissionForm,
  UserProfile,
} from '../types'

export const profileApi = {
  get: () => http.get<UserProfile>('/me/profile').then((r) => r.data),
  update: (body: { displayName: string; avatarUrl?: string | null }) =>
    http.patch<UserProfile>('/me/profile', body).then((r) => r.data),
}

export const authApi = {
  // Backend invalidates the Redis session + clears the SESSION cookie, returns 200.
  logout: () => http.post('/logout'),
}

export const problemApi = {
  getPage: (page = 0, size = 20) =>
    http
      .get<PageData<ProblemData>>('/problems', { params: { page, size } })
      .then((r) => r.data),
  getBySlug: (slug: string) =>
    http.get<ProblemData>(`/problems/${slug}`).then((r) => r.data),
}

export const executionApi = {
  execute: (form: ExecutionForm) =>
    http.post<ExecutionData>('/code/execute', form).then((r) => r.data),
}

export const submissionApi = {
  create: (form: SubmissionForm) =>
    http.post<SubmissionData>('/submissions', form).then((r) => r.data),
  get: (id: number) =>
    http.get<SubmissionData>(`/submissions/${id}`).then((r) => r.data),
}

export const matchmakingApi = {
  join: () => http.post<MatchmakingData>('/matchmaking/join').then((r) => r.data),
  status: () => http.get<MatchmakingData>('/matchmaking/status').then((r) => r.data),
  leave: () => http.post('/matchmaking/leave'),
}

export const matchApi = {
  get: (id: string | number) => http.get<MatchData>(`/matches/${id}`).then((r) => r.data),
  // Give up an active match — the opponent wins (backend publishes MATCH_OVER).
  forfeit: (id: string | number) => http.post(`/matches/${id}/forfeit`),
}

export const leaderboardApi = {
  getPage: (page = 0, size = 20) =>
    http
      .get<PageData<LeaderboardData>>('/leaderboard', { params: { page, size } })
      .then((r) => r.data),
  // Name-prefix search; called only when the box is non-empty.
  search: (q: string) =>
    http
      .get<LeaderboardData[]>('/leaderboard/search', { params: { q } })
      .then((r) => r.data),
}
