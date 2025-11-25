# X Location Scraper

Chrome extension that the user's country from X/Twitter following/followers lists.

Uses the "Account based in" field (actual geo-detected location, not the fake stuff users type in their bio). We know who you are bud.

## Install

1. Go to `chrome://extensions/`
2. Enable Developer mode
3. Load unpacked → select this folder

## Use

1. **First time only**: Visit any profile's about page (x.com/anyone/about) to capture the query ID
2. Go to any `/following` or `/followers` page on X
3. Click extension → Start Scraping
4. View results in table or export CSV

The extension auto-captures X's API query ID from your browser. If X rotates their API, just visit another about page to refresh it.

For large lists, scraping pauses every 50 users to let you continue or stop.

## Links

- [Buy me a coffee](https://buymeacoffee.com/lowhour)
- [@LowHour](https://x.com/LowHour)
