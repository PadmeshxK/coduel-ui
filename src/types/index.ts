/*
  Mirrors the backend's enums + Data classes (com.coduel.model.* / common.data).
  Keep this in sync with the Java side — it's the contract between the two.
*/

export type Language = 'PYTHON'

export type Verdict =
  | 'PENDING'
  | 'ACCEPTED'
  | 'WRONG_ANSWER'
  | 'TIME_LIMIT_EXCEEDED'
  | 'RUNTIME_ERROR'
  | 'COMPILE_ERROR'
  | 'INTERNAL_ERROR'

export type MatchmakingStatus = 'WAITING' | 'MATCHED'

export type MatchEventType = 'MATCH_READY' | 'SUBMISSION_JUDGED' | 'MATCH_OVER'

/** Why a match ended (carried on MATCH_OVER). winnerUserId is null for NO_SHOW_VOID / TIMEOUT. */
export type MatchEndReason =
  | 'SOLVED'
  | 'OPPONENT_FORFEIT'
  | 'OPPONENT_NO_SHOW'
  | 'NO_SHOW_VOID'
  | 'TIMEOUT'

/** GET /me/profile — the user's stored profile row (avatar defaults to the Google picture). */
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
}

/** GET /matches/{id} — the duel's problem + both players. */
export interface MatchData {
  matchId: number
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

/** GET /problems/{slug} — visible test cases only. */
export interface ProblemData {
  id: number
  slug: string
  title: string
  statement: string
  timeLimitMs: number
  testCases: TestCaseData[]
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

/** POST /code/execute */
export interface ExecutionForm {
  language: Language
  code: string
  stdin?: string
  timeoutMs?: number
}

export interface ExecutionData {
  stdout: string
  stderr: string
  exitCode: number
  timedOut: boolean
  durationMs: number
}

/** POST /submissions (userId comes from the session, never the body). */
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
}

/** POST /matchmaking/join · GET /matchmaking/status */
export interface MatchmakingData {
  status: MatchmakingStatus
  matchId: number | null
  problemId: number | null
}

/** WebSocket payload on /topic/match/{matchId}. */
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

/** Backend error envelope (com.coduel.common.data.ErrorData). */
export interface ApiError {
  status: string
  message: string
}
