import { useEffect, useState } from 'react'

const nameOf = (p) => p.split(/[\\/]/).pop()
const OK_EXT = /\.(mp4|m4v|mov|mkv|avi|webm|flv|wmv|m4a|wav|ogg)$/i

export default function App() {
  const [items, setItems] = useState([]) // {file, status, pct, out, error}
  const [outDir, setOutDir] = useState(null)
  const [bitrate, setBitrate] = useState(192)
  const [busy, setBusy] = useState(false)

  const patch = (file, p) =>
    setItems((list) => list.map((it) => (it.file === file ? { ...it, ...p } : it)))

  useEffect(() => window.racmp3.onProgress(({ file, pct }) => patch(file, { pct })), [])

  const add = (files) =>
    setItems((list) => {
      const known = new Set(list.map((i) => i.file))
      const fresh = files.filter((f) => !known.has(f)).map((file) => ({ file, status: 'waiting', pct: 0 }))
      return [...list, ...fresh]
    })

  const onDrop = (e) => {
    e.preventDefault()
    add([...e.dataTransfer.files].map((f) => window.racmp3.pathForFile(f)).filter((p) => OK_EXT.test(p)))
  }

  const run = async () => {
    setBusy(true)
    const todo = items.filter((i) => i.status !== 'done').map((i) => i.file)
    for (const file of todo) {
      patch(file, { status: 'running', pct: 0, error: null })
      const r = await window.racmp3.convert({ file, outDir, bitrate })
      patch(file, r.ok ? { status: 'done', pct: 100, out: r.out } : { status: 'error', error: r.error })
    }
    setBusy(false)
  }

  const pending = items.some((i) => i.status !== 'done')

  return (
    <div className="app" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <header>
        <h1>Rac<span>Mp3</span></h1>
        <p>Convertisseur MP4 → MP3</p>
      </header>

      <div className="toolbar">
        <button disabled={busy} onClick={async () => add(await window.racmp3.selectFiles())}>+ Ajouter des fichiers</button>
        <button disabled={busy} onClick={async () => setOutDir((await window.racmp3.selectOutput()) || outDir)}>
          Dossier de sortie
        </button>
        <label>
          Qualité
          <select disabled={busy} value={bitrate} onChange={(e) => setBitrate(+e.target.value)}>
            <option value="128">128 kbps</option>
            <option value="192">192 kbps</option>
            <option value="256">256 kbps</option>
            <option value="320">320 kbps</option>
          </select>
        </label>
        <span className="out" title={outDir || ''}>
          {outDir ? `→ ${outDir}` : '→ Même dossier que la source'}
        </span>
      </div>

      <ul className="list">
        {items.length === 0 && <li className="empty">Glisse tes fichiers MP4 ici</li>}
        {items.map((it) => (
          <li key={it.file}>
            <div className="row">
              <span className="name">{nameOf(it.file)}</span>
              <span className={`st ${it.status}`}>
                {it.status === 'waiting' && 'En attente'}
                {it.status === 'running' && `${Math.round(it.pct)} %`}
                {it.status === 'done' && '✔ Terminé'}
                {it.status === 'error' && '✖ Erreur'}
              </span>
              {it.status === 'done' && <button className="sm" onClick={() => window.racmp3.showInFolder(it.out)}>Afficher</button>}
              {!busy && <button className="sm" onClick={() => setItems((l) => l.filter((x) => x.file !== it.file))}>✕</button>}
            </div>
            {(it.status === 'running' || it.status === 'done') && (
              <div className="bar"><div style={{ width: `${it.pct}%` }} /></div>
            )}
            {it.error && <div className="err">{it.error}</div>}
          </li>
        ))}
      </ul>

      <footer>
        <button disabled={busy || !items.length} onClick={() => setItems([])}>Vider</button>
        <button className="big" disabled={busy || !pending} onClick={run}>
          {busy ? 'Conversion…' : 'Convertir en MP3'}
        </button>
      </footer>
    </div>
  )
}
