import React, { useState, useRef } from 'react'
import { Upload, Cpu, AlertTriangle, RotateCcw, Copy, CheckCircle, Info, Zap, ShieldAlert } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ─────────────────────────────────────────────────────────────
//  Flask API — your HAM10000 EfficientNetB3 model
//  Make sure api.py is running first:  python api.py
// ─────────────────────────────────────────────────────────────
const AI_API_URL = 'https://healthconnect-ai-api.onrender.com/predict'

// Risk styling driven by what the API returns in risk_level
const RISK_STYLE = {
  HIGH:     { badge: 'bg-red-100 text-red-700',      bar: 'bg-red-500',    ring: 'border-red-200',   bg: 'bg-red-50'     },
  MODERATE: { badge: 'bg-yellow-100 text-yellow-700', bar: 'bg-yellow-400', ring: 'border-yellow-200',bg: 'bg-yellow-50'  },
  LOW:      { badge: 'bg-green-100 text-green-700',   bar: 'bg-green-400',  ring: 'border-green-200', bg: 'bg-green-50'   },
  UNKNOWN:  { badge: 'bg-gray-100 text-gray-600',     bar: 'bg-gray-300',   ring: 'border-gray-200',  bg: 'bg-gray-50'    },
}

// Colour for the individual bar in the "all scores" list
// based on confidence level, not risk
function barColor(conf) {
  if (conf >= 60) return 'bg-red-400'
  if (conf >= 30) return 'bg-yellow-400'
  return 'bg-green-400'
}

