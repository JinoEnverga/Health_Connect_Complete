import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, CheckCircle, User, FileText, Upload, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const MAX_FILE_MB = 10
const ACCEPTED = '.pdf,image/*'

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9.\-]/g, '_')
}

export default function IssuePrescription() {
  const { user }   = useAuth()
  const location   = useLocation()
  const navigate   = useNavigate()
  const preEmail   = location.state?.patientEmail || ''
  const preApptId  = location.state?.appointmentId || null

  const [form, setForm]       = useState({ patient_email: preEmail, diagnosis: '', additional_notes: '' })
  const [file, setFile]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error,   setError]   = useState('')

  function handleFileChange(e) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`File is too large — max ${MAX_FILE_MB}MB.`)
      e.target.value = ''
      return
    }
    setError('')
    setFile(f)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.patient_email || !form.diagnosis) { setError('Patient email and diagnosis are required.'); return }
    if (!file) { setError('Please upload the prescription file (PDF or photo).'); return }
    setLoading(true); setError('')

    // 1. Look up patient by email via auth.users (profiles table has no email column)
    const { data: patientId, error: patErr } = await supabase
      .rpc('get_patient_id_by_email', { patient_email: form.patient_email })

    if (patErr || !patientId) {
      setError('No patient account found with that email address.'); setLoading(false); return
    }

    // 2. Upload the file into the patient's own storage folder.
    const filePath = `${patientId}/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`
    const { error: uploadErr } = await supabase.storage
      .from('prescription-files')
      .upload(filePath, file, { contentType: file.type || 'application/octet-stream' })

    if (uploadErr) { setError(`Could not upload file: ${uploadErr.message}`); setLoading(false); return }

    // 3. Create the prescription record pointing at that file.
    const { data: rxData, error: rxErr } = await supabase
      .from('prescriptions')
      .insert({
        doctor_id:        user.id,
        patient_id:       patientId,
        appointment_id:   preApptId,
        diagnosis:        form.diagnosis,
        additional_notes: form.additional_notes || null,
        file_path:        filePath,
        file_name:        file.name,
        file_type:        file.type || null,
      })
      .select()
      .single()

    if (rxErr || !rxData) {
      setError(rxErr?.message || 'Failed to create prescription.')
      await supabase.storage.from('prescription-files').remove([filePath])
      setLoading(false)
      return
    }

    setSuccess(rxData)
    setLoading(false)
  }

  if (success) return (
    <div className="max-w-lg mx-auto">
      <div className="card flex flex-col items-center text-center py-14">
        <div className="w-20 h-20 bg-doctor-100 rounded-full flex items-center justify-center mb-5">
          <CheckCircle className="w-10 h-10 text-doctor-600"/>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Prescription Issued!</h2>
        <p className="text-gray-500 text-sm mb-2">The prescription file has been securely sent to the patient's portal.</p>
        <div className="bg-gray-50 rounded-xl p-4 w-full text-left mt-2 mb-6 space-y-1.5 text-sm">
          <p><span className="font-semibold text-gray-600">Patient:</span> {form.patient_email}</p>
          <p><span className="font-semibold text-gray-600">Diagnosis:</span> {form.diagnosis}</p>
          <p><span className="font-semibold text-gray-600">File:</span> {success.file_name}</p>
          <p className="text-xs text-gray-400 mt-2">The patient will need their birth year to download it.</p>
        </div>
        <div className="flex gap-3 w-full">
          <button onClick={() => { setSuccess(null); setForm({ patient_email:'', diagnosis:'', additional_notes:'' }); setFile(null) }}
            className="btn-primary-doctor flex-1">
            Issue Another Rx
          </button>
          <button onClick={() => navigate('/doctor/prescriptions')} className="btn-outline flex-1">
            View All Rx
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600"/>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Issue E-Prescription</h1>
          <p className="text-gray-500 text-sm">Upload the signed prescription for your patient</p>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Patient */}
        <div className="card">
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2 text-base">
            <User className="w-4 h-4 text-doctor-600"/> Patient
          </h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Patient Email Address</label>
            <input type="email" required placeholder="patient@email.com"
              value={form.patient_email}
              onChange={e => setForm(f => ({ ...f, patient_email: e.target.value }))}
              className="input-doctor"/>
            <p className="text-xs text-gray-400 mt-1.5">Prescription will appear in this patient's E-Prescriptions page</p>
          </div>
        </div>

        {/* Diagnosis */}
        <div className="card">
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2 text-base">
            <FileText className="w-4 h-4 text-doctor-600"/> Diagnosis &amp; Notes
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Diagnosis <span className="text-red-400">*</span></label>
              <input required placeholder="e.g., Upper Respiratory Tract Infection"
                value={form.diagnosis}
                onChange={e => setForm(f => ({ ...f, diagnosis: e.target.value }))}
                className="input-doctor"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Doctor's Notes <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea rows={3} placeholder="Additional instructions or observations..."
                value={form.additional_notes}
                onChange={e => setForm(f => ({ ...f, additional_notes: e.target.value }))}
                className="input-doctor resize-none"/>
            </div>
          </div>
        </div>

        {/* Prescription file */}
        <div className="card">
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2 text-base">
            <Upload className="w-4 h-4 text-doctor-600"/> Prescription File <span className="text-red-400">*</span>
          </h2>

          {!file ? (
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-doctor-200 hover:border-doctor-400 hover:bg-doctor-50 rounded-2xl py-10 cursor-pointer transition-all">
              <Upload className="w-8 h-8 text-doctor-400"/>
              <span className="text-sm font-semibold text-doctor-600">Click to upload PDF or photo</span>
              <span className="text-xs text-gray-400">A scan or photo of the signed Rx pad — accepted at any pharmacy · max {MAX_FILE_MB}MB</span>
              <input type="file" accept={ACCEPTED} className="hidden" onChange={handleFileChange}/>
            </label>
          ) : (
            <div className="flex items-center gap-3 bg-gray-50 rounded-2xl p-4">
              <div className="w-10 h-10 bg-doctor-100 rounded-lg flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-doctor-600"/>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm truncate">{file.name}</p>
                <p className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <button type="button" onClick={() => setFile(null)} className="text-gray-400 hover:text-red-500 shrink-0">
                <X className="w-4 h-4"/>
              </button>
            </div>
          )}
        </div>

        {/* Submit */}
        <button type="submit" disabled={loading} className="btn-primary-doctor w-full py-4 text-base">
          {loading
            ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/>
            : <><Send className="w-5 h-5"/> Issue Secure Prescription</>}
        </button>
      </form>
    </div>
  )
}
