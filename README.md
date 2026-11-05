# E-learning portfolio

This is a static HTML/CSS/JavaScript portfolio containing the three original SCORM 1.2 packages and a browser-local demonstration runtime.

## Preview

Do not open `index.html` directly. From this folder, start an HTTP server:

```powershell
python -m http.server 8080
```

Then visit `http://localhost:8080/`. Localhost is only a preview on your own computer, not a client-facing link.

## Publish

Upload the complete contents of this folder to a static host such as Cloudflare Pages, Netlify, GitHub Pages or an Amazon S3 static site. Keep the directory structure unchanged and publish from the folder root. The portfolio, player and course files must remain on the same origin.

The included runtime supports the SCORM 1.2 calls used for demo playback and stores bookmark, completion, suspend data and score in that browser's `localStorage`. It is not a certified LMS and does not provide central reporting, accounts, cross-device progress or SCORM 2004 sequencing.

## Branding and contact

Edit `config.js`. Add an email address to `contact.email` to enable the enquiry button; the site intentionally hides it while contact details are missing.

## Add another course

1. Validate that the ZIP contains `imsmanifest.xml` and read the default organization/resource launch `href` plus any `parameters`.
2. Extract it into a new folder under `courses/`, preserving every internal path.
3. Add a matching object to `PORTFOLIO_CONFIG.courses` in `config.js`, using the exact launch path (including manifest query parameters).
4. If it is not SCORM 1.2, add a compatible runtime before advertising progress support.
5. Test the new card, playback, media, interactions, bookmarking and refresh-resume over HTTP.

## Compact hosting edition

This deployment edition omits the preserved source ZIPs and browser-unused authoring files. Narration is encoded as mono 32 kbps MP3, and oversized JPEGs are constrained to the course player's display resolution. Course launch paths, interactions, quizzes, video and runtime files remain in place.

The unchanged original packages and full-quality extracted edition remain in the separate `elearning-portfolio` deliverable folder; keep that version as the archival master rather than uploading it to a size-limited static host.
