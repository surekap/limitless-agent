'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import styles from './manual.module.css'

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugToHref(slug) {
  return `/manual/${slug}`
}

// Rewrite links in docs to proper UI routes
function rewriteHref(href) {
  if (!href) return href
  // Absolute filesystem paths: .../docs/manual/XX-slug.md
  const abs = href.match(/docs\/manual\/([^/]+)\.md$/)
  if (abs) return slugToHref(abs[1])
  // Relative same-dir: ./XX-slug.md or XX-slug.md
  const rel = href.match(/^\.?\/?(\d{2}-[^/]+)\.md$/)
  if (rel) return slugToHref(rel[1])
  return href
}

// Rewrite image/video src to point at the API media endpoint
function rewriteMediaSrc(src) {
  if (!src) return src
  if (src.includes('/api/docs/media/')) return src
  const m = src.match(/([^/]+\.(png|jpg|jpeg|gif|webp|mp4|webm|svg))$/)
  if (m) return `/api/docs/media/${m[1]}`
  return src
}

// ── Custom markdown components ────────────────────────────────────────────────

function MdLink({ href, children }) {
  const rewritten = rewriteHref(href)
  const isInternal = rewritten?.startsWith('/')
  if (isInternal) return <Link href={rewritten}>{children}</Link>
  return <a href={rewritten} target="_blank" rel="noopener noreferrer">{children}</a>
}

function MdImage({ src, alt }) {
  const resolved = rewriteMediaSrc(src)
  const isVideo = /\.(mp4|webm|ogg)$/i.test(resolved)
  if (isVideo) {
    return (
      <video controls playsInline style={{ maxWidth: '100%', borderRadius: '8px', marginTop: '0.5rem' }}>
        <source src={resolved} />
      </video>
    )
  }
  return <img src={resolved} alt={alt || ''} style={{ maxWidth: '100%', borderRadius: '6px' }} />
}

// Render [video] links (markdown links to .mp4) as inline video players
function MdParagraph({ children }) {
  // Detect if paragraph contains only a video link
  if (
    Array.isArray(children) && children.length === 1 &&
    children[0]?.props?.href &&
    /\.(mp4|webm|ogg)$/i.test(children[0].props.href)
  ) {
    const src = rewriteMediaSrc(children[0].props.href)
    return (
      <video controls playsInline style={{ maxWidth: '100%', borderRadius: '8px', margin: '0.75rem 0' }}>
        <source src={src} />
      </video>
    )
  }
  return <p>{children}</p>
}

const MD_COMPONENTS = {
  a: MdLink,
  img: MdImage,
  p: MdParagraph,
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

const CORE_PREFIX  = /^0[1-9]-/
const ADV_PREFIX   = /^(1[0-9]|[2-9]\d)-/

function Sidebar({ docs, currentSlug }) {
  const core     = docs.filter(d => CORE_PREFIX.test(d.slug))
  const advanced = docs.filter(d => ADV_PREFIX.test(d.slug))
  const overview = docs.find(d => d.slug === 'README')

  return (
    <nav className={styles.sidebar}>
      <div className={styles.sidebarHeader}>Manual</div>
      {overview && (
        <Link href="/manual/README" className={`${styles.sidebarLink} ${currentSlug === 'README' ? styles.active : ''}`}>
          Overview
        </Link>
      )}
      {core.length > 0 && (
        <>
          <div className={styles.sidebarSection}>Getting started</div>
          {core.map(d => (
            <Link key={d.slug} href={slugToHref(d.slug)}
              className={`${styles.sidebarLink} ${currentSlug === d.slug ? styles.active : ''}`}>
              {d.title}
            </Link>
          ))}
        </>
      )}
      {advanced.length > 0 && (
        <>
          <div className={styles.sidebarSection}>Advanced</div>
          {advanced.map(d => (
            <Link key={d.slug} href={slugToHref(d.slug)}
              className={`${styles.sidebarLink} ${currentSlug === d.slug ? styles.active : ''}`}>
              {d.title}
            </Link>
          ))}
        </>
      )}
    </nav>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ManualPage() {
  const params     = useParams()
  const router     = useRouter()
  const [docs, setDocs]       = useState([])
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(true)
  const contentRef = useRef(null)

  const slug = params?.slug?.[0] ?? 'README'

  useEffect(() => {
    fetch('/api/docs').then(r => r.json()).then(data => {
      setDocs(Array.isArray(data) ? data : [])
      // If no slug in URL, redirect to README
      if (!params?.slug?.length) return
    }).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/docs/${encodeURIComponent(slug)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.content) setContent(data)
        else setContent(null)
        setLoading(false)
      })
      .catch(() => { setContent(null); setLoading(false) })
  }, [slug])

  // Scroll to top when doc changes
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [slug])

  return (
    <div className={styles.layout}>
      <Sidebar docs={docs} currentSlug={slug} />

      <article className={styles.content} ref={contentRef}>
        {loading ? (
          <div className={styles.loading}>Loading…</div>
        ) : !content ? (
          <div className={styles.notFound}>Page not found.</div>
        ) : (
          <div className={styles.prose}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
              {content.content}
            </ReactMarkdown>
          </div>
        )}
      </article>
    </div>
  )
}
