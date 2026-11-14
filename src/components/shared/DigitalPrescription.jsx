import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer, Lock, AlertTriangle, X } from 'lucide-react'
import TelemedicineLogo from '../TelemedicineLogo'

const fmtDate = ts => ts
  ? new Date(ts).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric' })
  : '—'
const fmtStamp = ts => new Date(ts).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'medium' })

const LEDGER_ROWS = 6

/**
 * The native digital prescription document, rendered from structured
 * database rows (prescriptions + prescription_medications).
 *
 * Printing (see 014_prescription_print_lock.sql):
 *   mode="patient" — "Print Official Copy". Limited to rx.max_prints
 *     (1 + refills, plus any reprint the doctor authorizes). Each print is
 *     counted by the server (onOfficialPrint) BEFORE the print dialog opens.
 *     The printout carries a watermark (Rx ID, print time, "Print n of m")
 *     and a pharmacist dispensing ledger for partial fills.
 *   mode="doctor"  — unlimited "Print File Copy", watermarked
 *     "Doctor's file copy — not valid for dispensing", no ledger.
 *   Ctrl+P on the page never prints the prescription itself (index.css).
 *
 * Props:
 *   rx          { id, diagnosis, additional_notes, issued_at, expires_at, status, print_count, max_prints }
 *   medications [{ medicine_name, dosage, frequency, duration, quantity, refills_allowed, special_instructions }]
 *   doctor      { first_name, last_name, specialization, license_number, clinic_name, clinic_address, clinic_phone }
 *   patient     { first_name, last_name }
 *   mode        'patient' | 'doctor'
 *   onOfficialPrint  async () => { copy_number, max_prints, copy_label, printed_at }  (patient mode; throws on refusal)
 */
