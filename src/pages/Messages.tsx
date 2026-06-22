import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type Lenis from "lenis";
import { Card } from "../components/ui/Card";
import { Avatar } from "../components/ui/Avatar";
import { Loader } from "../components/ui/Loader";
import { chatApi, friendApi } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { useStomp } from "../hooks/useStomp";
import { useNotifications } from "../hooks/useNotifications";
import { usePresence } from "../hooks/usePresence";
import { useLenisBox } from "../hooks/useLenisBox";
import type {
  ConversationData,
  FriendData,
  MessageData,
  TypingData,
} from "../types";

// Consecutive messages from the same sender within this window collapse into one visual group.
const GROUP_MS = 5 * 60 * 1000;

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

export function Messages() {
  const { userId: userIdParam } = useParams();
  const activeUserId = userIdParam ? Number(userIdParam) : null;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subscribe, publish } = useStomp();
  const { setActiveDm } = useNotifications();
  const { isOnline } = usePresence();
  const me = user?.id ?? null;

  const [friends, setFriends] = useState<FriendData[]>([]);
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showJump, setShowJump] = useState(false);
  const [typing, setTyping] = useState(false);
  // False until the first conversations fetch returns — drives the list/thread loaders so the empty
  // state ("start a conversation" / "no messages") never flashes before we know what's there.
  const [convLoaded, setConvLoaded] = useState(false);

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
  const activeConvIdRef = useRef<number | null>(null);
  activeConvIdRef.current = activeConversationId;
  const activeUserIdRef = useRef<number | null>(null);
  activeUserIdRef.current = activeUserId;

  // ── scroll plumbing ──
  const threadRef = useRef<HTMLDivElement>(null);
  const threadLenis = useRef<Lenis | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Was the user near the bottom just before the latest message? Drives auto-follow vs "stay put".
  const nearBottomRef = useRef(true);
  // Detects opening a *different* thread (jump instantly) vs a new message in the open one (smooth).
  const lastConvRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Typing-indicator plumbing: throttle outgoing signals; auto-clear the incoming "typing…" after a pause.
  const lastTypingSentRef = useRef(0);
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Momentum smooth-scroll inside the panels (they sit in a data-lenis-prevent card, so the document
  // Lenis leaves them alone — these own their own wheel). Thread re-measures when the conversation swaps.
  useLenisBox(threadRef, [activeConversationId], threadLenis);
  useLenisBox(listRef, [conversations.length, friends.length, composeOpen]);

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
    const dist = w.scrollHeight - w.scrollTop - w.clientHeight;
    nearBottomRef.current = dist < 220;
    setShowJump(dist > 320);
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

  // Tell the notification provider which thread is open, so it won't toast DMs we're already reading.
  useEffect(() => {
    setActiveDm(activeUserId);
    setTyping(false); // a fresh thread starts with no pending "typing…"
    return () => setActiveDm(null);
  }, [activeUserId, setActiveDm]);

  // Load the thread when the selected conversation changes (API returns newest-first → chronological).
  // Clear first so we never flash the previous thread while the new one loads.
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }
    const convId = activeConversationId;
    setLoadingThread(true);
    setMessages([]);
    chatApi
      .messages(convId)
      .then((page) => setMessages([...page].reverse()))
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
          msg.conversationId === activeConvIdRef.current
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

  // Scroll discipline: opening a thread lands at the latest with NO animation; a new message in the
  // open thread eases down only if you were already at the bottom (so reading history isn't yanked).
  // useLayoutEffect → runs before paint, so the thread never flashes at the top first.
  useLayoutEffect(() => {
    if (messages.length === 0) return;
    const switched = lastConvRef.current !== activeConversationId;
    lastConvRef.current = activeConversationId;
    if (switched) scrollToLatest(true);
    else if (nearBottomRef.current) scrollToLatest(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // Keep the typing bubble in view when it appears (only if you're already at the bottom).
  useEffect(() => {
    if (typing && nearBottomRef.current) scrollToLatest(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typing]);

  async function handleSend() {
    const text = input.trim();
    if (!text || activeUserId == null || sending) return;
    // Snappy + optimistic: clear the box and show the message immediately, then reconcile with the
    // server's saved copy (for the sender, a DM comes back on the HTTP response, not the socket).
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    const tempId = -Date.now();
    const optimistic: MessageData = {
      messageId: tempId,
      conversationId: activeConversationId ?? 0,
      senderId: me ?? 0,
      body: text,
      createdAtMs: Date.now(),
    };
    setMessages((prev) => [...prev, optimistic]);
    nearBottomRef.current = true;
    setSending(true);
    try {
      const msg = await chatApi.send(activeUserId, text);
      setMessages((prev) => prev.map((m) => (m.messageId === tempId ? msg : m)));
      void reloadConversations();
    } catch {
      // send failed — drop the optimistic bubble and put the text back so it isn't lost
      setMessages((prev) => prev.filter((m) => m.messageId !== tempId));
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  function autoGrow(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
    // Let the friend know we're typing — throttled to at most one signal every ~1.8s.
    if (activeUserId != null) {
      const now = Date.now();
      if (now - lastTypingSentRef.current > 1800) {
        lastTypingSentRef.current = now;
        publish("/app/chat/typing", String(activeUserId));
      }
    }
  }

  const filteredConversations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) =>
      (c.otherDisplayName ?? "").toLowerCase().includes(q),
    );
  }, [conversations, query]);

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
  const friendStartButton = (f: FriendData) => (
    <button
      key={f.userId}
      onClick={() => startConversation(f.userId)}
      className="flex w-full items-center gap-3 rounded-2xl border border-line bg-paper-2/50 px-3 py-2.5 text-left transition hover:border-ink-soft/40 hover:bg-paper-2"
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

  return (
    <>
      <div className="mb-6 mt-10">
        <div className="mb-2.5 font-mono text-xs uppercase tracking-[0.18em] text-accent">
          ● Messages
        </div>
        <h1 className="font-display text-[34px] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[44px] lg:text-[54px] lg:leading-none">
          Direct messages
        </h1>
      </div>

      <div className="grid h-[68vh] grid-cols-1 gap-4 lg:grid-cols-[330px_1fr]">
        {/* ── conversation list panel ── */}
        <Card
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
              data-lenis-prevent
              className="no-scrollbar min-h-0 flex-1 overflow-y-auto"
            >
              <div className="space-y-2 p-2.5">
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
                    composableFriends.map((f) => friendStartButton(f))
                  )
                ) : (
                  <>
                    {filteredConversations.map((c) => {
                    const mine = c.lastSenderId === me;
                    // Server-tracked: stays cleared once you've opened the thread (survives re-entry).
                    const unseen = c.unread;
                    return (
                      <button
                        key={c.conversationId}
                        onClick={() => navigate(`/messages/${c.otherUserId}`)}
                        className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
                          c.otherUserId === activeUserId
                            ? "border-accent/40 bg-accent/[0.07]"
                            : "border-line bg-paper-2/50 hover:border-ink-soft/40 hover:bg-paper-2"
                        }`}
                      >
                        <PresenceAvatar
                          initial={(c.otherDisplayName ?? "?")
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
                              {c.otherDisplayName ?? "Unknown"}
                            </span>
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
                      composableFriends.map((f) => friendStartButton(f))}
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
              <>
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => navigate("/messages")}
                    className="font-mono text-lg leading-none text-ink-soft transition hover:text-ink lg:hidden"
                    aria-label="Back"
                  >
                    ‹
                  </button>
                  <PresenceAvatar
                    initial={(activeFriend?.displayName ?? "?")
                      .charAt(0)
                      .toUpperCase()}
                    src={activeFriend?.avatarUrl}
                    size={36}
                    online={activeUserId != null && isOnline(activeUserId)}
                  />
                  <div className="min-w-0">
                    <div className="truncate font-semibold leading-tight">
                      {activeFriend?.displayName ?? "Conversation"}
                    </div>
                    {typing ? (
                      <div className="text-[11px] font-medium leading-tight text-accent-2">
                        typing…
                      </div>
                    ) : (
                      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                        {activeUserId != null && isOnline(activeUserId) ? (
                          <span className="text-accent-2">● Online</span>
                        ) : (
                          "Offline"
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <FadeDivider />

                <div
                  ref={threadRef}
                  onScroll={onThreadScroll}
                  data-lenis-prevent
                  className="no-scrollbar min-h-0 flex-1 overflow-y-auto"
                >
                  <div className="space-y-1 px-4 py-4">
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
                          <div key={m.messageId}>
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
                              className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"} ${startGroup ? "mt-2.5" : "mt-0.5"}`}
                            >
                              {!mine &&
                                (endGroup ? (
                                  <Avatar
                                    initial={(activeFriend?.displayName ?? "?")
                                      .charAt(0)
                                      .toUpperCase()}
                                    src={activeFriend?.avatarUrl}
                                    size={26}
                                  />
                                ) : (
                                  <span className="w-[26px] shrink-0" />
                                ))}
                              <div
                                title={fmtTime(m.createdAtMs)}
                                className={`max-w-[75%] whitespace-pre-wrap break-words px-3.5 py-2 text-[13.5px] leading-snug shadow-sm ${
                                  mine
                                    ? `bg-accent text-white ${endGroup ? "rounded-2xl rounded-br-md" : "rounded-2xl"}`
                                    : `border border-line bg-paper-2 text-ink ${endGroup ? "rounded-2xl rounded-bl-md" : "rounded-2xl"}`
                                }`}
                              >
                                {m.body}
                              </div>
                            </div>
                            {endGroup && (
                              <div
                                className={`mt-0.5 px-1 font-mono text-[9.5px] text-ink-soft ${mine ? "pr-1 text-right" : "pl-9"}`}
                              >
                                {fmtTime(m.createdAtMs)}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                    {typing && !loadingThread && (
                      <div className="mt-2 flex items-end gap-2">
                        <Avatar
                          initial={(activeFriend?.displayName ?? "?")
                            .charAt(0)
                            .toUpperCase()}
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
                    )}
                  </div>
                </div>

                {/* jump-to-latest (shown once you've scrolled up into history) */}
                <button
                  onClick={() => scrollToLatest(false)}
                  aria-label="Jump to latest"
                  className={`absolute bottom-[78px] right-5 grid h-9 w-9 place-items-center rounded-full border border-line bg-paper-2 text-ink shadow-[0_8px_24px_-8px_rgba(27,24,19,0.5)] transition ${
                    showJump
                      ? "visible scale-100 opacity-100"
                      : "pointer-events-none invisible scale-90 opacity-0"
                  }`}
                >
                  <ChevronDownIcon />
                </button>

                <FadeDivider />
                <div className="flex items-end gap-2 px-3 py-3">
                  <textarea
                    ref={textareaRef}
                    data-lenis-prevent
                    value={input}
                    onChange={autoGrow}
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                    placeholder="Message…"
                    className="no-scrollbar max-h-[132px] flex-1 resize-none overflow-y-auto rounded-2xl border border-line bg-paper px-3.5 py-2.5 text-[13.5px] leading-snug outline-none transition focus:border-accent"
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
              </>
            )}
        </Card>
      </div>
    </>
  );
}

// Premium separator — a hairline that fades to transparent at both ends (no harsh edge-to-edge rule).
function FadeDivider() {
  return (
    <div className="mx-4 h-px shrink-0 bg-gradient-to-r from-transparent via-line to-transparent" />
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
