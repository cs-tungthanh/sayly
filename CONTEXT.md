# Sayly

A Chrome extension for English language learners to hear pronunciation of words and sentences on any webpage.

## Core Concepts

### Selection
Text highlighted by the user on a webpage. Can be a single word, full sentences, or even multiple paragraphs. The extension responds to any text selection; one longer than 5,000 characters is cut at a word, with an ellipsis, so the popup stays quick and can still be translated.

### Pronunciation
Audio playback of the selected text using American English (en-US). Plays at normal speaking speed. Users can restart pronunciation while audio is playing to hear it again immediately - essential for learning contexts where repetition aids retention.

### Popup
The floating UI card that appears near the cursor after selection. Shows the selected text, IPA phonetic transcription for each word, and provides a play button to trigger pronunciation. Dismissed by clicking anywhere outside it. When dismissed, any playing audio stops immediately - dismissal signals the user is done with that learning moment. On any site, a popup opened in full screen shows over the full-screen content, and clicks or scrolls on it don't reach a video player beneath it. Entering or leaving full screen closes an open popup, since it was placed for the other mode.

### IPA (International Phonetic Alphabet)
Phonetic transcription displayed for each word in the selection. Fetched in parallel from the Free Dictionary API. Each word is shown in a separate blue-tinted card with the word label above and IPA notation below. Words without available IPA data are silently skipped - only words with phonetic data appear. This design works equally well for single words and full sentences, helping learners see pronunciation for every recognizable word in their selection.

**Contraction Expansion:** Before looking up IPA, contractions are automatically expanded to their full forms (e.g., "doesn't" becomes "does not"). This ensures learners see pronunciation for both parts of common contractions, improving coverage and educational value.

### Sentence Replay (YouTube)
On a YouTube watch page, A jumps back to the start of the sentence being spoken, so learners can hear it again; pressed again within a second it goes to the sentence before. D jumps to the next sentence. YouTube doesn't use A or D itself. "A and D jump by" can be set to Seconds instead, so they always skip back or forward by the chosen seconds. Sentences come from the video's captions: Sayly can't request captions itself (YouTube requires a token its player makes), so it re-fetches the caption request the player makes when captions are on. With CC off, Sayly loads them by itself when a video opens ("Load captions automatically", on by default): it hides the caption text, turns CC on until the player has fetched them, and turns it back off. It then rejoins the caption lines' words and splits them at sentence punctuation or pauses, cutting sentences longer than 10 seconds at the next line; captions with hardly any punctuation are split at every line. Without captions, or while an ad plays, A and D skip back or forward by a chosen number of seconds (1–60, default 2). The keys are ignored while typing in search, comments or any field, and they follow the site's on/off switch. The amount is set on the options page and applies without reloading. YouTube features live in `src/youtube/`; each one is a `YouTubeFeature` listed in `youtube-features.ts`.

### Sayly Subtitles (YouTube)
While CC is on and the video's sentences can be read, Sayly hides the player's captions and shows its own: whole sentences (the same ones the A/D shortcuts use) instead of short caption lines, each held until the next sentence starts, or for 5 seconds after it ends when nothing follows. The last 1–3 sentences show at once ("Sentences shown", default 2), older ones smaller and dimmed, and the word being spoken is marked. Their text size is set in pixels ("Subtitle size", 12–48 px, default 18 px) and stays the same in full screen; changes apply while the video plays; manual captions only time each line, so their word timing is estimated. Without readable sentences, or during an ad, the player's captions show as usual. The subtitle lines take the pointer, so their words can be hovered and selected; a click on them doesn't reach the player (it doesn't pause the video). On by default ("Sayly subtitles"), in the player panel and on the options page.

### Caption Hover (YouTube)
Resting the pointer on a word in a YouTube video's captions for a moment (300 ms) pauses the video, marks the word and opens its popup, as if it were selected. The popup stays while the pointer is on the word or the popup, so its buttons can be used; moving onto another word swaps the popup, still paused. About 300 ms after the pointer leaves both, the popup closes and the video plays again — only if hovering paused it, and not when the user played it meanwhile. A selection's popup isn't replaced by hovering. Hovering follows the popup setting "Don't display" (no popup, no pause) but ignores "Display icon": the popup opens directly. Works in full screen; entering or leaving full screen closes the popup and plays the video again if hovering paused it. On by default ("Hover words in captions"), in the player panel and on the options page.

### Player Panel (YouTube)
A Sayly button in YouTube's player control bar, next to the gear, opens a dark panel over the video with Sayly's YouTube settings: the A/D shortcuts on/off, whether they jump by sentence or seconds, the seconds to skip, Sayly subtitles (on/off, sentences shown, size), hovering caption words, and whether this video's captions are loaded. Loading captions automatically is only on the options page. It works in full screen and closes on Escape or a click outside, without pausing the video. The same settings are on the options page.

## Design Principles

- **Immediate feedback**: Popup appears as soon as text is selected
- **Reliability over quality**: Uses browser's built-in Web Speech API to ensure pronunciation always works, avoiding network dependencies and CORS issues
- **Learning-focused**: Features (replay, dismissal behavior) optimize for language learners who need repetition and focus
- **Any length**: Handles selections from single words to several paragraphs, cutting very long ones (over 5,000 characters)
