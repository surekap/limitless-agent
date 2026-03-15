import './globals.css'
import Navigation from '../components/Navigation'
import SearchOverlay from '../components/SearchOverlay'

export const metadata = { title: 'secondbrain' }

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Navigation />
        <main>{children}</main>
        <SearchOverlay />
      </body>
    </html>
  )
}
