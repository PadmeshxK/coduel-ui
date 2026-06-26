// Human phrasing keyed off a message's kind, shared by the DM toast/bell and the reply quote so the
// wording stays consistent everywhere.

/** DM notification copy by kind — "X sent you an image", "X shared a problem", … */
export function dmNotificationText(kind?: string | null): { kicker: string; action: string } {
  switch (kind) {
    case 'IMAGE':
      return { kicker: 'Image', action: 'sent you an image' }
    case 'CODE':
      return { kicker: 'Code', action: 'sent you a code snippet' }
    case 'PROBLEM_SHARE':
      return { kicker: 'Problem', action: 'shared a problem with you' }
    case 'VOICE':
      return { kicker: 'Voice', action: 'sent you a voice message' }
    default:
      return { kicker: 'Message', action: 'sent you a message' }
  }
}

/** Quoted-message label for a reply — media kinds show a label instead of their (empty) body. */
export function replyPreviewText(kind: string | null | undefined, preview: string): string {
  switch (kind) {
    case 'IMAGE':
      return 'Photo'
    case 'CODE':
      return 'Code snippet'
    case 'PROBLEM_SHARE':
      return 'Duel challenge'
    case 'VOICE':
      return 'Voice message'
    default:
      return preview
  }
}
