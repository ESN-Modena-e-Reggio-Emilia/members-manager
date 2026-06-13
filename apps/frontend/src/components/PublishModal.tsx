import {
  CheckCircle,
  Download,
  ExternalLink,
  Loader2,
  Rocket,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface PublishResult {
  verified: boolean;
  driftDetected: boolean;
  firstBackup: boolean;
  commitSha: string | null;
}

interface PublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  newHtml: string;
  onPublish: (onLog: (msg: string) => void) => Promise<PublishResult>;
  onDownloadBackup: () => void;
}

const DRUPAL_URL =
  'https://more.esn.it/?q=user/login&destination=node/104/edit';

export default function PublishModal({
  isOpen,
  onClose,
  newHtml,
  onPublish,
  onDownloadBackup,
}: PublishModalProps) {
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  // Reset the flow every time the modal is (re)opened.
  useEffect(() => {
    if (isOpen) {
      setPublishing(false);
      setPublished(false);
      setResult(null);
      setError(null);
      setLogs([]);
      setCopied(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePublish = async () => {
    setPublishing(true);
    setError(null);
    setLogs([]);
    try {
      const res = await onPublish((msg) => setLogs((prev) => [...prev, msg]));
      setResult(res);
      setPublished(true);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : 'Qualcosa è andato storto durante la pubblicazione.',
      );
    } finally {
      setPublishing(false);
    }
  };

  const handleCopyFallback = async () => {
    try {
      await navigator.clipboard.writeText(newHtml);
      setCopied(true);
      window.open(DRUPAL_URL, '_blank');
    } catch (err) {
      console.error(err);
      alert("Errore nella copia. Copia manualmente l'HTML dalla schermata.");
    }
  };

  const logBox = logs.length > 0 && (
    <div className="bg-gray-900 text-green-400 text-left text-xs font-mono rounded-xl p-3 mb-4 max-h-40 overflow-y-auto">
      {logs.map((msg, i) => (
        <div key={`${i}-${msg}`}>
          <span className="text-gray-500">&gt;</span> {msg}
        </div>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 z-300 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header con pulsante chiudi */}
        <div className="flex justify-end p-4 pb-0">
          <button
            type="button"
            title="Chiudi"
            onClick={onClose}
            disabled={publishing}
            className="text-gray-400 hover:text-gray-600 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X size={24} />
          </button>
        </div>

        <div className="px-8 pb-8 pt-2 text-center">
          {published ? (
            /* --- SUCCESSO --- */
            <>
              <div className="flex justify-center mb-4">
                <div className="bg-green-100 p-4 rounded-full text-green-600">
                  <CheckCircle size={40} />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Pubblicato! ✨
              </h2>
              <p className="text-gray-600 mb-4 text-sm">
                L'HTML è stato salvato su Drupal e messo al sicuro su GitHub.
                {result?.driftDetected && (
                  <>
                    <br />
                    <br />
                    <span className="text-amber-700">
                      ⚠️ Avevo trovato modifiche fatte a mano direttamente su
                      Drupal: le ho salvate su GitHub come backup prima di
                      pubblicare.
                    </span>
                  </>
                )}
                {result?.firstBackup && (
                  <>
                    <br />
                    <br />
                    <span className="text-gray-500">
                      Era la prima pubblicazione: ho creato lo snapshot iniziale
                      del sito nella repo di backup.
                    </span>
                  </>
                )}
              </p>
              {logBox}
              <button
                type="button"
                title="Chiudi"
                onClick={onClose}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-200 cursor-pointer"
              >
                Chiudi
              </button>
            </>
          ) : error ? (
            /* --- ERRORE + FALLBACK MANUALE --- */
            <>
              <div className="flex justify-center mb-4">
                <div className="bg-red-100 p-4 rounded-full text-red-600">
                  <ShieldAlert size={40} />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Pubblicazione non riuscita
              </h2>
              <p className="text-red-600 mb-4 text-sm wrap-break-word">
                {error}
              </p>
              {logBox}
              <p className="text-gray-600 mb-4 text-sm">
                Nessun problema: puoi pubblicare a mano. Scarica il backup e
                copia l'HTML su Drupal.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  title="Copia HTML e apri Drupal"
                  onClick={handleCopyFallback}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-200 cursor-pointer"
                >
                  {copied ? (
                    <>
                      Copiato! Apri <ExternalLink size={18} />
                    </>
                  ) : (
                    <>
                      Copia HTML e apri Drupal <ExternalLink size={18} />
                    </>
                  )}
                </button>
                <button
                  type="button"
                  title="Scarica backup HTML"
                  onClick={onDownloadBackup}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Download size={18} />
                  Scarica backup HTML
                </button>
                <button
                  type="button"
                  title="Riprova la pubblicazione automatica"
                  onClick={handlePublish}
                  className="w-full text-blue-600 hover:text-blue-800 font-semibold py-2 text-sm cursor-pointer"
                >
                  Riprova la pubblicazione automatica
                </button>
              </div>
            </>
          ) : (
            /* --- STEP INIZIALE / IN CORSO --- */
            <>
              <div className="flex justify-center mb-4">
                <div className="bg-blue-100 p-4 rounded-full text-blue-600">
                  {publishing ? (
                    <Loader2 size={40} className="animate-spin" />
                  ) : (
                    <Rocket size={40} />
                  )}
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {publishing ? 'Pubblicazione in corso…' : 'Pronti al lancio 🚀'}
              </h2>
              <p className="text-gray-600 mb-6 text-sm">
                Ci penso io a tutto: salvo la versione attuale su GitHub come
                backup, pubblico l'HTML nuovo su Drupal, verifico che sia andato
                a buon fine e svuoto la cache.
              </p>
              {logBox}
              <button
                type="button"
                title="Pubblica su Drupal"
                onClick={handlePublish}
                disabled={publishing}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed text-white font-bold py-4 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-200 cursor-pointer"
              >
                {publishing ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Sto pubblicando…
                  </>
                ) : (
                  <>
                    <Rocket size={20} />
                    Pubblica su Drupal
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
