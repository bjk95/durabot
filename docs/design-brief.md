# durabot: Design Brief for Claude Design

## What to design

Design every screen and component of **durabot** in Apple's current design language, **Liquid Glass** (iOS 26 and macOS Tahoe, introduced at WWDC 2025).

durabot is a personal app for one owner. You make AI "bots" by chatting. Each bot lives in **one long, never-ending thread** with you (like a messenger contact). Bots can read your Gmail, Calendar, and Todoist, and they can also act on their own at set times and send a notification. The app is used mostly **on a phone, installed as a Home Screen app (PWA)**, and also on a desktop browser.

The feeling: calm, personal, quick, native. It should look like an Apple first-party app, such as Messages, Reminders, or Journal, not like a web dashboard or a developer tool.

## Design language rules

Follow these. Where the web cannot do a thing exactly, say how to approximate it.

1. **Liquid Glass for the control layer, not for content.** Glass is for things that float above content: the top bar, the tab control, the composer, sheets, cards that float, toasts. Message bubbles, list rows, and text blocks are plain content and are not glass.
2. **Content goes edge to edge, under the glass.** Content scrolls beneath a floating top bar and a floating composer. At the scroll edges use a soft fade or blur ("scroll edge effect") so text stays readable.
3. **Floating, capsule-shaped controls.** Buttons, the segmented tab control, and the composer are capsules or rounded rectangles with **concentric corners** (inner radius = outer radius minus padding). Controls sit inside the safe area with a visible gap to the screen edge.
4. **Glass has two variants:** *regular* (frosted, adaptive) for bars and sheets, and *clear* (more transparent, with a dimming layer when needed) for small controls over rich content. Show a subtle specular highlight on the edge and a soft shadow.
5. **Tint with one accent colour.** Use tint only for the primary action (send, Connect) and for the user's own message bubbles. Keep everything else neutral.
6. **Motion.** Controls morph into each other (for example the Send button becomes a Stop button, the tab control slides a glass "thumb" between segments, the top bar shrinks as you scroll). Describe the motion in short notes per screen. Keep it fast and springy.
7. **Typography.** SF Pro (system-ui fallback). Large left-aligned title on list screens that collapses to a small centred title on scroll. Dynamic type friendly. Body text 17 px on phone.
8. **Icons.** SF Symbols style (monoline, rounded, consistent weight). Suggest the symbol name for each icon.
9. **Colour and dark mode.** Design **light and dark** for every screen. Use the system grouped-background feel (soft off-white and near-black), vibrant labels (primary, secondary, tertiary), and the system blue family as the default accent (the owner may change it).
10. **Accessibility.** Show a **Reduce Transparency** fallback (solid materials), minimum 44 pt touch targets, 4.5:1 text contrast on glass, and visible focus rings on desktop.

## Screens and components to design

Design each at **phone (390 × 844)** and **desktop (centred column, about 720 px wide, with a floating sidebar glass panel on wide screens)**, in light and dark.

### 1. Home: the bot list
- Large title "durabot". Top-right glass buttons: Connections, Settings.
- List of bots as a messages-style list: round emoji avatar, name, last message preview (one line), time, **unread count badge**.
- **Builder** (the bot that creates other bots) is pinned at the top with a distinct hammer avatar.
- Empty state: a short prompt that says to open Builder and describe a bot, with a suggested example.
- Swipe actions are not needed (delete happens in chat).

### 2. Bot page shell
- Floating glass top bar: back button, avatar, bot name, model name as small secondary text, and a three-segment glass control: **Chat · Runs · Settings**.
- Bar collapses when scrolling.

### 3. Chat (the main screen: design this with the most care)
Show these states together on one scrolling screen:
- **User message** (tinted bubble, right) and **bot message** (neutral bubble, left; supports links, bold, inline code, and short paragraphs).
- **Streaming bot message** with a typing indicator, and live partial text.
- **Tool line**: a small secondary line with a wrench symbol, for example `Searched tools · GMAIL_FETCH_EMAILS`, with a spinner while it runs. Tool lines are quiet.
- **Connect card**: a floating glass card with the app logo (Gmail), the text "Connect Gmail", and a tinted capsule button.
- **Settings change card**: a centred pill, for example "Schedule added: weekdays 8:00", with an **Undo** capsule; and its "undone" state (struck through).
- **Proactive message**: a centred origin chip above the message, for example "Schedule · Weekdays 8am" or "Trigger · New Gmail message".
- **Date dividers** and a "Load earlier messages" pill at the top (the thread is very long).
- **Composer**: a floating glass capsule with a growing text field, a send button (tinted circle) that morphs into a stop button while the bot works. Safe-area aware, keyboard aware.
- **Empty thread state**: large avatar, name, "Say something to start the thread."

### 4. Runs tab
- A grouped list of runs. Each row: source badge (Chat, Schedule, Trigger), label, status (done, error, running), the tools used, time, and cost.
- Empty state.

### 5. Bot settings tab
Grouped form sections in the Settings app style (inset grouped lists, glass save bar):
- Identity: emoji, name.
- Persona (multi-line), model (text with a menu of suggestions), apps (chips for connected apps with a "+" chip).
- **Schedules** list: plain-words title, cron in secondary text, the prompt, Remove button. Empty state that says "Ask the bot: check my inbox every weekday at 8am."
- **Triggers** list: same pattern.
- **Memory** (multi-line text).
- **Delete this bot** destructive row with a confirmation sheet.
- Note at the top: "Chat is the main way to change a bot."

### 6. Connections
- List of apps (Gmail, Google Calendar, Todoist, GitHub, Slack, Notion, and others): logo, name, "Used by Inbox Helper", and either a **Connected** badge or a **Connect** capsule button. Include an error banner state and a loading state.

### 7. Settings
- Time zone field with helper text.
- "About me" shared memory (multi-line).
- Notifications card with a "Turn on for this device" button and success, blocked, and iPhone-needs-Home-Screen states.

### 8. Other
- 404 and error screen.
- A confirmation sheet and a toast (glass).
- Web push notification mock-ups (lock screen, banner) for a scheduled run.
- App icon (Liquid Glass style layered icon, a friendly bot face; light, dark, and tinted variants) and the Home Screen splash.

## Deliverables

1. Every screen above, phone and desktop, light and dark (reduced-transparency variant for Chat).
2. A **component sheet**: top bar, segmented glass control, buttons (primary, secondary, destructive, icon), list row, badge and chips, message bubbles, tool line, Connect card, change card, origin chip, composer, form fields and groups, sheet, toast, empty states. Show states: default, pressed, disabled, focus.
3. **Design tokens** for hand-off. Keep these existing CSS variable names so the code can adopt them directly: `--bg`, `--surface`, `--surface-2`, `--line`, `--ink`, `--muted`, `--accent`, `--accent-ink`, `--danger`. Add new tokens for glass (blur radius, tint opacity, highlight, shadow), radii (concentric scale), spacing, and type scale.
4. For each glass element, a note on the **web build**: `backdrop-filter: blur() saturate()`, an optional SVG displacement filter for the lens effect, a 1 px inner highlight, and the fallback when `backdrop-filter` or Reduce Transparency is not available.

## Technical constraints (for the hand-off)

- React with Tailwind CSS 4, colours from CSS variables, `prefers-color-scheme` for dark mode.
- Chat uses assistant-ui primitives, so the message list, viewport, and composer are separate parts that accept custom styling.
- Icons come from lucide-react today (SF Symbols style). Say if a different set is better.
- Keep the layout one column on phone. No horizontal scroll. Respect `env(safe-area-inset-*)`.
- No new features: design only what is listed.
