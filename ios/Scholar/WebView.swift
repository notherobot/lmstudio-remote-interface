import SwiftUI
import WebKit

/// Wraps the bundled Scholar web app (Resources/index.html) in a WKWebView.
///
/// The site itself is untouched — it still talks to LM Studio / AnythingLLM
/// directly over HTTP via fetch(), same as it does in Safari. This view just
/// gives it a native shell: persistent localStorage, no browser chrome, and
/// external links (target="_blank") open in Safari instead of doing nothing.
struct WebView: UIViewRepresentable {

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        // Persistent (not ephemeral) so the Tailscale IP, settings, and chat
        // history saved to localStorage survive relaunches.
        config.websiteDataStore = WKWebsiteDataStore.default()
        config.allowsInlineMediaPlayback = true

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.isOpaque = false
        webView.scrollView.bounces = false
        webView.backgroundColor = UIColor(red: 0x0a / 255, green: 0x12 / 255, blue: 0x1c / 255, alpha: 1)
        webView.scrollView.backgroundColor = webView.backgroundColor
        webView.allowsBackForwardNavigationGestures = false

        if let indexURL = Bundle.main.url(
            forResource: "index",
            withExtension: "html",
            subdirectory: "Resources"
        ) {
            let resourceDir = indexURL.deletingLastPathComponent()
            webView.loadFileURL(indexURL, allowingReadAccessTo: resourceDir)
        } else {
            assertionFailure("Resources/index.html not found in bundle — check that the Resources folder was added as a folder reference (blue icon), not a group.")
        }

        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        // Static content — nothing to push from SwiftUI into the web view.
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {

        // The site's setup screen links to login.tailscale.com with
        // target="_blank". WKWebView doesn't open new windows on its own,
        // so hand those off to Safari instead of letting the tap do nothing.
        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let url = navigationAction.request.url {
                UIApplication.shared.open(url)
            }
            return nil
        }

        // JS alert()/confirm() have no default UI in WKWebView — wire them
        // to real alerts in case a future version of app.js uses them.
        func webView(
            _ webView: WKWebView,
            runJavaScriptAlertPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping () -> Void
        ) {
            presentAlert(message: message, hasCancel: false) { _ in completionHandler() }
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptConfirmPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping (Bool) -> Void
        ) {
            presentAlert(message: message, hasCancel: true) { confirmed in completionHandler(confirmed) }
        }

        private func presentAlert(message: String, hasCancel: Bool, completion: @escaping (Bool) -> Void) {
            DispatchQueue.main.async {
                guard let root = UIApplication.shared.connectedScenes
                    .compactMap({ $0 as? UIWindowScene })
                    .first?.keyWindow?.rootViewController else {
                    completion(true)
                    return
                }
                let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
                if hasCancel {
                    alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completion(false) })
                }
                alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completion(true) })
                root.present(alert, animated: true)
            }
        }
    }
}
