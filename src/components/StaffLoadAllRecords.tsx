"use client";

import { useEffect } from "react";

export default function StaffLoadAllRecords() {
  useEffect(() => {
    let pending = false;
    let attempts = 0;
    let retryTimer = 0;

    const scan = () => {
      if (pending || attempts >= 20) return;

      const loadMoreButton = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
        (button.textContent ?? "").includes("Tải thêm"),
      );

      if (!loadMoreButton || loadMoreButton.disabled) return;

      pending = true;
      attempts += 1;
      loadMoreButton.click();

      retryTimer = window.setTimeout(() => {
        pending = false;
        scan();
      }, 900);
    };

    const observer = new MutationObserver(scan);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    scan();

    return () => {
      observer.disconnect();
      window.clearTimeout(retryTimer);
    };
  }, []);

  return null;
}
