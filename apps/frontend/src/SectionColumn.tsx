import { Users } from 'lucide-react';
import { useState } from 'react';
import { SECTION_COLORS, SECTION_LABELS } from './constants';
import MemberCard from './MemberCard';
import type { MemberData, SectionType } from './types';

interface SectionColumnProps {
  sectionKey: SectionType;
  members: MemberData[];
  onEdit: (idx: number) => void;
  onAddNew: () => void;
  onBulkImport?: () => void;
  onDragStart: (memberIdx: number) => void;
  onDropOnCard: (targetIdx: number) => void;
  onDropOnSection: () => void;
  dragSource: { section: SectionType; index: number } | null;
}

const SectionColumn = ({
  sectionKey,
  members,
  onEdit,
  onAddNew,
  onBulkImport,
  onDragStart,
  onDropOnCard,
  onDropOnSection,
  dragSource,
}: SectionColumnProps) => {
  const color = SECTION_COLORS[sectionKey];
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [dragOverSection, setDragOverSection] = useState(false);

  return (
    <div
      className="bg-white rounded-xl p-4 shadow-sm min-h-50 break-inside-avoid mb-4 border-t-[3px]"
      style={{ borderTopColor: color }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOverSection(true);
      }}
      onDragLeave={() => setDragOverSection(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOverSection(false);
        onDropOnSection();
      }}
    >
      <div className="flex items-center justify-between mb-3.5">
        <div>
          <div className="font-bold text-[15px]" style={{ color }}>
            {SECTION_LABELS[sectionKey]}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {members.length} {members.length === 1 ? 'membro' : 'membri'}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {onBulkImport && (
            <button
              type="button"
              className="bg-none border-2 border-dashed rounded-md w-7 h-7 cursor-pointer flex items-center justify-center leading-none"
              style={{ color, borderColor: color }}
              onClick={onBulkImport}
              title="Import multiplo"
            >
              <Users size={14} />
            </button>
          )}
          <button
            type="button"
            className="bg-none border-2 border-dashed rounded-md w-7 h-7 cursor-pointer font-bold text-base flex items-center justify-center leading-none"
            style={{ color, borderColor: color }}
            onClick={onAddNew}
            title="Aggiungi membro"
          >
            ＋
          </button>
        </div>
      </div>

      <div
        className="flex flex-col gap-2 p-1 transition-outline duration-150 rounded-lg"
        style={{
          outline:
            dragOverSection && dragSource?.section !== sectionKey
              ? `2px dashed ${color}`
              : 'none',
        }}
      >
        {members.length === 0 ? (
          <div className="py-5 text-center text-gray-400 text-sm">
            Nessun membro.
            <br />
            Trascina qui o aggiungi.
          </div>
        ) : (
          // --- CHANGED ---
          // Removed <Masonry> and used standard map
          members.map((member, index) => (
            <MemberCard
              key={`${member.name}-${index}`} // Add a key
              member={member}
              sectionKey={sectionKey}
              index={index}
              onEdit={() => onEdit(index)}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                onDragStart(index);
              }}
              onDragOver={() => setDragOverIdx(index)}
              onDragLeave={() => setDragOverIdx(null)}
              onDragEnd={() => setTimeout(() => setDragOverIdx(null), 0)}
              onDrop={(e) => {
                e.preventDefault();
                setTimeout(() => setDragOverIdx(null), 0);
                onDropOnCard(index);
              }}
              isDragOver={dragOverIdx === index}
            />
          ))
          // ---------------
        )}
      </div>
    </div>
  );
};

export default SectionColumn;
