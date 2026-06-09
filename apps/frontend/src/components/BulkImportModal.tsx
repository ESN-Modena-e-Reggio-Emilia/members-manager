import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  RefreshCw,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import { ROLE_SUGGESTIONS, SECTION_BG, SECTION_COLORS } from '../constants';
import { getCroppedImg } from '../cropUtils';
import type { MemberData, SectionType } from '../types';
import { imgUrl, initials } from '../utils';

const DEFAULT_ROLE = 'Membro Attivo';
const DEFAULT_IMAGE = 'esn_logo.jpg';

interface BulkImportModalProps {
  sectionKey: SectionType;
  onSave: (members: MemberData[]) => void;
  onClose: () => void;
}

// Normalizza il nome file come in MemberModal (handleSave)
function normalizeFilename(raw: string): string {
  let filename = raw.trim().toLowerCase();
  if (filename) {
    filename = filename.replace(/\s+/g, '_');
    if (!filename.includes('.')) {
      filename += '.jpg';
    }
  }
  return filename;
}

function filenameFromName(name: string): string {
  return `${name.trim().toLowerCase().replace(/\s+/g, '_')}.jpg`;
}

const BulkImportModal = ({
  sectionKey,
  onSave,
  onClose,
}: BulkImportModalProps) => {
  const color = SECTION_COLORS[sectionKey];
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [rawText, setRawText] = useState('');
  const [rows, setRows] = useState<MemberData[]>([]);

  // Stato per l'upload/ritaglio immagine di una singola riga
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropRowIndex, setCropRowIndex] = useState<number | null>(null);
  const [tempImage, setTempImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{
    width: number;
    height: number;
    x: number;
    y: number;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Riconcilia rawText con le righe esistenti, preservando le modifiche
  // (ruolo/immagine/ritaglio) per i nomi che non sono cambiati.
  function goToReview() {
    const names = rawText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    const pool = [...rows];
    const reconciled = names.map<MemberData>((name) => {
      const idx = pool.findIndex((r) => r.name.trim() === name);
      if (idx !== -1) {
        const [existing] = pool.splice(idx, 1);
        return existing;
      }
      return { name, role: DEFAULT_ROLE, imageFilename: DEFAULT_IMAGE };
    });
    setRows(reconciled);
    setStep('review');
  }

  // Tornando ai nomi, sincronizza la textbox con le righe correnti
  function goToInput() {
    setRawText(rows.map((r) => r.name).join('\n'));
    setStep('input');
  }

  function updateRow(index: number, patch: Partial<MemberData>) {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function handleConfirm() {
    const cleaned = rows
      .map<MemberData>((r) => ({
        name: r.name.trim(),
        role: r.role.trim(),
        imageFilename: normalizeFilename(r.imageFilename ?? ''),
        localImage: r.localImage,
      }))
      .filter((r) => r.name);
    if (cleaned.length === 0) return;
    onSave(cleaned);
  }

  // --- Flusso upload immagine (stesso di MemberModal) ---
  function handlePickImage(index: number) {
    setUploadError('');
    setCropRowIndex(index);
    fileInputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permette di ricaricare lo stesso file
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setTempImage(reader.result as string);
    });
    reader.readAsDataURL(file);
  }

  function cancelCrop() {
    setTempImage(null);
    setCropRowIndex(null);
  }

  async function handleConfirmCrop() {
    if (tempImage == null || croppedAreaPixels == null || cropRowIndex == null)
      return;
    setUploading(true);
    try {
      const croppedBlob = await getCroppedImg(tempImage, croppedAreaPixels);
      const reader = new FileReader();
      reader.readAsDataURL(croppedBlob);
      reader.onloadend = () => {
        const row = rows[cropRowIndex];
        // Selettore intelligente del nome file: sovrascrivi i default/temporanei
        let newName = row?.imageFilename ?? '';
        if (
          !newName ||
          newName === DEFAULT_IMAGE ||
          newName.startsWith('immagine_')
        ) {
          newName = row?.name?.trim()
            ? filenameFromName(row.name)
            : `immagine_${Date.now()}.jpg`;
        }
        updateRow(cropRowIndex, {
          localImage: reader.result as string,
          imageFilename: newName,
        });
        setTempImage(null);
        setCropRowIndex(null);
        setUploading(false);
      };
    } catch (_err) {
      setUploadError('Errore durante il ritaglio.');
      setUploading(false);
    }
  }

  const validCount = rows.filter((r) => r.name.trim()).length;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-35 z-200 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Input file nascosto condiviso per l'upload delle immagini */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />

      <div
        className="bg-white rounded-2xl px-7 py-6 w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]"
        style={{ borderTop: `4px solid ${color}` }}
      >
        <div className="flex items-center justify-between mb-4.5">
          <h2 className="font-bold text-lg m-0" style={{ color }}>
            Import multiplo membri
          </h2>
          <button
            className="bg-none border-none text-lg cursor-pointer text-gray-500 leading-none"
            onClick={onClose}
            type="button"
            title="Chiudi"
          >
            <X size={16} />
          </button>
        </div>

        {/* Step indicator (cliccabile) */}
        <div className="flex items-center gap-2 mb-5 text-xs font-semibold">
          <button
            type="button"
            className="px-2.5 py-1 rounded-full cursor-pointer border-none"
            style={{
              background: step === 'input' ? color : SECTION_BG[sectionKey],
              color: step === 'input' ? '#fff' : color,
            }}
            onClick={goToInput}
          >
            1. Nomi
          </button>
          <span className="text-gray-300">—</span>
          <button
            type="button"
            className="px-2.5 py-1 rounded-full border-none disabled:opacity-50 disabled:cursor-not-allowed enabled:cursor-pointer"
            style={{
              background: step === 'review' ? color : SECTION_BG[sectionKey],
              color: step === 'review' ? '#fff' : color,
            }}
            onClick={goToReview}
            disabled={!rawText.trim()}
          >
            2. Revisione
          </button>
        </div>

        {step === 'input' ? (
          <>
            <p className="text-sm text-gray-600 mb-2">
              Incolla un nome per riga. Verranno aggiunti con ruolo{' '}
              <strong>{DEFAULT_ROLE}</strong> e immagine{' '}
              <strong>{DEFAULT_IMAGE}</strong>, modificabili al passaggio
              successivo.
            </p>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none box-border font-inherit min-h-48 resize-y"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={'Mario Rossi\nGiulia Bianchi\nLuca Verdi'}
              // biome-ignore lint/a11y/noAutofocus: modal entry field
              autoFocus
            />
            <div className="flex gap-2 mt-5 items-center">
              <div className="flex-1" />
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-gray-300 bg-gray-100 text-gray-700 font-semibold text-sm cursor-pointer"
                onClick={onClose}
              >
                Annulla
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg border-none font-semibold text-sm cursor-pointer text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: color }}
                onClick={goToReview}
                disabled={!rawText.trim()}
              >
                Avanti
                <ArrowRight size={16} />
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-3">
              Controlla e modifica ciascun membro prima di aggiungerlo.
            </p>
            {uploadError && (
              <p className="text-red-600 m-0 mb-3 text-sm">{uploadError}</p>
            )}
            <div className="flex-1 overflow-y-auto -mx-1 px-1 flex flex-col gap-3">
              {rows.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm">
                  Nessun membro. Torna indietro per inserire i nomi.
                </div>
              ) : (
                rows.map((row, index) => {
                  const previewSrc =
                    row.localImage || imgUrl(row.imageFilename);
                  return (
                    <div
                      // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
                      key={index}
                      className="flex items-center gap-2 p-2 rounded-lg border border-gray-200"
                    >
                      <button
                        type="button"
                        className="relative group w-9 h-9 shrink-0 rounded-full cursor-pointer border-none p-0"
                        onClick={() => handlePickImage(index)}
                        title="Carica immagine"
                      >
                        {previewSrc ? (
                          <img
                            src={previewSrc}
                            alt={row.name}
                            className="w-9 h-9 rounded-full object-cover block"
                            style={{ border: `2px solid ${color}` }}
                          />
                        ) : (
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{
                              background: SECTION_BG[sectionKey],
                              color,
                              border: `2px solid ${color}`,
                            }}
                          >
                            {initials(row.name) || '?'}
                          </div>
                        )}
                        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white">
                          <Camera size={14} />
                        </span>
                      </button>
                      <input
                        className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1.5 text-sm outline-none box-border font-inherit"
                        value={row.name}
                        onChange={(e) =>
                          updateRow(index, { name: e.target.value })
                        }
                        placeholder="Nome"
                      />
                      <input
                        className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1.5 text-sm outline-none box-border font-inherit"
                        list="bulk-roles-list"
                        value={row.role}
                        onChange={(e) =>
                          updateRow(index, { role: e.target.value })
                        }
                        placeholder="Ruolo"
                      />
                      <div className="flex-1 min-w-0 flex items-center gap-1">
                        <input
                          className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1.5 text-sm outline-none box-border font-inherit"
                          value={row.imageFilename ?? ''}
                          onChange={(e) =>
                            updateRow(index, { imageFilename: e.target.value })
                          }
                          placeholder="immagine.jpg"
                        />
                        <button
                          type="button"
                          className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                          onClick={() =>
                            updateRow(index, {
                              imageFilename: filenameFromName(row.name),
                            })
                          }
                          title="Genera dal nome"
                          disabled={!row.name.trim()}
                        >
                          <RefreshCw size={14} />
                        </button>
                      </div>
                      <button
                        type="button"
                        className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors cursor-pointer shrink-0"
                        onClick={() => removeRow(index)}
                        title="Rimuovi"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <datalist id="bulk-roles-list">
              {ROLE_SUGGESTIONS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>

            <div className="flex gap-2 mt-5 items-center">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-gray-300 bg-gray-100 text-gray-700 font-semibold text-sm cursor-pointer flex items-center gap-2"
                onClick={goToInput}
              >
                <ArrowLeft size={16} />
                Indietro
              </button>
              <div className="flex-1" />
              <button
                type="button"
                className="px-4 py-2 rounded-lg border-none font-semibold text-sm cursor-pointer text-white disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: color }}
                onClick={handleConfirm}
                disabled={validCount === 0}
              >
                Aggiungi {validCount} {validCount === 1 ? 'membro' : 'membri'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* CROPPER OVERLAY */}
      {tempImage && (
        <div className="fixed inset-0 bg-black z-300 flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-xl h-100 bg-gray-900 rounded-lg overflow-hidden">
            <Cropper
              image={tempImage}
              crop={crop}
              zoom={zoom}
              aspect={1} // Forza il quadrato
              onCropChange={setCrop}
              onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
              onZoomChange={setZoom}
            />
          </div>

          <div className="mt-4 flex gap-3 w-full max-w-xl items-center">
            <button
              type="button"
              className="bg-gray-600 hover:bg-gray-700 text-white p-2 rounded-lg transition-colors cursor-pointer"
              onClick={() => setZoom(Math.max(1, zoom - 0.2))}
              title="Rimpicciolisci"
            >
              <ZoomOut size={18} />
            </button>
            <input
              type="range"
              className="flex-1 cursor-ew-resize"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              title="Zoom"
            />
            <button
              type="button"
              className="bg-gray-600 hover:bg-gray-700 text-white p-2 rounded-lg transition-colors cursor-pointer"
              onClick={() => setZoom(Math.min(3, zoom + 0.2))}
              title="Ingrandisci"
            >
              <ZoomIn size={18} />
            </button>
            <button
              type="button"
              className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
              onClick={cancelCrop}
            >
              <X size={18} />
              Annulla
            </button>
            <button
              type="button"
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-bold transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
              onClick={handleConfirmCrop}
              disabled={uploading}
            >
              <Check size={18} />
              {uploading ? 'Caricamento...' : 'Conferma'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkImportModal;
