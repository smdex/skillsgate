import { colors } from "../utils/colors.js"

/**
 * Favorites view: Coming soon placeholder.
 * Favorites require authentication which is not yet available in the public TUI.
 */
export function FavoritesView() {
  return (
    <box style={{ flexDirection: "column", padding: 2 }}>
      <text fg={colors.primary}>
        <strong>Favorites</strong>
      </text>
      <text>{" "}</text>
      <text fg={colors.text}>
        Coming soon. Favorites will be available once accounts are launched.
      </text>
    </box>
  )
}
