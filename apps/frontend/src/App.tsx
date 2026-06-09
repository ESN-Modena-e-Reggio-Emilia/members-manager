import {
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  CheckCircle,
  ExternalLink,
  FileDown,
  RefreshCw,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import BulkImportModal from './components/BulkImportModal';
import DiffViewer from './components/DiffViewer';
import ImageSyncManager from './components/ImageSyncManager';
import MemberModal from './components/MemberModal';
import PublishModal from './components/PublishModal';
import WelcomeModal from './components/WelcomeModal';
import { SECTION_COLORS, SECTION_KEYS } from './constants';
import SectionColumn from './SectionColumn';
import type { MemberData, SectionsState, SectionType } from './types';
import { parseDrupalHtml } from './utils';

// New Interface for Preview Data
interface PreviewData {
  oldHtml: string;
  newHtml: string;
  images: {
    toUpload: string[];
    toDelete: string[];
  };
}

export default function App() {
  const [sections, setSections] = useState<SectionsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [previewData, setPreviewData] = useState<PreviewData | null>(null); // New State
  const [hasBackedUp, setHasBackedUp] = useState(false);
  const [imagesUploadedPendingSave, setImagesUploadedPendingSave] =
    useState(false);

  // Modal state
  const [editModal, setEditModal] = useState<{
    section: SectionType;
    index: number | null;
  } | null>(null);
  const [bulkModal, setBulkModal] = useState<SectionType | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);

  // Drag state
  const dragSource = useRef<{ section: SectionType; index: number } | null>(
    null,
  );

  // Log container ref for auto-scroll
  const logBodyRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: necessary to auto-scroll on new logs
  useEffect(() => {
    // Scroll log container to bottom when logs change
    if (logBodyRef.current) {
      logBodyRef.current.scrollTop = logBodyRef.current.scrollHeight;
    }
  }, [logs]);

  const startStreaming = () => {
    setLoading(true);
    setIsStreaming(true);
    setLogs([]);

    const eventSource = new EventSource(`/v1/drupal/stream-about-us`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'log') {
        setLogs((prev) => [...prev, data.message]);
      } else if (data.type === 'result') {
        const jsonState = parseDrupalHtml(data.content);
        setSections(jsonState);
        setLoading(false);
        setIsStreaming(false);
        eventSource.close();
      } else if (data.type === 'error') {
        setError(data.message);
        setIsStreaming(false);
        eventSource.close();
      }
    };

    eventSource.onerror = () => {
      setError('Connection to stream lost.');
      setIsStreaming(false);
      eventSource.close();
    };
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: run only on mount
  useEffect(() => {
    startStreaming();
  }, []);

  // Intercetta la chiusura della pagina
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (imagesUploadedPendingSave) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [imagesUploadedPendingSave]);

  async function handleSave() {
    if (!sections || !previewData) return;

    setSaving(true);
    // setSaveMsg(''); // Non serve più mostrare messaggi qui

    try {
      // 1. Salviamo sul backend locale (opzionale ma utile)
      const res = await fetch(`/v1/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sections),
      });

      if (!res.ok) console.warn('Warning: Salvataggio locale fallito');

      setImagesUploadedPendingSave(false);

      // 2. Apriamo il Modal (che gestirà backup check e redirect)
      setShowPublishModal(true);
    } catch (err) {
      console.error(err);
      alert('Errore generico durante il salvataggio.');
    } finally {
      setSaving(false);
    }
  }

  const handleRefreshFromLive = () => {
    // Se abbiamo già dei dati (sections non è null), chiediamo conferma
    if (sections) {
      const confirmDiscard = window.confirm(
        'Attenzione: perderei tutte le modifiche fatte finora. Vuoi scaricare nuovamente i dati originali dal sito "live"?',
      );
      if (!confirmDiscard) return;
    }
    startStreaming();
  };

  const handleSortMembers = () => {
    if (!sections) return;
    const next: SectionsState = { ...sections };
    for (const key of SECTION_KEYS) {
      next[key] = [...sections[key]].sort((a, b) =>
        a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }),
      );
    }
    setSections(next);
  };

  // --- NUOVA FUNZIONE: Pulisce la cache e fa il refresh ---
  const handleClearCacheAndRefresh = async () => {
    if (sections) {
      const confirmDiscard = window.confirm(
        'Attenzione: perderei le modifiche locali non salvate. Vuoi SVUOTARE LA CACHE del server e forzare il download dei dati freschi dal sito?',
      );
      if (!confirmDiscard) return;
    }

    setLoading(true);
    try {
      await fetch('/v1/cache/content', { method: 'DELETE' });
      // Riavvia lo streaming (che ora troverà la cache vuota)
      startStreaming();
    } catch (e) {
      console.error('Errore durante lo svuotamento della cache:', e);
      alert('Impossibile svuotare la cache');
      setLoading(false);
    }
  };

  // --- NUOVA FUNZIONE: Pulisce la cache silenziosamente (per post-pubblicazione) ---
  const handleSilentCacheClear = async () => {
    try {
      await fetch('/v1/cache/content', { method: 'DELETE' });
    } catch (e) {
      console.error(
        'Errore nello svuotamento della cache post-pubblicazione:',
        e,
      );
    }
  };

  // Modified function to switch to Preview Mode
  const handleGoToPreview = async () => {
    if (!sections) return;
    setLoading(true);
    setHasBackedUp(false);
    try {
      const res = await fetch(`/v1/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sections),
      });
      if (!res.ok) throw new Error();

      const data = await res.json();
      setPreviewData(data); // Save the full response including Diff and Images
      setView('preview');
    } catch (e) {
      console.error('Error generating preview:', e);
      alert("Errore nella generazione dell'anteprima");
    } finally {
      setLoading(false);
    }
  };

  // NUOVA FUNZIONE DI UTILITÀ
  const downloadHtmlFile = (filename: string, content: string) => {
    const element = document.createElement('a');
    const file = new Blob([content], { type: 'text/html' });
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element); // Required for this to work in FireFox
    element.click();
    document.body.removeChild(element);
  };

  const handleDownloadOld = () => {
    if (!previewData) return;
    const date = new Date().toISOString().split('T')[0];
    downloadHtmlFile(`backup_esn_members_${date}.html`, previewData.oldHtml);
    setHasBackedUp(true);
  };

  // const handleDownloadNew = () => {
  //   if (!previewData) return;
  //   const date = new Date().toISOString().split('T')[0];
  //   downloadHtmlFile(`new_esn_members_${date}.html`, previewData.newHtml);
  // };

  // --- NUOVA FUNZIONE PER L'ANTEPRIMA LIVE ---
  const handleOpenLivePreview = () => {
    if (!previewData || !sections) return;

    // 1. Parsiamo l'HTML generato dal backend (che contiene i path 'rotti' o vecchi per le nuove immagini)
    const parser = new DOMParser();
    const doc = parser.parseFromString(previewData.newHtml, 'text/html');

    // 2. Aggiungiamo il tag <base> per far caricare CSS/JS relativi dal sito vero
    //    Nota: Lo mettiamo come primo elemento della head
    const base = doc.createElement('base');
    base.href = 'https://more.esn.it/';
    doc.head.prepend(base);

    // 3. Iniettiamo le immagini locali (Base64) al posto dei path generati dal backend
    //    Recuperiamo tutti i membri che hanno una modifica locale dell'immagine
    const membersWithLocalImages = Object.values(sections)
      .flat()
      .filter((m) => m.localImage && m.imageFilename);

    membersWithLocalImages.forEach((member) => {
      // Cerchiamo l'immagine nell'HTML tramite il filename
      // Il backend genera src tipo: "./sites/esnmodena.it/files/members/nome_cognome.jpg"
      // Quindi cerchiamo un src che finisca con il filename
      const imgEl = doc.querySelector(`img[src$="${member.imageFilename}"]`);
      if (imgEl && member.localImage) {
        imgEl.setAttribute('src', member.localImage);
      }
    });

    // 4. Serializziamo di nuovo l'HTML modificato
    const finalHtml = doc.documentElement.outerHTML;

    // 5. Apriamo una nuova finestra
    const win = window.open('', '_blank');
    if (win) {
      win.document.open();
      win.document.write(finalHtml);
      win.document.close();
    } else {
      alert('Impossibile aprire la finestra. Controlla il blocco popup.');
    }
  };

  function handleDragStart(section: SectionType, index: number) {
    dragSource.current = { section, index };
  }

  function handleDropOnCard(targetSection: SectionType, targetIndex: number) {
    const src = dragSource.current;
    if (!src || !sections) return;
    const next = { ...sections };
    // Remove from source
    const [moved] = next[src.section].splice(src.index, 1);
    // Insert into target
    next[targetSection].splice(targetIndex, 0, moved);
    setSections(next);
    dragSource.current = null;
  }

  function handleDropOnSection(targetSection: SectionType) {
    const src = dragSource.current;
    if (!src || !sections) return;
    const next = { ...sections };
    const [moved] = next[src.section].splice(src.index, 1);
    next[targetSection].push(moved);
    setSections({ ...next });
    dragSource.current = null;
  }

  function handleEditSave(
    section: SectionType,
    index: number | null,
    updated: MemberData,
  ) {
    if (!sections) return;
    const next = { ...sections };
    if (index === null) {
      next[section] = [...next[section], updated];
    } else {
      next[section] = next[section].map((m, i) => (i === index ? updated : m));
    }
    setSections(next);
    setEditModal(null);
  }

  function handleBulkSave(section: SectionType, newMembers: MemberData[]) {
    if (!sections) return;
    const next = { ...sections };
    next[section] = [...next[section], ...newMembers];
    setSections(next);
    setBulkModal(null);
  }

  function handleDelete(section: SectionType, index: number) {
    if (!sections) return;
    const next = { ...sections };
    next[section] = next[section].filter((_, i) => i !== index);
    setSections(next);
    setEditModal(null);
  }

  if (error)
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center text-red-600">
          <div className="text-4xl mb-3">
            <AlertTriangle size={40} />
          </div>
          <div className="font-semibold">{error}</div>
          <div className="text-gray-500 mt-2 text-sm">
            Assicurati che il server Express sia in esecuzione.
          </div>
        </div>
      </div>
    );

  const modalSection = editModal?.section;
  const modalIndex = editModal?.index ?? null;
  const modalMember =
    modalSection && modalIndex !== null
      ? sections?.[modalSection][modalIndex]
      : null;

  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      <WelcomeModal />
      {/* Floating Loading Indicator */}
      {loading && (
        <div className="fixed bottom-5 right-5 bg-white rounded-xl px-5 py-4 flex flex-col items-center shadow-lg z-150">
          <div className="w-9 h-9 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
          <span className="mt-2 text-xs text-blue-500">Caricamento...</span>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-100 shadow-sm">
        <div className="flex items-center gap-2.5">
          <img
            src="https://more.esn.it/sites/esnmodena.it/files/web-it-mode-esn-colour-black.png"
            alt="ESN Logo"
            className="h-10 mr-2.5"
          />
          <div className="flex flex-col">
            <span className="font-bold text-sm text-gray-900 leading-none">
              Members Manager
            </span>
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${view === 'edit' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'} cursor-pointer`}
                onClick={() => setView('edit')}
              >
                1. Modifica
              </button>
              <div className="w-4 h-px bg-gray-300" />
              <button
                type="button"
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${view === 'preview' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'} cursor-pointer`}
                onClick={() => setView('preview')}
              >
                2. Anteprima
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {view === 'preview' && (
            <>
              <button
                type="button"
                onClick={() => setView('edit')}
                className="text-gray-500 hover:text-gray-700 font-semibold text-sm px-3 cursor-pointer"
              >
                Torna indietro
              </button>

              {/* --- NUOVO BOTTONE ANTEPRIMA LIVE --- */}
              <button
                type="button"
                onClick={handleOpenLivePreview}
                className="bg-purple-100 hover:bg-purple-200 text-purple-700 border border-purple-300 flex items-center gap-2 rounded-lg px-4 py-2 font-bold text-sm cursor-pointer transition-colors"
                title="Apre una nuova scheda renderizzando la pagina esattamente come apparirà"
              >
                <ExternalLink size={18} /> Visualizza anteprima
              </button>
            </>
          )}

          {view === 'edit' && (
            <>
              <button
                type="button"
                onClick={handleSortMembers}
                disabled={isStreaming || loading}
                className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg px-3.5 py-2 flex items-center gap-2 font-semibold text-sm cursor-pointer transition-all"
                title="Ordina alfabeticamente i membri in ogni sezione"
              >
                <ArrowUpDown size={16} className="text-gray-400" />
                <span>Ordina A-Z</span>
              </button>

              {/* --- NUOVO PULSANTE FULMINE --- */}
              <button
                type="button"
                onClick={handleClearCacheAndRefresh}
                disabled={isStreaming || loading}
                className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-300 rounded-lg px-3.5 py-2 flex items-center gap-2 font-semibold text-sm cursor-pointer transition-all shadow-sm"
                title="Ignora la cache, scarica la versione attuale forzatamente"
              >
                <Zap
                  size={16}
                  className={`${isStreaming ? 'animate-pulse' : ''}`}
                />
              </button>

              <button
                type="button"
                onClick={handleRefreshFromLive}
                disabled={isStreaming || loading}
                className="group bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg px-3.5 py-2 flex items-center gap-2 font-semibold text-sm cursor-pointer transition-all"
                title="Elimina le modificle locali e scarica i dati attuali da Drupal"
              >
                {isStreaming ? (
                  <>
                    <div className="w-4 h-4 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
                    <span>Sincronizzazione...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw
                      size={16}
                      className="text-gray-400 group-hover:rotate-180 transition-transform duration-500"
                    />
                    <span>Reimposta come da sito</span>
                  </>
                )}
              </button>

              <button
                type="button"
                className="bg-blue-500 hover:bg-blue-600 text-white flex items-center gap-2 rounded-lg px-6 py-2 font-bold text-sm cursor-pointer transition-colors shadow-sm"
                onClick={handleGoToPreview}
              >
                Continua <ArrowRight size={18} />
              </button>
            </>
          )}

          {view === 'preview' && (
            <button
              type="button"
              className={`bg-green-600 hover:bg-green-700 text-white flex items-center gap-2 rounded-lg px-6 py-2 font-bold text-sm cursor-pointer transition-colors ${saving ? 'opacity-70' : ''}`}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Salvataggio...' : 'Conferma e pubblica'}
            </button>
          )}
        </div>
      </header>

      {view === 'edit' ? (
        <>
          {/* Log container */}
          <div className="mx-5 mt-5 mb-0 bg-white rounded-lg overflow-hidden text-gray-900 font-mono text-xs shadow-lg">
            <div className="px-3 py-2 bg-gray-100 border-b border-gray-300 text-gray-600 uppercase text-[10px] tracking-wider">
              Log del server (da Puppeteer)
            </div>
            <div
              className="px-3 py-3 max-h-37.5 overflow-y-auto flex flex-col gap-1"
              ref={logBodyRef}
            >
              {logs.map((log, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static
                <div key={i} className="leading-relaxed">
                  <span style={{ color: SECTION_COLORS.BOARD }}>&gt;</span>{' '}
                  {log}
                </div>
              ))}
            </div>
          </div>

          {/* Kanban board */}
          <main className="block columns-3 column-gap-4 px-5 py-5 flex-1 overflow-x-auto">
            {sections &&
              SECTION_KEYS.map((key) => (
                <SectionColumn
                  key={key}
                  sectionKey={key}
                  members={sections[key]}
                  onEdit={(i) => setEditModal({ section: key, index: i })}
                  onAddNew={() => setEditModal({ section: key, index: null })}
                  onBulkImport={
                    key === 'ACTIVE' ? () => setBulkModal(key) : undefined
                  }
                  onDragStart={(i) => handleDragStart(key, i)}
                  onDropOnCard={(ti) => handleDropOnCard(key, ti)}
                  onDropOnSection={() => handleDropOnSection(key)}
                  dragSource={dragSource.current}
                />
              ))}
          </main>
        </>
      ) : (
        <main className="flex-1 p-6 md:p-10 flex flex-col items-center w-full max-w-400 mx-auto">
          {previewData ? (
            <div className="w-full flex flex-col gap-6">
              {imagesUploadedPendingSave && (
                <div className="bg-red-50 border-l-4 border-red-500 rounded-r-xl p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="p-1 bg-red-100 rounded-full text-red-600 shrink-0">
                      <AlertTriangle size={20} />
                    </div>
                    <div className="flex-1">
                      <p className="text-red-800 text-sm font-medium">
                        ⚠️ Attenzione: hai caricato nuove immagini sul server. Se
                        esci ora senza salvare l'HTML, rimarranno file
                        inutilizzati su Drupal.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {/* --- ZONA DI SICUREZZA / DOWNLOAD --- */}
              <div className="bg-orange-50 border-l-4 border-orange-500 rounded-r-xl p-6 shadow-sm mb-2">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-orange-100 rounded-full text-orange-600 shrink-0">
                    <ShieldAlert size={32} />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-bold text-gray-900 mb-1">
                      Backup
                    </h2>
                    <p className="text-gray-700 text-sm mb-4 leading-relaxed">
                      Prima di caricare qualsiasi cosa su Drupal/Satellite,{' '}
                      <strong>DEVI scaricare il backup</strong> dell'HTML
                      attuale. Se qualcosa va storto, senza questo file sono
                      cazzi per ripristinare il sito.
                    </p>

                    <div className="flex flex-wrap gap-4 items-center">
                      {/* Tasto 1: Scarica Vecchio (Backup) */}
                      <button
                        type="button"
                        onClick={handleDownloadOld}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm cursor-pointer transition-all shadow-sm ${
                          hasBackedUp
                            ? 'bg-green-100 text-green-700 border border-green-200'
                            : 'bg-orange-600 hover:bg-orange-700 text-white'
                        }`}
                      >
                        {hasBackedUp ? (
                          <CheckCircle size={18} />
                        ) : (
                          <FileDown size={18} />
                        )}
                        {hasBackedUp
                          ? 'Backup scaricato'
                          : 'SCARICA BACKUP (Obbligatorio)'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {/* --- FINE ZONA DI SICUREZZA --- */}

              {/* 1. Image Management Section */}
              <ImageSyncManager
                localImages={Object.values(sections || {})
                  .flat()
                  .filter(
                    (
                      m,
                    ): m is MemberData & {
                      localImage: string;
                      imageFilename: string;
                    } => Boolean(m.localImage && m.imageFilename),
                  )
                  .map((m) => ({
                    filename: m.imageFilename,
                    dataUrl: m.localImage,
                  }))}
                toDelete={previewData.images.toDelete}
                onUploadSuccess={() => setImagesUploadedPendingSave(true)}
              />

              {/* 2. HTML Diff Section */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                  <h2 className="text-lg font-bold text-gray-800">
                    Differenze HTML
                  </h2>
                  <span className="text-xs text-gray-500 font-mono bg-gray-200 px-2 py-1 rounded">
                    Sinistra: Drupal attuale | Destra: Nuova versione
                  </span>
                </div>
                <div className="p-0">
                  <DiffViewer
                    oldCode={previewData.oldHtml}
                    newCode={previewData.newHtml}
                  />
                </div>
              </div>

              {/* 3. Final Warning */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-yellow-800 text-sm flex gap-3 items-start mt-4">
                <AlertTriangle className="shrink-0 mt-0.5" />
                <div>
                  <strong>Attenzione:</strong> Il salvataggio finale non è
                  automatico.{' '}
                  <a
                    href="https://more.esn.it/?q=node/104/edit"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-yellow-700 font-bold underline hover:text-yellow-900 transition-colors"
                  >
                    Vai qui
                  </a>{' '}
                  per modificare l'HTML con quello nuovo!!!
                </div>
              </div>
            </div>
          ) : (
            <div className="text-gray-500">Caricamento anteprima...</div>
          )}
        </main>
      )}

      {/* Modal */}
      <PublishModal
        isOpen={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        hasBackedUp={hasBackedUp}
        onDownloadBackup={handleDownloadOld}
        newHtml={previewData?.newHtml || ''}
        onInvalidateCache={handleSilentCacheClear} // <-- AGGIUNGI QUI
      />

      {editModal && (
        <MemberModal
          member={modalMember ?? null}
          sectionKey={editModal.section}
          onSave={(updated) =>
            handleEditSave(editModal.section, modalIndex, updated)
          }
          onClose={() => setEditModal(null)}
          onDelete={() =>
            modalIndex !== null && handleDelete(editModal.section, modalIndex)
          }
        />
      )}

      {bulkModal && (
        <BulkImportModal
          sectionKey={bulkModal}
          onSave={(newMembers) => handleBulkSave(bulkModal, newMembers)}
          onClose={() => setBulkModal(null)}
        />
      )}
    </div>
  );
}
