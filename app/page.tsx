"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import MapPicker from "./MapPicker";
import ProtectedPhoto from "./ProtectedPhoto";

type ItemStatus = "todo" | "done";
type ViewMode = "cook" | "eatOut";

type CheckinPhoto = {
  key: string;
  name: string;
  createdAt: number;
};

type CheckinFields = {
  review: string;
  photos?: CheckinPhoto[];
  coverPhotoKey?: string;
  // Kept for automatic migration from the first single-photo version.
  photoKey?: string;
  photoName?: string;
  checkedAt?: number;
};

type FoodItem = CheckinFields & {
  id: string;
  name: string;
  category: string;
  reason: string;
  source: string;
  status: ItemStatus;
  emoji: string;
  createdAt: number;
};

type RestaurantItem = CheckinFields & {
  id: string;
  name: string;
  category: string;
  address: string;
  reason: string;
  source: string;
  status: ItemStatus;
  emoji: string;
  createdAt: number;
  longitude?: number;
  latitude?: number;
};

type FoodDraft = Pick<FoodItem, "name" | "category" | "reason" | "review" | "source" | "emoji">;
type RestaurantDraft = Pick<RestaurantItem, "name" | "category" | "address" | "reason" | "review" | "source" | "emoji" | "longitude" | "latitude">;
type AuthStatus = "checking" | "signedOut" | "signingIn" | "ready";

const COOK_STORAGE_KEY = "hao-chi-qing-dan-v1";
const RESTAURANT_STORAGE_KEY = "hao-chi-qing-dan-restaurants-v1";
const SESSION_STORAGE_KEY = "hao-chi-qing-dan-session-v1";
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

const SAMPLE_ITEMS: FoodItem[] = [
  {
    id: "sample-1",
    name: "番茄牛腩煲",
    category: "中餐",
    reason: "想做一锅浓郁又下饭的，周末慢慢炖。",
    review: "",
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
    review: "",
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
    review: "香气很足，下次可以再多加一点罗勒。",
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
    review: "",
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
    review: "",
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
  review: "",
  source: "",
  emoji: "🍲",
};

const EMPTY_RESTAURANT_DRAFT: RestaurantDraft = {
  name: "",
  category: "中餐",
  address: "",
  reason: "",
  review: "",
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
  return isBaseItem(value) && hasCheckinFields(value);
}

function hasCheckinFields(value: Record<string, unknown>) {
  return (
    (value.review === undefined || typeof value.review === "string") &&
    (value.photos === undefined || (
      Array.isArray(value.photos) && value.photos.every((photo) => {
        if (!photo || typeof photo !== "object") return false;
        const entry = photo as Record<string, unknown>;
        return typeof entry.key === "string" && typeof entry.name === "string" && typeof entry.createdAt === "number";
      })
    )) &&
    (value.coverPhotoKey === undefined || typeof value.coverPhotoKey === "string") &&
    (value.photoKey === undefined || typeof value.photoKey === "string") &&
    (value.photoName === undefined || typeof value.photoName === "string") &&
    (value.checkedAt === undefined || typeof value.checkedAt === "number")
  );
}

function isRestaurantItem(value: unknown): value is RestaurantItem {
  if (!isBaseItem(value) || typeof value.address !== "string" || !hasCheckinFields(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    (item.longitude === undefined || typeof item.longitude === "number") &&
    (item.latitude === undefined || typeof item.latitude === "number")
  );
}

function normalizeHttpUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return { value: "", error: "" };
  if (trimmed.length > 2048) return { value: trimmed, error: "链接过长，请换一个更短的网址" };
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol)) return { value: trimmed, error: "只支持 http 或 https 链接" };
    if (!url.hostname || url.username || url.password) return { value: trimmed, error: "请输入不含账号密码的公开网页链接" };
    return { value: url.toString(), error: "" };
  } catch {
    return { value: trimmed, error: "链接格式不正确，例如：https://example.com/page" };
  }
}

function safeHttpUrl(value: string) {
  const result = normalizeHttpUrl(value);
  return result.error ? "" : result.value;
}