export default function DigitalPrescription({ rx, medications = [], doctor = {}, patient = {}, mode = 'doctor', onOfficialPrint }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy]               = useState(false)
  const [error, setError]             = useState('')
  const [printInfo, setPrintInfo]     = useState(null) // what the watermark says for the print in progress

  // The print copy is rendered into a separate container directly under
  // <body> (portal below) and is the only thing shown on paper — printing the
  // on-screen copy in place gets clipped by the portal's scrolling layout and
  // comes out blank. Once it has rendered, open the print dialog.
  useEffect(() => {
    if (!printInfo) return
    const cleanup = () => {
      window.removeEventListener('afterprint', cleanup)
      setPrintInfo(null)
    }
    window.addEventListener('afterprint', cleanup)
    window.print()
  }, [printInfo])

  const doctorName  = [doctor.first_name, doctor.last_name].filter(Boolean).join(' ')
  const patientName = [patient.first_name, patient.last_name].filter(Boolean).join(' ')
  const expired     = rx.expires_at && new Date(rx.expires_at) < new Date()
  const license     = doctor.license_number && !doctor.license_number.startsWith('PENDING-') ? doctor.license_number : null

  const used      = rx.print_count ?? 0
  const allowed   = rx.max_prints ?? 1
  const remaining = Math.max(allowed - used, 0)
  const blockedReason =
      rx.status && rx.status !== 'active' ? `This prescription is ${rx.status} and can no longer be printed.`
    : expired                             ? 'This prescription has expired and can no longer be printed.'
    : remaining === 0                     ? `All ${allowed} official print${allowed === 1 ? '' : 's'} used. If your copy was damaged or lost, ask your doctor to authorize a reprint.`
    : null

  async function confirmOfficialPrint() {
    setBusy(true); setError('')
    try {
      const info = await onOfficialPrint()
      setConfirmOpen(false)
      setPrintInfo({ ...info, official: true })
    } catch (e) {
      setError(e.message || 'Could not print. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function printFileCopy() {
    setPrintInfo({ official: false, printed_at: new Date().toISOString() })
  }

  const official = printInfo?.official
  const watermarkText = official
    ? `${printInfo.copy_label.toUpperCase()} · ${printInfo.copy_number} OF ${printInfo.max_prints}`
    : "DOCTOR'S FILE COPY"

  const renderDocument = forPrint => (
      <div className={forPrint
        ? 'rx-print-copy relative overflow-hidden bg-white p-2 text-gray-800'
        : 'rx-document relative overflow-hidden bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 text-gray-800'}>
        {/* Security strip + diagonal watermark (paper only) */}
        {forPrint && (
          <>
            <div className="rx-watermark" aria-hidden="true">
              {Array.from({ length: 5 }, (_, i) => <span key={i}>{watermarkText} · {rx.id.slice(0, 8).toUpperCase()}</span>)}
            </div>
            <div className="border-2 border-gray-800 rounded-lg px-3 py-2 mb-4 text-[11px] leading-snug">
              {official ? (
                <>
                  <p className="font-bold text-sm">
                    OFFICIAL COPY — Print {printInfo.copy_number} of {printInfo.max_prints} ({printInfo.copy_label})
                  </p>
                  <p>Printed {fmtStamp(printInfo.printed_at)} · Rx ID {rx.id}</p>
                  <p>Copies are counted by HealthConnect. A photocopy or a second sheet with the same print number is not valid.</p>
                </>
              ) : (
                <>
                  <p className="font-bold text-sm">DOCTOR'S FILE COPY — NOT VALID FOR DISPENSING</p>
                  <p>Printed {fmtStamp(printInfo.printed_at)} · Rx ID {rx.id}</p>
                </>
              )}
            </div>
          </>
        )}

        {/* Header: clinic + doctor */}
        <div className="flex items-start justify-between gap-4 border-b-2 border-gray-800 pb-4">
          <div>
            <p className="text-lg font-bold text-gray-900">{doctorName ? `Dr. ${doctorName}` : 'Attending Physician'}</p>
            {doctor.specialization && <p className="text-sm text-gray-600">{doctor.specialization}</p>}
            {doctor.clinic_name    && <p className="text-sm text-gray-600 mt-1">{doctor.clinic_name}</p>}
            {doctor.clinic_address && <p className="text-xs text-gray-500">{doctor.clinic_address}</p>}
            {doctor.clinic_phone   && <p className="text-xs text-gray-500">Tel: {doctor.clinic_phone}</p>}
          </div>
          <div className="text-right shrink-0">
            <TelemedicineLogo className="w-10 h-10 ml-auto"/>
            <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wide">HealthConnect e-Prescription</p>
          </div>
        </div>

        {/* Patient + dates */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-3 text-sm border-b border-gray-200">
          <p><span className="text-gray-500">Patient:</span> <span className="font-semibold">{patientName || '—'}</span></p>
          <p><span className="text-gray-500">Date issued:</span> <span className="font-semibold">{fmtDate(rx.issued_at)}</span></p>
          <p>
            <span className="text-gray-500">Valid until:</span>{' '}
            <span className={`font-semibold ${expired ? 'text-red-600' : ''}`}>{fmtDate(rx.expires_at)}{expired ? ' (expired)' : ''}</span>
          </p>
        </div>

        {rx.diagnosis && (
          <p className="text-sm py-3 border-b border-gray-200">
            <span className="text-gray-500">Diagnosis:</span> <span className="font-semibold">{rx.diagnosis}</span>
          </p>
        )}

        {/* Rx body */}
        <div className="py-4">
          <p className="text-4xl font-serif font-bold text-gray-900 leading-none mb-3">℞</p>
          {medications.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No medications listed.</p>
          ) : (
            <ol className="space-y-3">
              {medications.map((m, i) => (
                <li key={i} className="flex gap-3">
                  <span className="font-bold text-gray-500 w-5 shrink-0">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900">
                      {m.medicine_name}
                      {m.quantity ? <span className="font-normal text-gray-600"> — #{m.quantity}</span> : null}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Sig:</span> {m.dosage}, {m.frequency}, for {m.duration}
                    </p>
                    {m.special_instructions && <p className="text-sm text-gray-600 italic">{m.special_instructions}</p>}
                    {m.refills_allowed > 0 && <p className="text-xs text-gray-500">Refills allowed: {m.refills_allowed}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {rx.additional_notes && (
          <div className="text-sm border-t border-gray-200 pt-3">
            <p className="text-gray-500 text-xs uppercase tracking-wide mb-0.5">Doctor's notes</p>
            <p className="text-gray-700 whitespace-pre-line">{rx.additional_notes}</p>
          </div>
        )}

        {/* Signature block */}
        <div className="flex items-end justify-between gap-4 mt-6 pt-4 border-t border-gray-200">
          <p className="text-[10px] text-gray-400 break-all">Rx ID: {rx.id}</p>
          <div className="text-right">
            <p className="font-semibold text-gray-900 border-t border-gray-400 pt-1 px-4">{doctorName ? `Dr. ${doctorName}` : '—'}</p>
            <p className="text-xs text-gray-500">{license ? `License No. ${license}` : 'Electronically issued'}</p>
          </div>
        </div>

        {/* Pharmacist dispensing ledger — official printouts only */}
        {forPrint && official && (
          <div className="rx-ledger mt-6 pt-3 border-t-2 border-gray-800">
            <p className="font-bold text-sm">PHARMACIST DISPENSING LEDGER</p>
            <p className="text-[11px] text-gray-700 mb-1">
              For partial purchases: record every fill below and return this sheet to the patient. The next pharmacy
              dispenses only the remaining balance. Prescribed:{' '}
              {medications.map((m, i) => `${i + 1}) ${m.medicine_name}${m.quantity ? ` #${m.quantity}` : ''}`).join('; ')}.
            </p>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '15%' }}>Date</th>
                  <th style={{ width: '30%' }}>Medication &amp; Qty Dispensed</th>
                  <th style={{ width: '20%' }}>Remaining Balance</th>
                  <th style={{ width: '35%' }}>Pharmacy Name, License No. &amp; Signature</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: LEDGER_ROWS }, (_, i) => (
                  <tr key={i}><td/><td/><td/><td/></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
  )

  return (
    <div>
      {renderDocument(false)}

      {printInfo && createPortal(<div className="rx-print-root">{renderDocument(true)}</div>, document.body)}

      {/* Screen-only controls */}
      <div className="no-print mt-3">
        {mode === 'patient' ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => { setError(''); setConfirmOpen(true) }} disabled={!!blockedReason}
                className="btn-primary-patient text-sm px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed">
                {blockedReason ? <Lock className="w-4 h-4"/> : <Printer className="w-4 h-4"/>}
                Print Official Copy
              </button>
              <span className="text-xs text-gray-500">
                {used} of {allowed} official print{allowed === 1 ? '' : 's'} used
                {rx.last_printed_at ? ` · last printed ${fmtStamp(rx.last_printed_at)}` : ''}
              </span>
            </div>
            {blockedReason && <p className="text-xs text-gray-500">{blockedReason}</p>}
            {error && !confirmOpen && <p className="text-xs text-red-600">{error}</p>}
            <p className="text-[11px] text-gray-400">
              The on-screen view is for reference only. Pharmacies need the official printed copy.
            </p>
          </div>
        ) : (
          <button onClick={printFileCopy} type="button" className="btn-outline text-sm">
            <Printer className="w-4 h-4"/> Print File Copy
          </button>
        )}
      </div>

      {confirmOpen && (
        <div className="no-print fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600"/>
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-900">Print official copy?</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {allowed === 1
                    ? 'This official prescription can only be printed once.'
                    : `This prescription can be printed ${allowed} times in total (original + refills). You have ${remaining} left.`}
                  {' '}Make sure your printer is connected and ready before you continue.
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  The print is counted as soon as you continue, even if you cancel the print dialog. Keep the printed
                  sheet — pharmacies write partial purchases on it.
                </p>
              </div>
              <button onClick={() => setConfirmOpen(false)} disabled={busy} aria-label="Close" className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4"/>
              </button>
            </div>
            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setConfirmOpen(false)} disabled={busy} className="btn-outline text-sm">Cancel</button>
              <button type="button" onClick={confirmOfficialPrint} disabled={busy}
                className="btn-primary-patient text-sm px-4 py-2 disabled:opacity-60">
                <Printer className="w-4 h-4"/> {busy ? 'Preparing...' : `Print copy ${used + 1} of ${allowed}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
