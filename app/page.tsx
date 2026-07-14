"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

type FoodStatus = "todo" | "done";

type FoodItem = {
  id: string;
  name: string;
  category: string;
  reason: string;
  source: string;
  time: string;
  difficulty: string;
  status: FoodStatus;
  emoji: string;
  createdAt: number;
};

type FoodDraft = Omit<FoodItem, "id" | "createdAt" | "status">;

const STORAGE_KEY = "hao-chi-qing-dan-v1";

const SAMPLE_ITEMS: FoodItem[] = [
  {
    id: "sample-1",
    name: "番茄牛腩煲",
    category: "中餐",
    reason: "想做一锅浓郁又下饭的，周末慢慢炖。",
    source: "",
    time: "90 分钟",
    difficulty: "普通",
    status: "todo",
    emoji: "🍲",
    createdAt: 3,
  },
  {
    id: "sample-2",
    name: "巴斯克芝士蛋糕",
    category: "烘焙",
    reason: "焦香的表面和流心口感，想试试少糖版。",
    source: "",
    time: "50 分钟",
    difficulty: "简单",
    status: "todo",
    emoji: "🍰",
    createdAt: 2,
  },
  {
    id: "sample-3",
    name: "泰式打抛饭",
    category: "异国",
    reason: "罗勒、辣椒和鱼露的组合很适合工作日晚餐。",
    source: "",
    time: "25 分钟",
    difficulty: "简单",
    status: "done",
    emoji: "🍛",
    createdAt: 1,
  },
];

const CATEGORIES = ["全部", "中餐", "烘焙", "甜品", "异国", "小吃", "其他"];
const EMOJIS = ["🍲", "🍜", "🍚", "🥘", "🥟", "🍰", "🍪", "🥗", "🍝", "🍛", "🌮", "🍞"];

const EMPTY_DRAFT: FoodDraft = {
  name: "",
  category: "中餐",
  reason: "",
  source: "",
  time: "30 分钟",
  difficulty: "简单",
  emoji: "🍲",
};

function isFoodItem(value: unknown): value is FoodItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.category === "string" &&
    typeof item.reason === "string" &&
    typeof item.source === "string" &&
    typeof item.time === "string" &&
    typeof item.difficulty === "string" &&
    (item.status === "todo" || item.status === "done") &&
    typeof item.emoji === "string" &&
    typeof item.createdAt === "number"
  );
}

