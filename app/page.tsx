"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

type ItemStatus = "todo" | "done";
type ViewMode = "cook" | "eatOut";

type FoodItem = {
  id: string;
  name: string;
  category: string;
  reason: string;
  source: string;
  status: ItemStatus;
  emoji: string;
  createdAt: number;
};

type RestaurantItem = {
  id: string;
  name: string;
  category: string;
  address: string;
  reason: string;
  source: string;
  status: ItemStatus;
  emoji: string;
  createdAt: number;
};

type FoodDraft = Omit<FoodItem, "id" | "createdAt" | "status">;
type RestaurantDraft = Omit<RestaurantItem, "id" | "createdAt" | "status">;

const COOK_STORAGE_KEY = "hao-chi-qing-dan-v1";
const RESTAURANT_STORAGE_KEY = "hao-chi-qing-dan-restaurants-v1";

const SAMPLE_ITEMS: FoodItem[] = [
  {
    id: "sample-1",
    name: "番茄牛腩煲",
    category: "中餐",
    reason: "想做一锅浓郁又下饭的，周末慢慢炖。",
    source: "",
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
    status: "done",
    emoji: "🍛",
    createdAt: 1,
  },
];

const SAMPLE_RESTAURANTS: RestaurantItem[] = [
  {
    id: "restaurant-sample-1",
    name: "巷口炭火烧鸟",
    category: "日料",
    address: "静安区 · 南京西路附近",
    reason: "看到朋友推荐，想去试试鸡皮和提灯。",
    source: "",
    status: "todo",
    emoji: "🍢",
    createdAt: 2,
  },
  {
    id: "restaurant-sample-2",
    name: "山茶小馆",
    category: "中餐",
    address: "徐汇区 · 衡山路",
    reason: "想找一个周末和朋友慢慢吃饭的地方。",
    source: "",
    status: "todo",
    emoji: "🥢",
    createdAt: 1,
  },
];

const COOK_CATEGORIES = ["全部", "中餐", "烘焙", "甜品", "异国", "小吃", "其他"];
const RESTAURANT_CATEGORIES = ["全部", "中餐", "火锅", "烧烤", "日料", "西餐", "咖啡甜品", "其他"];
const FOOD_EMOJIS = ["🍲", "🍜", "🍚", "🥘", "🥟", "🍰", "🍪", "🥗", "🍝", "🍛", "🌮", "🍞"];
const RESTAURANT_EMOJIS = ["🥢", "🍽️", "🍲", "🍢", "🍣", "🍔", "🍕", "🥩", "☕", "🧁", "🌶️", "🏮"];

const EMPTY_FOOD_DRAFT: FoodDraft = {
  name: "",
  category: "中餐",
  reason: "",
  source: "",
  emoji: "🍲",
};

const EMPTY_RESTAURANT_DRAFT: RestaurantDraft = {
  name: "",
  category: "中餐",
  address: "",
  reason: "",
  source: "",
  emoji: "🥢",
};

function isBaseItem(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.category === "string" &&
    typeof item.reason === "string" &&
    typeof item.source === "string" &&
    (item.status === "todo" || item.status === "done") &&
    typeof item.emoji === "string" &&
    typeof item.createdAt === "number"
  );
}

function isFoodItem(value: unknown): value is FoodItem {
  return isBaseItem(value);
}

function isRestaurantItem(value: unknown): value is RestaurantItem {
  return isBaseItem(value) && typeof value.address === "string";
}

function normalizeFood(item: FoodItem): FoodItem {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    reason: item.reason,
    source: item.source,
    status: item.status,
    emoji: item.emoji,
    createdAt: item.createdAt,
  };
}

