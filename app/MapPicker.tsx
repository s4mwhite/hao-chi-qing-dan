"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useId, useRef, useState } from "react";

type MapValue = {
  address: string;
  longitude?: number;
  latitude?: number;
};

type SearchResult = Required<MapValue> & {
  id: string;
  name: string;
};

type MapPickerProps = {
  apiBaseUrl: string;
  token: string;
  value: MapValue;
  onChange: (value: MapValue) => void;
};

type AMapWindow = Window & {
  AMap?: any;
  _AMapSecurityConfig?: { serviceHost: string };
};

let amapPromise: Promise<any> | null = null;

function loadAmap(apiBaseUrl: string) {
  const browser = window as AMapWindow;
  if (browser.AMap) return Promise.resolve(browser.AMap);
  if (amapPromise) return amapPromise;
  amapPromise = new Promise((resolve, reject) => {
    browser._AMapSecurityConfig = { serviceHost: `${apiBaseUrl}/_AMapService` };
    const script = document.createElement("script");
    script.src = `${apiBaseUrl}/amap/maps`;
    script.async = true;
    script.onload = () => browser.AMap ? resolve(browser.AMap) : reject(new Error("地图加载失败"));
    script.onerror = () => reject(new Error("地图加载失败"));
    document.head.appendChild(script);
  }).catch((error) => {
    amapPromise = null;
    throw error;
  });
  return amapPromise;
}

function isSearchResult(value: unknown): value is SearchResult {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === "string" && typeof entry.name === "string" && typeof entry.address === "string"
    && typeof entry.longitude === "number" && typeof entry.latitude === "number";
}

