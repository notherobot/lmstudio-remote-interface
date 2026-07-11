import SwiftUI

struct ContentView: View {
    // Matches the site's --bg-app color (style.css) so the launch flash
    // and any unpainted edges blend in instead of flashing white.
    private let appBackground = Color(red: 0x0a / 255, green: 0x12 / 255, blue: 0x1c / 255)

    var body: some View {
        WebView()
            .ignoresSafeArea()
            .background(appBackground)
            .statusBar(hidden: false)
    }
}
