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
  const inputId = useId().replace(/:/g, "");
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("正在加载地图……");

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!apiBaseUrl || !containerRef.current) {
      setMapStatus("error");
      setMessage("地图服务尚未配置，仍可先填写文字地点。");
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
        onChangeRef.current({ address, longitude, latitude });
        setMessage(address ? `已选择：${address}` : "已选择地图位置");
      };

      AMap.plugin(["AMap.AutoComplete", "AMap.PlaceSearch", "AMap.Geocoder", "AMap.ToolBar"], () => {
        if (disposed) return;
        const geocoder = new AMap.Geocoder();
        const placeSearch = new AMap.PlaceSearch({ pageSize: 10, pageIndex: 1 });
        if (AMap.ToolBar) map.addControl(new AMap.ToolBar({ position: "RT" }));
        autocomplete = new AMap.AutoComplete({ input: searchRef.current ?? inputId, city: "全国" });
        autocomplete.on("select", (event: any) => {
          const selected = coordinateFromPoi(event?.poi);
          if (selected) {
            choosePosition(selected.longitude, selected.latitude, poiAddress(event.poi));
            return;
          }
          placeSearch.search(String(event?.poi?.name ?? ""), (status: string, result: any) => {
            const poi = status === "complete" ? result?.poiList?.pois?.[0] : null;
            const coordinates = coordinateFromPoi(poi);
            if (poi && coordinates) choosePosition(coordinates.longitude, coordinates.latitude, poiAddress(poi));
          });
        });

        map.on("click", (event: any) => {
          const longitude = event.lnglat.getLng();
          const latitude = event.lnglat.getLat();
          geocoder.getAddress([longitude, latitude], (status: string, result: any) => {
            const address = status === "complete" ? String(result?.regeocode?.formattedAddress ?? "") : "";
            choosePosition(longitude, latitude, address);
          });
        });
        setMapStatus("ready");
        setMessage(initial.longitude !== undefined ? "已载入保存的位置，可重新搜索或点击地图调整。" : "搜索饭店，或直接点击地图选择位置。");
      });
    }).catch(() => {
      if (!disposed) {
        setMapStatus("error");
        setMessage("地图暂时无法加载，仍可先填写文字地点。");
      }
    });

    return () => {
      disposed = true;
      autocomplete?.off?.("select");
      map?.destroy?.();
    };
  }, [apiBaseUrl, inputId]);

  return (
    <div className="map-picker">
      <label htmlFor={inputId}>地图位置</label>
      <input ref={searchRef} id={inputId} type="search" placeholder="搜索饭店名称或详细地址" autoComplete="off" disabled={mapStatus === "error"} />
      <div ref={containerRef} className="map-canvas" aria-label="高德地图选点" />
      <p className={`field-help ${mapStatus === "error" ? "is-error" : ""}`}>{message}</p>
    </div>
  );
}
