import { useRef, useEffect, useCallback } from "react"
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view"
import { EditorState } from "@codemirror/state"
import { markdown } from "@codemirror/lang-markdown"
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search"
import { languages } from "@codemirror/language-data"

const theme = EditorView.theme({
  "&": {
    fontSize: "13px",
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
    backgroundColor: "#0a0a0a",
    color: "#e5e5e5",
    borderRadius: "8px",
    border: "1px solid var(--color-border, #262626)",
    overflow: "hidden",
    height: "100%",
  },
  ".cm-content": {
    padding: "12px 0",
    lineHeight: "20px",
    caretColor: "#e5e5e5",
  },
  ".cm-cursor": {
    borderLeftColor: "#e5e5e5",
  },
  ".cm-activeLine": {
    backgroundColor: "#ffffff08",
  },
  ".cm-gutters": {
    backgroundColor: "#0a0a0a",
    color: "#525252",
    border: "none",
  },
  ".cm-activeLineGutter": {
    color: "#a3a3a3",
    backgroundColor: "transparent",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "#a8a29e33 !important",
  },
  ".cm-scroller": {
    overflow: "auto",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "#a8a29e33 !important",
  },
  "&.cm-focused": {
    outline: "none",
  },
}, { dark: true })

interface SkillEditorProps {
  content: string
  onChange: (content: string) => void
  onSave: () => void
}

export function SkillEditor({ content, onChange, onSave }: SkillEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const internalChange = useRef(false)

  onChangeRef.current = onChange
  onSaveRef.current = onSave

  const saveKeymap = useCallback(() => keymap.of([{
    key: "Mod-s",
    run: () => {
      onSaveRef.current()
      return true
    },
  }]), [])

  useEffect(() => {
    if (!containerRef.current) return

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        markdown({ codeLanguages: languages }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        highlightSelectionMatches(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        saveKeymap(),
        theme,
        EditorView.lineWrapping,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external content changes
  useEffect(() => {
    if (internalChange.current) {
      internalChange.current = false
      return
    }

    const view = viewRef.current
    if (!view) return

    if (view.state.doc.toString() !== content) {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: content,
        },
      })
    }
  }, [content])

  return (
    <div
      ref={containerRef}
      className="h-full"
    />
  )
}
