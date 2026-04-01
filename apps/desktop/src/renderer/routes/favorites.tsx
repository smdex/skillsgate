export function Favorites() {
  return (
    <div className="p-8">
      <h2 className="text-xl font-bold text-foreground mb-1">Favorites</h2>
      <p className="text-[12px] text-muted mb-6">
        Your bookmarked skills for quick access.
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
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <p className="text-foreground text-sm font-medium mb-1">Coming soon</p>
        <p className="text-muted text-[12px] max-w-sm">
          Favorites will be available in a future update.
        </p>
      </div>
    </div>
  )
}
