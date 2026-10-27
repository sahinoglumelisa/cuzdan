import { monthLabel, shiftMonth } from '../format';

export default function MonthPicker({ ym, setYm }: { ym: string; setYm: (ym: string) => void }) {
  return (
    <div className="month-picker">
      <button aria-label="Önceki ay" onClick={() => setYm(shiftMonth(ym, -1))}>
        ‹
      </button>
      <h1>{monthLabel(ym)}</h1>
      <button aria-label="Sonraki ay" onClick={() => setYm(shiftMonth(ym, 1))}>
        ›
      </button>
    </div>
  );
}
