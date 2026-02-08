"use client";

import React, { useEffect, useMemo, useState } from "react";

type Tier = "gold" | "silver" | "bronze";

type Task = {
  title: string;
  tier: Tier;
  points: number;
};

type RecordItem = {
  id: string;
  title: string;
  tier: Tier;
  points: number;
  minutes: number;
  note: string;
  occurredAt: string;
};

const STORAGE_KEY = "focuslog_records_v2";

const TASKS: Task[] = [
  { title: "發布一篇貼文", tier: "gold", points: 1000 },
  { title: "認真練琴", tier: "silver", points: 500 },
  { title: "看書", tier: "silver", points: 500 },
  { title: "做專案", tier: "silver", points: 500 },
  { title: "紀錄熱量", tier: "bronze", points: 100 },
  { title: "看書", tier: "bronze", points: 100 },
  { title: "threads發文", tier: "bronze", points: 100 },
  { title: "早上擦防曬", tier: "bronze", points: 100 },
  { title: "打開這個 app", tier: "bronze", points: 100 },
];

function tierClass(tier: Tier) {
  if (tier === "gold") return "task-gold";
  if (tier === "silver") return "task-silver";
  return "task-bronze";
}

function tierMedal(tier: Tier) {
  if (tier === "gold") return "🏆";
  if (tier === "silver") return "🥈";
  return "🥉";
}

function nowLocalDatetimeValue() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function toIso(localDatetime: string) {
  return new Date(localDatetime).toISOString();
}

function coinPos(index: number) {
  const slots = [
    { left: 45, top: 40 },
    { left: 105, top: 25 },
    { left: 75, top: 82 },
    { left: 140, top: 72 },
    { left: 20, top: 88 },
    { left: 170, top: 95 },
  ];
  return slots[index % slots.length];
}

export default function Page() {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [title, setTitle] = useState("");
  const [occurredAtLocal, setOccurredAtLocal] = useState(nowLocalDatetimeValue);
  const [minutes, setMinutes] = useState(10);
  const [note, setNote] = useState("隨意寫寫");
  const [tier, setTier] = useState<Tier>("bronze");
  const [points, setPoints] = useState(100);
  const [justSavedId, setJustSavedId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as RecordItem[];
      if (Array.isArray(parsed)) setRecords(parsed);
    } catch {
      // ignore parse failure
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch {
      // ignore
    }
  }, [records]);

  const totalPoints = useMemo(
    () => records.reduce((sum, item) => sum + item.points, 0),
    [records]
  );

  function pickTask(task: Task) {
    setTitle(task.title);
    setTier(task.tier);
    setPoints(task.points);
  }

  function onTitleChange(next: string) {
    setTitle(next);
    const exactTask = TASKS.find((task) => task.title === next.trim());
    if (exactTask) {
      setTier(exactTask.tier);
      setPoints(exactTask.points);
      return;
    }

    setTier("bronze");
    setPoints(100);
  }

  function saveRecord() {
    const trimmed = title.trim();
    if (!trimmed) return;

    const item: RecordItem = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      title: trimmed,
      tier,
      points,
      minutes: Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0,
      note,
      occurredAt: toIso(occurredAtLocal),
    };

    setRecords((prev) => [item, ...prev]);
    setJustSavedId(item.id);
    window.setTimeout(() => setJustSavedId(null), 900);
  }

  return (
    <main className="ui-shell">
      <div className="ui-frame">
        <section className="reward-wall">
          <h1 className="reward-title">獎金牆</h1>
          <div className="task-grid">
            {TASKS.map((task) => (
              <button
                key={`${task.tier}-${task.title}-${task.points}`}
                type="button"
                className={`task-chip ${tierClass(task.tier)}`}
                onClick={() => pickTask(task)}
              >
                <span>{tierMedal(task.tier)}</span>
                <span>{task.title}</span>
                <span>{task.points}點</span>
              </button>
            ))}
          </div>
        </section>

        <div className="custom-hint">自行輸入預設為 銅幣100點</div>

        <section className="entry-form">
          <FieldRow
            label="項目"
            type="text"
            value={title}
            onChange={onTitleChange}
            placeholder="剛剛我完成了"
          />
          <FieldRow
            label="時間"
            type="datetime-local"
            value={occurredAtLocal}
            onChange={setOccurredAtLocal}
          />
          <FieldRow
            label="時數"
            type="number"
            value={String(minutes)}
            onChange={(v) => setMinutes(parseInt(v || "0", 10))}
          />
          <FieldRow label="備註" type="text" value={note} onChange={setNote} />

          <div className="save-row">
            <button
              type="button"
              className="save-btn"
              onClick={saveRecord}
              disabled={!title.trim()}
            >
              儲存
            </button>
          </div>
        </section>

        <section className="coin-scene">
          <div className="pig-mark">🐷</div>

          <div className="coin-bowl">
            <svg viewBox="0 0 280 150" className="bowl-svg" aria-hidden>
              <ellipse
                cx="140"
                cy="28"
                rx="118"
                ry="24"
                fill="#ecf2f8"
                stroke="#95abc4"
                strokeWidth="4"
              />
              <path
                d="M22 28 C30 105, 38 136, 140 136 C242 136, 250 105, 258 28"
                fill="#f3f7fb"
                stroke="#95abc4"
                strokeWidth="4"
              />
              <ellipse
                cx="140"
                cy="28"
                rx="98"
                ry="14"
                fill="none"
                stroke="#d9e4ef"
                strokeWidth="3"
              />
              <ellipse
                cx="140"
                cy="106"
                rx="46"
                ry="14"
                fill="#cad8ea"
                opacity="0.85"
              />
            </svg>

            <div className="coins-layer">
              {records.slice(0, 18).map((record, index) => {
                const pos = coinPos(index);
                const isNew = record.id === justSavedId;
                return (
                  <span
                    key={record.id}
                    className={`coin-dot ${isNew ? "coin-fall" : ""}`}
                    style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
                  >
                    🪙
                  </span>
                );
              })}
            </div>
          </div>

          <p className="total-points">累積 {totalPoints} 點</p>
        </section>
      </div>
    </main>
  );
}

function FieldRow({
  label,
  type,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type: "text" | "datetime-local" | "number";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="field-row">
      <span className="field-label">{label}</span>
      <span className="field-wrap">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="field-input"
          placeholder={placeholder}
        />
        <span className="field-icon" aria-hidden>
          ✎
        </span>
      </span>
    </label>
  );
}
