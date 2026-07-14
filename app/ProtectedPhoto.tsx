"use client";

import { useEffect, useState } from "react";

type ProtectedPhotoProps = {
  apiBaseUrl: string;
  token: string;
  photoKey: string;
  alt: string;
};

export default function ProtectedPhoto({ apiBaseUrl, token, photoKey, alt }: ProtectedPhotoProps) {
  const [source, setSource] = useState("");

  useEffect(() => {
    let objectUrl = "";
    const controller = new AbortController();
    fetch(`${apiBaseUrl}/api/photos/${encodeURIComponent(photoKey)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    }).then((response) => {
      if (!response.ok) throw new Error("photo");
      return response.blob();
    }).then((blob) => {
      objectUrl = URL.createObjectURL(blob);
      setSource(objectUrl);
    }).catch(() => undefined);

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [apiBaseUrl, photoKey, token]);

  return source ? <img src={source} alt={alt} /> : <span className="photo-loading">照片加载中……</span>;
}
