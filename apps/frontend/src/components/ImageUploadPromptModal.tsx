import { CloudUpload, Loader2, X } from 'lucide-react';

interface ImageUploadPromptModalProps {
  isOpen: boolean;
  imageCount: number;
  uploading: boolean;
  onUploadAndContinue: () => void;
  onSkipAndPublish: () => void;
  onClose: () => void;
}

export default function ImageUploadPromptModal({
  isOpen,
  imageCount,
  uploading,
  onUploadAndContinue,
  onSkipAndPublish,
  onClose,
}: ImageUploadPromptModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-300 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex justify-end p-4 pb-0">
          <button
            type="button"
            title="Chiudi"
            onClick={onClose}
            disabled={uploading}
            className="text-gray-400 hover:text-gray-600 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X size={24} />
          </button>
        </div>

        <div className="px-8 pb-8 pt-2 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-100 p-4 rounded-full text-blue-600">
              {uploading ? (
                <Loader2 size={40} className="animate-spin" />
              ) : (
                <CloudUpload size={40} />
              )}
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Nuove immagini da caricare
          </h2>
          <p className="text-gray-600 mb-6 text-sm">
            Ci sono{' '}
            <strong>
              {imageCount} {imageCount === 1 ? 'immagine' : 'immagini'}
            </strong>{' '}
            non ancora caricate su Drupal. Se pubblichi senza caricarle, i
            membri con quella foto la mostreranno rotta.
            <br />
            <br />
            Vuoi caricarle adesso prima di continuare?
          </p>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              title="Carica le immagini e continua"
              onClick={onUploadAndContinue}
              disabled={uploading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-200 cursor-pointer"
            >
              {uploading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Caricamento…
                </>
              ) : (
                <>
                  <CloudUpload size={20} />
                  Carica le immagini e continua
                </>
              )}
            </button>
            <button
              type="button"
              title="Pubblica senza caricare"
              onClick={onSkipAndPublish}
              disabled={uploading}
              className="w-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 font-semibold py-3 px-4 rounded-xl transition-all cursor-pointer"
            >
              Pubblica senza caricare
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
