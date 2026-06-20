/*
  Mirrors the backend's enums + Data classes (com.coduel.model.* / common.data).
  Keep this in sync with the Java side — it's the contract between the two.
*/

export type Language = 'PYTHON' | 'CPP'

export type Verdict =
  | 'PENDING'
  | 'ACCEPTED'
  | 'WRONG_ANSWER'
  | 'TIME_LIMIT_EXCEEDED'
  | 'RUNTIME_ERROR'
  | 'COMPILE_ERROR'
  | 'INTERNAL_ERROR'

export type MatchmakingStatus = 'WAITING' | 'MATCHED'

export type MatchEventType = 'MATCH_READY' | 'SUBMISSION_JUDGED' | 'PLAYER_FORFEIT' | 'MATCH_OVER'

/** Why a match ended (carried on MATCH_OVER). winnerUserId is null for NO_SHOW_VOID / TIMEOUT. */
export type MatchEndReason =
  | 'SOLVED'
  | 'OPPONENT_FORFEIT'
  | 'OPPONENT_NO_SHOW'
  | 'NO_SHOW_VOID'
  | 'TIMEOUT'

/** GET /user/profile — the user's stored profile row (avatar defaults to the Google picture). */
export interface UserProfile {
  id: number
  email: string
  displayName: string | null
  avatarUrl: string | null
}

export type MatchState = 'ACTIVE' | 'FINISHED' | 'EXPIRED'

export interface MatchParticipantData {
  userId: number
  displayName: string | null
  avatarUrl: string | null
  forfeit: boolean
}

/** GET /match/{id} — the duel's problem + both players. */
export interface MatchData {
  matchId: number
  roomId: number | null // set when this match belongs to a private room (drives "back to lobby")
  state: MatchState
  slug: string
  problemTitle: string
  winnerUserId: number | null
  startedAtMs: number
  endedAtMs: number | null
  participants: MatchParticipantData[]
}

export interface TestCaseData {
  input: string
  expectedOutput: string
}

/** GET /problem/{slug} — visible test cases only. */
export interface ProblemData {
  id: number
  slug: string
  title: string
  statement: string
  timeLimitMs: number
  testCases: TestCaseData[]
  /** Latest verdict for the signed-in user — set on the list (GET /problem). */
  status?: Verdict | null
  /** The signed-in user's submissions for this problem — set on GET /problem/{slug}. */
  submissions?: SubmissionData[]
}

export interface PageData<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

/** GET /leaderboard, GET /leaderboard/search */
export interface LeaderboardData {
  userId: number
  displayName: string
  avatarUrl: string | null
  wins: number
  losses: number
}

/** POST /code/execute — run code against a list of test cases, judged synchronously (same as Submit). */
export interface ExecutionForm {
  language: Language
  code: string
  testCases: { input: string; expectedOutput: string }[]
  timeoutMs?: number
}

export interface ExecutionData {
  verdict: Verdict
  passedTests: number | null
  totalTests: number
  durationMs: number
  stdout: string | null
  stderr: string | null
  failedInput: string | null
  expectedOutput: string | null
  compilerLogs: string | null
}

/** POST /submission (userId comes from the session, never the body). */
export interface SubmissionForm {
  problemId: number
  matchId?: number
  language: Language
  sourceCode: string
}

export interface SubmissionData {
  submissionId: number
  userId: number
  problemId: number
  matchId: number | null
  language: Language
  verdict: Verdict
  runtimeMs: number | null
  passedTests: number | null
  totalTests: number | null
  createdAtMs: number | null
  sourceCode: string
}

/** POST /matchmaking/join · GET /matchmaking/status */
export interface MatchmakingData {
  status: MatchmakingStatus
  matchId: number | null
  problemId: number | null
}

/** Match-phase payload on /topic/match/{matchId}. */
export interface MatchEventData {
  type: MatchEventType
  submissionId?: number
  userId?: number
  verdict?: Verdict
  passedTests?: number
  totalTests?: number
  winnerUserId?: number | null
  endReason?: MatchEndReason
}

/** Public view of a user (no email) — a friend, or a search hit you can add. */
export interface FriendData {
  userId: number
  displayName: string | null
  avatarUrl: string | null
}

/** GET /friend/request — an incoming friend request. */
export interface FriendRequestData {
  requestId: number
  userId: number
  displayName: string | null
  avatarUrl: string | null
  createdAtMs: number | null
}

/** Backend error envelope (com.coduel.common.data.ErrorData). */
export interface ApiError {
  status: string
  message: string
}

// ===== Room (persistent private lobby; spawns N-player matches) =====

export type RoomState = 'OPEN' | 'CLOSED'

export interface RoomParticipantData {
  userId: number
  displayName: string | null
  avatarUrl: string | null
  host: boolean
  ready: boolean
}

/** GET /room/{id} — the persistent lobby. activeMatchId is the in-progress game, or null when idle. */
export interface RoomData {
  roomId: number
  state: RoomState
  host: boolean
  maxPlayers: number
  participants: RoomParticipantData[]
  activeMatchId: number | null
}

/** Payload on /topic/room/{roomId} — the persistent lobby channel. */
export type RoomEventType = 'ROSTER_CHANGED' | 'MATCH_STARTED' | 'ROOM_CLOSED'

export interface RoomEventData {
  type: RoomEventType
  matchId?: number | null // MATCH_STARTED — the match to jump into
}

// ===== Notifications =====

export type NotificationEventType = 'ROOM_INVITE' | 'FRIEND_REQUEST'

/** Pushed over /user/queue/notification via STOMP, and returned by GET /notification on load. */
export interface NotificationData {
  type: NotificationEventType
  roomId?: number | null // ROOM_INVITE — the room to join
  requestId?: number | null // FRIEND_REQUEST — the request to accept/decline
  fromUserId: number
  fromDisplayName: string | null
  fromAvatarUrl: string | null
  createdAtMs?: number | null
}
