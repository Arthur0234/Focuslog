"use client";

import React, { useEffect, useMemo, useState } from "react";

type Tier = "gold" | "silver" | "bronze";

type TaskSlot = {
  id: string;
  tier: Tier;
  points: number;
  defaultTitle: string;
};

type TaskConfig = {
  id: string;
  tier: Tier;
  points: number;
  title: string;
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

const RECORDS_STORAGE_KEY = "focuslog_records_v2";
const TASKS_STORAGE_KEY = "focuslog_task_config_v1";
const GOLD_WEEK_STORAGE_KEY = "focuslog_gold_edit_week_v1";

const TASK_SLOTS: TaskSlot[] = [
  { id: "gold-1", tier: "gold", points: 1000, defaultTitle: "發布一篇貼文" },
  { id: "silver-1", tier: "silver", points: 500, defaultTitle: "認真練琴" },
  { id: "silver-2", tier: "silver", points: 500, defaultTitle: "做專案" },
  { id: "silver-3", tier: "silver", points: 500, defaultTitle: "看書" },
  { id: "bronze-1", tier: "bronze", points: 100, defaultTitle: "紀錄熱量" },
  { id: "bronze-2", tier: "bronze", points: 100, defaultTitle: "打開這個 app" },
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

function tierLabel(tier: Tier) {
  if (tier === "gold") return "金牌";
  if (tier === "silver") return "銀牌";
  return "銅牌";
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

function weekKey(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
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

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function buildDefaultTasks() {
  return TASK_SLOTS.map((slot) => ({
    id: slot.id,
    tier: slot.tier,
    points: slot.points,
    title: slot.defaultTitle,
  }));
}

function parseStoredTasks(raw: string | null): TaskConfig[] {
  const defaults = buildDefaultTasks();
  if (!raw) return defaults;

  try {
    const parsed = JSON.parse(raw) as Array<Partial<TaskConfig>>;
    if (!Array.isArray(parsed)) return defaults;

    return defaults.map((slot) => {
      const found = parsed.find((item) => item?.id === slot.id);
      const validTitle = typeof found?.title === "string" ? found.title.trim() : "";
      return {
        ...slot,
        title: validTitle || slot.title,
      };
    });
  } catch {
    return defaults;
  }
}

function readRecordsFromStorage(): RecordItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECORDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecordItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function Page() {
  const [records, setRecords] = useState<RecordItem[]>(readRecordsFromStorage);
  const [tasks, setTasks] = useState<TaskConfig[]>(() => {
    if (typeof window === "undefined") return buildDefaultTasks();
    return parseStoredTasks(localStorage.getItem(TASKS_STORAGE_KEY));
  });
  const [goldLastEditedWeek, setGoldLastEditedWeek] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(GOLD_WEEK_STORAGE_KEY) ?? "";
  });

  const [title, setTitle] = useState("");
  const [occurredAtLocal, setOccurredAtLocal] = useState(nowLocalDatetimeValue);
  const [minutes, setMinutes] = useState(10);
  const [note, setNote] = useState("隨意寫寫");
  const [tier, setTier] = useState<Tier>("bronze");
  const [points, setPoints] = useState(100);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const [isTaskEditorOpen, setIsTaskEditorOpen] = useState(false);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, string>>({});
  const [taskEditorMessage, setTaskEditorMessage] = useState("");

  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editingRecordTitle, setEditingRecordTitle] = useState("");

  const [justSavedId, setJustSavedId] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(records));
    } catch {
      // ignore
    }
  }, [records]);

  useEffect(() => {
    try {
      localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      // ignore
    }
  }, [tasks]);

  useEffect(() => {
    try {
      localStorage.setItem(GOLD_WEEK_STORAGE_KEY, goldLastEditedWeek);
    } catch {
      // ignore
    }
  }, [goldLastEditedWeek]);

  const totalPoints = useMemo(
    () => records.reduce((sum, item) => sum + item.points, 0),
    [records]
  );

  const currentWeek = weekKey(new Date());
  const isGoldLocked = goldLastEditedWeek === currentWeek;

  const tasksByTier = useMemo(() => {
    return {
      gold: tasks.filter((task) => task.tier === "gold"),
      silver: tasks.filter((task) => task.tier === "silver"),
      bronze: tasks.filter((task) => task.tier === "bronze"),
    };
  }, [tasks]);

  function pickTask(task: TaskConfig) {
    setTitle(task.title);
    setTier(task.tier);
    setPoints(task.points);
    setSelectedTaskId(task.id);
  }

  function onTitleChange(next: string) {
    setTitle(next);
    const exactTask = tasks.find((task) => task.title === next.trim());
    if (exactTask) {
      setTier(exactTask.tier);
      setPoints(exactTask.points);
      setSelectedTaskId(exactTask.id);
      return;
    }

    setTier("bronze");
    setPoints(100);
    setSelectedTaskId(null);
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

  function openTaskEditor() {
    const drafts = Object.fromEntries(tasks.map((task) => [task.id, task.title]));
    setTaskDrafts(drafts);
    setTaskEditorMessage("");
    setIsTaskEditorOpen((prev) => !prev);
  }

  function saveTask(task: TaskConfig) {
    const nextTitle = (taskDrafts[task.id] ?? "").trim();
    if (!nextTitle) {
      setTaskEditorMessage("任務名稱不能是空白");
      return;
    }

    if (task.tier === "gold" && nextTitle !== task.title && isGoldLocked) {
      setTaskEditorMessage(`金牌任務本週已修改，請下週再改（${goldLastEditedWeek}）`);
      return;
    }

    if (nextTitle === task.title) {
      setTaskEditorMessage("任務沒有變更");
      return;
    }

    setTasks((prev) =>
      prev.map((item) => (item.id === task.id ? { ...item, title: nextTitle } : item))
    );

    if (task.tier === "gold") {
      setGoldLastEditedWeek(currentWeek);
    }

    if (selectedTaskId === task.id || title.trim() === task.title) {
      setTitle(nextTitle);
      setTier(task.tier);
      setPoints(task.points);
      setSelectedTaskId(task.id);
    }

    setTaskEditorMessage(`${tierLabel(task.tier)}任務已更新`);
  }

  function startEditRecord(item: RecordItem) {
    setEditingRecordId(item.id);
    setEditingRecordTitle(item.title);
  }

  function cancelEditRecord() {
    setEditingRecordId(null);
    setEditingRecordTitle("");
  }

  function saveEditedRecord(recordId: string) {
    const trimmed = editingRecordTitle.trim();
    if (!trimmed) return;

    setRecords((prev) =>
      prev.map((item) =>
        item.id === recordId
          ? {
              ...item,
              title: trimmed,
            }
          : item
      )
    );
    cancelEditRecord();
  }

  function deleteRecord(recordId: string) {
    const ok = window.confirm("確定刪除這筆紀錄？");
    if (!ok) return;

    setRecords((prev) => prev.filter((item) => item.id !== recordId));
    if (editingRecordId === recordId) cancelEditRecord();
  }

  return (
    <main className="ui-shell">
      <div className="ui-frame">
        <section className="reward-wall">
          <h1 className="reward-title">獎金牆</h1>
          <div className="task-grid">
            {tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                className={`task-chip ${tierClass(task.tier)} ${
                  selectedTaskId === task.id ? "task-chip-active" : ""
                }`}
                onClick={() => pickTask(task)}
              >
                <span>{tierMedal(task.tier)}</span>
                <span>{task.title}</span>
                <span>{task.points}點</span>
              </button>
            ))}
          </div>
        </section>

        <section className="task-editor-block">
          <div className="task-editor-head">
            <button type="button" className="task-editor-toggle" onClick={openTaskEditor}>
              {isTaskEditorOpen ? "收起任務編輯" : "編輯每日任務"}
            </button>
            <span className="task-editor-rule">限制：金牌1個(每週改1次)｜銀牌3個｜銅牌2個</span>
          </div>

          {isTaskEditorOpen ? (
            <div className="task-editor-panel">
              {(["gold", "silver", "bronze"] as Tier[]).map((tierKey) => (
                <div key={tierKey} className="task-editor-tier">
                  <div className="task-editor-tier-title">{tierLabel(tierKey)}任務</div>
                  {tasksByTier[tierKey].map((task) => (
                    <div key={task.id} className="task-editor-row">
                      <input
                        value={taskDrafts[task.id] ?? task.title}
                        onChange={(e) =>
                          setTaskDrafts((prev) => ({
                            ...prev,
                            [task.id]: e.target.value,
                          }))
                        }
                        className="task-editor-input"
                        disabled={task.tier === "gold" && isGoldLocked}
                      />
                      <button
                        type="button"
                        className="task-editor-save"
                        onClick={() => saveTask(task)}
                        disabled={task.tier === "gold" && isGoldLocked}
                      >
                        儲存
                      </button>
                    </div>
                  ))}
                </div>
              ))}
              <div className="task-editor-msg">{taskEditorMessage || "修改後會立即套用到獎金牆"}</div>
            </div>
          ) : null}
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
            showIcon={false}
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
                    {tierMedal(record.tier)}
                  </span>
                );
              })}
            </div>
          </div>

          <p className="total-points">累積 {totalPoints} 點</p>
        </section>

        <section className="jar-list-block">
          <h2 className="jar-list-title">Jar 已完成任務</h2>

          {records.length === 0 ? (
            <p className="jar-list-empty">目前還沒有紀錄</p>
          ) : (
            <div className="jar-list">
              {records.map((item) => (
                <div key={item.id} className="jar-item">
                  <div className="jar-item-main">
                    <span className={`jar-tier ${tierClass(item.tier)}`}>{tierMedal(item.tier)}</span>
                    {editingRecordId === item.id ? (
                      <input
                        value={editingRecordTitle}
                        onChange={(e) => setEditingRecordTitle(e.target.value)}
                        className="jar-edit-input"
                      />
                    ) : (
                      <div className="jar-title-wrap">
                        <div className="jar-item-title">{item.title}</div>
                        <div className="jar-item-meta">
                          {formatDateTime(item.occurredAt)} · {item.minutes} 分鐘 · {item.points} 點
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="jar-item-actions">
                    {editingRecordId === item.id ? (
                      <>
                        <button type="button" className="mini-btn" onClick={() => saveEditedRecord(item.id)}>
                          儲存
                        </button>
                        <button type="button" className="mini-btn" onClick={cancelEditRecord}>
                          取消
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="mini-btn" onClick={() => startEditRecord(item)}>
                          編輯
                        </button>
                        <button type="button" className="mini-btn mini-btn-danger" onClick={() => deleteRecord(item.id)}>
                          刪除
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
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
  showIcon = true,
}: {
  label: string;
  type: "text" | "datetime-local" | "number";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  showIcon?: boolean;
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
        {showIcon ? (
          <span className="field-icon" aria-hidden>
            ✎
          </span>
        ) : null}
      </span>
    </label>
  );
}
