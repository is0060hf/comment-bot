import * as React from "react"

type ToastProps = {
  title?: string
  description?: string
  variant?: "default" | "destructive"
}

type ToastContextType = {
  toast: (props: ToastProps) => void
}

const ToastContext = React.createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const toast = React.useCallback((props: ToastProps) => {
    // 簡易的な実装 - 実際はToastコンポーネントを表示
    console.log('Toast:', props)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = React.useContext(ToastContext)
  if (!context) {
    // 開発環境用のモック実装
    return {
      toast: (props: ToastProps) => {
        console.log('Toast (mock):', props)
      }
    }
  }
  return context
}