export default function AIScanner() {
  const { user } = useAuth()
  const fileInput = useRef(null)

  const [imageFile,   setImageFile]   = useState(null)
  const [imageUrl,    setImageUrl]    = useState('')
  const [prediction,  setPrediction]  = useState(null)   // data.prediction
  const [allScores,   setAllScores]   = useState([])     // data.all_scores
  const [disclaimer,  setDisclaimer]  = useState('')
  const [analyzing,   setAnalyzing]   = useState(false)
  const [error,       setError]       = useState('')
  const [copied,      setCopied]      = useState(false)
  const [saved,       setSaved]       = useState(false)

  // ── File selection ──────────────────────────────────────────
  function onFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Please upload an image file (JPG, PNG, WebP).'); return }
    setImageFile(file)
    setImageUrl(URL.createObjectURL(file))
    setPrediction(null); setAllScores([]); setError(''); setSaved(false)
  }

  function onDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Please drop an image file.'); return }
    setImageFile(file)
    setImageUrl(URL.createObjectURL(file))
    setPrediction(null); setAllScores([]); setError(''); setSaved(false)
  }

  // ── Call Flask API ──────────────────────────────────────────
  async function analyzeImage() {
    if (!imageFile) return
    setAnalyzing(true); setError('')

    try {
      const formData = new FormData()
      // ✅ Must match the field name in api.py: request.files['image']
      formData.append('image', imageFile)

      const res = await fetch(AI_API_URL, { method: 'POST', body: formData })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Server returned ${res.status}`)
      }

      // ✅ Response shape from your api.py:
      // {
      //   prediction: { code, label, confidence (%), risk_level, risk_color, advice },
      //   all_scores: [ { code, label, confidence (%) }, ... ],
      //   disclaimer: "...",
      //   model_info: { ... }
      // }
      const data = await res.json()

      setPrediction(data.prediction)
      setAllScores(data.all_scores || [])
      setDisclaimer(data.disclaimer || '')

      // Save result to Supabase
      if (user && data.prediction) {
        let storedUrl = imageUrl
        try {
          const path = `${user.id}/${Date.now()}_${imageFile.name}`
          const { data: up, error: upErr } = await supabase.storage
            .from('ai-scans').upload(path, imageFile, { upsert: true })
          if (upErr) throw upErr
          if (up?.path) {
            const { data: pub } = supabase.storage.from('ai-scans').getPublicUrl(up.path)
            storedUrl = pub.publicUrl
          }
        } catch (uploadErr) {
          // Falls back to a browser-local blob: URL, which only resolves in
          // this tab/session — it will be dead in the database for anyone
          // (including the mobile app) who reads it back later. Logged
          // instead of swallowed so a storage regression doesn't silently
          // recur the way the missing bucket previously did.
          console.warn('ai-scans upload failed, image_url will not persist:', uploadErr)
        }

        await supabase.from('ai_scan_results').insert({
          patient_id:     user.id,
          image_url:      storedUrl,
          image_filename: imageFile.name,
          // Store as the same array shape our schema expects
          predictions: data.all_scores.map(s => ({
            label:      s.label,
            confidence: s.confidence / 100,  // store as 0–1 in DB
          })),
          top_prediction: data.prediction.label,
          top_confidence: data.prediction.confidence / 100,
          disclaimer_acknowledged: true,
        })
        setSaved(true)
      }
    } catch (err) {
      setError(
        `Could not reach the AI model. The server may be waking up — please wait 30 seconds and try again.\n(${err.message})`
      )
    } finally {
      setAnalyzing(false)
    }
  }

  // ── Helpers ─────────────────────────────────────────────────
  function reset() {
    setImageFile(null); setImageUrl(''); setPrediction(null)
    setAllScores([]); setError(''); setSaved(false)
    if (fileInput.current) fileInput.current.value = ''
  }

  function copyResults() {
    if (!prediction) return
    const lines = [
      `Top: ${prediction.label} — ${prediction.confidence}%`,
      `Risk: ${prediction.risk_level}`,
      '',
      'All Scores:',
      ...allScores.map(s => `  ${s.label}: ${s.confidence}%`),
      '',
      disclaimer,
    ].join('\n')
    navigator.clipboard.writeText(lines)
    setCopied(true); setTimeout(() => setCopied(false), 2500)
  }

  const risk   = RISK_STYLE[prediction?.risk_level] || RISK_STYLE.UNKNOWN
  const hasResult = !!prediction && !analyzing

  return (
    <div className="space-y-5">

      {/* ── Page header ── */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-patient-100 rounded-xl flex items-center justify-center shrink-0">
          <Cpu className="w-5 h-5 text-patient-600"/>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Health Scanner</h1>
          <p className="text-gray-500 text-sm">Skin disease detection — HAM10000 EfficientNetB3</p>
        </div>
      </div>

      {/* ── Disclaimer banner ── */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5"/>
        <p className="text-sm text-yellow-800">
          <strong>Medical Disclaimer:</strong> For informational purposes only. Always consult a
          qualified healthcare provider for proper diagnosis and treatment.
        </p>
      </div>

      {/* ── Tool tabs ── */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        {[
          { label: 'Skin Analyzer',        badge: 'HAM10000', active: true  },
          { label: 'Prescription Scanner', coming: true },
          { label: 'Wound Analyzer',       coming: true },
          { label: 'Pill Identifier',      coming: true },
          { label: 'Lab Result Reader',    coming: true },
        ].map((t, i) => (
          <div key={i}
            className={`flex flex-col items-center gap-1 px-4 py-3 rounded-xl border shrink-0 min-w-[130px]
              ${t.active ? 'bg-patient-50 border-patient-200' : 'bg-gray-50 border-gray-100 opacity-50'}`}>
            <Cpu className={`w-5 h-5 ${t.active ? 'text-patient-600' : 'text-gray-400'}`}/>
            <span className={`text-xs font-semibold ${t.active ? 'text-patient-700' : 'text-gray-500'}`}>{t.label}</span>
            {t.badge  && <span className="text-xs bg-patient-100 text-patient-700 px-1.5 py-0.5 rounded-full font-bold">{t.badge}</span>}
            {t.coming && <span className="text-xs text-gray-400 italic">Coming Soon</span>}
          </div>
        ))}
      </div>

      {/* ── Main two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── LEFT: Upload ── */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-patient-600"/>
            <h2 className="font-bold text-gray-900">Skin Analyzer</h2>
            <span className="text-xs bg-patient-100 text-patient-700 px-2 py-0.5 rounded-full font-bold">HAM10000</span>
          </div>
          <p className="text-xs text-gray-500">
            Upload a dermoscopy or skin photo — analyzed by our trained HAM10000 EfficientNetB3 model.
          </p>

          {/* Drop zone */}
          <div
            onClick={() => !imageFile && fileInput.current?.click()}
            onDrop={onDrop}
            onDragOver={e => e.preventDefault()}
            className={`relative rounded-2xl border-2 border-dashed flex flex-col items-center justify-center transition-all
              ${imageFile
                ? 'border-patient-300 bg-patient-50 cursor-default p-2 min-h-[200px]'
                : 'border-gray-200 hover:border-patient-400 hover:bg-patient-50 bg-gray-50 cursor-pointer p-10'
              }`}>

            {imageFile ? (
              <>
                <img src={imageUrl} alt="Uploaded skin photo"
                  className="w-full max-h-72 object-contain rounded-xl"/>
                {/* Ready tag */}
                {!hasResult && !analyzing && (
                  <div className="absolute bottom-3 left-3 bg-green-500 text-white text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                    <CheckCircle className="w-3 h-3"/> Ready to analyze
                  </div>
                )}
                {/* Remove button */}
                <button onClick={e => { e.stopPropagation(); reset() }}
                  className="absolute top-2 right-2 w-7 h-7 bg-white/90 hover:bg-white rounded-full
                             flex items-center justify-center text-gray-600 shadow border border-gray-200 text-lg">
                  ×
                </button>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-patient-100 rounded-2xl flex items-center justify-center mb-3">
                  <Upload className="w-8 h-8 text-patient-500"/>
                </div>
                <p className="text-sm font-semibold text-gray-700">Click or drag image here</p>
                <p className="text-xs text-gray-400 mt-1">JPG · PNG · WebP — up to 10 MB</p>
              </>
            )}
          </div>

          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={onFileSelect}/>

          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-xs whitespace-pre-line">
              {error}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            {imageFile && !hasResult && (
              <button onClick={analyzeImage} disabled={analyzing}
                className="btn-primary-patient flex-1 py-3">
                {analyzing
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> Analyzing...</>
                  : <><Zap className="w-4 h-4"/> Analyze with AI</>
                }
              </button>
            )}

            {hasResult && (
              <>
                <button onClick={reset} className="btn-outline flex-1">
                  <RotateCcw className="w-4 h-4"/> Scan New
                </button>
                <button onClick={copyResults} className="btn-outline px-4" title="Copy results">
                  {copied
                    ? <CheckCircle className="w-4 h-4 text-green-500"/>
                    : <Copy className="w-4 h-4"/>
                  }
                </button>
              </>
            )}

            {!imageFile && (
              <button onClick={() => fileInput.current?.click()}
                className="btn-primary-patient flex-1 py-3">
                <Upload className="w-4 h-4"/> Upload Skin Photo
              </button>
            )}
          </div>

          {saved && (
            <p className="text-xs text-green-600 text-center flex items-center justify-center gap-1">
              <CheckCircle className="w-3.5 h-3.5"/> Result saved to your health records
            </p>
          )}
        </div>

        {/* ── RIGHT: Results ── */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-patient-600"/> AI Analysis Result
            </h2>
            {hasResult && (
              <div className="flex gap-2">
                <button onClick={copyResults}
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                  <Copy className="w-3 h-3"/> Copy
                </button>
                <button onClick={reset}
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                  <RotateCcw className="w-3 h-3"/> Reset
                </button>
              </div>
            )}
          </div>

          {/* Empty state */}
          {!hasResult && !analyzing && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Cpu className="w-16 h-16 text-gray-200 mb-3"/>
              <p className="text-gray-400 text-sm">
                Upload a skin photo and click<br/>
                <strong>Analyze with AI</strong> to see results
              </p>
            </div>
          )}

          {/* Loading spinner */}
          {analyzing && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 border-4 border-patient-200 border-t-patient-600 rounded-full animate-spin mb-4"/>
              <p className="font-semibold text-gray-700">Analyzing image...</p>
              <p className="text-gray-400 text-sm mt-1">Running EfficientNetB3 — HAM10000</p>
            </div>
          )}

          {/* ── RESULTS ── */}
          {hasResult && prediction && (
            <div className="space-y-4">

              {/* Top prediction card */}
              <div className={`${risk.bg} border ${risk.ring} rounded-2xl p-4`}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  TOP PREDICTION
                </p>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="text-xl font-bold text-gray-900 leading-tight">
                      {prediction.label}
                    </p>
                    <p className="text-sm font-semibold text-gray-600 mt-0.5">
                      {prediction.confidence}% confidence
                    </p>
                  </div>
                  {/* Risk badge — driven directly by API's risk_level field */}
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${risk.badge}`}>
                    {prediction.risk_level} RISK
                  </span>
                </div>

                {/* Confidence bar */}
                <div className="h-2 bg-white/60 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${risk.bar}`}
                    style={{ width: `${prediction.confidence}%` }}/>
                </div>
              </div>

              {/* Medical advice from the API */}
              {prediction.advice && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5"/>
                  <div>
                    <p className="text-xs font-semibold text-blue-800 mb-0.5">What to do next</p>
                    <p className="text-xs text-blue-700 leading-relaxed">{prediction.advice}</p>
                  </div>
                </div>
              )}

              {/* High risk urgent warning */}
              {prediction.risk_level === 'HIGH' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5"/>
                  <p className="text-xs text-red-700 font-semibold">
                    ⚠️ HIGH RISK detected — please consult a dermatologist as soon as possible.
                  </p>
                </div>
              )}

              {/* All scores */}
              {allScores.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    ALL PROBABILITIES
                  </p>
                  <div className="space-y-2">
                    {allScores.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-gray-700 w-44 truncate font-medium" title={s.label}>
                          {s.label}
                        </span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${barColor(s.confidence)}`}
                            style={{ width: `${s.confidence}%` }}/>
                        </div>
                        <span className="text-xs text-gray-500 w-14 text-right font-medium">
                          {s.confidence}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Disclaimer from API */}
              {disclaimer && (
                <p className="text-xs text-gray-400 text-center leading-relaxed border-t border-gray-100 pt-3">
                  {disclaimer}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
