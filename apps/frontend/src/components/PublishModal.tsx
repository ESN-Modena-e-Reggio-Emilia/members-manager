import {
  ArrowRight,
  CheckCircle,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
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
  onClearDrupalCache: (onLog: (msg: string) => void) => Promise<void>;
}

type Step = 'publish' | 'clearCache';

export default function PublishModal({
  isOpen,
  onClose,
  hasBackedUp,
  onDownloadBackup,
  newHtml,
  onInvalidateCache,
  onClearDrupalCache,
}: PublishModalProps) {
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<Step>('publish');
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [clearLogs, setClearLogs] = useState<string[]>([]);

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  // Reset internal flow every time the modal is (re)opened
  useEffect(() => {
    if (isOpen) {
      setStep('publish');
      setClearing(false);
      setCleared(false);
      setClearError(null);
      setClearLogs([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const DRUPAL_URL =
    'https://more.esn.it/?q=user/login&destination=node/104/edit';

  const handleCopyAndOpen = async () => {
    try {
      await navigator.clipboard.writeText(newHtml);
      setCopied(true);

      // Svuota la cache (backend) in background senza far accorgere nulla all'utente
      onInvalidateCache();

      window.open(DRUPAL_URL, '_blank');

      // Invece di chiudere, passiamo allo step di svuotamento cache del sito
      setStep('clearCache');
    } catch (err) {
      alert("Errore nella copia automatica. Copia manualmente l'HTML.");
      console.error(err);
    }
  };

  const handleClearDrupalCache = async () => {
    setClearing(true);
    setClearError(null);
    setClearLogs([]);
    try {
      await onClearDrupalCache((msg) => setClearLogs((prev) => [...prev, msg]));
      setCleared(true);
    } catch (err) {
      console.error(err);
      setClearError(
        'Qualcosa è andato storto. Puoi svuotare la cache manualmente dal pannello di Drupal.',
      );
    } finally {
      setClearing(false);
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
          {/* --- STEP: SVUOTAMENTO CACHE DEL SITO DRUPAL --- */}
          {step === 'clearCache' ? (
            cleared ? (
              /* --- FATTO! --- */
              <>
                <div className="flex justify-center mb-4">
                  <div className="bg-green-100 p-4 rounded-full text-green-600">
                    <CheckCircle size={40} />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Voilà! ✨
                </h2>
                <p className="text-gray-600 mb-6 text-sm">
                  La cache del sito è stata svuotata. Tra qualche secondo il
                  sito mostrerà i contenuti aggiornati.
                </p>
                <button
                  type="button"
                  title="Chiudi"
                  onClick={onClose}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-200 cursor-pointer"
                >
                  Chiudi
                </button>
              </>
            ) : (
              /* --- INVITO A SVUOTARE LA CACHE --- */
              <>
                <div className="flex justify-center mb-4">
                  <div className="bg-blue-100 p-4 rounded-full text-blue-600">
                    <RefreshCw
                      size={40}
                      className={clearing ? 'animate-spin' : ''}
                    />
                  </div>
                </div>

                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Ultimo passaggio 🧹
                </h2>
                <p className="text-gray-600 mb-6 text-sm">
                  Hai incollato l'HTML e premuto <strong>Salva</strong> su
                  Drupal? Il sito però è ancora in cache.
                  <br />
                  <br />
                  Premi qui sotto e ci penso io a svuotarla (apro Drupal, faccio
                  il login e clicco <em>Clear all caches</em>).
                </p>

                {clearLogs.length > 0 && (
                  <div className="bg-gray-900 text-green-400 text-left text-xs font-mono rounded-xl p-3 mb-4 max-h-32 overflow-y-auto">
                    {clearLogs.map((msg, i) => (
                      <div key={`${i}-${msg}`}>
                        <span className="text-gray-500">&gt;</span> {msg}
                      </div>
                    ))}
                  </div>
                )}

                {clearError && (
                  <p className="text-red-600 text-sm mb-4">{clearError}</p>
                )}

                <button
                  type="button"
                  title="Svuota la cache del sito"
                  onClick={handleClearDrupalCache}
                  disabled={clearing}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed text-white font-bold py-4 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-200 cursor-pointer"
                >
                  {clearing ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Sto svuotando la cache...
                    </>
                  ) : (
                    <>
                      <Trash2 size={20} />
                      Svuota la cache del sito
                    </>
                  )}
                </button>
              </>
            )
          ) : !hasBackedUp ? (
            /* --- STEP 1: BACKUP MANCANTE --- */
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
