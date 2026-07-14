"use client";

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

function coordinateFromPoi(poi: any) {
  const location = poi?.location;
  if (!location) return null;
  const longitude = typeof location.getLng === "function" ? location.getLng() : Number(location.lng);
  const latitude = typeof location.getLat === "function" ? location.getLat() : Number(location.lat);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return { longitude, latitude };
}

function poiAddress(poi: any) {
  const district = typeof poi?.district === "string" ? poi.district : "";
  const address = typeof poi?.address === "string" ? poi.address : "";
  return `${district}${address}`.trim() || String(poi?.name ?? "").trim();
}

export default function MapPicker({ apiBaseUrl, value, onChange }: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const initialValueRef = useRef(value);
  const runSearchRef = useRef<(keyword: string) => void>(() => undefined);
  const inputId = useId().replace(/:/g, "");
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("正在加载地图……");

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
      const initial = initialValueRef.current;
      const center = initial.longitude !== undefined && initial.latitude !== undefined
        ? [initial.longitude, initial.latitude]
        : [121.4737, 31.2304];
      map = new AMap.Map(containerRef.current, { center, zoom: initial.longitude !== undefined ? 16 : 11 });
      marker = new AMap.Marker({ position: center, visible: initial.longitude !== undefined });
      map.add(marker);

      const choosePosition = (longitude: number, latitude: number, address: string) => {
        marker.setPosition([longitude, latitude]);
        marker.show();
        map.setZoomAndCenter(16, [longitude, latitude]);
        if (address && searchRef.current) searchRef.current.value = address;
        onChangeRef.current({ address, longitude, latitude });
        setMessage(address ? `已选择：${address}` : "已选择地图位置");
      };

      AMap.plugin(["AMap.AutoComplete", "AMap.PlaceSearch", "AMap.Geocoder", "AMap.ToolBar"], () => {
        if (disposed) return;
        const geocoder = new AMap.Geocoder();
        const placeSearch = new AMap.PlaceSearch({ pageSize: 10, pageIndex: 1 });
        if (AMap.ToolBar) map.addControl(new AMap.ToolBar({ position: "RT" }));
        autocomplete = new AMap.AutoComplete({ input: searchRef.current ?? inputId, city: "全国" });

        const chooseGeocode = (result: any) => {
          const geocode = result?.geocodes?.[0];
          const coordinates = coordinateFromPoi(geocode);
          if (!geocode || !coordinates) return false;
          const address = String(geocode.formattedAddress ?? searchRef.current?.value ?? "").trim();
          choosePosition(coordinates.longitude, coordinates.latitude, address);
          return true;
        };

        const searchAddress = (keyword: string) => {
          const query = keyword.trim();
          if (!query) {
            setMessage("请输入饭店名称或详细地址。");
            return;
          }
          setMessage("正在搜索地图位置……");
          // Per AMap JS API 2.0: getLocation converts an address to coordinates.
          geocoder.getLocation(query, (status: string, result: any) => {
            if (status === "complete" && result?.info === "OK" && chooseGeocode(result)) return;
            // If the text is a POI name rather than a street address, fall back to PlaceSearch.search.
            placeSearch.search(query, (placeStatus: string, placeResult: any) => {
              const poi = placeStatus === "complete" ? placeResult?.poiList?.pois?.[0] : null;
              const coordinates = coordinateFromPoi(poi);
              if (poi && coordinates) {
                choosePosition(coordinates.longitude, coordinates.latitude, poiAddress(poi));
              } else {
                setMessage("没有找到这个位置，请补充城市和详细地址后再试。");
              }
            });
          });
        };
        runSearchRef.current = searchAddress;

        autocomplete.on("select", (event: any) => {
          const name = String(event?.poi?.name ?? "").trim();
          // AMap's official AutoComplete + PlaceSearch flow searches the selected POI name.
          placeSearch.search(name, (status: string, result: any) => {
            const poi = status === "complete" ? result?.poiList?.pois?.[0] : null;
            const coordinates = coordinateFromPoi(poi);
            if (poi && coordinates) {
              choosePosition(coordinates.longitude, coordinates.latitude, poiAddress(poi));
            } else {
              searchAddress(name);
            }
          });
        });

        map.on("click", (event: any) => {
          const longitude = event.lnglat.getLng();
          const latitude = event.lnglat.getLat();
          geocoder.getAddress([longitude, latitude], (status: string, result: any) => {
            const address = status === "complete" && result?.info === "OK" ? String(result?.regeocode?.formattedAddress ?? "") : "";
            choosePosition(longitude, latitude, address);
          });
        });
        setMapStatus("ready");
        setMessage(initial.longitude !== undefined ? "已载入保存的位置，可重新搜索或点击地图调整。" : "搜索饭店，或直接点击地图选择位置。");
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
      autocomplete?.off?.("select");
      map?.destroy?.();
    };
  }, [apiBaseUrl, inputId]);

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
          defaultValue={initialValueRef.current.address}
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
      <p className={`field-help ${mapStatus === "error" ? "is-error" : ""}`}>{message}</p>
    </div>
  );
}