function normalizedCheckin(item: CheckinFields) {
  const photos = Array.isArray(item.photos)
    ? item.photos.filter((photo) => photo.key && photo.name)
    : item.photoKey
      ? [{ key: item.photoKey, name: item.photoName || "打卡照片", createdAt: item.checkedAt ?? Date.now() }]
      : [];
  return {
    review: typeof item.review === "string" ? item.review : "",
    photos: photos.length ? photos : undefined,
    coverPhotoKey: photos.some((photo) => photo.key === item.coverPhotoKey) ? item.coverPhotoKey : photos[0]?.key,
  };
}

function normalizeFood(item: FoodItem): FoodItem {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    reason: item.reason,
    ...normalizedCheckin(item),
    source: safeHttpUrl(item.source),
    status: item.status,
    emoji: item.emoji,
    createdAt: item.createdAt,
  };
}

function normalizeRestaurant(item: RestaurantItem): RestaurantItem {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    address: item.address,
    reason: item.reason,
    ...normalizedCheckin(item),
    source: safeHttpUrl(item.source),
    status: item.status,
    emoji: item.emoji,
    createdAt: item.createdAt,
    longitude: typeof item.longitude === "number" ? item.longitude : undefined,
    latitude: typeof item.latitude === "number" ? item.latitude : undefined,
  };
}

function coverPhoto(item: FoodItem | RestaurantItem) {
  const photos = item.photos ?? [];
  return photos.find((photo) => photo.key === item.coverPhotoKey) ?? photos[0];
}

function mapLink(item: RestaurantItem) {
  if (item.longitude !== undefined && item.latitude !== undefined) {
    const params = new URLSearchParams({
      position: `${item.longitude},${item.latitude}`,
      name: item.name,
      src: "好吃清单",
      coordinate: "gaode",
      callnative: "0",
    });
    return `https://uri.amap.com/marker?${params}`;
  }
  const keyword = `${item.name} ${item.address}`.trim();
  return keyword ? `https://uri.amap.com/search?${new URLSearchParams({ keyword, src: "好吃清单", callnative: "0" })}` : "";
}

