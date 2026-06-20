import { http } from './http'
import type {
  ExecutionData,
  ExecutionForm,
  FriendData,
  FriendRequestData,
  LeaderboardData,
  MatchData,
  MatchmakingData,
  NotificationData,
  PageData,
  ProblemData,
  RoomData,
  SubmissionData,
  SubmissionForm,
  UserProfile,
} from '../types'

export const profileApi = {
  get: () => http.get<UserProfile>('/user/profile').then((r) => r.data),
  update: (body: { displayName: string; avatarUrl?: string | null }) =>
    http.patch<UserProfile>('/user/profile', body).then((r) => r.data),
}

export const authApi = {
  // Backend invalidates the Redis session + clears the SESSION cookie, returns 200.
  logout: () => http.post('/logout'),
}

export const problemApi = {
  getPage: (page = 0, size = 20) =>
    http
      .get<PageData<ProblemData>>('/problem', { params: { page, size } })
      .then((r) => r.data),
  getBySlug: (slug: string) =>
    http.get<ProblemData>(`/problem/${slug}`).then((r) => r.data),
}

export const executionApi = {
  execute: (form: ExecutionForm) =>
    http.post<ExecutionData>('/code/execute', form).then((r) => r.data),
}

export const submissionApi = {
  create: (form: SubmissionForm) =>
    http.post<SubmissionData>('/submission', form).then((r) => r.data),
  get: (id: number) =>
    http.get<SubmissionData>(`/submission/${id}`).then((r) => r.data),
}

export const userApi = {
  // Public directory search by display-name prefix (for adding friends).
  search: (q: string) =>
    http.get<FriendData[]>('/user/search', { params: { q } }).then((r) => r.data),
}

export const friendApi = {
  list: () => http.get<FriendData[]>('/friend').then((r) => r.data),
  requests: () => http.get<FriendRequestData[]>('/friend/request').then((r) => r.data),
  sendRequest: (userId: number) => http.post('/friend/request', null, { params: { userId } }),
  accept: (requestId: number) => http.post(`/friend/request/${requestId}/accept`),
  decline: (requestId: number) => http.delete(`/friend/request/${requestId}`),
  unfriend: (userId: number) => http.delete(`/friend/${userId}`),
}

export const matchmakingApi = {
  join: () => http.post<MatchmakingData>('/matchmaking/join').then((r) => r.data),
  status: () => http.get<MatchmakingData>('/matchmaking/status').then((r) => r.data),
  leave: () => http.post('/matchmaking/leave'),
}

export const matchApi = {
  get: (id: string | number) => http.get<MatchData>(`/match/${id}`).then((r) => r.data),
  // Give up an active match — the opponent wins (backend publishes MATCH_OVER).
  forfeit: (id: string | number) => http.post(`/match/${id}/forfeit`),
}

export const roomApi = {
  create: () => http.post<RoomData>('/room').then((r) => r.data),
  get: (roomId: number) => http.get<RoomData>(`/room/${roomId}`).then((r) => r.data),
  invite: (roomId: number, userId: number) =>
    http.post(`/room/${roomId}/invite`, null, { params: { userId } }),
  join: (roomId: number) => http.post(`/room/${roomId}/join`),
  // Non-host marks themselves ready / not ready in the lobby.
  ready: (roomId: number, ready: boolean) =>
    http.post<RoomData>(`/room/${roomId}/ready`, null, { params: { ready } }).then((r) => r.data),
  // Host starts a match; the returned room carries the new activeMatchId to jump into.
  start: (roomId: number) => http.post<RoomData>(`/room/${roomId}/start`).then((r) => r.data),
  leave: (roomId: number) => http.delete(`/room/${roomId}/leave`),
}

export const notificationApi = {
  // Pending notifications for the signed-in user (friend requests + live room invites), recent first.
  getPending: () => http.get<NotificationData[]>('/notification').then((r) => r.data),
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
