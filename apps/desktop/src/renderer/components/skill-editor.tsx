import { useRef, useEffect } from "react"
import { EditorView, keymap, placeholder as placeholderExt } from "@codemirror/view"
import { EditorState } from "@codemirror/state"
import { markdown } from "@codemirror/lang-markdown"
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language"
import { oneDark } from "@codemirror/theme-one-dark"

// ---------------------------------------------------------------------------
// Custom dark theme extension that matches the app's dark aesthetic.
// Layers on top of oneDark to override the background and gutter colors
// so the editor blends with the surrounding surface/background.
// ---------------------------------------------------------------------------

const appDarkTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--background)",
      color: "var(--foreground)",
      fontSize: "13px",
      fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
    },
    ".cm-content": {
      caretColor: "var(--foreground)",
      padding: "16px 0",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--foreground)",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      {
        backgroundColor: "rgba(168, 162, 158, 0.2)",
      },
    ".cm-gutters": {
      backgroundColor: "var(--background)",
      color: "var(--muted)",
      border: "none",
      paddingRight: "8px",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "var(--foreground)",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(168, 162, 158, 0.05)",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "var(--surface-hover)",
      border: "1px solid var(--border)",
      color: "var(--muted)",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      overflow: "auto",
    },
  },
  { dark: true },
)

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SkillEditorProps {
  content: string
  onChange: (content: string) => void
  onSave: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SkillEditor({ content, onChange, onSave }: SkillEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const internalChange = useRef(false)

  // Keep refs up to date without recreating the editor
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  // Create the editor on mount, destroy on unmount
  useEffect(() => {
    if (!containerRef.current) return

    const saveKeymap = keymap.of([
      {
        key: "Mod-s",
        run: () => {
          onSaveRef.current()
          return true
        },
      },
    ])

    const state = EditorState.create({
      doc: content,
      extensions: [
        saveKeymap,
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        oneDark,
        appDarkTheme,
        EditorView.lineWrapping,
        placeholderExt("Start writing your SKILL.md content..."),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            internalChange.current = true
            onChangeRef.current(update.state.doc.toString())
          }
        }),
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Only run on mount; content is set via initial state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If parent replaces the content string entirely (e.g. switching skills),
  // update the editor document to match. Skip if the change originated from
  // the editor itself to avoid a feedback loop that causes lag.
  useEffect(() => {
    if (internalChange.current) {
      internalChange.current = false
      return
    }

    const view = viewRef.current
    if (!view) return

    const currentDoc = view.state.doc.toString()
    if (currentDoc !== content) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: content,
        },
      })
    }
  }, [content])

  return (
    <div
      ref={containerRef}
      className="border border-border rounded-lg overflow-hidden bg-background"
      style={{ minHeight: "400px" }}
    />
  )
}
