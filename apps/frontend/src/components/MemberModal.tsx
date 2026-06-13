import { Camera, Check, RefreshCw, X, ZoomIn, ZoomOut } from 'lucide-react'; // Aggiunto RefreshCw
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import Cropper from 'react-easy-crop';
import {
  ROLE_SUGGESTIONS,
  SECTION_BG,
  SECTION_COLORS,
  SECTION_NEW_MEMBER_DEFAULTS,
} from '../constants';
import { getCroppedImg } from '../cropUtils';
import type { MemberData, SectionType } from '../types';
import { imgUrl, initials } from '../utils';

interface ModalProps {
  member: MemberData | null;
  sectionKey: SectionType;
  onSave: (updated: MemberData) => void;
  onClose: () => void;
  onDelete: () => void;
}

const MemberModal = ({
  member,
  sectionKey,
  onSave,
  onClose,
  onDelete,
}: ModalProps) => {
  const isNewMember = !member?.name;
  const sectionDefaults = isNewMember
    ? SECTION_NEW_MEMBER_DEFAULTS[sectionKey]
    : undefined;
  const [name, setName] = useState(member?.name ?? '');
  const [role, setRole] = useState(member?.role ?? sectionDefaults?.role ?? '');
  const [imageFilename, setImageFilename] = useState(
    member?.imageFilename ?? sectionDefaults?.imageFilename ?? '',
  );
  const [localImage, setLocalImage] = useState(member?.localImage ?? '');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [tempImage, setTempImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{
    width: number;
    height: number;
    x: number;
    y: number;
  } | null>(null);
  const color = SECTION_COLORS[sectionKey];
  const isNew = isNewMember;

  // Define the drop handler
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      const reader = new FileReader();
      reader.addEventListener('load', () =>
        setTempImage(reader.result as string),
      );
      reader.readAsDataURL(file);
    }
  }, []);

  // Initialize Dropzone
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: false,
    noClick: false,
  });

  async function handleConfirmCrop() {
    if (!tempImage || !croppedAreaPixels) return;
    setUploading(true);
    try {
      const croppedBlob = await getCroppedImg(tempImage, croppedAreaPixels);

      // Convert Blob to Base64 (Data URL)
      const reader = new FileReader();
      reader.readAsDataURL(croppedBlob);
      reader.onloadend = () => {
        // Selettore intelligente del nome file
        let newName = imageFilename;
        // Se il filename è vuoto, oppure è uno di quelli temporanei generati prima, lo sovrascriviamo
        if (!newName || newName.startsWith('immagine_')) {
          newName = name
            ? `${name.trim().toLowerCase().replace(/\s+/g, '_')}.jpg`
            : `immagine_${Date.now()}.jpg`;
        }

        setImageFilename(newName);
        setLocalImage(reader.result as string);
        setTempImage(null); // Close cropper
        setUploading(false);
      };
    } catch (_err) {
      setUploadError('Errore durante il ritaglio.');
      setUploading(false);
    }
  }

  function handleSave() {
    if (!name.trim()) return;

    // Pulizia e normalizzazione del nome file inserito manualmente
    let finalFilename = imageFilename.trim().toLowerCase();

    if (finalFilename) {
      // Sostituisci spazi con underscore
      finalFilename = finalFilename.replace(/\s+/g, '_');
      // Aggiungi .jpg se non c'è nessuna estensione
      if (!finalFilename.includes('.')) {
        finalFilename += '.jpg';
      }
    }

    onSave({
      name: name.trim(),
      role: role.trim(),
      imageFilename: finalFilename,
      localImage,
    });
  }

  // Funzione helper per generare il filename in base al nome inserito nell'input
  const autoGenerateFilename = () => {
    if (name) {
      setImageFilename(`${name.trim().toLowerCase().replace(/\s+/g, '_')}.jpg`);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-35 z-200 flex items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-white rounded-2xl px-7 py-6 w-full max-w-md shadow-2xl"
        style={{ borderTop: `4px solid ${color}` }}
      >
        <div className="flex items-center justify-between mb-4.5">
          <h2 className="font-bold text-lg m-0" style={{ color }}>
            {isNew ? 'Aggiungi membro' : 'Modifica membro'}
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

        {/* Preview avatar */}
        <div className="flex justify-center mb-5">
          {/* 4. Wrap the Avatar with Dropzone Props */}
          <div
            {...getRootProps()}
            className={`relative group cursor-pointer rounded-full transition-all duration-200 ${
              isDragActive ? 'scale-110 ring-4 ring-blue-400 ring-offset-4' : ''
            }`}
          >
            <input {...getInputProps()} />

            {localImage || imageFilename ? (
              <img
                src={localImage || imgUrl(imageFilename)}
                alt={name}
                className="w-20 h-20 rounded-full object-cover block"
                style={{
                  border: `3px solid ${isDragActive ? '#3b82f6' : color}`,
                  opacity: isDragActive ? 0.5 : 1,
                }}
              />
            ) : (
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold transition-colors"
                style={{
                  background: isDragActive ? '#dbeafe' : SECTION_BG[sectionKey],
                  border: `3px solid ${isDragActive ? '#3b82f6' : color}`,
                  color: isDragActive ? '#3b82f6' : color,
                }}
              >
                {initials(name) || '?'}
              </div>
            )}

            {isDragActive && (
              <div className="absolute inset-0 flex items-center justify-center bg-blue-500/20 rounded-full">
                <Camera size={24} className="text-blue-600 animate-bounce" />
              </div>
            )}

            {/* Button remains as a secondary option / visual cue */}
            <div
              className="absolute bottom-0 right-0 border-none rounded-full w-7 h-7 flex items-center justify-center text-white shadow-md transition-transform group-hover:scale-110"
              style={{ background: color }}
            >
              <Camera size={16} />
            </div>
          </div>
        </div>

        {/* 5. Dropzone "Zone" Text (Optional) */}
        <p className="text-[10px] text-center text-gray-400 -mt-2 mb-4">
          Trascina qui la foto o clicca per caricarla
        </p>
        {uploadError && (
          <p className="text-red-600 text-center m-0 mb-3 text-sm">
            {uploadError}
          </p>
        )}

        <div className="mb-4">
          <label
            className="block text-sm font-semibold text-gray-600 mb-1.25"
            htmlFor="fullname"
          >
            Nome completo
          </label>
          <input
            id="fullname"
            className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm outline-none box-border font-inherit"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="es. Mario Rossi"
          />
        </div>

        <div className="mb-4">
          <label
            className="block text-sm font-semibold text-gray-600 mb-1.25"
            htmlFor="role"
          >
            Ruolo
          </label>
          <input
            id="role"
            className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm outline-none box-border font-inherit"
            list="roles-list"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="es. Presidente"
          />
          <datalist id="roles-list">
            {ROLE_SUGGESTIONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>

        {/* --- NUOVO CAMPO: Nome file immagine --- */}
        <div className="mb-4">
          <label
            className="block text-sm font-semibold text-gray-600 mb-1.25"
            htmlFor="imageFilename"
          >
            Nome file immagine
          </label>
          <div className="flex gap-2 items-center">
            <input
              id="imageFilename"
              className="flex-1 border border-gray-300 rounded-lg px-2.5 py-2 text-sm outline-none box-border font-inherit"
              value={imageFilename}
              onChange={(e) => setImageFilename(e.target.value)}
              placeholder="es. mario_rossi.jpg"
            />
            <button
              type="button"
              className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={autoGenerateFilename}
              title="Genera dal nome utente"
              disabled={!name}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1 ml-1">
            Convenzione: <strong>nome_cognome.jpg</strong>
          </p>
        </div>
        {/* --------------------------------------- */}

        <div className="flex gap-2 mt-5 items-center">
          {!isNew && (
            <button
              type="button"
              className="px-4 py-2 rounded-lg border-none font-semibold text-sm cursor-pointer bg-red-50 text-red-600 border border-red-200"
              onClick={onDelete}
            >
              Rimuovi
            </button>
          )}
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
            className="px-4 py-2 rounded-lg border-none font-semibold text-sm cursor-pointer text-white"
            style={{ background: color }}
            onClick={handleSave}
          >
            {isNew ? 'Aggiungi' : 'Salva'}
          </button>
        </div>
      </div>

      {/* CROPPER OVERLAY */}
      {tempImage && (
        <div className="fixed inset-0 bg-black z-300 flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-xl h-100 bg-gray-900 rounded-lg overflow-hidden">
            <Cropper
              image={tempImage}
              crop={crop}
              zoom={zoom}
              aspect={1} // Forces Square
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
              onClick={() => setTempImage(null)}
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

export default MemberModal;
