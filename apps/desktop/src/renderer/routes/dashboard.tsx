export function Dashboard() {
  return (
    <div className="p-8">
      <h2 className="text-xl font-bold text-foreground mb-1">Dashboard</h2>
      <p className="text-[12px] text-muted mb-6">
        Stats and quick actions for your account.
      </p>

      <div className="flex flex-col items-center justify-center py-20 text-center">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mb-4 text-muted"
        >
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
        <p className="text-foreground text-sm font-medium mb-1">Coming soon</p>
        <p className="text-muted text-[12px] max-w-sm">
          The dashboard will be available in a future update.
        </p>
      </div>
    </div>
  )
}
