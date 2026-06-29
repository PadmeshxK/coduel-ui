import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Lenis from "lenis";
import EmojiPicker, { Theme as EmojiTheme, EmojiStyle } from "emoji-picker-react";
import { Card } from "../components/ui/Card";
import { Avatar } from "../components/ui/Avatar";
import { Loader } from "../components/ui/Loader";
import { challengeApi, chatApi, executionApi, friendApi, problemApi } from "../lib/api";
import { replyPreviewText } from "../lib/messageKind";
import { useAuth } from "../hooks/useAuth";
import { useStomp } from "../hooks/useStomp";
import { useNotifications } from "../hooks/useNotifications";
import { usePresence } from "../hooks/usePresence";
import { useLenisBox } from "../hooks/useLenisBox";
import { CodeBubble } from "../components/messages/CodeBubble";
import { CustomizePanel } from "../components/messages/CustomizePanel";
import { ImageBubble } from "../components/messages/ImageBubble";
import { PinnedBar } from "../components/messages/PinnedBar";
import { ProblemShareCard } from "../components/messages/ProblemShareCard";
import { seedProblems } from "../components/messages/problemCache";
import { VoicePlayer } from "../components/messages/VoicePlayer";
import { LiveMicMeter } from "../components/messages/LiveMicMeter";
import { useVoiceRecorder, MAX_RECORD_MS } from "../hooks/useVoiceRecorder";
import { SwordsIcon } from "../components/play/icons";
import { config } from "../lib/config";
import { QuickReactionBar, ReactionChips, ReactionPicker } from "../components/messages/Reactions";
import {
  REACTION_OPTIONS,
  backgroundArtStyle,
  bubbleClass,
  messageBubblePadding,
  messageFontFamily,
  messageRowGap,
  messageTextSizePx,
  threadThemeStyle,
} from "../components/messages/conversationTheme";
import type {
  ConversationData,
  ConversationSettingData,
  ExecutionData,
  FriendData,
  MessageData,
  MessageSearchData,
  ProblemData,
  MessageUpdateData,
  PinEventData,
  PinnedMessageData,
  ReactionData,
  ReactionEventData,
  ReadReceiptData,
  TypingData,
} from "../types";

// Consecutive messages from the same sender within this window collapse into one visual group.
const GROUP_MS = 5 * 60 * 1000;
// A message can only be edited within this window of being sent (mirrors the backend's 5 min).
const EDIT_WINDOW_MS = 5 * 60 * 1000;
// Thread page size (per history page). A full page means more history may exist in that direction.
const PAGE_SIZE = 50;
// Generous in-memory message window — enough that you rarely hit an edge, small enough the DOM never
// lags. Beyond this, the far end is dropped from memory and refetched if you scroll back to it.
const MAX_MESSAGES = 300;
// Languages offered for a code snippet (display label only — execution is a later slice).
const CODE_LANGS = ["Python", "JavaScript", "TypeScript", "Java", "C++", "C", "Go", "Rust", "SQL", "Bash", "JSON", "HTML", "Plain text"];

