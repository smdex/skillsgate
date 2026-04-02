import { useRef, useEffect, useCallback, useState } from "react"

// Lazy-load Monaco to avoid blocking app startup
let monacoPromise: Promise<typeof import("monaco-editor")> | null = null

function getMonaco() {
  if (!monacoPromise) {
    monacoPromise = import("monaco-editor").then((mod) => {
      // Configure workers
      self.MonacoEnvironment = {
        getWorker(_workerId: string, _label: string) {
          return new Worker(
            new URL("monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url),
            { type: "module" }
          )
        },
      }

      // Define theme once
      mod.editor.defineTheme("skillsgate-dark", {
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

      return mod
    })
  }
  return monacoPromise
}

interface SkillEditorProps {
  content: string
  onChange: (content: string) => void
  onSave: () => void
}

export function SkillEditor({ content, onChange, onSave }: SkillEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<any>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const contentRef = useRef(content)
  const internalChange = useRef(false)
  const [loading, setLoading] = useState(true)

  onChangeRef.current = onChange
  onSaveRef.current = onSave
  contentRef.current = content

  const handleResize = useCallback(() => {
    editorRef.current?.layout()
  }, [])

  // Create editor on mount, lazily
  useEffect(() => {
    if (!containerRef.current) return
    let disposed = false

    getMonaco().then((monaco) => {
      if (disposed || !containerRef.current) return

      // Defer creation to next frame so container is laid out
      requestAnimationFrame(() => {
        if (disposed || !containerRef.current) return

        const editor = monaco.editor.create(containerRef.current, {
          value: contentRef.current,
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
          automaticLayout: true,
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

        editor.addCommand(
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
          () => onSaveRef.current()
        )

        editor.onDidChangeModelContent(() => {
          internalChange.current = true
          onChangeRef.current(editor.getValue())
        })

        editorRef.current = editor
        setLoading(false)
      })
    })

    const observer = new ResizeObserver(handleResize)
    if (containerRef.current) observer.observe(containerRef.current)
    window.addEventListener("resize", handleResize)

    return () => {
      disposed = true
      window.removeEventListener("resize", handleResize)
      observer.disconnect()
      editorRef.current?.dispose()
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
    <div className="relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background border border-border rounded-lg z-10">
          <div className="flex items-center gap-2 text-muted text-[12px]">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
            Loading editor...
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className="border border-border rounded-lg overflow-hidden"
        style={{ minHeight: "400px", height: "calc(100vh - 300px)" }}
      />
    </div>
  )
}
