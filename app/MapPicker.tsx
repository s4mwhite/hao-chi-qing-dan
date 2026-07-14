"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useId, useRef, useState } from "react";

type MapValue = {
  address: string;
  longitude?: number;
  latitude?: number;
};

type MapPickerProps = {
  apiBaseUrl: string;
  value: MapValue;
  onChange: (value: MapValue) => void;
};

type SearchResult = MapValue & {
  id: string;
  name: string;
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

function textValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.filter((entry) => typeof entry === "string").join("").trim();
  return "";
}

function coordinateFromPoi(poi: any) {
  const location = poi?.location;
  if (!location) return null;
  if (typeof location === "string") {
    const [longitude, latitude] = location.split(",").map(Number);
    return Number.isFinite(longitude) && Number.isFinite(latitude) ? { longitude, latitude } : null;
  }
  if (Array.isArray(location)) {
    const [longitude, latitude] = location.map(Number);
    return Number.isFinite(longitude) && Number.isFinite(latitude) ? { longitude, latitude } : null;
  }
  const longitude = typeof location.getLng === "function" ? location.getLng() : Number(location.lng);
  const latitude = typeof location.getLat === "function" ? location.getLat() : Number(location.lat);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return { longitude, latitude };
}

function joinAddressParts(parts: string[]) {
  return parts.reduce((result, part) => {
    if (!part || result.includes(part)) return result;
    return `${result}${part}`;
  }, "");
}

function normalizePoi(poi: any, index: number): SearchResult | null {
  const coordinates = coordinateFromPoi(poi);
  if (!coordinates) return null;
  const name = textValue(poi?.name) || "地图位置";
  const streetAddress = joinAddressParts([
    textValue(poi?.pname),
    textValue(poi?.cityname),
    textValue(poi?.adname),
    textValue(poi?.district),
    textValue(poi?.address),
  ]);
  const address = streetAddress ? `${name} · ${streetAddress}` : name;
  return {
    id: textValue(poi?.id) || `${coordinates.longitude},${coordinates.latitude}-${index}`,
    name,
    address,
    ...coordinates,
  };
}

function poisFromResult(result: any) {
  const pois = result?.poiList?.pois ?? result?.pois ?? result?.data?.poiList?.pois;
  return Array.isArray(pois) ? pois : [];
}

