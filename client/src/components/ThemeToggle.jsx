import { useTheme } from '../ThemeContext.jsx'

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme()
  return (
    <button className={`theme-toggle ${className}`} onClick={toggleTheme} title="Switch theme">
      {theme === 'dark' ? 'Light' : 'Dark'}
    </button>
  )
}