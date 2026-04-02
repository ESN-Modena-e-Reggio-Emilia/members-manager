import {
  ArrowRight,
  CheckCircle,
  Download,
  ExternalLink,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface PublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  hasBackedUp: boolean;
  onDownloadBackup: () => void;
  newHtml: string;
  onInvalidateCache: () => void;
}

export default function PublishModal({
  isOpen,
  onClose,
  hasBackedUp,
  onDownloadBackup,
  newHtml,
  onInvalidateCache,
}: PublishModalProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  if (!isOpen) return null;

  const DRUPAL_URL =
    'https://more.esn.it/?q=user/login&destination=node/104/edit';

  const handleCopyAndOpen = async () => {
    try {
      await navigator.clipboard.writeText(newHtml);
      setCopied(true);

      // Svuota la cache in background senza far accorgere nulla all'utente
      onInvalidateCache();

      window.open(DRUPAL_URL, '_blank');
      onClose();
    } catch (err) {
      alert("Errore nella copia automatica. Copia manualmente l'HTML.");
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-300 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header con pulsante chiudi */}
        <div className="flex justify-end p-4 pb-0">
          <button
            type="button"
            title="Chiudi"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 cursor-pointer"
          >
            <X size={24} />
          </button>
        </div>

        <div className="px-8 pb-8 pt-2 text-center">
          {/* --- STEP 1: BACKUP MANCANTE --- */}
          {!hasBackedUp ? (
            <>
              <div className="flex justify-center mb-4">
                <div className="bg-orange-100 p-4 rounded-full text-orange-600 animate-pulse">
                  <ShieldAlert size={40} />
                </div>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-2">Aspe ✋</h2>
              <p className="text-gray-600 mb-6 text-sm">
                Non ti permetterò di pubblicare senza aver prima scaricato un
                backup della versione attuale.
                <br />
                <br />
                <strong>
                  Se rompiamo il sito, questo file ci salverà la vita.
                </strong>
              </p>

              <button
                type="button"
                title="Scarica backup HTML"
                onClick={onDownloadBackup}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-orange-200 cursor-pointer"
              >
                <Download size={20} />
                Scarica backup HTML
              </button>
            </>
          ) : (
            /* --- STEP 2: TUTTO PRONTO --- */
            <>
              <div className="flex justify-center mb-4">
                <div className="bg-green-100 p-4 rounded-full text-green-600">
                  <CheckCircle size={40} />
                </div>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Tutto pronto! 🚀
              </h2>
              <p className="text-gray-600 mb-6 text-sm">
                Il backup è al sicuro. Cliccando il pulsante qui sotto:
              </p>
              <ol className="text-gray-600 mb-6 text-sm list-decimal list-inside">
                <li>
                  L'HTML nuovo verrà <strong>copiato</strong>.
                </li>
                <li>
                  Si aprirà <strong>il sito di sezione</strong> (Drupal) in una
                  nuova scheda.{' '}
                  <small>
                    Se ti chiede di fare il login, pigia
                    <span className="uppercase text-white font-bold bg-gray-400 hover:bg-gray-500 transition-colors select-none cursor-not-allowed px-1 mx-1 rounded-xl">
                      Login without Galaxy
                    </span>
                    e inserisci le credenziali di accesso
                  </small>
                  .
                </li>
              </ol>

              <button
                type="button"
                title="Copia e vai su Drupal"
                onClick={handleCopyAndOpen}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-200 cursor-pointer group"
              >
                {copied ? (
                  <>
                    Copiato! Apri <ExternalLink size={20} />
                  </>
                ) : (
                  <>
                    {/* <Copy size={20} /> */}
                    Copia e vai su Drupal
                    <ArrowRight
                      size={20}
                      className="group-hover:translate-x-1 transition-transform"
                    />
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
