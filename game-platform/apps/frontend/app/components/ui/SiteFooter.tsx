import Link from 'next/link';
import Logo from './Logo';

export default function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-white/10 bg-felt-deep">
      <div className="page flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Logo size="sm" />
          <p className="text-sm text-chalk">Free games to play with friends in your browser.</p>
        </div>
        <nav aria-label="Footer" className="flex gap-6 text-sm">
          <Link href="/games" className="text-chalk hover:text-white">Games</Link>
          <Link href="/leaderboard" className="text-chalk hover:text-white">Leaderboard</Link>
        </nav>
      </div>
      <div className="page border-t border-white/5 py-5 text-xs text-chalk/70">
        © {new Date().getFullYear()} Joda Fun
      </div>
    </footer>
  );
}
