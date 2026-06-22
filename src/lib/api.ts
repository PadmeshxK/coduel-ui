import { http } from './http'
import type {
  ChallengeData,
  ConversationData,
  ExecutionForm,
  MessageData,
  FilterOptionsData,
  FriendData,
  FriendRequestData,
  LeaderboardData,
  MatchData,
  MatchmakingData,
  NotificationData,
  PageData,
  ProblemData,
  ProblemSort,
  ProblemStatusFilter,
  RoomChatData,
  RoomData,
  RunAcceptedData,
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

export interface ProblemQuery {
  page?: number
  size?: number
  q?: string
  sort?: ProblemSort
  ratings?: number[]
  tags?: string[]
  status?: ProblemStatusFilter
}

// Build the shared filter query params. Lists go as comma-joined (the backend form splits them);
// ALL/empty values are omitted so they don't filter.
function filterParams(query: ProblemQuery): Record<string, unknown> {
  const { q, sort = 'rating-asc', ratings, tags, status } = query
  const params: Record<string, unknown> = { sort }
  if (q) params.q = q
  if (status && status !== 'ALL') params.status = status
  if (ratings?.length) params.ratings = ratings.join(',')
  if (tags?.length) params.tags = tags.join(',')
  return params
}

export const problemApi = {
  getPage: (query: ProblemQuery = {}) =>
    http
      .get<PageData<ProblemData>>('/problem', {
        params: { page: query.page ?? 0, size: query.size ?? 100, ...filterParams(query) },
      })
      .then((r) => r.data),
  // Ordered slugs for the active filter — drives the Solve page's "next problem" button.
  slugs: (query: ProblemQuery = {}) =>
    http.get<string[]>('/problem/slugs', { params: filterParams(query) }).then((r) => r.data),
  filterOptions: () =>
    http.get<FilterOptionsData>('/problem/filter-options').then((r) => r.data),
  getBySlug: (slug: string) =>
    http.get<ProblemData>(`/problem/${slug}`).then((r) => r.data),
}

export const executionApi = {
  // Async: queues the run and returns its runId; the result arrives over /user/queue/run-result.
  execute: (form: ExecutionForm) =>
    http.post<RunAcceptedData>('/code/execute', form).then((r) => r.data),
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
  // Live availability check for the name-setup / profile-edit UI (case-sensitive on the server).
  checkDisplayName: (name: string) =>
    http
      .get<{ available: boolean }>('/user/display-name-available', { params: { name } })
      .then((r) => r.data.available),
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

export const challengeApi = {
  // Challenge a friend to a duel → returns the challengeId so we can show "waiting…".
  create: (userId: number) =>
    http.post<ChallengeData>('/challenge', null, { params: { userId } }).then((r) => r.data),
  // Accept a challenge sent to me → returns the matchId to jump into.
  accept: (id: string) =>
    http.post<ChallengeData>(`/challenge/${id}/accept`).then((r) => r.data),
  decline: (id: string) => http.post(`/challenge/${id}/decline`),
}

export const chatApi = {
  // The DM inbox — my conversations, most-recent-first.
  conversations: () => http.get<ConversationData[]>('/chat/conversations').then((r) => r.data),
  // A thread page, newest-first; pass `before` (a messageId) to load older history (keyset).
  messages: (conversationId: number, before?: number, size = 30) =>
    http
      .get<MessageData[]>(`/chat/conversations/${conversationId}/messages`, { params: { before, size } })
      .then((r) => r.data),
  // Send a DM to a friend → the persisted message (also pushed live to the recipient).
  send: (recipientUserId: number, body: string) =>
    http.post<MessageData>('/chat/messages', { recipientUserId, body }).then((r) => r.data),
  // Mark a thread read up to now — clears its unread badge (persisted server-side).
  markRead: (conversationId: number) => http.post(`/chat/conversations/${conversationId}/read`),
}

export const presenceApi = {
  // userIds of my friends who are online right now — live changes then arrive on /user/queue/presence.
  onlineFriends: () => http.get<number[]>('/presence/friends').then((r) => r.data),
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
  // Hydrate the lobby chat (recent messages, oldest-first). Live updates arrive on /topic/room/{id}/chat.
  chat: (roomId: number) => http.get<RoomChatData[]>(`/room/${roomId}/chat`).then((r) => r.data),
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
