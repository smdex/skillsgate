import { useRef, useEffect, useCallback } from "react"
import * as monaco from "monaco-editor"

// Configure Monaco workers for Vite/Electron
self.MonacoEnvironment = {
  getWorker(_workerId: string, _label: string) {
    return new Worker(
      new URL("monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url),
      { type: "module" }
    )
  },
}

// Define a dark theme matching the app's aesthetic
monaco.editor.defineTheme("skillsgate-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "6b7280" },
    { token: "keyword", foreground: "c084fc" },
    { token: "string", foreground: "86efac" },
    { token: "emphasis", fontStyle: "italic" },
    { token: "strong", fontStyle: "bold" },
  ],
  colors: {
    "editor.background": "#0a0a0a",
    "editor.foreground": "#e5e5e5",
    "editor.lineHighlightBackground": "#ffffff08",
    "editor.selectionBackground": "#a8a29e33",
    "editorCursor.foreground": "#e5e5e5",
    "editorLineNumber.foreground": "#525252",
    "editorLineNumber.activeForeground": "#a3a3a3",
    "editor.inactiveSelectionBackground": "#a8a29e1a",
    "editorWidget.background": "#171717",
    "editorWidget.border": "#262626",
    "scrollbarSlider.background": "#52525233",
    "scrollbarSlider.hoverBackground": "#52525266",
    "scrollbarSlider.activeBackground": "#525252aa",
  },
})

interface SkillEditorProps {
  content: string
  onChange: (content: string) => void
  onSave: () => void
}

export function SkillEditor({ content, onChange, onSave }: SkillEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const internalChange = useRef(false)

  onChangeRef.current = onChange
  onSaveRef.current = onSave

  const handleResize = useCallback(() => {
    editorRef.current?.layout()
  }, [])

  // Create editor on mount
  useEffect(() => {
    if (!containerRef.current) return

    const editor = monaco.editor.create(containerRef.current, {
      value: content,
      language: "markdown",
      theme: "skillsgate-dark",
      fontSize: 13,
      fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
      lineHeight: 20,
      minimap: { enabled: false },
      wordWrap: "on",
      lineNumbers: "on",
      renderLineHighlight: "line",
      scrollBeyondLastLine: false,
      padding: { top: 12, bottom: 12 },
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      overviewRulerBorder: false,
      scrollbar: {
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
        useShadows: false,
      },
      automaticLayout: false,
      contextmenu: true,
      tabSize: 2,
      insertSpaces: true,
      bracketPairColorization: { enabled: false },
      guides: { indentation: false },
      renderWhitespace: "none",
      occurrencesHighlight: "off",
      selectionHighlight: false,
      folding: true,
      glyphMargin: false,
    })

    // Cmd+S to save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSaveRef.current()
    })

    // Listen for content changes
    editor.onDidChangeModelContent(() => {
      internalChange.current = true
      onChangeRef.current(editor.getValue())
    })

    editorRef.current = editor

    // Resize observer for responsive layout
    const observer = new ResizeObserver(handleResize)
    observer.observe(containerRef.current)

    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
      observer.disconnect()
      editor.dispose()
      editorRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external content changes (e.g. switching skills)
  useEffect(() => {
    if (internalChange.current) {
      internalChange.current = false
      return
    }

    const editor = editorRef.current
    if (!editor) return

    if (editor.getValue() !== content) {
      editor.setValue(content)
    }
  }, [content])

  return (
    <div
      ref={containerRef}
      className="border border-border rounded-lg overflow-hidden"
      style={{ minHeight: "400px", height: "calc(100vh - 300px)" }}
    />
  )
}