export default function Home() {
  const [items, setItems] = useState<FoodItem[]>(SAMPLE_ITEMS);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [status, setStatus] = useState<"all" | FoodStatus>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<FoodDraft>(EMPTY_DRAFT);
  const [randomPick, setRandomPick] = useState<FoodItem | null>(null);
  const [toast, setToast] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.every(isFoodItem)) setItems(parsed);
      }
    } catch {
      setToast("本地记录读取失败，已显示示例清单");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (loaded) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, loaded]);

  useEffect(() => {
    if (!dialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDialog();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("dialog-visible");
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("dialog-visible");
    };
  }, [dialogOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("zh-CN");
    return items
      .filter((item) => category === "全部" || item.category === category)
      .filter((item) => status === "all" || item.status === status)
      .filter((item) => {
        if (!keyword) return true;
        return `${item.name} ${item.reason} ${item.category}`.toLocaleLowerCase("zh-CN").includes(keyword);
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [items, category, status, query]);

  const todoCount = items.filter((item) => item.status === "todo").length;
  const doneCount = items.length - todoCount;

  function showToast(message: string) {
    setToast(message);
  }

  function openNewDialog() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setDialogOpen(true);
  }

  function openEditDialog(item: FoodItem) {
    setEditingId(item.id);
    setDraft({
      name: item.name,
      category: item.category,
      reason: item.reason,
      source: item.source,
      time: item.time,
      difficulty: item.difficulty,
      emoji: item.emoji,
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
  }

  function submitFood(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim()) return;

    if (editingId) {
      setItems((current) =>
        current.map((item) =>
          item.id === editingId ? { ...item, ...draft, name: draft.name.trim() } : item,
        ),
      );
      showToast("已经更新这道美食");
    } else {
      const next: FoodItem = {
        ...draft,
        id: window.crypto?.randomUUID?.() ?? `${Date.now()}`,
        name: draft.name.trim(),
        status: "todo",
        createdAt: Date.now(),
      };
      setItems((current) => [next, ...current]);
      showToast("已经加入想吃清单");
    }
    closeDialog();
  }

  function toggleStatus(id: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, status: item.status === "todo" ? "done" : "todo" } : item,
      ),
    );
  }

  function removeItem(item: FoodItem) {
    if (!window.confirm(`确定删除「${item.name}」吗？`)) return;
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    if (randomPick?.id === item.id) setRandomPick(null);
    showToast("已从清单删除");
  }

  function pickRandomFood() {
    const candidates = items.filter((item) => item.status === "todo");
    if (!candidates.length) {
      showToast("想做清单还是空的，先记下一道吧");
      return;
    }
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    setRandomPick(pick);
    window.setTimeout(() => document.getElementById("random-result")?.scrollIntoView({ behavior: "smooth" }), 20);
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `好吃清单-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("备份文件已导出");
  }

  async function importData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!Array.isArray(parsed) || !parsed.every(isFoodItem)) throw new Error("invalid");
      setItems(parsed);
      setRandomPick(null);
      showToast(`已导入 ${parsed.length} 条记录`);
    } catch {
      showToast("导入失败，请选择从本站导出的备份文件");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="好吃清单首页">
          <span className="brand-mark" aria-hidden="true">好</span>
          <span>好吃清单</span>
        </a>
        <nav className="nav-actions" aria-label="页面操作">
          <button className="nav-link" type="button" onClick={exportData}>导出备份</button>
          <button className="nav-link" type="button" onClick={() => importInputRef.current?.click()}>导入</button>
          <input
            ref={importInputRef}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={importData}
            aria-label="导入好吃清单备份"
          />
          <button className="button button-small" type="button" onClick={openNewDialog}>＋ 记一道</button>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">MY LITTLE FOOD NOTEBOOK</p>
          <h1>想吃的，<br /><em>都记下来。</em></h1>
          <p className="hero-description">收藏每一个突然冒出来的馋念。等到有空，就亲手把它变成一顿好饭。</p>
          <div className="hero-actions">
            <button className="button button-primary" type="button" onClick={openNewDialog}>记下想做的美食 <span aria-hidden="true">→</span></button>
            <button className="button button-quiet" type="button" onClick={pickRandomFood}>今天做什么？</button>
          </div>
        </div>

        <div className="hero-board" aria-label="清单统计">
          <div className="plate plate-main" aria-hidden="true"><span>🍳</span></div>
          <div className="plate plate-small plate-one" aria-hidden="true"><span>🥬</span></div>
          <div className="plate plate-small plate-two" aria-hidden="true"><span>🍅</span></div>
          <div className="stat-card stat-todo"><strong>{todoCount}</strong><span>道想做</span></div>
          <div className="stat-card stat-done"><strong>{doneCount}</strong><span>道做过</span></div>
          <span className="scribble scribble-one" aria-hidden="true">慢慢做，慢慢吃</span>
        </div>
      </section>

      {randomPick && (
        <section className="random-result" id="random-result" aria-live="polite">
          <div>
            <span className="random-label">今天就做这道</span>
            <h2>{randomPick.emoji} {randomPick.name}</h2>
            <p>{randomPick.reason || "跟着胃口出发，做一顿喜欢的。"}</p>
          </div>
          <div className="random-actions">
            <button className="button button-quiet" type="button" onClick={pickRandomFood}>再抽一次</button>
            <button className="button button-primary" type="button" onClick={() => toggleStatus(randomPick.id)}>做好了</button>
          </div>
        </section>
      )}

      <section className="collection" id="collection">
        <div className="section-heading">
          <div>
            <p className="eyebrow">THE WANT-TO-COOK LIST</p>
            <h2>我的美食清单</h2>
          </div>
          <p>共 {items.length} 道 · 还有 {todoCount} 道等着下厨</p>
        </div>

        <div className="toolbar">
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <span className="visually-hidden">搜索美食</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜一道想吃的……" />
          </label>
          <div className="status-tabs" role="group" aria-label="按完成状态筛选">
            {([
              ["all", "全部"],
              ["todo", "想做"],
              ["done", "做过"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={status === value ? "active" : ""}
                onClick={() => setStatus(value)}
                aria-pressed={status === value}
              >{label}</button>
            ))}
          </div>
        </div>

        <div className="category-row" aria-label="按分类筛选">
          {CATEGORIES.map((entry) => (
            <button
              key={entry}
              type="button"
              className={category === entry ? "active" : ""}
              onClick={() => setCategory(entry)}
              aria-pressed={category === entry}
            >{entry}</button>
          ))}
        </div>

        {filteredItems.length > 0 ? (
          <div className="food-grid">
            {filteredItems.map((item, index) => (
              <article className={`food-card ${item.status === "done" ? "is-done" : ""}`} key={item.id}>
                <div className={`food-visual visual-${index % 4}`}>
                  <span className="food-emoji" aria-hidden="true">{item.emoji}</span>
                  <span className="category-stamp">{item.category}</span>
                  {item.status === "done" && <span className="done-stamp">做过啦</span>}
                </div>
                <div className="food-content">
                  <div className="food-title-row">
                    <h3>{item.name}</h3>
                    <button className="icon-button" type="button" onClick={() => openEditDialog(item)} aria-label={`编辑${item.name}`}>✎</button>
                  </div>
                  <p>{item.reason || "先记下来，等下厨时再补充想法。"}</p>
                  <div className="food-meta">
                    <span>◷ {item.time}</span>
                    <span>难度 · {item.difficulty}</span>
                  </div>
                  <div className="card-actions">
                    <button className="status-button" type="button" onClick={() => toggleStatus(item.id)}>
                      <span aria-hidden="true">{item.status === "done" ? "↺" : "✓"}</span>
                      {item.status === "done" ? "放回想做" : "标记做过"}
                    </button>
                    {item.source && (
                      <a href={item.source} target="_blank" rel="noreferrer">看做法 ↗</a>
                    )}
                    <button className="delete-button" type="button" onClick={() => removeItem(item)}>删除</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span aria-hidden="true">🥣</span>
            <h3>这里还没有符合条件的美食</h3>
            <p>换个筛选条件，或者记下一道新的馋念。</p>
            <button className="button button-primary" type="button" onClick={openNewDialog}>记一道</button>
          </div>
        )}
      </section>

      <footer>
        <span>好吃清单</span>
        <p>认真吃饭，也认真期待下一顿。</p>
        <button type="button" onClick={exportData}>备份我的清单 →</button>
      </footer>

      {dialogOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeDialog()}>
          <section className="food-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            <button className="dialog-close" type="button" onClick={closeDialog} aria-label="关闭">×</button>
            <p className="eyebrow">ADD TO MY LIST</p>
            <h2 id="dialog-title">{editingId ? "编辑这道美食" : "记下一道想做的美食"}</h2>
            <form onSubmit={submitFood}>
              <label>
                美食名称 <strong>*</strong>
                <input autoFocus required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="比如：冬阴功汤" />
              </label>

              <fieldset>
                <legend>选一个小图标</legend>
                <div className="emoji-options">
                  {EMOJIS.map((emoji) => (
                    <button key={emoji} type="button" className={draft.emoji === emoji ? "active" : ""} onClick={() => setDraft({ ...draft, emoji })} aria-label={`选择${emoji}`} aria-pressed={draft.emoji === emoji}>{emoji}</button>
                  ))}
                </div>
              </fieldset>

              <div className="form-row">
                <label>
                  分类
                  <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
                    {CATEGORIES.slice(1).map((entry) => <option key={entry}>{entry}</option>)}
                  </select>
                </label>
                <label>
                  预计时间
                  <input value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} placeholder="30 分钟" />
                </label>
                <label>
                  难度
                  <select value={draft.difficulty} onChange={(event) => setDraft({ ...draft, difficulty: event.target.value })}>
                    <option>简单</option><option>普通</option><option>挑战</option>
                  </select>
                </label>
              </div>

              <label>
                为什么想做 / 备忘
                <textarea value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} placeholder="记下口味、食材或想尝试的原因……" rows={3} />
              </label>

              <label>
                菜谱链接（选填）
                <input type="url" value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })} placeholder="https://" />
              </label>

              <div className="dialog-actions">
                <button className="button button-quiet" type="button" onClick={closeDialog}>取消</button>
                <button className="button button-primary" type="submit">{editingId ? "保存修改" : "加入清单"}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
