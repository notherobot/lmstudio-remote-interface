# Scholar for iOS

A native iOS wrapper around this repo's web app. It's the same `index.html` /
`app.js` / `style.css` you already have, loaded into a `WKWebView` inside a
SwiftUI shell instead of Safari — no rewrite, no App Store, no PWA
limitations (real localStorage persistence, no "Add to Home Screen" nag, no
Safari UI chrome eating screen space).

This is source only — there's no `.xcodeproj` here. Xcode project files are
brittle to hand-generate, so the reliable path is: create the project in
Xcode, then drop these files in.

## What's in this folder

```
ios/Scholar/
  ScholarApp.swift       — @main app entry point
  ContentView.swift       — root SwiftUI view, hosts the WebView full-screen
  WebView.swift            — UIViewRepresentable wrapping WKWebView
  Info-Additions.plist    — keys to add in Xcode's Info tab (see below)
  Resources/               — copy of the site: index.html, app.js, style.css,
                              marked.min.js, manifest.json, sw.js, icons,
                              fonts/, images/
```

## Setup steps

1. **Create the project**
   Xcode → File → New → Project → iOS → App.
   - Product Name: `Scholar`
   - Interface: **SwiftUI**
   - Language: **Swift**
   - Uncheck "Use Core Data" and "Include Tests" (not needed)

2. **Replace the generated Swift files**
   Delete the template's `ContentView.swift` and `ScholarApp.swift` (or
   whatever the project name generated), then drag in this folder's
   `ScholarApp.swift`, `ContentView.swift`, and `WebView.swift`. In the
   dialog, check **"Copy items if needed"** and make sure the app target's
   checkbox is ticked.

3. **Add the Resources folder — as a folder reference, not a group**
   Drag the `Resources` folder from this repo into the Xcode project
   navigator. When prompted, choose **"Create folder references"** (shows as
   a blue folder icon), not "Create groups" (yellow icon). This matters:
   `WebView.swift` loads `index.html` via
   `Bundle.main.url(forResource:withExtension:subdirectory: "Resources")`,
   which needs the on-disk folder structure preserved so `fonts/` and
   `images/` resolve as subpaths the same way the CSS/HTML already expect.

4. **Add the Info.plist keys**
   Open the project settings → target **Scholar** → **Info** tab. Add the
   four keys from `Info-Additions.plist`:
   - `NSAppTransportSecurity` → `NSAllowsArbitraryLoads` = `YES`
     (required — LM Studio is plain `http://`, not `https://`)
   - `NSCameraUsageDescription`
   - `NSPhotoLibraryUsageDescription`
   - `NSLocalNetworkUsageDescription`

   You can add these as raw XML by right-clicking in the Info editor →
   "Add Row" for each, or by switching the editor to "Raw Keys & Values" and
   pasting the `<key>`/`<string>` pairs.

5. **Set a deployment target**
   iOS 16 or later is fine (project settings → General → Minimum Deployments).

6. **Run it on your phone**
   Plug in your iPhone, select it as the run destination, hit ▶. First run:
   on the phone, go to **Settings → General → VPN & Device Management** and
   trust your developer certificate.

   With a free Apple ID (no paid developer account) the app's signature
   expires after **7 days** — reinstall from Xcode to renew. A $99/yr Apple
   Developer account extends that to a year and removes the device-count
   limit. Since this is personal use only, no App Store submission is
   needed either way.

## How it behaves

- Loads `Resources/index.html` from the app bundle via `loadFileURL` — fully
  offline shell, no dependency on GitHub Pages staying up.
- Uses the **persistent** `WKWebsiteDataStore`, so the Tailscale IP,
  settings, and saved chat sessions in `localStorage` survive app relaunches
  exactly like they do in Safari today.
- All LM Studio / AnythingLLM traffic still goes straight from the app to
  your Tailscale IP over `fetch()` — nothing changed there, no proxy, no new
  backend.
- `target="_blank"` links (the `login.tailscale.com` link on the setup
  screen) open in Safari instead of doing nothing, via
  `WKUIDelegate.createWebViewWith`.
- `<input type="file">` attachments use iOS's native document/photo picker
  automatically — no extra code needed for that part.

## Keeping it in sync with the web app

`Resources/` is a snapshot, not a live link. When you update
`index.html` / `app.js` / `style.css` / etc. at the repo root, re-copy the
changed files into `ios/Scholar/Resources/` and rebuild in Xcode.

## If you'd rather not bundle files at all

The simplest possible version of this wrapper is pointing `WebView.swift` at
the live site instead of a local bundle — replace the `loadFileURL` call
with:

```swift
webView.load(URLRequest(url: URL(string: "https://notherobot.github.io/lmstudio-remote-interface/")!))
```

That removes the "keep Resources in sync" step entirely (you get whatever's
live on GitHub Pages), at the cost of needing network access to GitHub Pages
itself, and it drops the ATS exception requirement since that URL is https.
Given the app already needs Tailscale connectivity to be useful, this
tradeoff is a matter of taste — bundling is what's set up here because it
gives you a fully self-contained app you can tweak without touching the
public site.
