// Forum: shared rules used by the app, the local test server, and mirrored in supabase/schema.sql.
export const CATEGORIES = {
  housing: { label: 'Housing', icon: '🛏️' },
  food: { label: 'Food & local', icon: '🍽️' },
  rides: { label: 'Rides', icon: '🚗' },
  work: { label: 'Work & pay', icon: '💵' },
  general: { label: 'General', icon: '💬' },
};
export const OVERALL = 'overall';
export const HIDE_AFTER = 3; // distinct reports before a post is hidden pending review
export const LIMITS = { name: [2, 30], title: [3, 120], body: 4000 };
export const GUIDELINES = [
  'No security details, site layouts, access or badge info, or anything proprietary.',
  'Don’t name or call out individuals — talk about the plant, the job, the town.',
  'Be respectful. Disagree with ideas, not people.',
];
// Gentle heads-up (not a block) when a post looks like it touches security-sensitive info.
const SENSITIVE = /\b(badge|gate code|door code|keypad|vital area|protected area|security (post|plan|officer)|guard post|camera|password|combo|combination|clearance|safeguards|floor ?plan|layout|elevation \d|room \d{2,})\b/i;
export const looksSensitive = (s) => SENSITIVE.test(String(s || ''));

const clean = (s) => String(s ?? '').replace(/\s+$/g, '').replace(/^\s+/, '');
export function validName(n) {
  const v = clean(n);
  if (v.length < LIMITS.name[0] || v.length > LIMITS.name[1]) return `Display name must be ${LIMITS.name[0]}–${LIMITS.name[1]} characters`;
  return null;
}
export const validBoard = (b) => /^[a-z0-9-]{2,60}$/.test(String(b || ''));
export function validThread(t) {
  if (!validBoard(t.board)) return 'Unknown board';
  if (!CATEGORIES[t.category]) return 'Pick a category';
  const title = clean(t.title);
  if (title.length < LIMITS.title[0]) return 'Give it a title (3+ characters)';
  if (title.length > LIMITS.title[1]) return `Title is over ${LIMITS.title[1]} characters`;
  if (String(t.body || '').length > LIMITS.body) return `Post is over ${LIMITS.body} characters`;
  return null;
}
export function validReply(body) {
  const b = clean(body);
  if (!b) return 'Write something first';
  if (b.length > LIMITS.body) return `Reply is over ${LIMITS.body} characters`;
  return null;
}
export const shouldHide = (reportCount) => reportCount >= HIDE_AFTER;
export const sortThreads = (l) => [...l].sort((a, b) => (b.last_activity_at > a.last_activity_at ? 1 : b.last_activity_at < a.last_activity_at ? -1 : 0));
export const visible = (x, me) => (!x.hidden && !x.deleted) || (!!me && x.author_id === me);

export function timeAgo(iso, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24); if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