// ── time helpers ─────────────────────────────────────────────────────────────
function ts(m: MessageData): number {
  return m.createdAtMs ?? Date.now();
}
function fmtTime(ms?: number | null): string {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function timeAgo(ms?: number | null): string {
  if (!ms) return "";
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
function sameDay(a?: number | null, b?: number | null): boolean {
  if (!a || !b) return false;
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}
function dateLabel(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((today - that) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// Resolve a stored media path to a full URL. Absolute (R2/CDN https), blob: (local optimistic preview),
// and data: URLs pass through untouched; only a backend-relative path (/uploads/x) gets the API base.
function mediaSrc(url: string): string {
  return /^(https?:|blob:|data:)/.test(url) ? url : config.apiBaseUrl + url;
}

// Per-peer theme cache (localStorage) so a themed thread paints with ITS theme on the very first frame
// — without it, settings load async and the thread flashes the default theme then snaps to the chosen
// one. Stale-while-revalidate: hydrate from cache instantly, then the server fetch reconciles.
const SETTINGS_CACHE_PREFIX = "coduel:dm-settings:";
function readCachedSettings(userId: number): ConversationSettingData | null {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_PREFIX + userId);
    return raw ? (JSON.parse(raw) as ConversationSettingData) : null;
  } catch {
    return null;
  }
}
function writeCachedSettings(userId: number, s: ConversationSettingData): void {
  try {
    localStorage.setItem(SETTINGS_CACHE_PREFIX + userId, JSON.stringify(s));
  } catch {
    // quota / disabled storage — caching is best-effort, the server fetch still themes it
  }
}

// Stable client-side id for an optimistic message — its React key never changes across the
// optimistic→sent swap, so the bubble updates in place (dim → solid) instead of remounting.
function newClientId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `c-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

// Monotonic counter for optimistic-message ids (negative) — a wall-clock -Date.now() collides on rapid
// multi-send, breaking id-keyed lookups; a counter never does.
let tempIdCounter = 0;

// Rating → tone, mirroring the Practice list so difficulty reads the same in the share picker.
function ratingTone(rating: number): string {
  if (rating < 1200) return "text-accent-2 border-accent-2/40";
  if (rating < 1800) return "text-gold border-gold/40";
  return "text-accent border-accent/40";
}

// A code snippet is runnable in the sandbox only for languages the execution engine supports.
function runnableLanguage(label: string | null): "PYTHON" | "CPP" | null {
  if (label === "Python") return "PYTHON";
  if (label === "C++") return "CPP";
  return null;
}

// Set (or clear, when emoji is null) one user's reaction in a message's reaction list — one per user.
function withReaction(reactions: ReactionData[], userId: number, emoji: string | null): ReactionData[] {
  const others = reactions.filter((r) => r.userId !== userId);
  return emoji ? [...others, { userId, emoji }] : others;
}

// Heuristic: does pasted text look like source code? (multi-line + indentation/braces/keywords, or a
// clear single-line code pattern). Used to auto-switch the composer to a code snippet on paste.
function looksLikeCode(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const lines = t.split("\n");
  const multiLine = lines.length >= 2;
  const indented = lines.some((l) => /^(\s{2,}|\t)/.test(l));
  const braces = /[{}]/.test(t) || /;\s*$/m.test(t);
  const keywords =
    /\b(def|class|function|const|let|var|import|from|public|private|static|void|return|for|while|if|else|elif|print|self|interface|struct)\b|=>|#include|std::|console\.log|System\.out/.test(t);
  if (multiLine && (indented || braces || keywords)) return true;
  if (keywords && (braces || t.includes("=>") || t.includes("("))) return true;
  return false;
}

// Best-effort language label for pasted code.
function detectCodeLang(text: string): string {
  if (/#include|std::|cout|cin|int\s+main\s*\(/.test(text)) return "C++";
  if (/\bpublic\s+class\b|System\.out|void\s+main/.test(text)) return "Java";
  if (/\b(const|let|var)\b|=>|console\.log|\bfunction\b/.test(text))
    return /:\s*(string|number|boolean|any)\b|\binterface\b/.test(text) ? "TypeScript" : "JavaScript";
  if (/\bdef\b|\bprint\(|\bimport\b|\belif\b|\bself\b/.test(text)) return "Python";
  if (/\bSELECT\b|\bFROM\b|\bWHERE\b/i.test(text)) return "SQL";
  if (/^\s*[[{]/.test(text) && /"\w+"\s*:/.test(text)) return "JSON";
  return "Plain text";
}

export function Messages() {
  const { userId: userIdParam } = useParams();
  const activeUserId = userIdParam ? Number(userIdParam) : null;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subscribe, publish, connected } = useStomp();
  const { setActiveDm, declinedChallenge } = useNotifications();
  const { isOnline } = usePresence();
  const me = user?.id ?? null;

  const [friends, setFriends] = useState<FriendData[]>([]);
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [messages, setMessages] = useState<MessageData[]>([]);
  // Windowed history pagination — load older (scroll up) / newer (scroll down) and trim the far side so
  // the in-memory window stays bounded. hasMoreNewer becomes true once we've trimmed the newest end.
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [hasMoreNewer, setHasMoreNewer] = useState(false);
  const loadingOlderRef = useRef(false); // synchronous re-entry guards (scroll fires faster than state)
  const loadingNewerRef = useRef(false);
  // Scroll anchor for keeping the viewport on the same message across a prepend/append/trim.
  const scrollAnchorRef = useRef<{ id: string; top: number } | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [query, setQuery] = useState("");
  // In-thread message search: the open search bar + its query + paginated results for THIS conversation.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [msgResults, setMsgResults] = useState<MessageSearchData[]>([]);
  const [msgPage, setMsgPage] = useState(0);
  const [msgTotalPages, setMsgTotalPages] = useState(0);
  const [msgSearching, setMsgSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchResultsRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);
  const [typing, setTyping] = useState(false);
  // Keep the typing bubble mounted briefly after typing stops so it can fade OUT instead of vanishing.
  const [typingMounted, setTypingMounted] = useState(false);
  const [typingShown, setTypingShown] = useState(false);
  // How far the OTHER person has read this thread (epoch ms) — drives the "Seen …" receipt, live.
  const [otherReadAt, setOtherReadAt] = useState<number | null>(null);
  // False until the first conversations fetch returns — drives the list/thread loaders so the empty
  // state ("start a conversation" / "no messages") never flashes before we know what's there.
  const [convLoaded, setConvLoaded] = useState(false);
  // The open thread's personalization (null while loading / no thread). Drives the per-DM theme,
  // background, bubble shape, font and nickname.
  const [settings, setSettings] = useState<ConversationSettingData | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  // messageId whose reaction picker is open (null = none); reactingOpen drives its in/out animation.
  const [reactingId, setReactingId] = useState<number | null>(null);
  const [reactingOpen, setReactingOpen] = useState(false);
  // The message being replied to (null = not replying), and the message briefly highlighted after a
  // "jump to original".
  const [replyingTo, setReplyingTo] = useState<MessageData | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  // The message being edited (null = composing a new one), and the message whose ••• actions menu is open.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [menuId, setMenuId] = useState<number | null>(null);
  // Code-snippet composer mode + the chosen language label.
  const [codeMode, setCodeMode] = useState(false);
  const [codeLang, setCodeLang] = useState("Python");
  // Voice notes: the recorded clip awaiting preview/send, and the recorder (mic permission + live meter).
  // The recorder delivers a finished clip via the callback — covers BOTH a manual stop and the 2-min
  // auto-stop, so a long recording is never lost.
  const [recordedVoice, setRecordedVoice] = useState<{ url: string; blob: Blob; durationMs: number } | null>(null);
  const [sendingVoice, setSendingVoice] = useState(false);
  const voice = useVoiceRecorder((clip) =>
    setRecordedVoice({ url: URL.createObjectURL(clip.blob), blob: clip.blob, durationMs: clip.durationMs }),
  );
  // Image upload in flight, the lightbox target, and the hidden file input.
  const [uploading, setUploading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  // Full emoji-library picker for the composer (insert any emoji into the message). emojiRendered is
  // sticky once opened (kept mounted so re-opening is instant + the close animates), emojiShown drives
  // the in/out transition on the already-rendered tree.
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiRendered, setEmojiRendered] = useState(false);
  const [emojiShown, setEmojiShown] = useState(false);
  const emojiPopupRef = useRef<HTMLDivElement>(null);
  const problemPickerScrollRef = useRef<HTMLDivElement>(null);
  // Share-a-problem composer popover + the problem list (loaded once, on first open).
  const [problemPickerOpen, setProblemPickerOpen] = useState(false);
  const [problemList, setProblemList] = useState<ProblemData[] | null>(null);
  const [problemQuery, setProblemQuery] = useState("");
  // A duel challenge launched from a shared-problem card: the card whose challenge is in flight, and a
  // card briefly flagged "declined" so the user can re-challenge.
  const [challengeMsgId, setChallengeMsgId] = useState<number | null>(null);
  const [declinedMsgId, setDeclinedMsgId] = useState<number | null>(null);
  // The id of the in-flight challenge launched from a card, so Cancel can actually withdraw it.
  const pendingChallengeIdRef = useRef<string | null>(null);
  // Run-from-chat: per-code-message sandbox output + which are running; runId → messageId correlation.
  const [runOutputs, setRunOutputs] = useState<Record<number, ExecutionData>>({});
  const [runningIds, setRunningIds] = useState<Set<number>>(new Set());
  const pendingRunsRef = useRef<Map<string, { messageId: number; convId: number | null }>>(new Map());
  const [menuOpen, setMenuOpen] = useState(false); // drives the menu's in/out animation while mounted
  // Composer attachment (reply preview / edit banner) kept mounted across close so it can animate OUT.
  const [heldAttach, setHeldAttach] = useState<{ kind: "edit" | "reply" | "code"; message: MessageData | null } | null>(null);
  const [attachShown, setAttachShown] = useState(false);
  // Shared pins for the open thread; heldPins keeps the last set mounted so the bar can animate OUT.
  const [pins, setPins] = useState<PinnedMessageData[]>([]);
  const [heldPins, setHeldPins] = useState<PinnedMessageData[]>([]);
  // Latest settings + a debounce timer, so dragging a slider doesn't fire a PUT per pixel.
  const settingsRef = useRef<ConversationSettingData | null>(null);
  settingsRef.current = settings;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The thread is keyed by the friend (userId); the conversation row (if any) gives its id + history.
  const activeConversationId = useMemo(
    () =>
      conversations.find((c) => c.otherUserId === activeUserId)
        ?.conversationId ?? null,
    [conversations, activeUserId],
  );
  const activeFriend = useMemo(
    () => friends.find((f) => f.userId === activeUserId) ?? null,
    [friends, activeUserId],
  );
  // The hover bar leads with your chosen quick-reaction (from the customize panel), then common ones.
  const barReactions = useMemo(() => {
    const quick = settings?.quickReactionEmoji ?? "🔥";
    return [quick, ...REACTION_OPTIONS.filter((e) => e !== quick)].slice(0, 5);
  }, [settings?.quickReactionEmoji]);
  const pinnedIds = useMemo(() => new Set(pins.map((p) => p.messageId)), [pins]);
  // Match the emoji picker chrome to the thread's effective theme (per-DM override, else the site theme).
  const darkThread =
    settings?.themeMode === "DARK" ||
    (settings?.themeMode !== "LIGHT" && document.documentElement.getAttribute("data-theme") === "dark");

  // What to call the other person here: your private nickname if set, else their display name.
  const peerName = settings?.nickname || activeFriend?.displayName || "Conversation";
  const peerInitial = (settings?.nickname || activeFriend?.displayName || "?")
    .charAt(0)
    .toUpperCase();
  const activeConvIdRef = useRef<number | null>(null);
  activeConvIdRef.current = activeConversationId;
  // Latest hasMoreNewer for use inside socket callbacks (which close over a stale render otherwise).
  const hasMoreNewerRef = useRef(false);
  hasMoreNewerRef.current = hasMoreNewer;
  const activeUserIdRef = useRef<number | null>(null);
  activeUserIdRef.current = activeUserId;

  // ── scroll plumbing ──
  const threadRef = useRef<HTMLDivElement>(null);
  const threadLenis = useRef<Lenis | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Was the user near the bottom just before the latest message? Drives auto-follow vs "stay put".
  const nearBottomRef = useRef(true);
  // True for the first messages render after a thread (re)loads → jump to the bottom instantly. Reset
  // after, so subsequent message appends only smooth-follow. Reliable even when reopening the SAME
  // thread (a plain id-compare missed that, causing a visible scroll-from-top on reopen).
  const freshLoadRef = useRef(false);
  // False until the thread has loaded + landed at the bottom — gates history prefetch so the open
  // sequence (Lenis briefly reporting scrollTop 0) can't spuriously pull older messages.
  const threadReadyRef = useRef(false);
  const isAnchoringRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Typing-indicator plumbing: throttle outgoing signals; auto-clear the incoming "typing…" after a pause.
  const lastTypingSentRef = useRef(0);
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Momentum smooth-scroll inside the panels (they sit in a data-lenis-prevent card, so the document
  // Lenis leaves them alone — these own their own wheel). Thread re-measures when the conversation swaps.
  useLenisBox(threadRef, [activeConversationId], threadLenis);
  useLenisBox(listRef, [conversations.length, friends.length, composeOpen]);
  // Momentum scroll for the in-thread search results dropdown.
  useLenisBox(searchResultsRef, [searchOpen, msgResults.length]);

  function scrollToLatest(immediate: boolean) {
    const w = threadRef.current;
    if (!w) return;
    const lenis = threadLenis.current;
    if (immediate) {
      // Land at the bottom with no visible travel (set native first so it's done before paint), then
      // align Lenis to the same spot so a subsequent wheel doesn't snap back up.
      w.scrollTop = w.scrollHeight;
      lenis?.resize();
      lenis?.scrollTo(w.scrollHeight, { immediate: true });
    } else if (lenis) {
      lenis.resize();
      lenis.scrollTo(w.scrollHeight);
    } else {
      w.scrollTop = w.scrollHeight;
    }
    nearBottomRef.current = true;
    setShowJump(false);
  }

  function onThreadScroll() {
    const w = threadRef.current;
    if (!w) return;
    if(isAnchoringRef.current) return;
    if (reactingId !== null) closeReact(); // a scroll dismisses an open reaction picker
    if (menuId !== null) closeMenu();
    const dist = w.scrollHeight - w.scrollTop - w.clientHeight;
    nearBottomRef.current = dist < 220;
    setShowJump(dist > 320 || hasMoreNewer); // also offer "jump to latest" while in a history window
    if (!threadReadyRef.current) return; // ignore the open-sequence scroll churn
    // Prefetch ~a screen ahead of either edge so windowed scrolling feels seamless.
    if (w.scrollTop < 600) loadOlder();
    if (dist < 600 && hasMoreNewer) loadNewer();
  }

  // Record the message at the top of the viewport + its screen position, so we can restore it after the
  // list mutates (prepend / append / trim) and the viewport stays put — no jump.
  function captureAnchor() {
    const w = threadRef.current;
    if (!w) return;
    const top = w.getBoundingClientRect().top;
    const nodes = w.querySelectorAll<HTMLElement>("[data-message-id]");
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      if (r.bottom > top + 8) {
        scrollAnchorRef.current = { id: el.dataset.messageId ?? "", top: r.top };
        return;
      }
    }
    scrollAnchorRef.current = null;
  }

  // Load the previous (older) page and prepend it; trim the newest end if the window overflows.
  function loadOlder() {
    const convId = activeConvIdRef.current;
    const oldest = messages[0];
    if (convId == null || loadingOlderRef.current || !hasMoreOlder || !oldest || oldest.messageId < 0) {
      return;
    }
    loadingOlderRef.current = true;
    chatApi
      .messages(convId, oldest.messageId, PAGE_SIZE)
      .then((page) => {
        if (activeConvIdRef.current !== convId) return; // thread switched mid-fetch — discard
        const older = [...page].reverse();
        if (older.length === 0) {
          setHasMoreOlder(false);
          return;
        }
        setHasMoreOlder(older.length >= PAGE_SIZE);
        captureAnchor();
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.messageId));
          let next = [...older.filter((m) => !seen.has(m.messageId)), ...prev];
          if (next.length > MAX_MESSAGES) {
            next = next.slice(0, MAX_MESSAGES); // drop the newest tail (far from view) — refetch on scroll-down
            setHasMoreNewer(true);
          }
          return next;
        });
      })
      .catch(() => {})
      .finally(() => {
        loadingOlderRef.current = false;
      });
  }

  // Load the next (newer) page and append it; trim the oldest end if the window overflows.
  function loadNewer() {
    const convId = activeConvIdRef.current;
    const newest = messages[messages.length - 1];
    if (convId == null || loadingNewerRef.current || !hasMoreNewer || !newest || newest.messageId < 0) {
      return;
    }
    loadingNewerRef.current = true;
    chatApi
      .messagesAfter(convId, newest.messageId, PAGE_SIZE)
      .then((newer) => {
        if (activeConvIdRef.current !== convId) return; // thread switched mid-fetch — discard
        if (newer.length === 0) {
          setHasMoreNewer(false);
          return;
        }
        setHasMoreNewer(newer.length >= PAGE_SIZE);
        captureAnchor();
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.messageId));
          let next = [...prev, ...newer.filter((m) => !seen.has(m.messageId))];
          if (next.length > MAX_MESSAGES) {
            next = next.slice(next.length - MAX_MESSAGES); // drop the oldest head — refetch on scroll-up
            setHasMoreOlder(true);
          }
          return next;
        });
      })
      .catch(() => {})
      .finally(() => {
        loadingNewerRef.current = false;
      });
  }

  const reloadConversations = () =>
    chatApi
      .conversations()
      .then(setConversations)
      .catch(() => {});

  // DMs are friends-only, so the thread header / contact name always resolves from the friends list.
  useEffect(() => {
    void reloadConversations().finally(() => setConvLoaded(true));
    void friendApi
      .list()
      .then(setFriends)
      .catch(() => {});
  }, []);

  // In-thread message search, debounced (≥2 chars), scoped to the open conversation. Resets to page 0
  // on every query change; only runs while the search bar is open.
  useEffect(() => {
    const q = searchQuery.trim();
    const convId = activeConversationId;
    if (!searchOpen || convId == null || q.length < 2) {
      setMsgResults([]);
      setMsgPage(0);
      setMsgTotalPages(0);
      setMsgSearching(false);
      return;
    }
    setMsgSearching(true);
    const t = setTimeout(() => {
      chatApi
        .searchMessages(q, convId, 0)
        .then((pageData) => {
          setMsgResults(pageData.content);
          setMsgPage(0);
          setMsgTotalPages(pageData.totalPages);
        })
        .catch(() => {
          setMsgResults([]);
          setMsgTotalPages(0);
        })
        .finally(() => setMsgSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, searchOpen, activeConversationId]);

  function loadMoreResults() {
    const q = searchQuery.trim();
    const convId = activeConversationId;
    const next = msgPage + 1;
    if (convId == null || q.length < 2 || next >= msgTotalPages || msgSearching) return;
    setMsgSearching(true);
    chatApi
      .searchMessages(q, convId, next)
      .then((pageData) => {
        setMsgResults((prev) => [...prev, ...pageData.content]);
        setMsgPage(next);
        setMsgTotalPages(pageData.totalPages);
      })
      .catch(() => {})
      .finally(() => setMsgSearching(false));
  }

  // Jump to a search hit: scroll+flash if it's already loaded, else load a window anchored at it.
  function handleJumpToMatch(messageId: number) {
    setSearchOpen(false);
    const convId = activeConvIdRef.current;
    if (messages.some((m) => m.messageId === messageId)) {
      requestAnimationFrame(() => scrollToMessage(messageId));
      return;
    }
    if (convId == null) return;
    chatApi
      .messages(convId, messageId + 1, PAGE_SIZE)
      .then((page) => {
        if (activeConvIdRef.current !== convId) return; // thread switched mid-fetch — discard
        setMessages([...page].reverse());
        setHasMoreOlder(page.length >= PAGE_SIZE);
        setHasMoreNewer(true); // there are newer messages after the match (loadNewer corrects if not)
        freshLoadRef.current = false;
        // double rAF: wait for the window to render before scrolling to the match
        requestAnimationFrame(() => requestAnimationFrame(() => scrollToMessage(messageId)));
      })
      .catch(() => {});
  }

  // Jump to latest — if we're in a history window (newer messages not loaded), reload the newest page
  // first; otherwise just smooth-scroll to the bottom of the loaded window.
  function jumpToLatest() {
    const convId = activeConvIdRef.current;
    if (hasMoreNewer && convId != null) {
      freshLoadRef.current = true;
      chatApi
        .messages(convId, undefined, PAGE_SIZE)
        .then((page) => {
          setMessages([...page].reverse());
          setHasMoreOlder(page.length >= PAGE_SIZE);
          setHasMoreNewer(false);
        })
        .catch(() => {});
    } else {
      scrollToLatest(false);
    }
  }

  // Tell the notification provider which thread is open, so it won't toast DMs we're already reading.
  useEffect(() => {
    setActiveDm(activeUserId);
    setTyping(false); // a fresh thread starts with no pending "typing…"
    return () => setActiveDm(null);
  }, [activeUserId, setActiveDm]);

  // Load this thread's personalization on open (the server returns defaults if never customized).
  // Hydrate from the per-peer cache FIRST so the thread paints with its own theme on frame one (no
  // default-theme flash), then fetch to reconcile (also picks up changes made on another device).
  useEffect(() => {
    setCustomizeOpen(false);
    if (activeUserId == null) {
      setSettings(null);
      return;
    }
    const peer = activeUserId;
    let live = true;
    setSettings(readCachedSettings(peer)); // cached theme instantly (null only on the first-ever open)
    chatApi
      .settings(peer)
      .then((s) => {
        if (!live) return;
        setSettings(s);
        writeCachedSettings(peer, s);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [activeUserId]);

  // Cancel any pending settings save when the page unmounts.
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  // Apply a settings change instantly (optimistic), then debounce a single PUT. The peerId is captured
  // at schedule time so a late-firing save always lands on the right thread even mid-switch. A saved
  // change refreshes the inbox so the row's nickname / accent / muted state stay in sync.
  function applySetting(partial: Partial<ConversationSettingData>) {
    const base = settingsRef.current;
    if (!base || activeUserId == null) return;
    const next = { ...base, ...partial };
    setSettings(next);
    settingsRef.current = next;
    const peer = activeUserId;
    writeCachedSettings(peer, next); // keep the cache fresh so the next open paints this theme instantly
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void chatApi.saveSettings(peer, next).then(reloadConversations).catch(() => {});
    }, 350);
  }

  // Seed how far the other person has read from the (already-loaded) conversation row when the thread
  // changes; live updates then arrive on /user/queue/chat-read.
  useEffect(() => {
    const conv = conversations.find((c) => c.conversationId === activeConversationId);
    setOtherReadAt(conv?.otherLastReadAtMs ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);

  // Recovery path: a live receipt can be missed if the socket blipped (the broker has no replay), so
  // also advance from any conversation refresh — never regressing (max), so it self-heals.
  useEffect(() => {
    const conv = conversations.find((c) => c.conversationId === activeConversationId);
    if (conv?.otherLastReadAtMs != null) {
      const seen = conv.otherLastReadAtMs;
      setOtherReadAt((prev) => Math.max(prev ?? 0, seen));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations]);

  // Live read receipts: the other person read this thread → advance how far they've read ("Seen …").
  useEffect(() => {
    return subscribe("/user/queue/chat-read", (body) => {
      try {
        const r = JSON.parse(body) as ReadReceiptData;
        if (r.conversationId === activeConvIdRef.current) {
          setOtherReadAt((prev) => Math.max(prev ?? 0, r.readAtMs));
        }
      } catch {
        // ignore malformed frames
      }
    });
  }, [subscribe]);

  // Load the thread when the selected conversation changes (API returns newest-first → chronological).
  // Clear first so we never flash the previous thread while the new one loads.
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      setPins([]);
      return;
    }
    const convId = activeConversationId;
    setLoadingThread(true);
    setMessages([]);
    setReactingId(null);
    setReactingOpen(false);
    setReplyingTo(null);
    setEditingId(null);
    setMenuId(null);
    setMenuOpen(false);
    setCodeMode(false);
    setEmojiOpen(false);
    setProblemPickerOpen(false);
    setChallengeMsgId(null);
    setDeclinedMsgId(null);
    setSearchOpen(false);
    setSearchQuery("");
    // Reset windowed pagination for the new thread.
    setHasMoreOlder(false);
    setHasMoreNewer(false);
    loadingOlderRef.current = false;
    loadingNewerRef.current = false;
    scrollAnchorRef.current = null;
    threadReadyRef.current = false; // re-armed after the new thread lands at the bottom
    // Abandon any in-progress / unsent voice recording when switching threads.
    voice.cancel();
    setRecordedVoice((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setPins([]);
    freshLoadRef.current = true; // the next non-empty messages render is a fresh thread → instant jump
    reloadPins(convId); // shared pins load alongside the thread
    chatApi
      .messages(convId, undefined, PAGE_SIZE)
      .then((page) => {
        setMessages([...page].reverse());
        setHasMoreOlder(page.length >= PAGE_SIZE); // a full page → older history likely exists
        setHasMoreNewer(false); // opening lands at the latest — nothing newer to load
      })
      .catch(() => setMessages([]))
      .finally(() => {
        setLoadingThread(false);
        // We're now reading this thread → persist the read marker and refresh the inbox so its
        // unread badge clears (and stays cleared after leaving and re-entering).
        void chatApi
          .markRead(convId)
          .then(reloadConversations)
          .catch(() => {});
      });
  }, [activeConversationId]);

  // Live receive on the shared socket: append to the open thread + refresh the inbox order/preview.
  useEffect(() => {
    return subscribe("/user/queue/dm", (body) => {
      try {
        const msg = JSON.parse(body) as MessageData;
        if (
          activeConvIdRef.current &&
          msg.conversationId === activeConvIdRef.current &&
          !hasMoreNewerRef.current // if scrolled up in a history window, don't append out of context
        ) {
          setMessages((prev) => [...prev, msg]);
          setTyping(false); // their message landed — they're no longer typing
          // We're looking at this thread, so it's read on arrival — mark it, then refresh the inbox.
          void chatApi
            .markRead(activeConvIdRef.current)
            .then(reloadConversations)
            .catch(() => {});
        } else {
          void reloadConversations();
        }
      } catch {
        // ignore malformed frames
      }
    });
  }, [subscribe]);

  // Live "typing…" from the friend whose thread is open (auto-clears if they pause sending signals).
  useEffect(() => {
    return subscribe("/user/queue/typing", (body) => {
      try {
        const t = JSON.parse(body) as TypingData;
        if (t.fromUserId === activeUserIdRef.current) {
          setTyping(true);
          if (typingClearRef.current) clearTimeout(typingClearRef.current);
          typingClearRef.current = setTimeout(() => setTyping(false), 3500);
        }
      } catch {
        // ignore malformed frames
      }
    });
  }, [subscribe]);

  // Live reactions from the peer on the currently-open thread.
  useEffect(() => {
    return subscribe("/user/queue/dm-reaction", (body) => {
      try {
        const e = JSON.parse(body) as ReactionEventData;
        if (e.conversationId !== activeConvIdRef.current) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.messageId === e.messageId
              ? { ...m, reactions: withReaction(m.reactions, e.userId, e.removed ? null : e.emoji) }
              : m,
          ),
        );
      } catch {
        // ignore malformed frames
      }
    });
  }, [subscribe]);

  // Live edits/deletes from the peer — merge into the existing message (keeps reactions + quote).
  useEffect(() => {
    return subscribe("/user/queue/dm-update", (body) => {
      try {
        const u = JSON.parse(body) as MessageUpdateData;
        if (u.conversationId !== activeConvIdRef.current) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.messageId === u.messageId
              ? {
                  ...m,
                  body: u.body,
                  editedAtMs: u.editedAtMs,
                  deleted: u.deleted,
                  ...(u.deleted ? { reactions: [], replyTo: null, replyToId: null } : {}),
                }
              : m,
          ),
        );
      } catch {
        // ignore malformed frames
      }
    });
  }, [subscribe]);

  // Live pins from the peer (shared per conversation).
  useEffect(() => {
    return subscribe("/user/queue/dm-pin", (body) => {
      try {
        const e = JSON.parse(body) as PinEventData;
        if (e.conversationId !== activeConvIdRef.current) return;
        setPins((prev) => {
          if (e.pinned && e.pin) {
            return prev.some((p) => p.messageId === e.messageId) ? prev : [e.pin, ...prev];
          }
          return prev.filter((p) => p.messageId !== e.messageId);
        });
      } catch {
        // ignore malformed frames
      }
    });
  }, [subscribe]);

  // Live run-from-chat results: correlate by runId → the code message that requested the run.
  useEffect(() => {
    return subscribe("/user/queue/run-result", (body) => {
      try {
        const data = JSON.parse(body) as ExecutionData;
        if (!data.runId) return;
        const pending = pendingRunsRef.current.get(data.runId);
        if (pending === undefined) return;
        pendingRunsRef.current.delete(data.runId);
        // Drop a result that belongs to a thread we've since left — it must not paint onto the open one.
        if (pending.convId !== activeConvIdRef.current) return;
        const messageId = pending.messageId;
        setRunOutputs((prev) => ({ ...prev, [messageId]: data }));
        setRunningIds((prev) => {
          const next = new Set(prev);
          next.delete(messageId);
          return next;
        });
      } catch {
        // ignore malformed frames
      }
    });
  }, [subscribe]);

  // Reconnect re-sync: /user/queue/* has no replay, so a DM / reaction / pin that arrived while the
  // socket was briefly down is missed live. On a genuine re-connect, re-fetch the open thread (messages
  // carry their reactions) + its pins so it self-heals — without a fresh-load jump, so scroll is kept.
  const hadConnectedRef = useRef(false);
  useEffect(() => {
    if (!connected) return;
    if (hadConnectedRef.current) {
      const convId = activeConvIdRef.current;
      if (convId) {
        // Re-sync to the latest page (a reconnect re-anchors the window at the newest messages).
        void chatApi
          .messages(convId, undefined, PAGE_SIZE)
          .then((page) => {
            setMessages([...page].reverse());
            setHasMoreOlder(page.length >= PAGE_SIZE);
            setHasMoreNewer(false);
          })
          .catch(() => {});
        reloadPins(convId);
      }
    }
    hadConnectedRef.current = true;
  }, [connected]);

  // Dismiss the reaction picker on any click outside a reaction control (trigger or the picker itself).
  useEffect(() => {
    if (reactingId === null) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element).closest("[data-reaction-ui]")) closeReact();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [reactingId]);

  // Dismiss the composer emoji picker on any click outside it.
  useEffect(() => {
    if (!emojiOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element).closest("[data-emoji-ui]")) setEmojiOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [emojiOpen]);

  // Ease the emoji picker in AND out. Keep it mounted once opened so re-opening is instant and the
  // exit animates. A double rAF lets the collapsed "from" state paint first (the picker's render is
  // heavy — a single frame gets skipped and the open looks instant), so the transition actually runs.
  useEffect(() => {
    if (emojiOpen) {
      setEmojiRendered(true);
      let r2 = 0;
      const r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => setEmojiShown(true));
      });
      return () => {
        cancelAnimationFrame(r1);
        cancelAnimationFrame(r2);
      };
    }
    setEmojiShown(false); // stays mounted (emojiRendered) so the close transition plays
  }, [emojiOpen]);

  // Momentum smooth-scroll for the emoji list — the library's own `.epr-body` scroller, given the same
  // eased feel as every other panel. Attaches once the picker has rendered its body (retry a few frames
  // since it mounts a tick after emojiRendered flips). prevent:()=>false so it owns the wheel.
  useEffect(() => {
    if (!emojiRendered) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let lenis: Lenis | null = null;
    let frame = 0;
    let tries = 0;
    const attach = () => {
      const body = emojiPopupRef.current?.querySelector(".epr-body") as HTMLElement | null;
      if (!body) {
        if (tries++ < 40) frame = requestAnimationFrame(attach);
        return;
      }
      lenis = new Lenis({
        wrapper: body,
        content: body,
        lerp: 0.14,
        wheelMultiplier: 1,
        smoothWheel: true,
        prevent: () => false,
      });
      const raf = (time: number) => {
        lenis?.raf(time);
        frame = requestAnimationFrame(raf);
      };
      frame = requestAnimationFrame(raf);
    };
    attach();
    return () => {
      cancelAnimationFrame(frame);
      lenis?.destroy();
    };
  }, [emojiRendered]);

  // Load the problem catalogue the first time the share picker opens (cached after); seed the shared
  // problem cache so cards built from it render with no round-trip. Dismiss on outside-click / Escape.
  useEffect(() => {
    if (!problemPickerOpen) return;
    if (problemList === null) {
      void problemApi
        .getPage({ size: 100, sort: "rating-asc" })
        .then((page) => {
          setProblemList(page.content);
          seedProblems(page.content);
        })
        .catch(() => setProblemList([]));
    }
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element).closest("[data-problem-ui]")) setProblemPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setProblemPickerOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [problemPickerOpen, problemList]);

  // A challenge launched from a problem card was declined (live) → flag that card so it offers a
  // re-challenge, and drop the waiting state. Keyed to the peer of this thread.
  useEffect(() => {
    if (challengeMsgId == null || !declinedChallenge) return;
    if (declinedChallenge.userId === activeUserIdRef.current) {
      setDeclinedMsgId(challengeMsgId);
      setChallengeMsgId(null);
    }
    // Only react to a fresh decline signal — challengeMsgId is read at that moment, not a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [declinedChallenge]);

  // A sent challenge self-expires (~90s) if unanswered — mirror that so a card doesn't wait forever.
  useEffect(() => {
    if (challengeMsgId == null) return;
    const id = challengeMsgId;
    const t = setTimeout(() => {
      setDeclinedMsgId(id);
      setChallengeMsgId((cur) => (cur === id ? null : cur));
    }, 95_000);
    return () => clearTimeout(t);
  }, [challengeMsgId]);

  // Clear a card's "declined" flag after a few seconds so it returns to its normal state.
  useEffect(() => {
    if (declinedMsgId == null) return;
    const t = setTimeout(() => setDeclinedMsgId(null), 6000);
    return () => clearTimeout(t);
  }, [declinedMsgId]);

  // Close the image lightbox on Escape.
  useEffect(() => {
    if (!lightboxUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxUrl(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightboxUrl]);

  // Dismiss the message ••• menu on any click outside it (animates out via closeMenu).
  useEffect(() => {
    if (menuId === null) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element).closest("[data-msg-menu]")) closeMenu();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuId]);

  // Drive the composer attachment (reply preview / edit banner) in/out: capture content on open, keep it
  // mounted through the close so it can animate OUT (grid-rows collapse + fade), then clear.
  useEffect(() => {
    const next: { kind: "edit" | "reply" | "code"; message: MessageData | null } | null =
      codeMode
        ? { kind: "code", message: null }
        : editingId !== null
          ? { kind: "edit", message: null }
          : replyingTo
            ? { kind: "reply", message: replyingTo }
            : null;
    if (next) {
      setHeldAttach(next);
      const r = requestAnimationFrame(() => setAttachShown(true));
      return () => cancelAnimationFrame(r);
    }
    setAttachShown(false);
    const t = setTimeout(() => setHeldAttach(null), 280);
    return () => clearTimeout(t);
  }, [codeMode, editingId, replyingTo]);

  // Keep the pin bar mounted through its close so it can animate OUT (then clear the held copy).
  useEffect(() => {
    if (pins.length > 0) {
      setHeldPins(pins);
      return;
    }
    const t = setTimeout(() => setHeldPins([]), 300);
    return () => clearTimeout(t);
  }, [pins]);

  // Scroll discipline: opening a thread lands at the latest with NO animation; a new message in the
  // open thread eases down only if you were already at the bottom (so reading history isn't yanked).
  // useLayoutEffect → runs before paint, so the thread never flashes at the top first.
  useLayoutEffect(() => {
    if (messages.length === 0) return;
    const w = threadRef.current;
    // Just paged history (prepend / append / trim) → keep the anchored message at the same screen
    // position. Takes precedence over the fresh-load / follow-bottom behaviour below.
    if (scrollAnchorRef.current && w) {
      const a = scrollAnchorRef.current;
      scrollAnchorRef.current = null;
      const el = w.querySelector<HTMLElement>(`[data-message-id="${a.id}"]`);
      if (el) {
        const delta = el.getBoundingClientRect().top - a.top;
        if (delta !== 0) {
          const lenis = threadLenis.current;
          const target = w.scrollTop + delta;
          isAnchoringRef.current = true;
          lenis?.stop();
          lenis?.resize();
          w.scrollTop = target;
          lenis?.scrollTo(target, {
            immediate: true,
            force: true,
          });
          requestAnimationFrame(() => {
            lenis?.start();
            isAnchoringRef.current = false;})
        }

      }
      return;
    }
    if (freshLoadRef.current) {
      freshLoadRef.current = false;
      scrollToLatest(true); // fresh thread (open or reopen) → instant jump, no visible scroll
      // Enable history prefetch only after we've settled at the bottom (next frame), so the open
      // sequence doesn't trip loadOlder.
      requestAnimationFrame(() => {
        threadReadyRef.current = true;
      });
    } else if (nearBottomRef.current) {
      scrollToLatest(false); // a new message in the open thread → smooth follow
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // Reveal the typing bubble once its open animation has settled (only if you're at the bottom) — an
  // ease-down, not a jump. The collapse on stop is animated too (grid-rows), so neither is harsh.
  useEffect(() => {
    if (!typing || !nearBottomRef.current) return;
    const t = setTimeout(() => scrollToLatest(false), 210);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typing]);

  // Enter/exit choreography for the typing bubble: fade in when it appears, and stay mounted for a
  // beat after typing stops so it can fade OUT (React would otherwise unmount it instantly).
  useEffect(() => {
    if (typing) {
      setTypingMounted(true);
      const r = requestAnimationFrame(() => setTypingShown(true));
      return () => cancelAnimationFrame(r);
    }
    setTypingShown(false);
    const t = setTimeout(() => setTypingMounted(false), 220);
    return () => clearTimeout(t);
  }, [typing]);

  async function handleSend() {
    const text = input.trim();
    if (!text || activeUserId == null || sending) return;

    // Edit mode: PATCH the existing message instead of sending a new one (optimistic; revert on failure).
    if (editingId !== null) {
      const id = editingId;
      const before = messages.find((m) => m.messageId === id);
      setEditingId(null);
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      setMessages((prev) =>
        prev.map((m) => (m.messageId === id ? { ...m, body: text, editedAtMs: Date.now() } : m)),
      );
      try {
        await chatApi.edit(id, text);
        void reloadConversations();
      } catch {
        if (before) setMessages((prev) => prev.map((m) => (m.messageId === id ? before : m)));
      }
      return;
    }

    // Snappy + optimistic: clear the box and show the message immediately, then reconcile with the
    // server's saved copy (for the sender, a DM comes back on the HTTP response, not the socket).
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    const replyTarget = replyingTo;
    const isCode = codeMode;
    setReplyingTo(null);
    setCodeMode(false);
    const tempId = -(++tempIdCounter);
    const clientId = newClientId();
    const optimistic: MessageData = {
      messageId: tempId,
      conversationId: activeConversationId ?? 0,
      senderId: me ?? 0,
      body: text,
      createdAtMs: Date.now(),
      reactions: [],
      replyToId: replyTarget?.messageId ?? null,
      replyTo: replyTarget
        ? { messageId: replyTarget.messageId, senderId: replyTarget.senderId, preview: replyTarget.body.slice(0, 140), kind: replyTarget.kind }
        : null,
      editedAtMs: null,
      deleted: false,
      kind: isCode ? "CODE" : "TEXT",
      codeLanguage: isCode ? codeLang : null,
      attachmentUrl: null,
      sharedRef: null,
      durationMs: null,
      clientId,
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    nearBottomRef.current = true;
    setSending(true);
    try {
      const msg = await chatApi.send(activeUserId, text, {
        replyToId: replyTarget?.messageId ?? null,
        kind: isCode ? "CODE" : "TEXT",
        codeLanguage: isCode ? codeLang : null,
      });
      // Update in place (keep clientId → same key → no remount); pending clears → dim fades to solid.
      setMessages((prev) => prev.map((m) => (m.clientId === clientId ? { ...msg, clientId } : m)));
      void reloadConversations();
    } catch {
      // send failed — drop the optimistic bubble, restore the text + reply/code context so nothing is lost
      setMessages((prev) => prev.filter((m) => m.clientId !== clientId));
      setInput(text);
      setReplyingTo(replyTarget);
      if (isCode) setCodeMode(true);
    } finally {
      setSending(false);
    }
  }

  // Toggle my reaction on a message: same emoji as mine → clear it, otherwise set it. Optimistic, then
  // the server pushes the authoritative change to the peer (and a failure reconciles from the server).
  function handleReact(message: MessageData, emoji: string) {
    closeReact();
    if (me == null || message.messageId < 0) return; // can't react to an unsent (optimistic) message
    const mineNow = message.reactions.find((r) => r.userId === me)?.emoji;
    const removing = mineNow === emoji;
    const messageId = message.messageId;
    setMessages((prev) =>
      prev.map((m) =>
        m.messageId === messageId
          ? { ...m, reactions: withReaction(m.reactions, me, removing ? null : emoji) }
          : m,
      ),
    );
    const call = removing ? chatApi.unreact(messageId) : chatApi.react(messageId, emoji);
    void call.catch(() => {
      // Reconcile on failure. A full-page refetch is only safe when pinned to the latest page — inside a
      // history window it would discard the loaded older/newer window, so just revert the change in place.
      const convId = activeConvIdRef.current;
      if (convId && !hasMoreNewerRef.current) {
        void chatApi
          .messages(convId)
          .then((page) => setMessages([...page].reverse()))
          .catch(() => {});
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.messageId === messageId
              ? { ...m, reactions: withReaction(m.reactions, me, mineNow ?? null) }
              : m,
          ),
        );
      }
    });
  }

  // Start replying to a message — close any reaction picker and focus the composer.
  function startReply(message: MessageData) {
    setReactingId(null);
    setCodeMode(false);
    setEditingId(null);
    setReplyingTo(message);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  // Toggle the code-snippet composer (mutually exclusive with reply/edit); focus the input.
  function startCode() {
    setReactingId(null);
    setReplyingTo(null);
    setEditingId(null);
    setCodeMode((c) => !c);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  // Jump to (and briefly highlight) a quoted message. Uses the thread's Lenis instance so it eases like
  // the rest of the scrolling; no-op if the original is older than the loaded page.
  function scrollToMessage(id: number) {
    const el = threadRef.current?.querySelector(`[data-message-id="${id}"]`) as HTMLElement | null;
    if (!el) return;
    const lenis = threadLenis.current;
    if (lenis) lenis.scrollTo(el, { offset: -120 });
    else el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashId(id);
    setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1100);
  }

  // The reaction picker, mounted-then-animated so it eases both in and out.
  function openReact(id: number) {
    setReactingId(id);
    requestAnimationFrame(() => setReactingOpen(true));
  }
  function closeReact() {
    setReactingOpen(false);
    setTimeout(() => setReactingId(null), 150);
  }

  // The ••• actions menu, mounted-then-animated so it eases both in and out.
  function openMenu(id: number) {
    setMenuId(id);
    requestAnimationFrame(() => setMenuOpen(true));
  }
  function closeMenu() {
    setMenuOpen(false);
    setTimeout(() => setMenuId(null), 160);
  }

  // Begin editing one of my messages: close the menu/reply, load its text into the composer, focus end.
  function startEdit(message: MessageData) {
    closeMenu();
    setReplyingTo(null);
    setCodeMode(false);
    setEditingId(message.messageId);
    setInput(message.body);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  // Soft-delete my message: optimistic tombstone, revert if the server rejects it.
  function handleDelete(message: MessageData) {
    closeMenu();
    const id = message.messageId;
    setMessages((prev) =>
      prev.map((m) =>
        m.messageId === id ? { ...m, deleted: true, body: "", reactions: [], replyTo: null } : m,
      ),
    );
    void chatApi
      .deleteMessage(id)
      .then(reloadConversations)
      .catch(() => setMessages((prev) => prev.map((m) => (m.messageId === id ? message : m))));
  }

  function reloadPins(convId: number | null) {
    if (!convId) {
      setPins([]);
      return;
    }
    void chatApi.pins(convId).then(setPins).catch(() => {});
  }

  // Pin / unpin (shared per conversation) — optimistic, reconcile from the server on failure.
  function handlePin(message: MessageData) {
    closeMenu();
    const id = message.messageId;
    // Match the server: carry the kind (the bar renders an icon + label). Only TEXT shows its body;
    // image uses its caption, code/problem-share render an icon + label with no body.
    const preview =
      message.kind === "TEXT" ? message.body.slice(0, 140) : message.kind === "IMAGE" ? message.body.trim() : "";
    setPins((prev) =>
      prev.some((p) => p.messageId === id)
        ? prev
        : [
            { messageId: id, senderId: message.senderId, preview, pinnedByUserId: me ?? 0, kind: message.kind },
            ...prev,
          ],
    );
    void chatApi.pin(id).catch(() => reloadPins(activeConvIdRef.current));
  }

  function handleUnpin(messageId: number) {
    closeMenu();
    setPins((prev) => prev.filter((p) => p.messageId !== messageId));
    void chatApi.unpin(messageId).catch(() => reloadPins(activeConvIdRef.current));
  }

  // People paste code rather than type it — auto-switch a fresh, empty composer into code mode when the
  // pasted content looks like source. The code banner then lets you cancel (×) or change the language.
  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (codeMode || editingId !== null || input.trim() !== "") return;
    const pasted = e.clipboardData.getData("text");
    if (looksLikeCode(pasted)) {
      setReplyingTo(null);
      setCodeLang(detectCodeLang(pasted));
      setCodeMode(true);
    }
  }

  // Pick → show the image INSTANTLY from a local blob preview, then upload + send in the background and
  // swap in the stored copy. The bubble appears immediately instead of waiting on the (slower) upload.
  async function handleImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-picking the same file fires onChange again
    if (!file || activeUserId == null) return;
    const replyTarget = replyingTo;
    setReplyingTo(null);
    setCodeMode(false);
    const caption = input.trim();
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    const previewUrl = URL.createObjectURL(file); // local, instant — no round-trip
    const tempId = -(++tempIdCounter);
    const clientId = newClientId();
    const optimistic: MessageData = {
      messageId: tempId,
      conversationId: activeConversationId ?? 0,
      senderId: me ?? 0,
      body: caption,
      createdAtMs: Date.now(),
      reactions: [],
      replyToId: replyTarget?.messageId ?? null,
      replyTo: replyTarget
        ? { messageId: replyTarget.messageId, senderId: replyTarget.senderId, preview: replyTarget.body.slice(0, 140), kind: replyTarget.kind }
        : null,
      editedAtMs: null,
      deleted: false,
      kind: "IMAGE",
      codeLanguage: null,
      attachmentUrl: previewUrl,
      sharedRef: null,
      durationMs: null,
      clientId,
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    nearBottomRef.current = true;
    setUploading(true);
    try {
      const { url } = await chatApi.uploadImage(file);
      const msg = await chatApi.send(activeUserId, caption, {
        replyToId: replyTarget?.messageId ?? null,
        kind: "IMAGE",
        attachmentUrl: url,
      });
      // Keep the local blob URL on the confirmed message so the image doesn't re-fetch/flash on swap.
      setMessages((prev) =>
        prev.map((m) => (m.clientId === clientId ? { ...msg, clientId, attachmentUrl: previewUrl } : m)),
      );
      void reloadConversations();
    } catch {
      // upload/send failed — drop the optimistic bubble and restore the caption + reply context
      setMessages((prev) => prev.filter((m) => m.clientId !== clientId));
      URL.revokeObjectURL(previewUrl);
      setInput(caption);
      setReplyingTo(replyTarget);
    } finally {
      setUploading(false);
    }
  }

  // ── voice notes ──
  function startRecording() {
    if (recordedVoice || voice.recording) return;
    setReplyingTo(null);
    setCodeMode(false);
    void voice.start();
  }

  function discardVoice() {
    if (recordedVoice) URL.revokeObjectURL(recordedVoice.url);
    setRecordedVoice(null);
  }

  // Discard the current take and immediately start a fresh recording (tapping the mic during preview).
  function reRecord() {
    if (recordedVoice) URL.revokeObjectURL(recordedVoice.url);
    setRecordedVoice(null);
    void voice.start();
  }

  // Send the previewed clip: optimistic bubble from the local blob, upload + send in the background.
  async function sendVoice() {
    if (!recordedVoice || activeUserId == null || sendingVoice) return;
    const clip = recordedVoice;
    setRecordedVoice(null);
    const tempId = -(++tempIdCounter);
    const clientId = newClientId();
    const optimistic: MessageData = {
      messageId: tempId,
      conversationId: activeConversationId ?? 0,
      senderId: me ?? 0,
      body: "",
      createdAtMs: Date.now(),
      reactions: [],
      replyToId: null,
      replyTo: null,
      editedAtMs: null,
      deleted: false,
      kind: "VOICE",
      codeLanguage: null,
      attachmentUrl: clip.url,
      sharedRef: null,
      durationMs: clip.durationMs,
      clientId,
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    nearBottomRef.current = true;
    setSendingVoice(true);
    try {
      const { url } = await chatApi.uploadAudio(clip.blob);
      const msg = await chatApi.send(activeUserId, "", {
        kind: "VOICE",
        attachmentUrl: url,
        durationMs: clip.durationMs,
      });
      // Keep the local blob URL so playback doesn't re-fetch/flash on the swap (in place — same key).
      setMessages((prev) =>
        prev.map((m) => (m.clientId === clientId ? { ...msg, clientId, attachmentUrl: clip.url } : m)),
      );
      void reloadConversations();
    } catch {
      // Send failed — drop the optimistic bubble but KEEP the clip (fresh url) so the user can retry.
      setMessages((prev) => prev.filter((m) => m.clientId !== clientId));
      URL.revokeObjectURL(clip.url);
      setRecordedVoice({ url: URL.createObjectURL(clip.blob), blob: clip.blob, durationMs: clip.durationMs });
    } finally {
      setSendingVoice(false);
    }
  }

  // Insert an emoji from the picker at the textarea caret (keeps multi-insert + cursor position).
  // Selection is read live from the (stable) ref; the text is updated functionally so a stale closure
  // — the picker stays mounted and memoizes onEmojiClick from an earlier render — can't clobber text
  // typed since it mounted (the cause of the "emoji wipes my message" bug).
  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? null;
    const end = el?.selectionEnd ?? null;
    setInput((prev) => {
      const s = start ?? prev.length;
      const e = end ?? prev.length;
      return prev.slice(0, s) + emoji + prev.slice(e);
    });
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      const pos = start != null ? start + emoji.length : node.value.length;
      node.setSelectionRange(pos, pos);
      node.style.height = "auto";
      node.style.height = `${Math.min(node.scrollHeight, 132)}px`;
    });
  }

  // Clear a code message's run output (the user dismissing the output panel).
  function clearRunOutput(id: number) {
    setRunOutputs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  // Run a code snippet in the sandbox (Python/C++ only), feeding it the given stdin — output streams
  // back to the card via run-result.
  function handleRunCode(message: MessageData, stdin: string) {
    const lang = runnableLanguage(message.codeLanguage);
    if (!lang || message.messageId < 0 || runningIds.has(message.messageId)) return;
    const id = message.messageId;
    setRunningIds((prev) => new Set(prev).add(id));
    setRunOutputs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    const fail = (msg: string) => {
      setRunningIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
      setRunOutputs((prev) => ({ ...prev, [id]: { stderr: msg, durationMs: 0 } as unknown as ExecutionData }));
    };
    executionApi
      .execute({ language: lang, code: message.body, testCases: [{ input: stdin, expectedOutput: "" }] })
      .then(({ runId }) => {
        pendingRunsRef.current.set(runId, { messageId: id, convId: activeConvIdRef.current });
        setTimeout(() => {
          if (pendingRunsRef.current.has(runId)) {
            pendingRunsRef.current.delete(runId);
            fail("Run timed out — try again.");
          }
        }, 20000);
      })
      .catch(() => fail("Run failed."));
  }

  // Share a problem into the thread as a PROBLEM_SHARE card (optimistic). Any typed text rides along
  // as a caption. Mirrors the image-send flow (no upload step).
  async function handleShareProblem(slug: string) {
    if (activeUserId == null || sending) return;
    setProblemPickerOpen(false);
    setProblemQuery("");
    const replyTarget = replyingTo;
    setReplyingTo(null);
    setCodeMode(false);
    const caption = input.trim();
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    const tempId = -(++tempIdCounter);
    const clientId = newClientId();
    const optimistic: MessageData = {
      messageId: tempId,
      conversationId: activeConversationId ?? 0,
      senderId: me ?? 0,
      body: caption,
      createdAtMs: Date.now(),
      reactions: [],
      replyToId: replyTarget?.messageId ?? null,
      replyTo: replyTarget
        ? { messageId: replyTarget.messageId, senderId: replyTarget.senderId, preview: replyTarget.body.slice(0, 140), kind: replyTarget.kind }
        : null,
      editedAtMs: null,
      deleted: false,
      kind: "PROBLEM_SHARE",
      codeLanguage: null,
      attachmentUrl: null,
      sharedRef: slug,
      durationMs: null,
      clientId,
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    nearBottomRef.current = true;
    setSending(true);
    try {
      const msg = await chatApi.send(activeUserId, caption, {
        replyToId: replyTarget?.messageId ?? null,
        kind: "PROBLEM_SHARE",
        sharedRef: slug,
      });
      setMessages((prev) => prev.map((m) => (m.clientId === clientId ? { ...msg, clientId } : m)));
      void reloadConversations();
    } catch {
      setMessages((prev) => prev.filter((m) => m.clientId !== clientId));
      setInput(caption);
      setReplyingTo(replyTarget);
    } finally {
      setSending(false);
    }
  }

  // Launch a duel on a shared problem (either participant can). Fires a problem-specific challenge to
  // the peer; the card shows "waiting…" until they accept (global nav into the duel) or decline.
  async function handleCardChallenge(message: MessageData) {
    if (activeUserId == null || !message.sharedRef) return;
    setDeclinedMsgId(null);
    setChallengeMsgId(message.messageId);
    pendingChallengeIdRef.current = null;
    try {
      const res = await challengeApi.create(activeUserId, message.sharedRef);
      pendingChallengeIdRef.current = res.challengeId;
    } catch {
      setChallengeMsgId((cur) => (cur === message.messageId ? null : cur));
    }
  }

  // Cancel a pending card challenge — actually withdraw it so the friend can no longer accept it.
  function handleCancelChallenge() {
    const id = pendingChallengeIdRef.current;
    pendingChallengeIdRef.current = null;
    setChallengeMsgId(null);
    if (id && activeUserId != null) void challengeApi.cancel(id, activeUserId).catch(() => {});
  }

  function autoGrow(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
    // Let the friend know we're typing — throttled to at most one signal every ~1.8s. NOT while editing:
    // an edit happens in place, so a "typing…" cue (which implies an incoming new message) is misleading.
    if (activeUserId != null && editingId === null) {
      const now = Date.now();
      if (now - lastTypingSentRef.current > 1800) {
        lastTypingSentRef.current = now;
        publish("/app/chat/dm/typing", String(activeUserId));
      }
    }
  }

  const filteredConversations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        (c.otherDisplayName ?? "").toLowerCase().includes(q) ||
        (c.nickname ?? "").toLowerCase().includes(q),
    );
  }, [conversations, query]);

  const filteredProblems = useMemo(() => {
    const q = problemQuery.trim().toLowerCase();
    const all = problemList ?? [];
    if (!q) return all;
    return all.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.tags ?? []).some((t) => t.toLowerCase().includes(q)),
    );
  }, [problemList, problemQuery]);

  // Momentum scroll for the composer's "share a problem" picker (re-measures as the result count changes).
  useLenisBox(problemPickerScrollRef, [problemPickerOpen, filteredProblems.length]);

  const composableFriends = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Only friends you DON'T already have a thread with — existing conversations are in the list above.
    const existing = new Set(conversations.map((c) => c.otherUserId));
    return friends.filter(
      (f) => !existing.has(f.userId) && (!q || (f.displayName ?? "").toLowerCase().includes(q)),
    );
  }, [friends, conversations, query]);

  function startConversation(userId: number) {
    setComposeOpen(false);
    setQuery("");
    navigate(`/messages/${userId}`);
  }

  // A friend you don't have a thread with yet — tapping it opens a fresh conversation. Used both in
  // the compose picker and as search results (so searching a name finds friends, not just threads).
  const friendStartButton = (f: FriendData, i: number) => (
    <button
      key={f.userId}
      onClick={() => startConversation(f.userId)}
      style={{ animationDelay: `${Math.min(i, 14) * 35}ms` }}
      className="animate-reveal flex w-full items-center gap-3 rounded-2xl border border-line bg-paper-2/50 px-3 py-2.5 text-left transition hover:border-ink-soft/40 hover:bg-paper-2"
    >
      <PresenceAvatar
        initial={(f.displayName ?? "?").charAt(0).toUpperCase()}
        src={f.avatarUrl}
        size={38}
        online={isOnline(f.userId)}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold">
          {f.displayName ?? "Unknown"}
        </div>
        <div className="truncate text-[12px] text-ink-soft">
          Start a conversation
        </div>
      </div>
    </button>
  );

  // "Seen" sits on the last message the other has actually read (so it persists when you send more);
  // "Sent" marks your newest message when it's still unread (past the seen boundary).
  const lastMineIndex = messages.reduce(
    (acc, m, i) => (m.senderId === me ? i : acc),
    -1,
  );
  const lastReadMineIndex = messages.reduce(
    (acc, m, i) =>
      m.senderId === me && otherReadAt != null && ts(m) <= otherReadAt ? i : acc,
    -1,
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header compacts on short viewports so the chat gets the height back (kicker hidden, smaller h1). */}
      <div className="shrink-0 mb-5 mt-1 [@media(max-height:780px)]:mb-2">
        <div className="mb-2.5 font-mono text-xs uppercase tracking-[0.18em] text-accent [@media(max-height:780px)]:hidden">
          Messages
        </div>
        <h1 className="font-display text-[32px] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[40px] lg:text-[48px] lg:leading-none [@media(max-height:780px)]:!text-[24px] [@media(max-height:780px)]:!leading-tight">
          Direct messages
        </h1>
      </div>

      {/* Flex-fill the remaining height inside FillLayout's viewport-locked main — no page scroll. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[330px_1fr]">
        {/* ── conversation list panel ── */}
        <Card
          reflective={false}
          className={`min-h-0 flex-col overflow-hidden !p-0 ${
            activeUserId != null ? "hidden lg:flex" : "flex"
          }`}
        >
            <div className="flex items-center justify-between px-4 py-3">
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">
                {composeOpen ? "New message" : "Conversations"}
              </span>
              <button
                onClick={() => {
                  setComposeOpen((v) => !v);
                  setQuery("");
                }}
                aria-label={composeOpen ? "Close" : "New message"}
                className={`grid h-7 w-7 place-items-center rounded-full border transition active:scale-90 ${
                  composeOpen
                    ? "border-line bg-paper-2 text-ink"
                    : "border-transparent text-ink-soft hover:border-line hover:bg-paper-2 hover:text-ink"
                }`}
              >
                {composeOpen ? <CloseIcon /> : <PlusIcon />}
              </button>
            </div>

            <div className="px-3 py-2.5">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search friends…"
                className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-[13px] outline-none transition focus:border-accent"
              />
            </div>

            <div
              ref={listRef}
              data-lenis-prevent
              className="no-scrollbar min-h-0 flex-1 overflow-y-auto"
            >
              <div key={composeOpen ? "compose" : "list"} className="space-y-2 p-2.5">
                {!convLoaded ? (
                  <div className="grid h-40 place-items-center">
                    <Loader label="loading" />
                  </div>
                ) : composeOpen ? (
                  composableFriends.length === 0 ? (
                    <p className="px-4 py-6 text-[13px] text-ink-soft">
                      {query
                        ? "No matching friends."
                        : "No new friends to start a chat with — you've already messaged everyone."}
                    </p>
                  ) : (
                    composableFriends.map((f, i) => friendStartButton(f, i))
                  )
                ) : (
                  <>
                    {filteredConversations.map((c, i) => {
                    const mine = c.lastSenderId === me;
                    // Server-tracked: stays cleared once you've opened the thread (survives re-entry).
                    const unseen = c.unread;
                    return (
                      <button
                        key={c.conversationId}
                        onClick={() => navigate(`/messages/${c.otherUserId}`)}
                        style={{
                          animationDelay: `${Math.min(i, 14) * 35}ms`,
                          // Per-DM accent: themes this row's active highlight + unread dot.
                          ...(c.accentHex ? { ["--color-accent" as string]: c.accentHex } : {}),
                        } as React.CSSProperties}
                        className={`animate-reveal flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
                          c.otherUserId === activeUserId
                            ? "border-accent/40 bg-accent/[0.07]"
                            : "border-line bg-paper-2/50 hover:border-ink-soft/40 hover:bg-paper-2"
                        }`}
                      >
                        <PresenceAvatar
                          initial={(c.nickname || c.otherDisplayName || "?")
                            .charAt(0)
                            .toUpperCase()}
                          src={c.otherAvatarUrl}
                          size={40}
                          online={isOnline(c.otherUserId)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`truncate text-[14px] ${unseen ? "font-bold" : "font-semibold"}`}
                            >
                              {c.nickname || c.otherDisplayName || "Unknown"}
                            </span>
                            {c.muted && (
                              <span className="shrink-0 text-ink-soft/60" title="Muted">
                                <MutedIcon />
                              </span>
                            )}
                            <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-soft">
                              {timeAgo(c.lastMessageAtMs)}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2">
                            <span
                              className={`truncate text-[12px] ${unseen ? "text-ink" : "text-ink-soft"}`}
                            >
                              {mine && c.lastPreview ? "You: " : ""}
                              {c.lastPreview ?? ""}
                            </span>
                            {unseen && (
                              <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-accent" />
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                    {query.trim() !== "" &&
                      composableFriends.map((f, i) => friendStartButton(f, i))}
                    {filteredConversations.length === 0 &&
                      (query.trim() === "" || composableFriends.length === 0) && (
                        <div className="px-4 py-8 text-center">
                          <p className="text-[13px] text-ink-soft">
                            {query ? "No matches." : "No conversations yet."}
                          </p>
                          {!query && (
                            <button
                              onClick={() => setComposeOpen(true)}
                              className="mt-2 font-mono text-[11px] uppercase tracking-[0.15em] text-accent transition hover:opacity-80"
                            >
                              Start one →
                            </button>
                          )}
                        </div>
                      )}
                  </>
                )}
              </div>
            </div>
        </Card>

        {/* ── conversation thread panel ── */}
        <Card
          reflective={false}
          className={`relative min-h-0 flex-col overflow-hidden !p-0 ${
            activeUserId == null ? "hidden lg:flex" : "flex"
          }`}
        >
            {activeUserId == null ? (
              <div className="grid flex-1 place-items-center px-6 text-center">
                <div>
                  <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-line bg-paper-2 text-ink-soft">
                    <ChatIcon />
                  </div>
                  <p className="text-[14px] font-semibold">Your messages</p>
                  <p className="mt-1 text-[13px] text-ink-soft">
                    Pick a conversation, or start a new one.
                  </p>
                </div>
              </div>
            ) : (
              <div
                style={threadThemeStyle(settings)}
                className="relative flex min-h-0 flex-1 flex-col"
              >
                {/* per-DM background: an art layer + a dim overlay toward paper so text stays readable.
                    Both ease so a theme/background change in the customize panel fades in. */}
                <div
                  className="pointer-events-none absolute inset-0 transition-[filter,background-color] duration-500 ease-fluid"
                  style={backgroundArtStyle(settings)}
                />
                <div
                  className="pointer-events-none absolute inset-0 bg-paper transition-opacity duration-500 ease-fluid"
                  style={{ opacity: (settings?.backgroundDim ?? 0) / 100 }}
                />
                <div className="relative z-10 flex min-h-0 flex-1 flex-col text-ink">
                <div className="relative z-10 flex items-center gap-3 bg-paper/85 px-4 py-3 shadow-[0_12px_26px_-22px_rgba(27,24,19,0.5)]">
                  <button
                    onClick={() => navigate("/messages")}
                    className="font-mono text-lg leading-none text-ink-soft transition hover:text-ink lg:hidden"
                    aria-label="Back"
                  >
                    ‹
                  </button>
                  <PresenceAvatar
                    initial={peerInitial}
                    src={activeFriend?.avatarUrl}
                    size={36}
                    online={activeUserId != null && isOnline(activeUserId)}
                  />
                  <div className="min-w-0">
                    <div className="truncate font-semibold leading-tight">{peerName}</div>
                    {typing ? (
                      <div className="text-[11px] font-medium leading-tight text-accent-2">
                        typing…
                      </div>
                    ) : (
                      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                        {activeUserId != null && isOnline(activeUserId) ? (
                          <span className="text-accent-2">Online</span>
                        ) : (
                          "Offline"
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setSearchOpen((o) => {
                        const next = !o;
                        if (next) requestAnimationFrame(() => searchInputRef.current?.focus());
                        else setSearchQuery("");
                        return next;
                      });
                    }}
                    aria-label="Search conversation"
                    title="Search conversation"
                    className={`ml-auto grid h-9 w-9 place-items-center rounded-full border transition ${
                      searchOpen
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-transparent text-ink-soft hover:border-line hover:bg-paper-2 hover:text-ink"
                    }`}
                  >
                    <MagnifierIcon />
                  </button>
                  <button
                    onClick={() => setCustomizeOpen(true)}
                    aria-label="Customize chat"
                    title="Customize chat"
                    className="grid h-9 w-9 place-items-center rounded-full border border-transparent text-ink-soft transition hover:border-line hover:bg-paper-2 hover:text-ink"
                  >
                    <PaletteIcon />
                  </button>
                </div>

                {/* in-thread search — bar + results dropdown (jump to a match in THIS conversation) */}
                {searchOpen && (
                  <div className="relative z-20">
                    <div className="flex items-center gap-2.5 bg-paper/95 px-4 py-2.5 shadow-[0_12px_26px_-22px_rgba(27,24,19,0.5)]">
                      <span className="shrink-0 text-ink-soft">
                        <MagnifierIcon />
                      </span>
                      <input
                        ref={searchInputRef}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setSearchOpen(false);
                            setSearchQuery("");
                          }
                        }}
                        placeholder="Search this conversation…"
                        className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-ink-soft/70"
                      />
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
                        {searchQuery.trim().length < 2
                          ? ""
                          : msgSearching
                            ? "…"
                            : `${msgResults.length}${msgPage + 1 < msgTotalPages ? "+" : ""}`}
                      </span>
                      <button
                        onClick={() => {
                          setSearchOpen(false);
                          setSearchQuery("");
                        }}
                        aria-label="Close search"
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-soft transition hover:bg-paper-2 hover:text-ink"
                      >
                        <CloseIcon />
                      </button>
                    </div>
                    {searchQuery.trim().length >= 2 && (
                      <div
                        ref={searchResultsRef}
                        data-lenis-prevent
                        className="animate-reveal absolute left-2 right-2 top-full mt-1 max-h-[55vh] overflow-y-auto rounded-2xl border border-line bg-paper shadow-[0_24px_50px_-20px_rgba(27,24,19,0.6)]"
                      >
                        <div className="p-2">
                          {msgResults.length === 0 && !msgSearching ? (
                            <p className="px-2 py-6 text-center text-[13px] text-ink-soft">
                              No matches in this chat.
                            </p>
                          ) : (
                            msgResults.map((r, i) => (
                              <button
                                key={r.messageId}
                                onClick={() => handleJumpToMatch(r.messageId)}
                                style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                                className="animate-reveal flex w-full items-start gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-left transition hover:border-line hover:bg-paper-2"
                              >
                                <span className="mt-[3px] shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-accent">
                                  {r.senderId === me ? "You" : peerName}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[13px] text-ink">
                                    {r.kind === "TEXT" ? r.snippet : replyPreviewText(r.kind, r.snippet)}
                                  </span>
                                  <span className="mt-0.5 block font-mono text-[9.5px] text-ink-soft">
                                    {timeAgo(r.createdAtMs)}
                                  </span>
                                </span>
                              </button>
                            ))
                          )}
                          {msgPage + 1 < msgTotalPages && (
                            <button
                              onClick={loadMoreResults}
                              disabled={msgSearching}
                              className="mt-1 w-full rounded-xl py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-accent transition hover:bg-accent/5 disabled:opacity-50"
                            >
                              {msgSearching ? "Loading…" : "Show more"}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* shared pin bar — eases in/out as pins change (kept mounted via heldPins) */}
                <div
                  className={`relative z-10 grid transition-[grid-template-rows] duration-300 ease-fluid ${
                    pins.length > 0 ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <PinnedBar
                      pins={heldPins}
                      me={me}
                      peerName={peerName}
                      onJump={scrollToMessage}
                      onUnpin={handleUnpin}
                    />
                  </div>
                </div>

                <div
                  ref={threadRef}
                  onScroll={onThreadScroll}
                  data-lenis-prevent
                  className="no-scrollbar min-h-0 flex-1 overflow-y-auto"
                >
                  <div
                    className="space-y-1 px-4 py-4"
                    style={{
                      fontFamily: messageFontFamily(settings?.messageFont ?? "SANS"),
                      fontSize: messageTextSizePx(settings?.messageTextSize),
                    }}
                  >
                    {loadingThread || !convLoaded ? (
                      <div className="grid h-[40vh] place-items-center">
                        <Loader label="loading" />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="grid h-[40vh] place-items-center text-[13px] text-ink-soft">
                        No messages yet — say hello.
                      </div>
                    ) : (
                      messages.map((m, i) => {
                        const prev = messages[i - 1];
                        const mine = m.senderId === me;
                        const newDay = !prev || !sameDay(ts(prev), ts(m));
                        const startGroup =
                          newDay ||
                          !prev ||
                          prev.senderId !== m.senderId ||
                          ts(m) - ts(prev) > GROUP_MS;
                        const next = messages[i + 1];
                        const endGroup =
                          !next ||
                          next.senderId !== m.senderId ||
                          ts(next) - ts(m) > GROUP_MS ||
                          !sameDay(ts(next), ts(m));
                        return (
                          <div
                            key={m.clientId ?? m.messageId}
                            data-message-id={m.messageId}
                            className={`rounded-2xl transition-colors duration-700 ${
                              flashId === m.messageId ? "bg-accent/10" : ""
                            }`}
                          >
                            {newDay && (
                              <div className="my-3 flex items-center gap-3">
                                <span className="h-px flex-1 bg-line" />
                                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                                  {dateLabel(ts(m))}
                                </span>
                                <span className="h-px flex-1 bg-line" />
                              </div>
                            )}
                            <div
                              className={`group/msg animate-reveal relative flex items-end gap-2 ${mine ? "justify-end" : "justify-start"} ${messageRowGap(settings?.messageDensity, startGroup)}`}
                            >
                              {!mine &&
                                (endGroup ? (
                                  <Avatar
                                    initial={peerInitial}
                                    src={activeFriend?.avatarUrl}
                                    size={26}
                                  />
                                ) : (
                                  <span className="w-[26px] shrink-0" />
                                ))}
                              <div
                                className={`relative w-fit max-w-[75%] transition-opacity duration-300 ease-fluid ${
                                  m.pending ? "opacity-55" : "opacity-100"
                                }`}
                              >
                                {/* hover quick-react bar: one tap reacts (clear cue, no hidden double-tap);
                                    "more" opens the full palette. */}
                                {m.messageId >= 0 && reactingId !== m.messageId && (
                                  <div
                                    className={`invisible absolute bottom-full z-20 pb-2 opacity-0 transition-opacity duration-150 group-hover/msg:visible group-hover/msg:opacity-100 ${
                                      mine ? "right-0" : "left-0"
                                    }`}
                                  >
                                    <QuickReactionBar
                                      emojis={barReactions}
                                      onReact={(e) => handleReact(m, e)}
                                      onMore={() => openReact(m.messageId)}
                                    />
                                  </div>
                                )}
                                {reactingId === m.messageId && (
                                  <div
                                    data-reaction-ui
                                    className={`absolute bottom-full z-30 mb-1 transition duration-150 ease-fluid ${
                                      mine ? "right-0 origin-bottom-right" : "left-0 origin-bottom-left"
                                    } ${reactingOpen ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
                                  >
                                    <ReactionPicker emojis={REACTION_OPTIONS} onPick={(e) => handleReact(m, e)} />
                                  </div>
                                )}
                                {m.deleted ? (
                                  <div className="inline-flex items-center gap-1.5 rounded-2xl border border-dashed border-line bg-paper-2/40 px-3.5 py-2 text-[12.5px] italic text-ink-soft">
                                    <TrashIcon /> Message deleted
                                  </div>
                                ) : m.kind === "CODE" ? (
                                  <div className="flex flex-col">
                                    <CodeBubble
                                      code={m.body}
                                      language={m.codeLanguage}
                                      dark={darkThread}
                                      runnable={m.messageId >= 0 && runnableLanguage(m.codeLanguage) !== null}
                                      running={runningIds.has(m.messageId)}
                                      output={runOutputs[m.messageId] ?? null}
                                      onRun={(stdin) => handleRunCode(m, stdin)}
                                      onClearOutput={() => clearRunOutput(m.messageId)}
                                    />
                                    {m.editedAtMs != null && (
                                      <span className="mt-0.5 px-1 text-[10px] text-ink-soft/70">(edited)</span>
                                    )}
                                  </div>
                                ) : m.kind === "IMAGE" && m.attachmentUrl ? (
                                  <div className="flex flex-col">
                                    <ImageBubble
                                      src={mediaSrc(m.attachmentUrl)}
                                      caption={m.body}
                                      mine={mine}
                                      onOpen={() => setLightboxUrl(mediaSrc(m.attachmentUrl!))}
                                    />
                                    {m.editedAtMs != null && (
                                      <span className="mt-0.5 px-1 text-[10px] text-ink-soft/70">(edited)</span>
                                    )}
                                  </div>
                                ) : m.kind === "PROBLEM_SHARE" && m.sharedRef ? (
                                  <ProblemShareCard
                                    slug={m.sharedRef}
                                    caption={m.body}
                                    peerName={peerName}
                                    state={
                                      challengeMsgId === m.messageId
                                        ? "pending"
                                        : declinedMsgId === m.messageId
                                          ? "declined"
                                          : "idle"
                                    }
                                    onChallenge={() => handleCardChallenge(m)}
                                    onCancel={handleCancelChallenge}
                                    onOpen={() => m.sharedRef && navigate(`/practice/${m.sharedRef}`)}
                                  />
                                ) : m.kind === "VOICE" && m.attachmentUrl ? (
                                  <div
                                    className={`w-[min(280px,64vw)] rounded-2xl px-2.5 py-2 ${
                                      mine ? "bg-accent" : "border border-line bg-paper-2"
                                    }`}
                                  >
                                    <VoicePlayer
                                      src={mediaSrc(m.attachmentUrl)}
                                      durationMs={m.durationMs}
                                      seed={Math.abs(m.messageId)}
                                      onAccent={mine}
                                    />
                                  </div>
                                ) : (
                                  <div
                                    title={fmtTime(m.createdAtMs)}
                                    className={`whitespace-pre-wrap break-words px-3.5 leading-snug ${messageBubblePadding(
                                      settings?.messageDensity,
                                    )} ${bubbleClass(settings?.bubbleStyle ?? "ROUNDED", mine, endGroup)}`}
                                  >
                                    {m.replyTo && (
                                      <button
                                        onClick={() => m.replyTo && scrollToMessage(m.replyTo.messageId)}
                                        className={`mb-1.5 flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition ${
                                          mine
                                            ? "bg-white/15 hover:bg-white/25"
                                            : "bg-accent/[0.08] hover:bg-accent/[0.14]"
                                        }`}
                                      >
                                        <span className={`shrink-0 ${mine ? "text-white/80" : "text-accent"}`}>
                                          <ReplyQuoteIcon />
                                        </span>
                                        <span className="min-w-0">
                                          <span
                                            className={`block font-mono text-[9px] uppercase tracking-[0.16em] ${mine ? "text-white/85" : "text-accent"}`}
                                          >
                                            {m.replyTo.senderId === me ? "You" : peerName}
                                          </span>
                                          <span
                                            className={`mt-0.5 block truncate text-[12px] ${mine ? "text-white/75" : "text-ink-soft"}`}
                                          >
                                            {replyPreviewText(m.replyTo.kind, m.replyTo.preview)}
                                          </span>
                                        </span>
                                      </button>
                                    )}
                                    {m.body}
                                    {m.editedAtMs != null && (
                                      <span
                                        className={`ml-1.5 align-baseline text-[10px] ${mine ? "text-white/55" : "text-ink-soft/70"}`}
                                      >
                                        (edited)
                                      </span>
                                    )}
                                  </div>
                                )}
                                {m.messageId >= 0 && !m.deleted && (
                                  <div
                                    className={`absolute top-1/2 z-20 -translate-y-1/2 items-center gap-1 ${
                                      mine ? "right-full mr-1.5" : "left-full ml-1.5"
                                    } ${menuId === m.messageId ? "flex" : "hidden group-hover/msg:flex"}`}
                                  >
                                    <button
                                      onClick={() => startReply(m)}
                                      aria-label="Reply"
                                      className="grid h-7 w-7 place-items-center rounded-full text-ink-soft transition hover:bg-paper-2 hover:text-ink"
                                    >
                                      <ReplyIcon />
                                    </button>
                                    <button
                                      data-msg-menu
                                      onClick={() =>
                                        menuId === m.messageId ? closeMenu() : openMenu(m.messageId)
                                      }
                                      aria-label="More"
                                      className="grid h-7 w-7 place-items-center rounded-full text-ink-soft transition hover:bg-paper-2 hover:text-ink"
                                    >
                                      <MoreDotsIcon />
                                    </button>
                                  </div>
                                )}
                                {menuId === m.messageId && (
                                  <div
                                    data-msg-menu
                                    className={`absolute bottom-full z-30 mb-1 min-w-[150px] overflow-hidden rounded-xl border border-line bg-paper p-1 shadow-[0_18px_36px_-16px_rgba(27,24,19,0.6)] transition duration-150 ease-fluid ${
                                      mine ? "right-0 origin-bottom-right" : "left-0 origin-bottom-left"
                                    } ${menuOpen ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
                                  >
                                    <button
                                      onClick={() =>
                                        pinnedIds.has(m.messageId) ? handleUnpin(m.messageId) : handlePin(m)
                                      }
                                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-ink transition hover:bg-paper-2"
                                    >
                                      <PinIcon /> {pinnedIds.has(m.messageId) ? "Unpin" : "Pin"}
                                    </button>
                                    {mine && m.createdAtMs != null && Date.now() - m.createdAtMs < EDIT_WINDOW_MS && (
                                      <button
                                        onClick={() => startEdit(m)}
                                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-ink transition hover:bg-paper-2"
                                      >
                                        <EditIcon /> Edit
                                      </button>
                                    )}
                                    {mine && (
                                      <button
                                        onClick={() => handleDelete(m)}
                                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-accent transition hover:bg-accent/10"
                                      >
                                        <TrashIcon /> Delete
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                            <ReactionChips
                              reactions={m.reactions}
                              me={me}
                              align={mine ? "end" : "start"}
                              onToggle={(e) => handleReact(m, e)}
                            />
                            {endGroup && (
                              <div
                                className={`mt-0.5 px-1 font-mono text-[9.5px] text-ink-soft ${mine ? "pr-1 text-right" : "pl-9"}`}
                              >
                                {fmtTime(m.createdAtMs)}
                              </div>
                            )}
                            {mine && i === lastReadMineIndex && (
                              <div className="mt-1 flex justify-end px-1">
                                <span className="animate-reveal inline-flex items-center gap-1 text-[10px] font-medium tracking-tight text-accent-2">
                                  <SeenIcon /> Seen
                                </span>
                              </div>
                            )}
                            {mine &&
                              i === lastMineIndex &&
                              lastMineIndex > lastReadMineIndex && (
                                <div className="mt-1 flex justify-end px-1">
                                  {/* delivered, not yet seen — a single tick, no label (the solid bubble already says "sent") */}
                                  <span className="animate-reveal text-ink-soft/45" title="Sent">
                                    <SingleCheckIcon />
                                  </span>
                                </div>
                              )}
                          </div>
                        );
                      })
                    )}
                    {typingMounted && !loadingThread && (
                      <div
                        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                          typingShown ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                        }`}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div
                            className={`mt-2 flex items-end gap-2 transition-opacity duration-200 ${
                              typingShown ? "opacity-100" : "opacity-0"
                            }`}
                          >
                            <Avatar
                              initial={peerInitial}
                              src={activeFriend?.avatarUrl}
                              size={26}
                            />
                            <div className="rounded-2xl rounded-bl-md border border-line bg-paper-2 px-3.5 py-3">
                              <span className="flex gap-1">
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-soft [animation-delay:0ms]" />
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-soft [animation-delay:150ms]" />
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-soft [animation-delay:300ms]" />
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* jump-to-latest (shown once you've scrolled up into history). z-20 + a lift while the
                    reply/edit banner is up so it floats cleanly above it instead of bleeding through. */}
                <button
                  onClick={jumpToLatest}
                  aria-label="Jump to latest"
                  className={`absolute bottom-[78px] right-5 z-20 grid h-9 w-9 place-items-center rounded-full border border-line bg-paper-2 text-ink shadow-[0_8px_24px_-8px_rgba(27,24,19,0.5)] transition ${
                    attachShown ? "-translate-y-[64px]" : ""
                  } ${
                    showJump
                      ? "visible scale-100 opacity-100"
                      : "pointer-events-none invisible scale-90 opacity-0"
                  }`}
                >
                  <ChevronDownIcon />
                </button>

                {/* live recording bar — real-time mic meter so you can see it working, + stop/cancel */}
                {voice.recording && (
                  <div className="animate-reveal relative z-10 mx-3 mb-1.5">
                    <div className="flex items-center gap-3 rounded-2xl border border-line bg-paper-2/80 py-2 pl-3 pr-2 shadow-[0_12px_26px_-22px_rgba(27,24,19,0.5)]">
                      <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/12 text-accent">
                        <span className="absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-accent/60" />
                        <span className="relative h-2.5 w-2.5 rounded-full bg-accent" />
                      </span>
                      <LiveMicMeter analyserRef={voice.analyserRef} />
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-soft">
                        {Math.floor(voice.seconds / 60)}:{(voice.seconds % 60).toString().padStart(2, "0")}
                        <span className="text-ink-soft/50"> / {MAX_RECORD_MS / 60000}:00</span>
                      </span>
                      <button
                        onClick={() => voice.cancel()}
                        aria-label="Cancel recording"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-soft transition hover:bg-paper hover:text-ink"
                      >
                        <CloseIcon />
                      </button>
                      <button
                        onClick={() => voice.stop()}
                        aria-label="Stop recording"
                        title="Stop"
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-white transition hover:brightness-110 active:scale-90"
                      >
                        <StopIcon />
                      </button>
                    </div>
                  </div>
                )}

                {/* recorded-clip preview — play it back, then send or discard (consistent preview chrome) */}
                {recordedVoice && (
                  <div className="animate-reveal relative z-10 mx-3 mb-1.5">
                    <div className="flex items-center gap-2 rounded-2xl border border-line bg-paper-2/80 py-2 pl-3 pr-2 shadow-[0_12px_26px_-22px_rgba(27,24,19,0.5)]">
                      <div className="min-w-0 flex-1">
                        <VoicePlayer src={recordedVoice.url} durationMs={recordedVoice.durationMs} seed={7} />
                      </div>
                      <button
                        onClick={discardVoice}
                        aria-label="Discard"
                        title="Discard"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-soft transition hover:bg-paper hover:text-accent"
                      >
                        <TrashIcon />
                      </button>
                      <button
                        onClick={sendVoice}
                        disabled={sendingVoice}
                        aria-label="Send voice message"
                        title="Send"
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-white transition hover:brightness-110 active:scale-90 disabled:opacity-50"
                      >
                        {sendingVoice ? <SpinnerIcon /> : <SendIcon />}
                      </button>
                    </div>
                  </div>
                )}

                {/* mic-permission / recording error */}
                {voice.error && !voice.recording && !recordedVoice && (
                  <div className="animate-reveal relative z-10 mx-3 mb-1.5 rounded-xl border border-accent/30 bg-accent/[0.06] px-3.5 py-2 text-[12px] text-accent">
                    {voice.error}
                  </div>
                )}

                {/* composer attachment (reply preview / edit banner) — eases in AND out via grid-rows */}
                <div
                  className={`relative z-10 mx-3 grid transition-[grid-template-rows] duration-300 ease-fluid ${
                    attachShown ? "mb-1.5 grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div
                      className={`flex items-center gap-3 rounded-2xl border border-line bg-paper-2/70 py-2 pl-2.5 pr-2 shadow-[0_12px_26px_-22px_rgba(27,24,19,0.5)] transition-opacity duration-200 ${
                        attachShown ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent">
                        {heldAttach?.kind === "edit" ? (
                          <EditIcon />
                        ) : heldAttach?.kind === "code" ? (
                          <CodeIcon />
                        ) : (
                          <ReplyIcon />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                          {heldAttach?.kind === "edit"
                            ? "Editing message"
                            : heldAttach?.kind === "code"
                              ? "Code snippet"
                              : `Replying to ${heldAttach?.message && heldAttach.message.senderId === me ? "yourself" : peerName}`}
                        </div>
                        {heldAttach?.kind === "code" ? (
                          <select
                            value={codeLang}
                            onChange={(e) => setCodeLang(e.target.value)}
                            className="mt-1 max-w-[200px] rounded-md border border-line bg-paper px-1.5 py-1 font-mono text-[11px] text-ink outline-none transition focus:border-accent"
                          >
                            {CODE_LANGS.map((l) => (
                              <option key={l} value={l}>
                                {l}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="mt-0.5 truncate text-[12.5px] text-ink-soft">
                            {heldAttach?.kind === "edit"
                              ? "Enter to save · Esc to cancel"
                              : heldAttach?.message
                                ? replyPreviewText(heldAttach.message.kind, heldAttach.message.body)
                                : ""}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() =>
                          heldAttach?.kind === "edit"
                            ? cancelEdit()
                            : heldAttach?.kind === "code"
                              ? setCodeMode(false)
                              : setReplyingTo(null)
                        }
                        aria-label="Cancel"
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-soft transition hover:bg-paper hover:text-ink"
                      >
                        <CloseIcon />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="relative z-10 flex items-end gap-2 bg-paper/85 px-3 py-3 shadow-[0_-12px_26px_-22px_rgba(27,24,19,0.5)]">
                  <button
                    onClick={startCode}
                    aria-label="Code snippet"
                    title="Code snippet"
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition active:scale-90 ${
                      codeMode
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-transparent text-ink-soft hover:border-line hover:bg-paper-2 hover:text-ink"
                    }`}
                  >
                    <CodeIcon />
                  </button>
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    disabled={uploading}
                    aria-label="Send image"
                    title="Send image"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-transparent text-ink-soft transition hover:border-line hover:bg-paper-2 hover:text-ink active:scale-90 disabled:opacity-50"
                  >
                    {uploading ? <SpinnerIcon /> : <ImageIcon />}
                  </button>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    className="hidden"
                    onChange={handleImageSelected}
                  />
                  {voice.supported && (
                    <button
                      onClick={
                        voice.recording
                          ? () => voice.stop()
                          : recordedVoice
                            ? reRecord
                            : startRecording
                      }
                      aria-label={voice.recording ? "Stop recording" : "Record voice message"}
                      title={voice.recording ? "Stop recording" : recordedVoice ? "Record again" : "Record voice message"}
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition active:scale-90 ${
                        voice.recording || recordedVoice
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-transparent text-ink-soft hover:border-line hover:bg-paper-2 hover:text-ink"
                      }`}
                    >
                      <MicIcon />
                    </button>
                  )}
                  <div data-problem-ui className="relative shrink-0">
                    <button
                      onClick={() => setProblemPickerOpen((o) => !o)}
                      aria-label="Share a problem"
                      title="Share a problem"
                      className={`grid h-9 w-9 place-items-center rounded-full border transition active:scale-90 ${
                        problemPickerOpen
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-transparent text-ink-soft hover:border-line hover:bg-paper-2 hover:text-ink"
                      }`}
                    >
                      <SwordsIcon size={16} />
                    </button>
                    {problemPickerOpen && (
                      <div className="animate-reveal absolute bottom-full left-0 z-30 mb-2 w-[320px] overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_24px_50px_-20px_rgba(27,24,19,0.6)]">
                        <div className="flex items-center gap-2 px-4 pb-2 pt-3 text-accent">
                          <SwordsIcon size={13} />
                          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]">
                            Share a problem
                          </span>
                        </div>
                        <div className="px-3 pb-2.5">
                          <input
                            autoFocus
                            value={problemQuery}
                            onChange={(e) => setProblemQuery(e.target.value)}
                            placeholder="Search problems…"
                            className="w-full rounded-lg border border-line bg-paper-2 px-3 py-2 text-[13px] outline-none transition focus:border-accent"
                          />
                        </div>
                        <div ref={problemPickerScrollRef} data-lenis-prevent className="no-scrollbar max-h-72 overflow-y-auto">
                          <div className="px-2 pb-2">
                            {problemList === null ? (
                              <div className="grid h-24 place-items-center">
                                <Loader inline size={16} label="loading" />
                              </div>
                            ) : filteredProblems.length === 0 ? (
                              <p className="px-2 py-6 text-center text-[13px] text-ink-soft">
                                {problemQuery ? "No matching problems." : "No problems available."}
                              </p>
                            ) : (
                              filteredProblems.map((p, i) => (
                                <button
                                  key={p.slug}
                                  onClick={() => handleShareProblem(p.slug)}
                                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                                  className="animate-reveal flex w-full items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-left transition hover:border-line hover:bg-paper-2"
                                >
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13.5px] font-semibold text-ink">{p.title}</span>
                                    {p.tags && p.tags.length > 0 && (
                                      <span className="mt-0.5 block truncate font-mono text-[10px] text-ink-soft">
                                        {p.tags.slice(0, 3).join(" · ")}
                                      </span>
                                    )}
                                  </span>
                                  {p.rating != null && (
                                    <span
                                      className={`shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px] ${ratingTone(p.rating)}`}
                                    >
                                      {p.rating}
                                    </span>
                                  )}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="relative shrink-0">
                    <button
                      data-emoji-ui
                      onClick={() => setEmojiOpen((o) => !o)}
                      aria-label="Emoji"
                      title="Emoji"
                      className={`grid h-9 w-9 place-items-center rounded-full border transition active:scale-90 ${
                        emojiOpen
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-transparent text-ink-soft hover:border-line hover:bg-paper-2 hover:text-ink"
                      }`}
                    >
                      <EmojiFaceIcon />
                    </button>
                    {emojiRendered && (
                      <div
                        ref={emojiPopupRef}
                        data-emoji-ui
                        className={`absolute bottom-full left-0 z-30 mb-2 origin-bottom-left overflow-hidden rounded-2xl border border-line shadow-[0_24px_50px_-20px_rgba(27,24,19,0.6)] transition duration-200 ease-fluid ${
                          emojiShown ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
                        }`}
                      >
                        <EmojiPicker
                          className="coduel-emoji"
                          onEmojiClick={(e) => insertEmoji(e.emoji)}
                          theme={darkThread ? EmojiTheme.DARK : EmojiTheme.LIGHT}
                          emojiStyle={EmojiStyle.NATIVE}
                          skinTonesDisabled
                          previewConfig={{ showPreview: false }}
                          searchPlaceHolder="Search emoji…"
                          width={320}
                          height={400}
                        />
                      </div>
                    )}
                  </div>
                  <textarea
                    ref={textareaRef}
                    data-lenis-prevent
                    value={input}
                    onChange={autoGrow}
                    onPaste={onPaste}
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !codeMode) {
                        e.preventDefault();
                        void handleSend();
                      } else if (e.key === "Escape" && (editingId !== null || codeMode)) {
                        e.preventDefault();
                        if (editingId !== null) cancelEdit();
                        else setCodeMode(false);
                      }
                    }}
                    placeholder={codeMode ? "Paste your code… (Enter for newlines)" : "Message…"}
                    className={`no-scrollbar max-h-[132px] flex-1 resize-none overflow-y-auto rounded-2xl border border-line bg-paper px-3.5 py-2.5 leading-snug outline-none transition focus:border-accent ${
                      codeMode ? "font-mono text-[12.5px]" : "text-[13.5px]"
                    }`}
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !input.trim()}
                    aria-label="Send"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-white transition active:scale-90 disabled:opacity-40"
                  >
                    <SendIcon />
                  </button>
                </div>
                </div>
                {settings && (
                  <CustomizePanel
                    open={customizeOpen}
                    settings={settings}
                    peerName={peerName}
                    onChange={applySetting}
                    onClose={() => setCustomizeOpen(false)}
                  />
                )}
              </div>
            )}
        </Card>
      </div>

      {/* image lightbox — warm espresso scrim (matches the code card), framed image that scales in on
          the site's motion curve. Tap anywhere or Esc to close. */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          className="animate-reveal fixed inset-0 z-[60] flex items-center justify-center bg-[#140f0c]/90 p-6 backdrop-blur-md sm:p-12"
        >
          <img
            src={lightboxUrl}
            alt="image"
            className="animate-win-card max-h-full max-w-full rounded-2xl border border-white/10 object-contain shadow-[0_40px_120px_-30px_rgba(0,0,0,0.85)]"
          />
          <button
            onClick={() => setLightboxUrl(null)}
            aria-label="Close"
            className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/10 text-white/90 backdrop-blur transition hover:bg-white/20 active:scale-90"
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </div>
  );
}

// Reply — a curved back-arrow, used beside a message and in the reply bar.
function ReplyIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 17 4 12l5-5" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

// Compact reply glyph for the quoted message above a reply (replaces the generic left bar).
function ReplyQuoteIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 17 4 12l5-5" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

// Pencil — edit a message.
function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

// Trash — delete a message.
function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
    </svg>
  );
}

// Smiley face — opens the composer emoji picker.
function EmojiFaceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5a4 4 0 0 0 7 0" />
      <path d="M9 9.5h.01M15 9.5h.01" />
    </svg>
  );
}

// Picture — attach an image.
function ImageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

// Magnifier — in-thread search (stroke icon, matches the site's line language).
function MagnifierIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <line x1="20" y1="20" x2="16.65" y2="16.65" />
    </svg>
  );
}

// Microphone — start a voice note.
function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

// Stop — finish recording.
function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

// Small spinner shown while an image uploads.
function SpinnerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.2-8.5" />
    </svg>
  );
}

// </> — code snippet.
function CodeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

// Pin — pin/unpin a message.
function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 17v5" />
      <path d="M9 10.8V4h6v6.8l2 3.2H7l2-3.2Z" />
    </svg>
  );
}

// Vertical ellipsis — the per-message actions menu.
function MoreDotsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

// Palette — opens the per-DM customize panel.
function PaletteIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 22a10 10 0 1 1 10-10c0 2.5-2 3-3.5 3H16a2 2 0 0 0-1.5 3.3A2 2 0 0 1 12 22Z" />
      <circle cx="7.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Muted bell (with a slash) — marks a conversation you've muted, in the inbox row.
function MutedIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <path d="M18.63 13A17.9 17.9 0 0 1 18 8" />
      <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
      <path d="M18 8a6 6 0 0 0-9.33-5" />
      <path d="m2 2 20 20" />
    </svg>
  );
}

// Single tick — your latest message is delivered (sent) but not yet seen.
function SingleCheckIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m5 12.5 5 5L20 6" />
    </svg>
  );
}

// Read-receipt double-tick — shown when the other person has seen your latest message.
function SeenIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M1.5 12.5 6 17l5-6" />
      <path d="m12 14 1 1 7.5-8.5" />
    </svg>
  );
}

// Avatar with a live online dot (green) tucked into the corner.
function PresenceAvatar({
  initial,
  src,
  size,
  online,
}: {
  initial: string;
  src?: string | null;
  size: number;
  online: boolean;
}) {
  return (
    <span
      className="relative inline-block shrink-0"
      style={{ width: size, height: size }}
    >
      <Avatar initial={initial} src={src} size={size} />
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-paper bg-accent-2" />
      )}
    </span>
  );
}

// ── icons (stroke SVGs, matching the site) ──
// "+" — start a new message (opens the friend picker to begin a fresh DM).
function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
    </svg>
  );
}
function ChevronDownIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
// Upward "submit" arrow — symmetric, so it sits dead-centre in the round button.
function SendIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}
