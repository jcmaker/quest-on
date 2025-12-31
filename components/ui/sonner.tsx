"use client"

import { Toaster as HotToaster } from "react-hot-toast"

const Toaster = () => {
  return (
    <HotToaster
      position="top-center"
      toastOptions={{
        className: "toaster group",
        style: {
          background: "var(--popover)",
          color: "var(--popover-foreground)",
          border: "1px solid var(--border)",
          minWidth: "250px", // 메시지 길이 차이로 인한 점프 방지
        },
        duration: 4000, // 기본 지속 시간
        removeDelay: 1000, // 닫힐 때 애니메이션 시간
        success: {
          duration: 2000, // 성공 메시지는 더 짧게
          iconTheme: {
            primary: "#22c55e", // green-500
            secondary: "#ffffff", // white
          },
        },
        error: {
          duration: 4000, // 에러 메시지는 더 길게
          iconTheme: {
            primary: "#ef4444", // red-500
            secondary: "#ffffff", // white
          },
        },
        loading: {
          duration: Infinity, // 로딩은 무한대로 (수동으로 닫을 때까지)
          iconTheme: {
            primary: "#3b82f6", // blue-500
            secondary: "#ffffff", // white
          },
        },
      }}
    />
  )
}

export { Toaster }