export default function MapPicker({ apiBaseUrl, value, onChange }: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const [initialValue] = useState(value);
  const runSearchRef = useRef<(keyword: string) => void>(() => undefined);
  const chooseResultRef = useRef<(result: SearchResult) => void>(() => undefined);
  const inputId = useId().replace(/:/g, "");
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "searching" | "error">("loading");
  const [message, setMessage] = useState("正在加载地图……");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!apiBaseUrl || !containerRef.current) {
      setMapStatus("error");
      setMessage("地图服务尚未配置，请稍后重试。");
      return;
    }

    let disposed = false;
    let map: any;
    let marker: any;
    let autocomplete: any;

    loadAmap(apiBaseUrl).then((AMap) => {
      if (disposed || !containerRef.current) return;
      const initial = initialValue;
      const center = initial.longitude !== undefined && initial.latitude !== undefined
        ? [initial.longitude, initial.latitude]
        : [121.4737, 31.2304];
      map = new AMap.Map(containerRef.current, { center, zoom: initial.longitude !== undefined ? 16 : 11 });
      marker = new AMap.Marker({ position: center, visible: initial.longitude !== undefined });
      map.add(marker);

      const choosePosition = (result: SearchResult) => {
        marker.setPosition([result.longitude, result.latitude]);
        marker.show();
        map.setZoomAndCenter(17, [result.longitude, result.latitude]);
        if (searchRef.current) searchRef.current.value = result.address;
        onChangeRef.current({ address: result.address, longitude: result.longitude, latitude: result.latitude });
        setMessage(`已选择：${result.address}`);
        setMapStatus("ready");
      };
      chooseResultRef.current = choosePosition;

      AMap.plugin(["AMap.AutoComplete", "AMap.PlaceSearch", "AMap.Geocoder", "AMap.ToolBar"], () => {
        if (disposed) return;
        const geocoder = new AMap.Geocoder();
        const placeSearch = new AMap.PlaceSearch({ pageSize: 8, pageIndex: 1, city: "全国" });
        if (AMap.ToolBar) map.addControl(new AMap.ToolBar({ position: "RT" }));
        autocomplete = new AMap.AutoComplete({ input: searchRef.current ?? inputId, city: "全国" });

        const applyPoiResults = (result: any) => {
          const results = poisFromResult(result)
            .map((poi: any, index: number) => normalizePoi(poi, index))
            .filter((entry: SearchResult | null): entry is SearchResult => entry !== null);
          if (!results.length) return false;
          setSearchResults(results);
          choosePosition(results[0]);
          setMessage(results.length > 1
            ? `已定位到：${results[0].address}。如不是这家，请从下方候选中选择。`
            : `已选择：${results[0].address}`);
          return true;
        };

        const geocodeAddress = (query: string) => {
          geocoder.getLocation(query, (status: string, result: any) => {
            const geocode = status === "complete" && result?.info === "OK" ? result?.geocodes?.[0] : null;
            const coordinates = coordinateFromPoi(geocode);
            if (!geocode || !coordinates) {
              setSearchResults([]);
              setMapStatus("ready");
              setMessage("没有找到这个位置，请输入饭店名，或包含城市、道路和门牌号的详细地址。");
              return;
            }
            const address = textValue(geocode.formattedAddress) || query;
            const entry: SearchResult = { id: `address-${coordinates.longitude},${coordinates.latitude}`, name: address, address, ...coordinates };
            setSearchResults([entry]);
            choosePosition(entry);
          });
        };

        const searchEverywhere = (query: string) => {
          placeSearch.search(query, (status: string, result: any) => {
            if (status === "complete" && applyPoiResults(result)) return;
            geocodeAddress(query);
          });
        };

        const searchPlace = (keyword: string) => {
          const query = keyword.trim();
          if (!query) {
            setMessage("请输入饭店名称或详细地址。");
            return;
          }
          setMapStatus("searching");
          setSearchResults([]);
          setMessage("正在搜索当前地图附近的地点……");
          const currentCenter = map.getCenter();
          placeSearch.searchNearBy(query, [currentCenter.getLng(), currentCenter.getLat()], 50000, (status: string, result: any) => {
            if (status === "complete" && applyPoiResults(result)) return;
            searchEverywhere(query);
          });
        };
        runSearchRef.current = searchPlace;

        autocomplete.on("select", (event: any) => {
          const selected = normalizePoi(event?.poi, 0);
          if (selected) {
            setSearchResults([selected]);
            choosePosition(selected);
            return;
          }
          const name = textValue(event?.poi?.name);
          const district = textValue(event?.poi?.district);
          searchPlace(`${district}${name}` || name);
        });

        map.on("click", (event: any) => {
          const longitude = event.lnglat.getLng();
          const latitude = event.lnglat.getLat();
          setMapStatus("searching");
          setSearchResults([]);
          setMessage("正在读取地图地址……");
          geocoder.getAddress([longitude, latitude], (status: string, result: any) => {
            const address = status === "complete" && result?.info === "OK"
              ? textValue(result?.regeocode?.formattedAddress)
              : "";
            const entry: SearchResult = {
              id: `map-${longitude},${latitude}`,
              name: address || "地图选点",
              address: address || `地图选点 · ${longitude.toFixed(6)}, ${latitude.toFixed(6)}`,
              longitude,
              latitude,
            };
            choosePosition(entry);
          });
        });
        setMapStatus("ready");
        setMessage(initial.longitude !== undefined
          ? "已载入保存的位置，可重新搜索或点击地图调整。"
          : "搜索饭店，或直接点击地图选择位置。");
      });
    }).catch(() => {
      if (!disposed) {
        setMapStatus("error");
        setMessage("地图暂时无法加载，请稍后重试。");
      }
    });

    return () => {
      disposed = true;
      runSearchRef.current = () => undefined;
      chooseResultRef.current = () => undefined;
      autocomplete?.off?.("select");
      map?.destroy?.();
    };
  }, [apiBaseUrl, initialValue, inputId]);

  function submitSearch() {
    runSearchRef.current(searchRef.current?.value ?? "");
  }

  return (
    <div className="map-picker">
      <label htmlFor={inputId}>地图位置</label>
      <div className="map-search-row">
        <input
          ref={searchRef}
          id={inputId}
          type="search"
          defaultValue={initialValue.address}
          placeholder="输入饭店名称或详细地址，按回车搜索"
          autoComplete="off"
          disabled={mapStatus === "error"}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            event.stopPropagation();
            submitSearch();
          }}
        />
        <button type="button" onClick={submitSearch} disabled={mapStatus !== "ready"}>搜索</button>
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