async function optimizePhoto(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error("仅支持 JPG、PNG 或 WebP 图片");
  const bitmap = await createImageBitmap(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("图片处理失败");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
  if (!blob) throw new Error("图片处理失败");
  if (blob.size > 5 * 1024 * 1024) throw new Error("压缩后的图片仍超过 5MB，请选择较小的照片");
  return blob;
}

type PhotoManagerProps = {
  item?: FoodItem | RestaurantItem;
  mode: ViewMode;
  token: string;
  uploadingId: string;
  onUpload: (item: FoodItem | RestaurantItem, mode: ViewMode, event: ChangeEvent<HTMLInputElement>) => void;
  onSetCover: (itemId: string, mode: ViewMode, photoKey: string) => void;
  onRemove: (item: FoodItem | RestaurantItem, mode: ViewMode, photo: CheckinPhoto) => void;
};

function PhotoManager({ item, mode, token, uploadingId, onUpload, onSetCover, onRemove }: PhotoManagerProps) {
  const titleId = `photo-manager-title-${mode}`;
  return (
    <section className="photo-manager" aria-labelledby={titleId}>
      <div className="photo-manager-heading">
        <div>
          <h3 id={titleId}>打卡照片</h3>
          <p>{item
            ? `上传照片会自动标记为${mode === "cook" ? "已做" : "已去"}；单张自动成为封面，多张可选封面。`
            : `先保存${mode === "cook" ? "这道美食" : "这家饭店"}，再进入编辑即可上传照片。`}</p>
        </div>
        {item && (
          <label className="photo-add-button">
            {uploadingId === item.id ? "上传中…" : "＋ 上传照片"}
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              disabled={uploadingId === item.id}
              onChange={(event) => onUpload(item, mode, event)}
            />
          </label>
        )}
      </div>
      {item && (item.photos?.length ?? 0) === 0 && <div className="photo-empty">还没有打卡照片</div>}
      {item && (item.photos?.length ?? 0) > 0 && (
        <div className="photo-library">
          {(item.photos ?? []).map((photo) => {
            const isCover = coverPhoto(item)?.key === photo.key;
            return (
              <article className={`photo-tile ${isCover ? "is-cover" : ""}`} key={photo.key}>
                <ProtectedPhoto apiBaseUrl={API_BASE_URL} token={token} photoKey={photo.key} alt={`${item.name}的打卡照片`} />
                <div className="photo-tile-actions">
                  {isCover ? <span>封面</span> : <button type="button" onClick={() => onSetCover(item.id, mode, photo.key)}>设为封面</button>}
                  <button type="button" onClick={() => onRemove(item, mode, photo)}>删除</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [sessionToken, setSessionToken] = useState("");
  const [loginName, setLoginName] = useState("");
  const [loginError, setLoginError] = useState("");
  const [syncReady, setSyncReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "saved" | "error">("idle");
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
  const [sourceError, setSourceError] = useState("");
  const [uploadingId, setUploadingId] = useState("");
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
          setRestaurants(parsedRestaurants.map(normalizeRestaurant));
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
    if (!API_BASE_URL) {
      setAuthStatus("signedOut");
      setLoginError("共享服务尚未配置完成");
      return;
    }
    const savedToken = window.localStorage.getItem(SESSION_STORAGE_KEY) ?? "";
    if (!savedToken) {
      setAuthStatus("signedOut");
      return;
    }
    setSessionToken(savedToken);
    void loadSharedData(savedToken, true);
  }, [loaded]);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(COOK_STORAGE_KEY, JSON.stringify(items));
    window.localStorage.setItem(RESTAURANT_STORAGE_KEY, JSON.stringify(restaurants));
  }, [items, restaurants, loaded]);

  useEffect(() => {
    if (!syncReady || authStatus !== "ready" || !sessionToken) return;
    setSyncStatus("syncing");
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`${API_BASE_URL}/api/data`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ version: 5, cook: items, eatOut: restaurants }),
        signal: controller.signal,
      }).then((response) => {
        if (response.status === 401) {
          signOut("登录已过期，请重新进入");
          throw new Error("expired");
        }
        if (!response.ok) throw new Error("sync");
        setSyncStatus("saved");
      }).catch((error) => {
        if (error.name !== "AbortError" && error.message !== "expired") setSyncStatus("error");
      });
    }, 500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [items, restaurants, authStatus, sessionToken, syncReady]);

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
      .filter((item) => !keyword || `${item.name} ${item.reason} ${item.review} ${item.category}`.toLocaleLowerCase("zh-CN").includes(keyword))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [items, category, status, query]);

  const filteredRestaurants = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("zh-CN");
    return restaurants
      .filter((item) => category === "全部" || item.category === category)
      .filter((item) => status === "all" || item.status === status)
      .filter((item) => !keyword || `${item.name} ${item.reason} ${item.review} ${item.category} ${item.address}`.toLocaleLowerCase("zh-CN").includes(keyword))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [restaurants, category, status, query]);

  const currentItems = mode === "cook" ? items : restaurants;
  const todoCount = currentItems.filter((item) => item.status === "todo").length;
  const doneCount = currentItems.length - todoCount;
  const activeCategories = mode === "cook" ? COOK_CATEGORIES : RESTAURANT_CATEGORIES;
  const editingFood = mode === "cook" && editingId
    ? items.find((item) => item.id === editingId)
    : undefined;
  const editingRestaurant = mode === "eatOut" && editingId
    ? restaurants.find((item) => item.id === editingId)
    : undefined;

  function showToast(message: string) {
    setToast(message);
  }

  async function loadSharedData(token: string, migrateLocal: boolean) {
    setAuthStatus("checking");
    setLoginError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/data`, { headers: { Authorization: `Bearer ${token}` } });
      if (response.status === 401) {
        signOut("登录已过期，请重新进入");
        return;
      }
      if (!response.ok) throw new Error("共享服务暂时不可用");
      const data = await response.json() as { cook?: unknown; eatOut?: unknown; empty?: boolean };
      if (data.empty && migrateLocal) {
        const upload = await fetch(`${API_BASE_URL}/api/data`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ version: 5, cook: items, eatOut: restaurants }),
        });
        if (!upload.ok) throw new Error("现有清单迁移失败");
      } else if (
        Array.isArray(data.cook) && data.cook.every(isFoodItem) &&
        Array.isArray(data.eatOut) && data.eatOut.every(isRestaurantItem)
      ) {
        setItems(data.cook.map(normalizeFood));
        setRestaurants(data.eatOut.map(normalizeRestaurant));
      } else {
        throw new Error("共享清单格式错误");
      }
      setSyncReady(true);
      setSyncStatus("saved");
      setAuthStatus("ready");
    } catch (error) {
      setAuthStatus("signedOut");
      setLoginError(error instanceof Error ? error.message : "共享服务暂时不可用");
    }
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loginName.trim() || !API_BASE_URL) return;
    setAuthStatus("signingIn");
    setLoginError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: loginName }),
      });
      const result = await response.json() as { token?: string; error?: string };
      if (!response.ok || !result.token) throw new Error(result.error || "暂时无法登录");
      window.localStorage.setItem(SESSION_STORAGE_KEY, result.token);
      setSessionToken(result.token);
      setLoginName("");
      await loadSharedData(result.token, true);
    } catch (error) {
      setAuthStatus("signedOut");
      setLoginError(error instanceof Error ? error.message : "暂时无法登录");
    }
  }

  function signOut(message = "") {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setSessionToken("");
    setSyncReady(false);
    setAuthStatus("signedOut");
    setLoginError(message);
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
    setSourceError("");
    setDialogOpen(true);
  }

  function openFoodDialog(item: FoodItem) {
    setEditingId(item.id);
    setFoodDraft({
      name: item.name,
      category: item.category,
      reason: item.reason,
      review: item.review,
      source: item.source,
      emoji: item.emoji,
    });
    setSourceError("");
    setDialogOpen(true);
  }

  function openRestaurantDialog(item: RestaurantItem) {
    setEditingId(item.id);
    setRestaurantDraft({
      name: item.name,
      category: item.category,
      address: item.address,
      reason: item.reason,
      review: item.review,
      source: item.source,
      emoji: item.emoji,
      longitude: item.longitude,
      latitude: item.latitude,
    });
    setSourceError("");
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
      const normalizedSource = normalizeHttpUrl(foodDraft.source);
      if (normalizedSource.error) {
        setSourceError(normalizedSource.error);
        return;
      }
      const cleanDraft = { ...foodDraft, source: normalizedSource.value };
      if (editingId) {
        setItems((current) => current.map((item) => item.id === editingId ? { ...item, ...cleanDraft, name: foodDraft.name.trim() } : item));
        showToast("已经更新这道美食");
      } else {
        const next: FoodItem = {
          ...cleanDraft,
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
      const normalizedSource = normalizeHttpUrl(restaurantDraft.source);
      if (normalizedSource.error) {
        setSourceError(normalizedSource.error);
        return;
      }
      const cleanDraft = { ...restaurantDraft, source: normalizedSource.value };
      if (editingId) {
        setRestaurants((current) => current.map((item) => item.id === editingId ? { ...item, ...cleanDraft, name: restaurantDraft.name.trim() } : item));
        showToast("已经更新这家饭店");
      } else {
        const next: RestaurantItem = {
          ...cleanDraft,
          id: window.crypto?.randomUUID?.() ?? `${Date.now()}`,
          name: restaurantDraft.name.trim(),
          status: "todo",
          createdAt: Date.now(),
        };
        setRestaurants((current) => [next, ...current]);
        showToast("已经加入出去吃清单");
      }
    }
    setSourceError("");
    closeDialog();
  }

  function toggleFoodStatus(id: string) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, status: item.status === "todo" ? "done" : "todo" } : item));
  }

  function toggleRestaurantStatus(id: string) {
    setRestaurants((current) => current.map((item) => item.id === id ? { ...item, status: item.status === "todo" ? "done" : "todo" } : item));
  }

  function validateFoodSource() {
    const result = normalizeHttpUrl(foodDraft.source);
    setSourceError(result.error);
    if (!result.error && result.value !== foodDraft.source) setFoodDraft((current) => ({ ...current, source: result.value }));
  }

  function validateRestaurantSource() {
    const result = normalizeHttpUrl(restaurantDraft.source);
    setSourceError(result.error);
    if (!result.error && result.value !== restaurantDraft.source) setRestaurantDraft((current) => ({ ...current, source: result.value }));
  }

  async function deletePhoto(photoKey: string) {
    if (!photoKey || !sessionToken) return;
    await fetch(`${API_BASE_URL}/api/photos/${encodeURIComponent(photoKey)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${sessionToken}` },
    }).catch(() => undefined);
  }

  async function uploadCheckinPhotos(item: FoodItem | RestaurantItem, targetMode: ViewMode, event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length || !sessionToken) return;
    const existingPhotos = item.photos ?? [];
    if (existingPhotos.length + files.length > 30) {
      showToast("每条记录最多保存 30 张照片");
      return;
    }
    setUploadingId(item.id);
    const uploaded: CheckinPhoto[] = [];
    let failed = 0;
    try {
      for (const file of files) {
        try {
          const photo = await optimizePhoto(file);
          const response = await fetch(`${API_BASE_URL}/api/photos/${encodeURIComponent(item.id)}`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${sessionToken}`,
              "Content-Type": photo.type,
              "X-Filename": encodeURIComponent(file.name),
            },
            body: photo,
          });
          const result = await response.json() as { key?: string; error?: string };
          if (response.status === 401) {
            signOut("登录已过期，请重新进入");
            return;
          }
          if (!response.ok || !result.key) throw new Error(result.error || "照片上传失败");
          uploaded.push({ key: result.key, name: file.name.slice(0, 160), createdAt: Date.now() });
        } catch {
          failed += 1;
        }
      }
      if (!uploaded.length) throw new Error("照片上传失败，请选择 JPG、PNG 或 WebP 图片");
      if (targetMode === "cook") {
        setItems((current) => current.map((entry) => entry.id === item.id ? {
          ...entry,
          photos: [...(entry.photos ?? []), ...uploaded],
          coverPhotoKey: entry.coverPhotoKey ?? uploaded[0].key,
          status: "done",
        } : entry));
      } else {
        setRestaurants((current) => current.map((entry) => entry.id === item.id ? {
          ...entry,
          photos: [...(entry.photos ?? []), ...uploaded],
          coverPhotoKey: entry.coverPhotoKey ?? uploaded[0].key,
          status: "done",
        } : entry));
      }
      showToast(failed ? `已上传 ${uploaded.length} 张，${failed} 张失败` : `已上传 ${uploaded.length} 张照片`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "照片上传失败");
    } finally {
      setUploadingId("");
    }
  }

  function setCoverPhoto(itemId: string, targetMode: ViewMode, photoKey: string) {
    if (targetMode === "cook") {
      setItems((current) => current.map((entry) => entry.id === itemId ? { ...entry, coverPhotoKey: photoKey } : entry));
    } else {
      setRestaurants((current) => current.map((entry) => entry.id === itemId ? { ...entry, coverPhotoKey: photoKey } : entry));
    }
    showToast("已设为封面");
  }

  function removeCheckinPhoto(item: FoodItem | RestaurantItem, targetMode: ViewMode, photo: CheckinPhoto) {
    if (!window.confirm(`确定删除照片「${photo.name}」吗？`)) return;
    void deletePhoto(photo.key);
    if (targetMode === "cook") {
      setItems((current) => current.map((entry) => entry.id === item.id ? {
        ...entry,
        photos: (entry.photos ?? []).filter((candidate) => candidate.key !== photo.key),
        coverPhotoKey: entry.coverPhotoKey === photo.key
          ? (entry.photos ?? []).find((candidate) => candidate.key !== photo.key)?.key
          : entry.coverPhotoKey,
      } : entry));
    } else {
      setRestaurants((current) => current.map((entry) => entry.id === item.id ? {
        ...entry,
        photos: (entry.photos ?? []).filter((candidate) => candidate.key !== photo.key),
        coverPhotoKey: entry.coverPhotoKey === photo.key
          ? (entry.photos ?? []).find((candidate) => candidate.key !== photo.key)?.key
          : entry.coverPhotoKey,
      } : entry));
    }
    showToast("打卡照片已删除");
  }

  function removeFood(item: FoodItem) {
    if (!window.confirm(`确定删除「${item.name}」吗？`)) return;
    for (const photo of item.photos ?? []) void deletePhoto(photo.key);
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    if (randomPick?.item.id === item.id) setRandomPick(null);
    showToast("已从自己做清单删除");
  }

  function removeRestaurant(item: RestaurantItem) {
    if (!window.confirm(`确定删除「${item.name}」吗？`)) return;
    for (const photo of item.photos ?? []) void deletePhoto(photo.key);
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
    const backup = { version: 5, cook: items, eatOut: restaurants };
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
        setRestaurants(backup.eatOut.map(normalizeRestaurant));
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

  if (authStatus !== "ready") {
    return (
      <main className="login-shell">
        <section className="login-card" aria-labelledby="login-title">
          <div className="login-mark" aria-hidden="true">好</div>
          <p className="eyebrow">OUR LITTLE FOOD NOTEBOOK</p>
          <h1 id="login-title">两个人的<br /><em>好吃清单</em></h1>
          <p className="login-copy">这是一份私人清单，请验证后继续。</p>
          {authStatus === "checking" ? (
            <div className="login-loading" role="status">正在打开清单……</div>
          ) : (
            <form onSubmit={submitLogin}>
              <label htmlFor="access-name">访问凭证</label>
              <input
                id="access-name"
                type="password"
                autoComplete="current-password"
                autoFocus
                required
                value={loginName}
                onChange={(event) => setLoginName(event.target.value)}
                aria-describedby={loginError ? "login-error" : undefined}
              />
              {loginError && <p className="login-error" id="login-error" role="alert">{loginError}</p>}
              <button className="button button-primary" type="submit" disabled={authStatus === "signingIn" || !API_BASE_URL}>
                {authStatus === "signingIn" ? "正在验证……" : "进入清单"}
              </button>
            </form>
          )}
          <p className="login-footnote">验证状态仅保存在当前设备。</p>
        </section>
      </main>
    );
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="好吃清单首页">
          <span className="brand-mark" aria-hidden="true">好</span>
          <span>好吃清单</span>
        </a>
        <nav className="nav-actions" aria-label="页面操作">
          <span className={`sync-state sync-${syncStatus}`}>{syncStatus === "syncing" ? "同步中" : syncStatus === "error" ? "同步失败" : "已同步"}</span>
          <button className="nav-link" type="button" onClick={exportData}>导出备份</button>
          <button className="nav-link" type="button" onClick={() => importInputRef.current?.click()}>导入</button>
          <button className="nav-link" type="button" onClick={() => signOut()}>退出</button>
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
            {filteredItems.map((item, index) => {
              const cardPhoto = coverPhoto(item);
              return (
              <article className={`food-card is-${item.status}`} key={item.id}>
                <div className={`food-visual visual-${index % 4} ${cardPhoto ? "has-photo" : ""}`}>
                  {cardPhoto ? (
                    <ProtectedPhoto apiBaseUrl={API_BASE_URL} token={sessionToken} photoKey={cardPhoto.key} alt={`${item.name}的封面照片`} />
                  ) : <span className="food-emoji" aria-hidden="true">{item.emoji}</span>}
                  <span className="category-stamp">{item.category}</span>
                  {item.status === "done" && <span className="done-stamp">做过啦</span>}
                </div>
                <div className="food-content">
                  <div className="food-title-row">
                    <h3>{item.name}</h3>
                    <button className="icon-button" type="button" onClick={() => openFoodDialog(item)} aria-label={`编辑${item.name}`}>✎</button>
                  </div>
                  <p>{item.reason || "先记下来，等下厨时再补充想法。"}</p>
                  {item.review && <div className="review-line"><strong>做后评价</strong><span>{item.review}</span></div>}
                  <div className="card-actions">
                    <button className={`status-button status-${item.status}`} type="button" onClick={() => toggleFoodStatus(item.id)} aria-label={item.status === "done" ? "放回想做" : "标记做过"}><span aria-hidden="true">{item.status === "done" ? "✓" : "○"}</span>{item.status === "done" ? "已经做过" : "还没做"}</button>
                    {safeHttpUrl(item.source) && <a href={safeHttpUrl(item.source)} target="_blank" rel="noopener noreferrer">看做法 ↗</a>}
                    <button className="delete-button" type="button" onClick={() => removeFood(item)}>删除</button>
                  </div>
                </div>
              </article>
            )})}
          </div>
        )}

        {mode === "eatOut" && filteredRestaurants.length > 0 && (
          <div className="food-grid">
            {filteredRestaurants.map((item, index) => {
              const cardPhoto = coverPhoto(item);
              return (
              <article className={`food-card restaurant-card is-${item.status}`} key={item.id}>
                <div className={`food-visual restaurant-visual visual-${(index + 1) % 4} ${cardPhoto ? "has-photo" : ""}`}>
                  {cardPhoto ? (
                    <ProtectedPhoto apiBaseUrl={API_BASE_URL} token={sessionToken} photoKey={cardPhoto.key} alt={`${item.name}的封面照片`} />
                  ) : <span className="food-emoji" aria-hidden="true">{item.emoji}</span>}
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
                  {item.review && <div className="review-line"><strong>吃后评价</strong><span>{item.review}</span></div>}
                  <div className="card-actions">
                    <button className={`status-button status-${item.status}`} type="button" onClick={() => toggleRestaurantStatus(item.id)} aria-label={item.status === "done" ? "放回想去" : "标记去过"}><span aria-hidden="true">{item.status === "done" ? "✓" : "○"}</span>{item.status === "done" ? "已经去过" : "还没去"}</button>
                    {mapLink(item) && <a href={mapLink(item)} target="_blank" rel="noopener noreferrer">地图 ↗</a>}
                    {safeHttpUrl(item.source) && <a href={safeHttpUrl(item.source)} target="_blank" rel="noopener noreferrer">饭店详情 ↗</a>}
                    <button className="delete-button" type="button" onClick={() => removeRestaurant(item)}>删除</button>
                  </div>
                </div>
              </article>
            )})}
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
                    做完后的评价
                    <textarea value={foodDraft.review} onChange={(event) => setFoodDraft({ ...foodDraft, review: event.target.value })} placeholder="做完后记录味道、口感和下次想调整的地方……" rows={3} />
                  </label>
                  <label>
                    菜谱链接（选填）
                    <input
                      type="text"
                      inputMode="url"
                      value={foodDraft.source}
                      onChange={(event) => { setFoodDraft({ ...foodDraft, source: event.target.value }); setSourceError(""); }}
                      onBlur={validateFoodSource}
                      aria-invalid={Boolean(sourceError)}
                      aria-describedby={sourceError ? "source-error" : "source-help"}
                      placeholder="可直接粘贴网址，例如 xiachufang.com/recipe/…"
                    />
                    {sourceError ? <span className="field-error" id="source-error">{sourceError}</span> : <span className="field-help" id="source-help">将自动补全 https://，仅接受安全的网页链接。</span>}
                  </label>
                  <PhotoManager
                    item={editingFood}
                    mode="cook"
                    token={sessionToken}
                    uploadingId={uploadingId}
                    onUpload={uploadCheckinPhotos}
                    onSetCover={setCoverPhoto}
                    onRemove={removeCheckinPhoto}
                  />
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
                  <label>
                    类型
                    <select value={restaurantDraft.category} onChange={(event) => setRestaurantDraft({ ...restaurantDraft, category: event.target.value })}>{RESTAURANT_CATEGORIES.slice(1).map((entry) => <option key={entry}>{entry}</option>)}</select>
                  </label>
                  <MapPicker
                    apiBaseUrl={API_BASE_URL}
                    token={sessionToken}
                    value={{ address: restaurantDraft.address, longitude: restaurantDraft.longitude, latitude: restaurantDraft.latitude }}
                    onChange={(place) => setRestaurantDraft((current) => ({ ...current, ...place }))}
                  />
                  <label>
                    为什么想去 / 想吃什么
                    <textarea value={restaurantDraft.reason} onChange={(event) => setRestaurantDraft({ ...restaurantDraft, reason: event.target.value })} placeholder="记下招牌菜、推荐理由或约饭想法……" rows={3} />
                  </label>
                  <label>
                    吃完后的评价
                    <textarea value={restaurantDraft.review} onChange={(event) => setRestaurantDraft({ ...restaurantDraft, review: event.target.value })} placeholder="吃完后记录口味、服务和下次还想不想来……" rows={3} />
                  </label>
                  <label>
                    饭店链接（选填）
                    <input
                      type="text"
                      inputMode="url"
                      value={restaurantDraft.source}
                      onChange={(event) => { setRestaurantDraft({ ...restaurantDraft, source: event.target.value }); setSourceError(""); }}
                      onBlur={validateRestaurantSource}
                      aria-invalid={Boolean(sourceError)}
                      aria-describedby={sourceError ? "source-error" : "source-help"}
                      placeholder="地图、点评或店铺主页链接"
                    />
                    {sourceError ? <span className="field-error" id="source-error">{sourceError}</span> : <span className="field-help" id="source-help">将自动补全 https://，仅接受安全的网页链接。</span>}
                  </label>
                  <PhotoManager
                    item={editingRestaurant}
                    mode="eatOut"
                    token={sessionToken}
                    uploadingId={uploadingId}
                    onUpload={uploadCheckinPhotos}
                    onSetCover={setCoverPhoto}
                    onRemove={removeCheckinPhoto}
                  />
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