export default function MapPicker({ apiBaseUrl, token, value, onChange }: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const runSearchRef = useRef<(keyword: string) => void>(() => undefined);
  const chooseResultRef = useRef<(result: SearchResult) => void>(() => undefined);
  const autoSearchTimerRef = useRef<number | undefined>(undefined);
  const requestSequenceRef = useRef(0);
  const [initialValue] = useState(value);
  const [searchText, setSearchText] = useState(value.address);
  const inputId = useId().replace(/:/g, "");
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "searching" | "error">("loading");
  const [message, setMessage] = useState("正在加载地图……");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!apiBaseUrl || !token || !containerRef.current) {
      setMapStatus("error");
      setMessage("地图服务尚未配置，请稍后重试。");
      return;
    }

    let disposed = false;
    let map: any;
    let marker: any;

    loadAmap(apiBaseUrl).then((AMap) => {
      if (disposed || !containerRef.current) return;
      const center = initialValue.longitude !== undefined && initialValue.latitude !== undefined
        ? [initialValue.longitude, initialValue.latitude]
        : [121.4737, 31.2304];
      map = new AMap.Map(containerRef.current, { center, zoom: initialValue.longitude !== undefined ? 16 : 11 });
      marker = new AMap.Marker({ position: center, visible: initialValue.longitude !== undefined });
      map.add(marker);

      const choosePosition = (result: SearchResult) => {
        marker.setPosition([result.longitude, result.latitude]);
        marker.show();
        map.setZoomAndCenter(17, [result.longitude, result.latitude]);
        onChangeRef.current({ address: result.address, longitude: result.longitude, latitude: result.latitude });
        setMessage(`已定位：${result.address}`);
        setMapStatus("ready");
      };
      chooseResultRef.current = choosePosition;

      const searchPlace = async (keyword: string) => {
        const query = keyword.trim();
        if (query.length < 2) {
          setMessage("请输入至少两个字的饭店名称或地址。");
          return;
        }
        const sequence = ++requestSequenceRef.current;
        setMapStatus("searching");
        setSearchResults([]);
        setMessage("正在定位地图位置……");
        const currentCenter = map.getCenter();
        const params = new URLSearchParams({
          query,
          longitude: String(currentCenter.getLng()),
          latitude: String(currentCenter.getLat()),
        });
        try {
          const response = await fetch(`${apiBaseUrl}/api/map/search?${params}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const payload = await response.json() as { results?: unknown; error?: string };
          if (sequence !== requestSequenceRef.current || disposed) return;
          if (!response.ok) throw new Error(payload.error || "地图搜索失败");
          const results = Array.isArray(payload.results) ? payload.results.filter(isSearchResult) : [];
          if (!results.length) {
            setMapStatus("ready");
            setMessage("没有找到这个位置，请尝试加入城市、道路或门牌号。");
            return;
          }
          setSearchResults(results);
          choosePosition(results[0]);
          if (results.length > 1) setMessage(`已定位：${results[0].address}。不是这家可从下方候选中选择。`);
        } catch (error) {
          if (sequence !== requestSequenceRef.current || disposed) return;
          setMapStatus("ready");
          setMessage(error instanceof Error ? error.message : "地图搜索失败，请稍后重试。");
        }
      };
      runSearchRef.current = (keyword) => { void searchPlace(keyword); };

      AMap.plugin("AMap.ToolBar", () => {
        if (!disposed && AMap.ToolBar) map.addControl(new AMap.ToolBar({ position: "RT" }));
      });

      map.on("click", async (event: any) => {
        const longitude = event.lnglat.getLng();
        const latitude = event.lnglat.getLat();
        const sequence = ++requestSequenceRef.current;
        setMapStatus("searching");
        setSearchResults([]);
        setMessage("正在读取地图地址……");
        const params = new URLSearchParams({ longitude: String(longitude), latitude: String(latitude) });
        try {
          const response = await fetch(`${apiBaseUrl}/api/map/reverse?${params}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const payload = await response.json() as { address?: string };
          if (sequence !== requestSequenceRef.current || disposed) return;
          const address = typeof payload.address === "string" && payload.address.trim()
            ? payload.address.trim()
            : `地图选点 · ${longitude.toFixed(6)}, ${latitude.toFixed(6)}`;
          choosePosition({ id: `map-${longitude},${latitude}`, name: address, address, longitude, latitude });
        } catch {
          if (sequence !== requestSequenceRef.current || disposed) return;
          choosePosition({
            id: `map-${longitude},${latitude}`,
            name: "地图选点",
            address: `地图选点 · ${longitude.toFixed(6)}, ${latitude.toFixed(6)}`,
            longitude,
            latitude,
          });
        }
      });
      setMapStatus("ready");
      setMessage(initialValue.longitude !== undefined
        ? "已载入保存的位置；输入新地点后会自动重新定位。"
        : "输入饭店名称或地址，停顿片刻后地图会自动定位。");
    }).catch(() => {
      if (!disposed) {
        setMapStatus("error");
        setMessage("地图暂时无法加载，请稍后重试。");
      }
    });

    return () => {
      disposed = true;
      requestSequenceRef.current += 1;
      window.clearTimeout(autoSearchTimerRef.current);
      runSearchRef.current = () => undefined;
      chooseResultRef.current = () => undefined;
      map?.destroy?.();
    };
  }, [apiBaseUrl, initialValue, token]);

  function queueAutomaticSearch(keyword: string) {
    setSearchText(keyword);
    window.clearTimeout(autoSearchTimerRef.current);
    if (keyword.trim().length < 2) return;
    autoSearchTimerRef.current = window.setTimeout(() => runSearchRef.current(keyword), 700);
  }

  function submitSearch() {
    window.clearTimeout(autoSearchTimerRef.current);
    runSearchRef.current(searchText);
  }

  return (
    <div className="map-picker">
      <label htmlFor={inputId}>地图位置</label>
      <div className="map-search-row">
        <input
          id={inputId}
          type="search"
          value={searchText}
          placeholder="输入饭店名称或详细地址"
          autoComplete="off"
          disabled={mapStatus === "error"}
          onChange={(event) => queueAutomaticSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            event.stopPropagation();
            submitSearch();
          }}
        />
        <button type="button" onClick={submitSearch} disabled={mapStatus === "loading" || mapStatus === "searching" || mapStatus === "error"}>
          {mapStatus === "searching" ? "定位中" : "搜索"}
        </button>
      </div>
      <div ref={containerRef} className="map-canvas" aria-label="高德地图选点" />
      {searchResults.length > 1 && (
        <div className="map-results" aria-label="地图搜索候选">
          {searchResults.map((result) => (
            <button key={result.id} type="button" onClick={() => chooseResultRef.current(result)}>
              <strong>{result.name}</strong>
              <span>{result.address.replace(`${result.name} · `, "")}</span>
            </button>
          ))}
        </div>
      )}
      <p className={`field-help ${mapStatus === "error" ? "is-error" : ""}`}>{message}</p>
    </div>
  );
}
