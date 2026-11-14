# Category conventions and where things belong

Owners judge their app against the apps their users already know: "ChatGPT puts the model picker in the chat box", "every booking site lets me sign in with Google". Users do the same without saying it: they spend most of their time in other apps, so they expect yours to work like those (Jakob's law, Nielsen Norman Group). An audit that never makes this comparison misses the problems owners notice first.

## C1. Compare with the category leaders

1. **Name the category** in the app's own words: AI chat assistant, booking, CRM, online store, analytics dashboard, content or creator tool, marketplace, landing page, internal admin.
2. **Pick 3 to 5 leaders** this app's users most likely use. Say why each one.
3. **Research them live.** When you have a web search or a web fetch tool, you must use it: for each leader, open its help pages or product pages and read how the feature works today. Leaders change every month, and what you remember is often a version old. Write the URL you opened and the date you checked it in the **Source** column, like `https://help.example.com/tools (checked 2026-11-12)`. Only when no web tool exists may a row say "from knowledge, not checked today", and then the header says "Competitor research: from knowledge, no web tool".
4. **List what the leaders do** for each core task and each main screen area: where the main action sits, what the navigation holds, what the first screen shows, what settings contain, how sign-in works. Then, for every main feature the app has, how it works (C3).
5. **Compare, row by row,** in the pain map's **Category conventions** table: at least 10 rows. Each row has a **Kind** ("Where it sits" or "How it works"; at least 3 rows are "How it works"), a **Source**, and ends in one verdict:
   - **Matches.**
   - **A pain ID**, when the app differs and users will stumble (lens: "Conventions: C1" for where it sits, "Conventions: C3" for how it works).
   - **Differs on purpose:** the reason, when the difference is the product's own idea. Ask: does it help the user, or is it just different? If the owner wrote the reason down (see owner-rules.md), quote it.
6. **Expected features missing.** Things the leaders have and users will look for (Google sign-in, search, an effort or quality control, undo, a way to make your own with help) go in Missing, under **What leaders have that this app doesn't**, with the leaders named and linked.

## C2. Where does each thing belong? (information architecture)

Check every navigation item, panel and setting against these:

- **IA1. Main navigation holds the places most users visit often.** Rare or expert tools go under a "More" item or in Settings.
- **IA2. Controls sit next to what they change.** A control that changes the next message belongs in the message box; one that changes a list belongs above that list.
- **IA3. Settings hold what you set once.** Preferences, keys, integrations, connected tools, saved memories and account items live in Settings, not in the main navigation.
- **IA4. A panel shows what its section is about.** When the user picks a section, the side panel changes to match. A panel that keeps showing the chat list on every section reads as broken.
- **IA5. One home per thing.** The same feature reached from two unrelated places, with two names, is two features to the user.
- **IA6. Every icon in a navigation rail has a visible label,** or at least a tooltip and a name for screen readers. Icon-only rails work only for the 3 or 4 symbols everyone knows (home, search, settings, profile).

A pain from this check uses the lens "IA: IA#".

## C3. How it works (behavior, not only placement)

Two apps can put a feature in the same place and still work very differently. Owners notice: "there it is one switch for good, here I flip it in every chat". For every main feature the app has, research how 2 or more leaders handle it, and compare. Ask these 5 questions:

1. **Set once, or every time?** Is it set once for the account, or again for each chat, item or session?
2. **How is it called up?** A menu, a typed shortcut such as "/" or "@", a button, or by itself when it is needed?
3. **How does a result show, and what happens before anything is sent or changed?** Does it act at once, or show a draft first and wait for a confirm?
4. **How do users make their own?** Can they create one with help ("create with AI"), import one, or start from a template?
5. **What does it look like on phone?** The same controls, fewer, or a different layout?

Each answer that differs from the leaders is a row in **Category conventions** with Kind "How it works": a pain (lens "Conventions: C3"), or "Differs on purpose:" with the reason. You can only answer these by using the feature or reading how it works: looking at where it sits is not enough. If you could not use the feature (the owner said no to "use the app like a real user"), compare what you can see and put the rest in Not verified.

## Starter checklists

Use these to start the leaders' list, then check them against the real leaders. They are prompts, not verdicts.

**Every app with an account**
- Sign in: Google or Apple sign-in where the audience expects it, show-password, forgot-password, a logo and form with even spacing in a fixed-width card.
- After sign-in: lands on the main job, not on settings or an empty page.
- Settings: grouped by what people look for (Account, Preferences, Billing, Connections), in plain words.

**AI chat or assistant**
- The message box holds the per-message controls: attach, tools, model or mode, effort or quality, voice, send.
- New chat is one click; past chats are searchable by their words.
- The model or mode in use is always visible; cost or usage is labeled in words.
- Creating an image, file or other artifact starts from the message box, and the assistant understands the request in words.
- Memory and personalization live in Settings, with a clear signal when the app wants to remember something.
- Voice input turns speech into text you can see before it is sent.

**Booking or scheduling**
- Availability first, then details. The price and total are visible before the last step.
- Change and cancel are easy to find after booking. Confirmation by email.

**Online store**
- Search and filters on lists, the price and stock near the buy button, the cart reachable from every page, guest checkout.

**Dashboard or admin tool**
- The first screen answers "what needs me now" with numbers. Lists can be filtered, sorted and searched. Actions sit on the rows they affect.

**Content or creator tool**
- Drafts save on their own and say so. Preview before publish. Publishing asks once, clearly.

**Landing page**
- Above the fold: what it is, who it is for, one main action. Price or "free" is findable from the navigation. Real product proof, not placeholders.
