// apps/desktop/src/renderer/routes/push-dialog.tsx
import { useEffect, useState } from "react"

interface PushPlanEntry {
  folderName: string
  name: string
  remoteDir: string
  reason: "added" | "updated" | "deleted" | "unchanged"
}

interface PushPreview {
  toAdd: PushPlanEntry[]
  toUpdate: PushPlanEntry[]
  toDelete: PushPlanEntry[]
  unchanged: PushPlanEntry[]
  mirror: boolean
}

interface PushResult {
  added: number
  updated: number
  deleted: number
  unchanged: number
  errors: { folderName: string; message: string }[]
}

export function PushDialog({
  open,
  serverId,
  serverLabel,
  onClose,
}: {
  open: boolean
  serverId: string | null
  serverLabel: string
  onClose: (result?: PushResult) => void
}) {
  const [mirror, setMirror] = useState(false)
  const [stage, setStage] = useState<"choose" | "previewing" | "review" | "applying" | "done" | "error">(
    "choose",
  )
  const [preview, setPreview] = useState<PushPreview | null>(null)
  const [result, setResult] = useState<PushResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setMirror(false)
      setStage("choose")
      setPreview(null)
      setResult(null)
      setError(null)
    }
  }, [open])

  if (!open || !serverId) return null

  const electronAPI = (window as any).electronAPI

  async function handlePreview() {
    setStage("previewing")
    setError(null)
    try {
      const p = (await electronAPI.serversPushPreview(serverId, mirror)) as PushPreview
      setPreview(p)
      setStage("review")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStage("error")
    }
  }

  async function handleApply() {
    if (!preview) return
    setStage("applying")
    setError(null)
    try {
      const r = (await electronAPI.serversPushApply(serverId, preview)) as PushResult
      setResult(r)
      setStage("done")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStage("error")
    }
  }

  const totalChanges =
    (preview?.toAdd.length ?? 0) +
    (preview?.toUpdate.length ?? 0) +
    (preview?.toDelete.length ?? 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => onClose()} />
      <div className="relative bg-surface border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 animate-slide-down">
        <div className="px-6 py-5 border-b border-border">
          <h3 className="text-base font-semibold text-foreground">
            Push to {serverLabel}
          </h3>
          <p className="text-[11px] text-muted mt-0.5">
            Copy your local skills to the remote server.
          </p>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
          {stage === "choose" && (
            <>
              <div className="flex flex-col gap-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="push-mode"
                    checked={!mirror}
                    onChange={() => setMirror(false)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-[12px] font-medium text-foreground">Push (additive)</div>
                    <div className="text-[11px] text-muted">
                      Adds new skills and updates changed ones. Never deletes anything on the remote.
                    </div>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="push-mode"
                    checked={mirror}
                    onChange={() => setMirror(true)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-[12px] font-medium text-foreground">
                      Mirror to remote
                      <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-red-500/15 text-red-400">
                        destructive
                      </span>
                    </div>
                    <div className="text-[11px] text-muted">
                      Match the remote one-to-one. Skills on the remote that don't exist locally
                      will be deleted.
                    </div>
                  </div>
                </label>
              </div>
            </>
          )}

          {stage === "previewing" && (
            <p className="text-[12px] text-muted">Computing diff…</p>
          )}

          {stage === "review" && preview && (
            <>
              <div className="text-[12px] text-foreground">
                <strong>{preview.toAdd.length}</strong> to add,{" "}
                <strong>{preview.toUpdate.length}</strong> to update,{" "}
                {preview.mirror && (
                  <>
                    <strong className="text-red-400">{preview.toDelete.length}</strong> to delete,{" "}
                  </>
                )}
                <strong>{preview.unchanged.length}</strong> unchanged.
              </div>
              {totalChanges === 0 && (
                <p className="text-[12px] text-muted">
                  Nothing to push — the remote already matches your local skills.
                </p>
              )}
              {(preview.toAdd.length > 0 || preview.toUpdate.length > 0 || preview.toDelete.length > 0) && (
                <ul className="text-[11px] font-mono flex flex-col gap-0.5 max-h-64 overflow-y-auto border border-border rounded-md p-2 bg-background">
                  {preview.toAdd.map((e) => (
                    <li key={`add-${e.folderName}`} className="text-green-400">
                      + {e.folderName}
                    </li>
                  ))}
                  {preview.toUpdate.map((e) => (
                    <li key={`upd-${e.folderName}`} className="text-yellow-400">
                      ~ {e.folderName}
                    </li>
                  ))}
                  {preview.toDelete.map((e) => (
                    <li key={`del-${e.folderName}`} className="text-red-400">
                      − {e.folderName}
                    </li>
                  ))}
                </ul>
              )}
              {preview.mirror && preview.toDelete.length > 0 && (
                <p className="text-[11px] text-red-400">
                  Mirror mode will delete {preview.toDelete.length} skill
                  {preview.toDelete.length === 1 ? "" : "s"} from the remote.
                </p>
              )}
            </>
          )}

          {stage === "applying" && (
            <p className="text-[12px] text-muted">Pushing to remote…</p>
          )}

          {stage === "done" && result && (
            <div className="text-[12px] text-foreground flex flex-col gap-1">
              <p>
                {result.added} added, {result.updated} updated, {result.deleted} deleted,{" "}
                {result.unchanged} unchanged.
              </p>
              {result.errors.length > 0 && (
                <ul className="text-red-400 mt-2 flex flex-col gap-0.5">
                  {result.errors.map((e) => (
                    <li key={e.folderName}>
                      {e.folderName}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {stage === "error" && (
            <p className="text-[12px] text-red-400">{error || "Push failed"}</p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2">
          {(stage === "choose" || stage === "review" || stage === "error") && (
            <button
              onClick={() => onClose()}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-foreground hover:bg-background transition-colors"
            >
              Cancel
            </button>
          )}

          {stage === "choose" && (
            <button
              onClick={handlePreview}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity"
            >
              Preview
            </button>
          )}

          {stage === "review" && totalChanges > 0 && (
            <button
              onClick={handleApply}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-opacity ${
                preview?.mirror && (preview?.toDelete.length ?? 0) > 0
                  ? "bg-red-500 text-white hover:opacity-90"
                  : "bg-foreground text-background hover:opacity-90"
              }`}
            >
              {preview?.mirror && (preview?.toDelete.length ?? 0) > 0
                ? `Mirror (delete ${preview.toDelete.length})`
                : "Apply"}
            </button>
          )}

          {stage === "done" && (
            <button
              onClick={() => onClose(result ?? undefined)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
