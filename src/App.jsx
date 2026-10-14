import { useEffect, useMemo, useRef, useState } from 'react'

const nameOf = (p) => p.split(/[\\/]/).pop()
const dirOf = (p) => p.slice(0, Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')))
const OK_EXT = /\.(mp4|m4v|mov|mkv|avi|webm|flv|wmv|m4a|wav|ogg)$/i
const QUALITIES = [
  { kbps: 128, label: 'Léger', hint: '128 kbps' },
  { kbps: 192, label: 'Standard', hint: '192 kbps' },
  { kbps: 256, label: 'Haute', hint: '256 kbps' },
  { kbps: 320, label: 'Maximale', hint: '320 kbps' }
]

const fmtSize = (b) => {
  if (!b) return ''
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} Ko`
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1).replace('.', ',')} Mo`
  return `${(b / 1024 ** 3).toFixed(2).replace('.', ',')} Go`
}

const load = (k, d) => {
  try {
    const v = localStorage.getItem(k)
    return v === null ? d : JSON.parse(v)
  } catch {
    return d
  }
}
const save = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {}
}

export default function App() {
  const [items, setItems] = useState([]) // {file, size, status, pct, out, outSize, error}
  const [outDir, setOutDir] = useState(() => load('outDir', null))
  const [bitrate, setBitrate] = useState(() => load('bitrate', 192))
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [notice, setNotice] = useState('')
  const stop = useRef(false)
  const depth = useRef(0)

  useEffect(() => save('outDir', outDir), [outDir])
  useEffect(() => save('bitrate', bitrate), [bitrate])

  const patch = (file, p) =>
    setItems((list) => list.map((it) => (it.file === file ? { ...it, ...p } : it)))

  useEffect(() => window.racmp3.onProgress(({ file, pct }) => patch(file, { pct })), [])

  const add = async (files) => {
    const valid = files.filter((p) => OK_EXT.test(p))
    const skipped = files.length - valid.length
    const known = new Set(items.map((i) => i.file))
    const fresh = valid.filter((f) => !known.has(f))
    if (fresh.length) {
      const info = await window.racmp3.fileInfo(fresh)
      setItems((list) => [
        ...list,
        ...info.map(({ file, size }) => ({ file, size, status: 'waiting', pct: 0 }))
      ])
    }
    setNotice(skipped ? `${skipped} fichier${skipped > 1 ? 's' : ''} ignoré${skipped > 1 ? 's' : ''} (format non pris en charge).` : '')
  }

  const onDrop = (e) => {
    e.preventDefault()
    depth.current = 0
    setOver(false)
    if (busy) return
    add([...e.dataTransfer.files].map((f) => window.racmp3.pathForFile(f)))
  }
  const onEnter = (e) => {
    e.preventDefault()
    depth.current++
    setOver(true)
  }
  const onLeave = () => {
    depth.current = Math.max(0, depth.current - 1)
    if (!depth.current) setOver(false)
  }

  const run = async () => {
    stop.current = false
    setBusy(true)
    setNotice('')
    const todo = items.filter((i) => i.status !== 'done').map((i) => i.file)
    const total = todo.length
    for (let n = 0; n < total; n++) {
      if (stop.current) break
      const file = todo[n]
      patch(file, { status: 'running', pct: 0, error: null })
      const r = await window.racmp3.convert({ file, outDir, bitrate })
      if (r.ok) patch(file, { status: 'done', pct: 100, out: r.out, outSize: r.size })
      else if (r.cancelled) patch(file, { status: 'waiting', pct: 0 })
      else patch(file, { status: 'error', error: r.error })
      window.racmp3.taskbarProgress((n + 1) / total)
    }
    window.racmp3.taskbarProgress(-1)
    setBusy(false)
  }

  const cancel = () => {
    stop.current = true
    window.racmp3.cancel()
  }

  const remove = (file) => setItems((l) => l.filter((x) => x.file !== file))
  const retry = (file) => patch(file, { status: 'waiting', pct: 0, error: null })

  const stats = useMemo(() => {
    const done = items.filter((i) => i.status === 'done').length
    const err = items.filter((i) => i.status === 'error').length
    const pending = items.length - done
    const running = items.find((i) => i.status === 'running')
    const overall = items.length
      ? (items.reduce((s, i) => s + (i.status === 'done' ? 100 : i.status === 'running' ? i.pct : 0), 0) / (items.length * 100)) * 100
      : 0
    return { done, err, pending, running, overall }
  }, [items])

  const doneItems = items.filter((i) => i.status === 'done')
  const folderOfDone = doneItems.length ? dirOf(doneItems[doneItems.length - 1].out) : null
  const allDone = items.length > 0 && stats.pending === 0

  return (
    <div
      className={`app ${over ? 'over' : ''}`}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={onEnter}
      onDragLeave={onLeave}
      onDrop={onDrop}
    >
      <header>
        <img src="icon.png" alt="" width="40" height="40" />
        <div>
          <h1>Rac<span>Mp3</span></h1>
          <p>Convertisseur MP4 → MP3</p>
        </div>
      </header>

      <main>
        {items.length === 0 ? (
          <button className="drop" onClick={async () => add(await window.racmp3.selectFiles())}>
            <span className="drop-icon" aria-hidden="true">⬇</span>
            <strong>Glisse tes vidéos ici</strong>
            <span>ou clique pour choisir des fichiers</span>
            <small>MP4, MOV, MKV, AVI, WebM…</small>
          </button>
        ) : (
          <>
            <div className="list-head">
              <span>
                {items.length} fichier{items.length > 1 ? 's' : ''}
                {stats.done > 0 && ` · ${stats.done} converti${stats.done > 1 ? 's' : ''}`}
                {stats.err > 0 && ` · ${stats.err} en erreur`}
              </span>
              <span className="head-actions">
                <button className="link" disabled={busy} onClick={async () => add(await window.racmp3.selectFiles())}>+ Ajouter</button>
                <button className="link" disabled={busy} onClick={() => setItems([])}>Tout retirer</button>
              </span>
            </div>
            <ul className="list">
              {items.map((it) => (
                <li key={it.file} className={it.status}>
                  <div className="row">
                    <span className="badge" aria-hidden="true">
                      {it.status === 'done' ? '✔' : it.status === 'error' ? '!' : it.status === 'running' ? '…' : '♪'}
                    </span>
                    <div className="info">
                      <span className="name" title={it.file}>{nameOf(it.file)}</span>
                      <span className="meta">
                        {it.status === 'waiting' && `En attente · ${fmtSize(it.size)}`}
                        {it.status === 'running' && `Conversion… ${Math.round(it.pct)} %`}
                        {it.status === 'done' && `${fmtSize(it.size)} → ${fmtSize(it.outSize)} MP3`}
                        {it.status === 'error' && 'Échec de la conversion'}
                      </span>
                    </div>
                    {it.status === 'done' && (
                      <button className="sm" onClick={() => window.racmp3.showInFolder(it.out)}>Afficher</button>
                    )}
                    {it.status === 'error' && !busy && (
                      <button className="sm" onClick={() => retry(it.file)}>Réessayer</button>
                    )}
                    {!busy && (
                      <button className="sm ghost" aria-label={`Retirer ${nameOf(it.file)}`} onClick={() => remove(it.file)}>✕</button>
                    )}
                  </div>
                  {it.status === 'running' && <div className="bar"><div style={{ width: `${it.pct}%` }} /></div>}
                  {it.error && <div className="err">{it.error}</div>}
                </li>
              ))}
            </ul>
          </>
        )}
        {notice && <p className="notice" role="status">{notice}</p>}
      </main>

      <section className="settings" aria-label="Réglages">
        <div className="field">
          <span className="label">Qualité</span>
          <div className="seg" role="radiogroup" aria-label="Qualité du MP3">
            {QUALITIES.map((q) => (
              <button
                key={q.kbps}
                role="radio"
                aria-checked={bitrate === q.kbps}
                className={bitrate === q.kbps ? 'on' : ''}
                disabled={busy}
                onClick={() => setBitrate(q.kbps)}
                title={q.hint}
              >
                {q.label}
                <small>{q.hint}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">Enregistrer dans</span>
          <div className="dest">
            <button disabled={busy} onClick={async () => setOutDir((await window.racmp3.selectOutput()) || outDir)}>
              {outDir ? 'Changer…' : 'Choisir un dossier…'}
            </button>
            <span className="path" title={outDir || ''}>{outDir || 'À côté de chaque fichier d’origine'}</span>
            {outDir && !busy && <button className="sm ghost" aria-label="Revenir au dossier d’origine" onClick={() => setOutDir(null)}>✕</button>}
          </div>
        </div>
      </section>

      <footer>
        {busy ? (
          <>
            <div className="overall">
              <div className="bar big"><div style={{ width: `${stats.overall}%` }} /></div>
              <span>{stats.running ? nameOf(stats.running.file) : 'Terminé'} · {Math.round(stats.overall)} %</span>
            </div>
            <button className="danger" onClick={cancel}>Annuler</button>
          </>
        ) : allDone ? (
          <>
            <span className="done-msg">✔ {stats.done} fichier{stats.done > 1 ? 's' : ''} converti{stats.done > 1 ? 's' : ''}</span>
            <span className="foot-actions">
              <button onClick={() => window.racmp3.openFolder(folderOfDone)}>Ouvrir le dossier</button>
              <button className="primary" onClick={() => setItems([])}>Nouvelle conversion</button>
            </span>
          </>
        ) : (
          <>
            <span className="hint">{items.length ? `${stats.pending} à convertir` : 'Aucun fichier'}</span>
            <button className="primary" disabled={!stats.pending} onClick={run}>
              Convertir {stats.pending > 0 ? `${stats.pending} fichier${stats.pending > 1 ? 's' : ''}` : ''} en MP3
            </button>
          </>
        )}
      </footer>

      {over && (
        <div className="overlay" aria-hidden="true">
          <div>Dépose tes fichiers pour les ajouter</div>
        </div>
      )}
    </div>
  )
}
