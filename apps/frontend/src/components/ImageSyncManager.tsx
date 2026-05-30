import {
  ArrowRight,
  CheckCircle,
  CloudUpload,
  Download,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { imgUrl } from '../utils';

interface ImageSyncManagerProps {
  localImages: { filename: string; dataUrl: string }[];
  toDelete: string[];
  onUploadSuccess: () => void;
}

export default function ImageSyncManager({
  localImages,
  toDelete,
  onUploadSuccess,
}: ImageSyncManagerProps) {
  const dataUrlSize = (dataUrl: string) => {
    const base64 = dataUrl.split(',')[1] ?? '';
    const bytes = Math.round((base64.length * 3) / 4);
    return bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(0)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<null | {
    success: number;
    failed: number;
  }>(null);

  const handleSync = async () => {
    if (localImages.length === 0) return;
    setUploading(true);
    try {
      const form = new FormData();

      // Convert base64 data URLs back to Blobs/Files
      for (const img of localImages) {
        const res = await fetch(img.dataUrl);
        const blob = await res.blob();
        form.append('photos', blob, img.filename);
      }

      // Hit the standard upload endpoint!
      const res = await fetch('/v1/members/upload', {
        method: 'POST',
        body: form,
      });

      const data = await res.json();
      const successCount = data.results.filter(
        (r: { status: string }) => r.status === 'success',
      ).length;

      if (successCount > 0) {
        onUploadSuccess();
      }

      setUploadResult({
        success: successCount,
        failed: data.results.length - successCount,
      });
    } catch (err) {
      console.error('Error during image sync:', err);
      alert('Errore durante il sync delle immagini');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
      {/* Upload Column */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <CloudUpload className="text-blue-500" size={20} />
            Da caricare
            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
              {localImages.length}
            </span>
            <a
              href="https://more.esn.it/?q=user/1/imce"
              target="_blank"
              rel="noopener noreferrer"
              title="Carica manualmente le immagini da qui, oppure usa il tasto automatico"
              className="text-blue-500 hover:text-blue-700 ml-2"
            >
              <ExternalLink size={16} />
            </a>
          </h3>
          {localImages.length > 0 && !uploadResult && (
            <button
              type="button"
              onClick={handleSync}
              disabled={uploading}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {uploading ? (
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <ArrowRight size={14} />
              )}
              {uploading ? 'Caricamento...' : 'Carica ora'}
            </button>
          )}
        </div>

        {uploadResult ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <div className="flex justify-center mb-2">
              <CheckCircle className="text-green-600" size={32} />
            </div>
            <p className="font-bold text-green-800">Operazione completata</p>
            <p className="text-sm text-green-700">
              {uploadResult.success} caricati, {uploadResult.failed} falliti.
            </p>
          </div>
        ) : localImages.length === 0 ? (
          <p className="text-sm text-gray-400 italic">
            Nessuna nuova immagine da caricare.
          </p>
        ) : (
          <ul className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {localImages.map((img) => (
              <li
                key={img.filename}
                className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg border border-gray-100"
              >
                <img
                  src={img.dataUrl}
                  alt=""
                  className="w-10 h-10 rounded object-cover bg-gray-200"
                />
                <span className="text-sm font-medium text-gray-700 truncate flex-1">
                  {img.filename}
                </span>
                <span className="text-xs text-gray-400 shrink-0">
                  {dataUrlSize(img.dataUrl)}
                </span>
                <a
                  href={img.dataUrl}
                  download={img.filename}
                  className="p-2 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                  title="Scarica immagine"
                >
                  <Download size={16} />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Delete Column */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm opacity-70">
        <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
          <Trash2 className="text-red-500" size={20} />
          Inutilizzate (Info)
          <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">
            {toDelete.length}
          </span>
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Queste immagini sono presenti nel vecchio HTML ma non nel nuovo.
          Drupal non le cancella automaticamente.
        </p>

        {toDelete.length === 0 ? (
          <p className="text-sm text-gray-400 italic">
            Nessuna immagine rimossa.
          </p>
        ) : (
          <ul className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {toDelete.map((filename) => (
              <li
                key={filename}
                className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg border border-gray-100"
              >
                <img
                  src={imgUrl(filename)}
                  alt=""
                  className="w-8 h-8 rounded object-cover grayscale opacity-60"
                />
                <span className="text-sm text-gray-500 truncate line-through">
                  {filename}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