export default function Home() {
  const [mode, setMode] = useState<ViewMode>("cook");
  const [items, setItems] = useState<FoodItem[]>(SAMPLE_ITEMS);
  const [restaurants, setRestaurants] = useState<RestaurantItem[]>(SAMPLE_RESTAURANTS);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [status, setStatus] = useState<"all" | ItemStatus>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [foodDraft, setFoodDraft] = useState<FoodDraft>(EMPTY_FOOD_DRAFT);
  const [restaurantDraft, setRestaurantDraft] = useState<RestaurantDraft>(EMPTY_RESTAURANT_DRAFT);
  const [randomPick, setRandomPick] = useState<{ mode: ViewMode; item: FoodItem | RestaurantItem } | null>(null);
  const [toast, setToast] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const savedItems = window.localStorage.getItem(COOK_STORAGE_KEY);
      if (savedItems) {
        const parsedItems: unknown = JSON.parse(savedItems);
        if (Array.isArray(parsedItems) && parsedItems.every(isFoodItem)) {
          setItems(parsedItems.map(normalizeFood));
        }
      }

      const savedRestaurants = window.localStorage.getItem(RESTAURANT_STORAGE_KEY);
      if (savedRestaurants) {
        const parsedRestaurants: unknown = JSON.parse(savedRestaurants);
        if (Array.isArray(parsedRestaurants) && parsedRestaurants.every(isRestaurantItem)) {
          setRestaurants(parsedRestaurants);
        }
      }
    } catch {
      setToast("本地记录读取失败，已显示示例清单");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(COOK_STORAGE_KEY, JSON.stringify(items));
    window.localStorage.setItem(RESTAURANT_STORAGE_KEY, JSON.stringify(restaurants));
  }, [items, restaurants, loaded]);

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
      .filter((item) => !keyword || `${item.name} ${item.reason} ${item.category}`.toLocaleLowerCase("zh-CN").includes(keyword))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [items, category, status, query]);

  const filteredRestaurants = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("zh-CN");
    return restaurants
      .filter((item) => category === "全部" || item.category === category)
      .filter((item) => status === "all" || item.status === status)
      .filter((item) => !keyword || `${item.name} ${item.reason} ${item.category} ${item.address}`.toLocaleLowerCase("zh-CN").includes(keyword))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [restaurants, category, status, query]);

  const currentItems = mode === "cook" ? items : restaurants;
  const todoCount = currentItems.filter((item) => item.status === "todo").length;
  const doneCount = currentItems.length - todoCount;
  const activeCategories = mode === "cook" ? COOK_CATEGORIES : RESTAURANT_CATEGORIES;

  function showToast(message: string) {
    setToast(message);
  }

  function switchMode(nextMode: ViewMode) {
    setMode(nextMode);
    setQuery("");
    setCategory("全部");
    setStatus("all");
    setRandomPick(null);
    closeDialog();
  }

  function openNewDialog() {
    setEditingId(null);
    setFoodDraft(EMPTY_FOOD_DRAFT);
    setRestaurantDraft(EMPTY_RESTAURANT_DRAFT);
    setDialogOpen(true);
  }

  function openFoodDialog(item: FoodItem) {
    setEditingId(item.id);
    setFoodDraft({
      name: item.name,
      category: item.category,
      reason: item.reason,
      source: item.source,
      emoji: item.emoji,
    });
    setDialogOpen(true);
  }

  function openRestaurantDialog(item: RestaurantItem) {
    setEditingId(item.id);
    setRestaurantDraft({
      name: item.name,
      category: item.category,
      address: item.address,
      reason: item.reason,
      source: item.source,
      emoji: item.emoji,
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
  }

  function submitCurrent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mode === "cook") {
      if (!foodDraft.name.trim()) return;
      if (editingId) {
        setItems((current) => current.map((item) => item.id === editingId ? { ...item, ...foodDraft, name: foodDraft.name.trim() } : item));
        showToast("已经更新这道美食");
      } else {
        const next: FoodItem = {
          ...foodDraft,
          id: window.crypto?.randomUUID?.() ?? `${Date.now()}`,
          name: foodDraft.name.trim(),
          status: "todo",
          createdAt: Date.now(),
        };
        setItems((current) => [next, ...current]);
        showToast("已经加入自己做清单");
      }
    } else {
      if (!restaurantDraft.name.trim()) return;
      if (editingId) {
        setRestaurants((current) => current.map((item) => item.id === editingId ? { ...item, ...restaurantDraft, name: restaurantDraft.name.trim() } : item));
        showToast("已经更新这家饭店");
      } else {
        const next: RestaurantItem = {
          ...restaurantDraft,
          id: window.crypto?.randomUUID?.() ?? `${Date.now()}`,
          name: restaurantDraft.name.trim(),
          status: "todo",
          createdAt: Date.now(),
        };
        setRestaurants((current) => [next, ...current]);
        showToast("已经加入出去吃清单");
      }
    }
    closeDialog();
  }

  function toggleFoodStatus(id: string) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, status: item.status === "todo" ? "done" : "todo" } : item));
  }

  function toggleRestaurantStatus(id: string) {
    setRestaurants((current) => current.map((item) => item.id === id ? { ...item, status: item.status === "todo" ? "done" : "todo" } : item));
  }

  function removeFood(item: FoodItem) {
    if (!window.confirm(`确定删除「${item.name}」吗？`)) return;
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    if (randomPick?.item.id === item.id) setRandomPick(null);
    showToast("已从自己做清单删除");
  }

  function removeRestaurant(item: RestaurantItem) {
    if (!window.confirm(`确定删除「${item.name}」吗？`)) return;
    setRestaurants((current) => current.filter((entry) => entry.id !== item.id));
    if (randomPick?.item.id === item.id) setRandomPick(null);
    showToast("已从出去吃清单删除");
  }

  function pickRandom() {
    const candidates = currentItems.filter((item) => item.status === "todo");
    if (!candidates.length) {
      showToast(mode === "cook" ? "想做清单还是空的，先记下一道吧" : "想去清单还是空的，先记一家吧");
      return;
    }
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    setRandomPick({ mode, item: pick });
    window.setTimeout(() => document.getElementById("random-result")?.scrollIntoView({ behavior: "smooth" }), 20);
  }

  function completeRandomPick() {
    if (!randomPick) return;
    if (randomPick.mode === "cook") toggleFoodStatus(randomPick.item.id);
    else toggleRestaurantStatus(randomPick.item.id);
    setRandomPick(null);
  }

  function exportData() {
    const backup = { version: 2, cook: items, eatOut: restaurants };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `好吃清单-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("两份清单都已导出");
  }

  async function importData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (Array.isArray(parsed) && parsed.every(isFoodItem)) {
        setItems(parsed.map(normalizeFood));
        showToast(`已导入 ${parsed.length} 条美食记录`);
      } else if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { cook?: unknown }).cook) &&
        Array.isArray((parsed as { eatOut?: unknown }).eatOut) &&
        (parsed as { cook: unknown[] }).cook.every(isFoodItem) &&
        (parsed as { eatOut: unknown[] }).eatOut.every(isRestaurantItem)
      ) {
        const backup = parsed as { cook: FoodItem[]; eatOut: RestaurantItem[] };
        setItems(backup.cook.map(normalizeFood));
        setRestaurants(backup.eatOut);
        showToast(`已导入 ${backup.cook.length + backup.eatOut.length} 条记录`);
      } else {
        throw new Error("invalid");
      }
      setRandomPick(null);
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
          <input ref={importInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={importData} aria-label="导入好吃清单备份" />
          <button className="button button-small" type="button" onClick={openNewDialog}>＋ {mode === "cook" ? "记一道" : "记一家"}</button>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="mode-switch" role="tablist" aria-label="切换清单模块">
            <button type="button" role="tab" aria-selected={mode === "cook"} className={mode === "cook" ? "active" : ""} onClick={() => switchMode("cook")}><span aria-hidden="true">🍳</span>自己做</button>
            <button type="button" role="tab" aria-selected={mode === "eatOut"} className={mode === "eatOut" ? "active" : ""} onClick={() => switchMode("eatOut")}><span aria-hidden="true">🍽️</span>出去吃</button>
          </div>
          <p className="eyebrow">{mode === "cook" ? "MY LITTLE FOOD NOTEBOOK" : "MY EAT-OUT WISH LIST"}</p>
          <h1>{mode === "cook" ? <>想吃的，<br /><em>都记下来。</em></> : <>想去的店，<br /><em>都别错过。</em></>}</h1>
          <p className="hero-description">{mode === "cook" ? "收藏每一个突然冒出来的馋念。等到有空，就亲手把它变成一顿好饭。" : "记下每一家想去的饭店。等到下次约饭，不再对着地图临时发愁。"}</p>
          <div className="hero-actions">
            <button className="button button-primary" type="button" onClick={openNewDialog}>{mode === "cook" ? "记下想做的美食" : "记下想去的饭店"} <span aria-hidden="true">→</span></button>
            <button className="button button-quiet" type="button" onClick={pickRandom}>{mode === "cook" ? "今天做什么？" : "今天吃哪家？"}</button>
          </div>
        </div>

        <div className={`hero-board ${mode === "eatOut" ? "restaurant-board" : ""}`} aria-label="清单统计">
          <div className="plate plate-main" aria-hidden="true"><span>{mode === "cook" ? "🍳" : "🍽️"}</span></div>
          <div className="plate plate-small plate-one" aria-hidden="true"><span>{mode === "cook" ? "🥬" : "📍"}</span></div>
          <div className="plate plate-small plate-two" aria-hidden="true"><span>{mode === "cook" ? "🍅" : "🥢"}</span></div>
          <div className="stat-card stat-todo"><strong>{todoCount}</strong><span>{mode === "cook" ? "道想做" : "家想去"}</span></div>
          <div className="stat-card stat-done"><strong>{doneCount}</strong><span>{mode === "cook" ? "道做过" : "家去过"}</span></div>
          <span className="scribble scribble-one" aria-hidden="true">{mode === "cook" ? "慢慢做，慢慢吃" : "把这座城吃个遍"}</span>
        </div>
      </section>

      {randomPick?.mode === mode && (
        <section className="random-result" id="random-result" aria-live="polite">
          <div>
            <span className="random-label">{mode === "cook" ? "今天就做这道" : "今天就去这家"}</span>
            <h2>{randomPick.item.emoji} {randomPick.item.name}</h2>
            <p>{randomPick.item.reason || (mode === "cook" ? "跟着胃口出发，做一顿喜欢的。" : "跟着胃口出发，去吃一顿喜欢的。")}</p>
          </div>
          <div className="random-actions">
            <button className="button button-quiet" type="button" onClick={pickRandom}>再抽一次</button>
            <button className="button button-primary" type="button" onClick={completeRandomPick}>{mode === "cook" ? "做好了" : "去过了"}</button>
          </div>
        </section>
      )}

      <section className="collection" id="collection">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{mode === "cook" ? "THE WANT-TO-COOK LIST" : "THE WANT-TO-VISIT LIST"}</p>
            <h2>{mode === "cook" ? "想自己做" : "想出去吃"}</h2>
          </div>
          <p>共 {currentItems.length} {mode === "cook" ? "道" : "家"} · 还有 {todoCount} {mode === "cook" ? "道等着下厨" : "家等着去吃"}</p>
        </div>

        <div className="toolbar">
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <span className="visually-hidden">{mode === "cook" ? "搜索美食" : "搜索饭店"}</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={mode === "cook" ? "搜一道想吃的……" : "搜一家想去的……"} />
          </label>
          <div className="status-tabs" role="group" aria-label="按完成状态筛选">
            {([
              ["all", "全部"],
              ["todo", mode === "cook" ? "想做" : "想去"],
              ["done", mode === "cook" ? "做过" : "去过"],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" className={status === value ? "active" : ""} onClick={() => setStatus(value)} aria-pressed={status === value}>{label}</button>
            ))}
          </div>
        </div>

        <div className="category-row" aria-label="按分类筛选">
          {activeCategories.map((entry) => (
            <button key={entry} type="button" className={category === entry ? "active" : ""} onClick={() => setCategory(entry)} aria-pressed={category === entry}>{entry}</button>
          ))}
        </div>

        {mode === "cook" && filteredItems.length > 0 && (
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
                    <button className="icon-button" type="button" onClick={() => openFoodDialog(item)} aria-label={`编辑${item.name}`}>✎</button>
                  </div>
                  <p>{item.reason || "先记下来，等下厨时再补充想法。"}</p>
                  <div className="card-actions">
                    <button className="status-button" type="button" onClick={() => toggleFoodStatus(item.id)}><span aria-hidden="true">{item.status === "done" ? "↺" : "✓"}</span>{item.status === "done" ? "放回想做" : "标记做过"}</button>
                    {item.source && <a href={item.source} target="_blank" rel="noreferrer">看做法 ↗</a>}
                    <button className="delete-button" type="button" onClick={() => removeFood(item)}>删除</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {mode === "eatOut" && filteredRestaurants.length > 0 && (
          <div className="food-grid">
            {filteredRestaurants.map((item, index) => (
              <article className={`food-card restaurant-card ${item.status === "done" ? "is-done" : ""}`} key={item.id}>
                <div className={`food-visual restaurant-visual visual-${(index + 1) % 4}`}>
                  <span className="food-emoji" aria-hidden="true">{item.emoji}</span>
                  <span className="category-stamp">{item.category}</span>
                  {item.status === "done" && <span className="done-stamp">去过啦</span>}
                </div>
                <div className="food-content">
                  <div className="food-title-row">
                    <h3>{item.name}</h3>
                    <button className="icon-button" type="button" onClick={() => openRestaurantDialog(item)} aria-label={`编辑${item.name}`}>✎</button>
                  </div>
                  <div className="address-line"><span aria-hidden="true">⌖</span>{item.address || "地点待补充"}</div>
                  <p>{item.reason || "先记下来，等约饭时再做决定。"}</p>
                  <div className="card-actions">
                    <button className="status-button" type="button" onClick={() => toggleRestaurantStatus(item.id)}><span aria-hidden="true">{item.status === "done" ? "↺" : "✓"}</span>{item.status === "done" ? "放回想去" : "标记去过"}</button>
                    {item.source && <a href={item.source} target="_blank" rel="noreferrer">看详情 ↗</a>}
                    <button className="delete-button" type="button" onClick={() => removeRestaurant(item)}>删除</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {((mode === "cook" && filteredItems.length === 0) || (mode === "eatOut" && filteredRestaurants.length === 0)) && (
          <div className="empty-state">
            <span aria-hidden="true">{mode === "cook" ? "🥣" : "🏮"}</span>
            <h3>{mode === "cook" ? "这里还没有符合条件的美食" : "这里还没有符合条件的饭店"}</h3>
            <p>{mode === "cook" ? "换个筛选条件，或者记下一道新的馋念。" : "换个筛选条件，或者记下一家想去的店。"}</p>
            <button className="button button-primary" type="button" onClick={openNewDialog}>{mode === "cook" ? "记一道" : "记一家"}</button>
          </div>
        )}
      </section>

      <footer>
        <span>好吃清单</span>
        <p>在家认真做饭，也去外面好好吃饭。</p>
        <button type="button" onClick={exportData}>备份我的清单 →</button>
      </footer>

      {dialogOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeDialog()}>
          <section className="food-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            <button className="dialog-close" type="button" onClick={closeDialog} aria-label="关闭">×</button>
            <p className="eyebrow">{mode === "cook" ? "ADD TO MY COOK LIST" : "ADD TO MY EAT-OUT LIST"}</p>
            <h2 id="dialog-title">{mode === "cook" ? (editingId ? "编辑这道美食" : "记下一道想做的美食") : (editingId ? "编辑这家饭店" : "记下一家想去的饭店")}</h2>
            <form onSubmit={submitCurrent}>
              {mode === "cook" ? (
                <>
                  <label>
                    美食名称 <strong>*</strong>
                    <input autoFocus required value={foodDraft.name} onChange={(event) => setFoodDraft({ ...foodDraft, name: event.target.value })} placeholder="比如：冬阴功汤" />
                  </label>
                  <fieldset>
                    <legend>选一个小图标</legend>
                    <div className="emoji-options">
                      {FOOD_EMOJIS.map((emoji) => <button key={emoji} type="button" className={foodDraft.emoji === emoji ? "active" : ""} onClick={() => setFoodDraft({ ...foodDraft, emoji })} aria-label={`选择${emoji}`} aria-pressed={foodDraft.emoji === emoji}>{emoji}</button>)}
                    </div>
                  </fieldset>
                  <label>
                    分类
                    <select value={foodDraft.category} onChange={(event) => setFoodDraft({ ...foodDraft, category: event.target.value })}>{COOK_CATEGORIES.slice(1).map((entry) => <option key={entry}>{entry}</option>)}</select>
                  </label>
                  <label>
                    为什么想做 / 备忘
                    <textarea value={foodDraft.reason} onChange={(event) => setFoodDraft({ ...foodDraft, reason: event.target.value })} placeholder="记下口味、食材或想尝试的原因……" rows={3} />
                  </label>
                  <label>
                    菜谱链接（选填）
                    <input type="url" value={foodDraft.source} onChange={(event) => setFoodDraft({ ...foodDraft, source: event.target.value })} placeholder="https://" />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    饭店名称 <strong>*</strong>
                    <input autoFocus required value={restaurantDraft.name} onChange={(event) => setRestaurantDraft({ ...restaurantDraft, name: event.target.value })} placeholder="比如：巷口炭火烧鸟" />
                  </label>
                  <fieldset>
                    <legend>选一个小图标</legend>
                    <div className="emoji-options">
                      {RESTAURANT_EMOJIS.map((emoji) => <button key={emoji} type="button" className={restaurantDraft.emoji === emoji ? "active" : ""} onClick={() => setRestaurantDraft({ ...restaurantDraft, emoji })} aria-label={`选择${emoji}`} aria-pressed={restaurantDraft.emoji === emoji}>{emoji}</button>)}
                    </div>
                  </fieldset>
                  <div className="form-row">
                    <label>
                      类型
                      <select value={restaurantDraft.category} onChange={(event) => setRestaurantDraft({ ...restaurantDraft, category: event.target.value })}>{RESTAURANT_CATEGORIES.slice(1).map((entry) => <option key={entry}>{entry}</option>)}</select>
                    </label>
                    <label>
                      地点 / 商圈
                      <input value={restaurantDraft.address} onChange={(event) => setRestaurantDraft({ ...restaurantDraft, address: event.target.value })} placeholder="比如：静安寺附近" />
                    </label>
                  </div>
                  <label>
                    为什么想去 / 想吃什么
                    <textarea value={restaurantDraft.reason} onChange={(event) => setRestaurantDraft({ ...restaurantDraft, reason: event.target.value })} placeholder="记下招牌菜、推荐理由或约饭想法……" rows={3} />
                  </label>
                  <label>
                    饭店链接（选填）
                    <input type="url" value={restaurantDraft.source} onChange={(event) => setRestaurantDraft({ ...restaurantDraft, source: event.target.value })} placeholder="地图、点评或店铺主页链接" />
                  </label>
                </>
              )}
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
