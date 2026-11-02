# Category conventions and where things belong

Owners judge their app against the apps their users already know: "ChatGPT puts the model picker in the chat box", "every booking site lets me sign in with Google". Users do the same without saying it: they spend most of their time in other apps, so they expect yours to work like those (Jakob's law, Nielsen Norman Group). An audit that never makes this comparison misses the problems owners notice first.

## C1. Compare with the category leaders

1. **Name the category** in the app's own words: AI chat assistant, booking, CRM, online store, analytics dashboard, content or creator tool, marketplace, landing page, internal admin.
2. **Pick 3 to 5 leaders** this app's users most likely use. Say why each one.
3. **List what the leaders do** for each core task and each main screen area: where the main action sits, what the navigation holds, what the first screen shows, what settings contain, how sign-in works. If you can search the web or open their sites, do it and cite what you saw. If not, write "from knowledge, not checked today" next to the claim.
4. **Compare, row by row,** in the pain map's **Category conventions** table: at least 6 rows. Each row ends in one verdict:
   - **Matches.**
   - **A pain ID**, when the app differs and users will stumble (lens: "Conventions: C1").
   - **Differs on purpose:** the reason, when the difference is the product's own idea. Ask: does it help the user, or is it just different?
5. **Expected features missing.** Things every leader has and users will look for (Google sign-in, search, an effort or quality control, undo) go in Missing, with the leaders that have them.

## C2. Where does each thing belong? (information architecture)

Check every navigation item, panel and setting against these:

- **IA1. Main navigation holds the places most users visit often.** Rare or expert tools go under a "More" item or in Settings.
- **IA2. Controls sit next to what they change.** A control that changes the next message belongs in the message box; one that changes a list belongs above that list.
- **IA3. Settings hold what you set once.** Preferences, keys, integrations, connected tools, saved memories and account items live in Settings, not in the main navigation.
- **IA4. A panel shows what its section is about.** When the user picks a section, the side panel changes to match. A panel that keeps showing the chat list on every section reads as broken.
- **IA5. One home per thing.** The same feature reached from two unrelated places, with two names, is two features to the user.
- **IA6. Every icon in a navigation rail has a visible label,** or at least a tooltip and a name for screen readers. Icon-only rails work only for the 3 or 4 symbols everyone knows (home, search, settings, profile).

A pain from this check uses the lens "IA: IA#".

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
