# Privacy Policy for Sayly

**Last Updated: November 14, 2026**

## Overview

Sayly is a Chrome extension that helps users learn English pronunciation. We are committed to protecting your privacy and being transparent about our practices.

## Data Collection

**We do not collect, store, or transmit any personal data.**

## How the Extension Works

The extension runs in your browser and only contacts the services listed under Third-Party Services:

1. **Text Selection**: When you select text on a webpage, the extension processes it locally in your browser
2. **IPA Notation**: Pronunciations come from a dictionary built into the extension, so looking up a word normally sends nothing. Only for a word that dictionary doesn't have, the word is sent to the Free Dictionary API (dictionaryapi.dev) - no user information is sent
3. **English definitions** (optional, on by default): When you select a single word, it is sent to the Free Dictionary API (dictionaryapi.dev) to get its meanings and examples - no user information is sent. Turn English definitions off in Settings to stop this
4. **Translation** (optional): Translation is on by default (Vietnamese). The selected text is sent to Google Translate, or to MyMemory if Google fails, to translate it. Turn translation off in Settings to stop this
5. **Gemini translation** (optional, off unless you add a key): If you add your own Gemini API key in Settings, the popup shows a "Say it naturally" button. Only when you click it, the selected text is sent to Google's Gemini API with your key
6. **Text-to-Speech**: When you press play, the text being spoken is sent to Google Translate's text-to-speech service to get the audio. If that fails, your browser's built-in speech synthesis is used instead, which runs locally
7. **No Tracking**: We don't track your usage, selections, or browsing activity
8. **No Analytics**: We don't use any analytics services
9. **No Cookies**: We don't set or read any cookies

## Permissions Used

The extension requires certain permissions to function:

- **activeTab**: To detect text selection on the current webpage
- **scripting**: To inject the pronunciation popup interface
- **offscreen**: To play pronunciation audio in a hidden extension page, so websites can't block it
- **Host permissions**: To work on any website you visit, to reach translate.googleapis.com and api.mymemory.translated.net for translation, generativelanguage.googleapis.com for Gemini translation, and translate.google.com for pronunciation audio

These permissions are used solely to provide the pronunciation functionality and are not used to collect any data.

## Third-Party Services

The extension makes requests to:
- **Free Dictionary API** (dictionaryapi.dev): To fetch IPA phonetic notation for words missing from the built-in dictionary, and English definitions of a selected word when that setting is on
  - Only the word itself is sent
  - No user information or identifiers are included
  - This is a public API that doesn't require authentication
- **Google Translate** (translate.googleapis.com): To translate selected text, only when translation is on
  - Only the selected text and target language are sent, without cookies
- **MyMemory** (api.mymemory.translated.net): Fallback translation when Google fails, only when translation is on
  - Only the selected text and target language are sent, without cookies
- **Google Gemini API** (generativelanguage.googleapis.com): To translate selected text with Gemini, only when you click the Gemini button and have added your own API key
  - Only the selected text and your API key are sent, without cookies
  - Google's Gemini API terms apply to these requests
- **Google Translate text-to-speech** (translate.google.com): To play pronunciation audio, only when you press play
  - Only the text being spoken is sent

## Data Storage

- **Local Settings Only**: The extension stores your settings (disabled sites, translation language, and your Gemini API key if you add one) in your browser's extension storage, on this device only
- **No Cloud Storage**: We don't have any servers or cloud storage
- **No Caching**: Previous lookups are not saved or cached

## Children's Privacy

This extension does not knowingly collect any information from children under 13 years of age.

## Changes to This Policy

If we make changes to this privacy policy, we will update the "Last Updated" date above.

## Contact

If you have questions about this privacy policy or the extension, please:
- Open an issue on our [GitHub repository](https://github.com/cs-tungthanh/sayly)
- Contact the developer at: cs.tungthanh@gmail.com

## Summary

- ✅ No data collection
- ✅ No tracking
- ✅ No ads
- ✅ No cookies
- ✅ No user accounts
- ✅ Completely private

Your privacy is protected because we simply don't collect any data.